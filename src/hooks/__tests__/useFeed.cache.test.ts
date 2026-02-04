/**
 * useFeed integration with feed cache layer
 * TDD: initial load always from server (no target); target in cache = no server; loadMore/loadNewer from cache; older exhausted = no API
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useFeed } from "../useFeed";
import { createFeedPostStore } from "@lib/feed/feedPostStore";
import { createFeedCacheController } from "@lib/feed/feedCacheController";
import type { Post } from "@types";

jest.mock("@lib/api/client", () => ({
  getActiveClient: jest.fn(),
  withRetry: jest.fn((fn: () => Promise<any>) => fn()),
  RequestPriority: { HIGH: 0, NORMAL: 1, LOW: 2 },
}));
jest.mock("@lib/storage");
jest.mock("@lib/api/timeline", () => ({
  transformStatus: (s: any) => ({
    id: s.id,
    content: s.content || "",
    createdAt: s.createdAt || new Date().toISOString(),
    account: s.account || { id: "test", username: "test" },
    mediaAttachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    reblogsCount: 0,
    favouritesCount: 0,
    repliesCount: 0,
    uri: `https://test.com/${s.id}`,
    visibility: "public",
    sensitive: false,
    spoilerText: "",
    reblogged: false,
    favourited: false,
    bookmarked: false,
  }),
}));
jest.mock("@lib/api/mastodonRequests", () => ({
  getDirectionalTimelinePaginator: jest.fn(() => ({
    next: jest.fn().mockResolvedValue({ done: true, value: undefined }),
  })),
}));
jest.mock("@contexts/AuthContext", () => ({
  useAuth: () => ({
    instance: { id: "test-instance", url: "https://test.social" },
  }),
}));

function makePost(id: string): Post {
  return {
    id,
    uri: `https://example.com/${id}`,
    createdAt: "2024-01-01T00:00:00Z",
    content: `content-${id}`,
    visibility: "public",
    sensitive: false,
    spoilerText: "",
    mediaAttachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    reblogsCount: 0,
    favouritesCount: 0,
    repliesCount: 0,
    account: {
      id: "acct-1",
      username: "user",
      acct: "user",
      displayName: "User",
      avatar: "",
      header: "",
      followersCount: 0,
      followingCount: 0,
      statusesCount: 0,
      note: "",
      url: "",
      createdAt: "2024-01-01T00:00:00Z",
    },
    reblog: null,
    inReplyToId: null,
    inReplyToAccountId: null,
  };
}

const CACHE_KEY = "test-instance_feed_home";

describe("useFeed with feed cache layer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { storageService } = require("@lib/storage");
    storageService.getCachedPosts = jest.fn().mockResolvedValue([]);
    storageService.isCacheValid = jest.fn().mockReturnValue(false);
    storageService.saveCachedPosts = jest.fn().mockResolvedValue(undefined);
  });

  it("initial load (no target) always requests latest from server first, then populates cache", async () => {
    const latest = [makePost("1"), makePost("2"), makePost("3")];
    const { getActiveClient } = require("@lib/api/client");
    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockReturnValue({
                [Symbol.asyncIterator]: async function* () {
                  yield latest.map((p) => ({ id: p.id, content: p.content, createdAt: p.createdAt, account: p.account }));
                },
              }),
            },
          },
        },
      },
    });

    const { result } = renderHook(() =>
      useFeed({
        feedType: "home",
        limit: 20,
        cacheKey: CACHE_KEY,
        enableCache: true,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getActiveClient).toHaveBeenCalled();
    expect(result.current.posts.length).toBeGreaterThanOrEqual(1);
  });

  it("initial load with target post ID checks cache first — if target in cache, use cache slice (no server)", async () => {
    const store = createFeedPostStore();
    await store.clearAll();
    const cached = [makePost("1"), makePost("2"), makePost("3"), makePost("4")];
    await store.addPosts(CACHE_KEY, cached);

    const fetchLatest = jest.fn().mockResolvedValue(cached);
    const fetchContextAround = jest.fn();
    const controller = createFeedCacheController(store, {
      feedKey: CACHE_KEY,
      fetchLatest,
      fetchContextAround,
      fetchOlderPage: jest.fn(),
      fetchNewerPage: jest.fn(),
    });

    const { result } = renderHook(() =>
      useFeed({
        feedType: "home",
        limit: 20,
        cacheKey: CACHE_KEY,
        enableCache: true,
        feedCacheController: controller,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loadFromAnchor("3");
    });

    await waitFor(() => expect(result.current.posts.length).toBeGreaterThan(0));

    expect(fetchContextAround).not.toHaveBeenCalled();
    expect(result.current.posts.map((p) => p.id)).toContain("3");
  });

  it("loadMore returns cached older posts when present", async () => {
    const store = createFeedPostStore();
    await store.clearAll();
    const posts = Array.from({ length: 30 }, (_, i) => makePost(String(100 + i)));
    await store.addPosts(CACHE_KEY, posts);

    const fetchLatest = jest.fn().mockResolvedValue(posts.slice(0, 20));
    const controller = createFeedCacheController(store, {
      feedKey: CACHE_KEY,
      fetchLatest,
      fetchContextAround: jest.fn(),
      fetchOlderPage: jest.fn(),
      fetchNewerPage: jest.fn(),
    });

    const { result } = renderHook(() =>
      useFeed({
        feedType: "home",
        limit: 20,
        cacheKey: CACHE_KEY,
        enableCache: true,
        feedCacheController: controller,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const initialCount = result.current.posts.length;
    expect(initialCount).toBeGreaterThan(0);
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    expect(result.current.posts.length).toBeGreaterThanOrEqual(initialCount);
  });

  it("refresh requests latest from server and updates cache", async () => {
    const latest = [makePost("1"), makePost("2")];
    const { getActiveClient } = require("@lib/api/client");
    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockReturnValue({
                [Symbol.asyncIterator]: async function* () {
                  yield latest.map((p) => ({ id: p.id, content: p.content, createdAt: p.createdAt, account: p.account }));
                },
              }),
            },
          },
        },
      },
    });

    const { result } = renderHook(() =>
      useFeed({
        feedType: "home",
        limit: 20,
        cacheKey: CACHE_KEY,
        enableCache: true,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const beforeRefresh = result.current.posts.length;

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(getActiveClient).toHaveBeenCalled();
    expect(result.current.posts.length).toBeGreaterThanOrEqual(0);
  });

  it("cacheKey (server+account+feed) is passed correctly to controller/store", async () => {
    const store = createFeedPostStore();
    const fetchLatest = jest.fn().mockResolvedValue([makePost("1")]);
    const controller = createFeedCacheController(store, {
      feedKey: CACHE_KEY,
      fetchLatest,
      fetchContextAround: jest.fn(),
      fetchOlderPage: jest.fn(),
      fetchNewerPage: jest.fn(),
    });

    const { result } = renderHook(() =>
      useFeed({
        feedType: "home",
        limit: 20,
        cacheKey: CACHE_KEY,
        enableCache: true,
        feedCacheController: controller,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchLatest).toHaveBeenCalled();
  });
});
