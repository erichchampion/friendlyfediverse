import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useFeed } from "../useFeed";

// Mock dependencies
jest.mock("@/config", () => {
  const actual = jest.requireActual("@/config");
  return {
    ...actual,
    FEED_CONFIG: {
      ...actual.FEED_CONFIG,
      // Smaller cap for faster tests (legacy, not used in trimming)
      MAX_TOTAL_POSTS: 50,
    },
    UI_CONFIG: {
      ...actual.UI_CONFIG,
      // Override buffer size and trim threshold for tests
      // The trimming logic uses POST_BUFFER_SIZE and TRIM_THRESHOLD, not MAX_TOTAL_POSTS
      POST_BUFFER_SIZE: 50,
      TRIM_THRESHOLD: 50,
      // Make chunk size large enough to trim all overflow in one pass for tests
      TRIM_CHUNK_SIZE: 200,
      // Reduce viewport buffer for tests (only affects smart trimming path)
      VIEWPORT_BUFFER_POSTS: 10,
    },
  };
});
jest.mock("@lib/api/client", () => ({
  getActiveClient: jest.fn(),
  withRetry: jest.fn((fn) => fn()),
  RequestPriority: {
    HIGH: 0,
    NORMAL: 1,
    LOW: 2,
  },
}));
jest.mock("@lib/storage");
jest.mock("@lib/api/timeline", () => ({
  transformStatus: (status: any) => ({
    id: status.id,
    content: status.content || "",
    createdAt: status.createdAt || new Date().toISOString(),
    account: status.account || { id: "test", username: "test" },
    mediaAttachments: [],
    mentions: [],
    tags: [],
    reblogsCount: 0,
    favouritesCount: 0,
    repliesCount: 0,
    uri: `https://test.com/${status.id}`,
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

const buildStatuses = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({
    id: `post-${i + offset}`,
    content: `Post ${i + offset}`,
    createdAt: new Date().toISOString(),
    account: { id: "acc1", username: "user" },
  }));

const createIterator = (...pages: any[][]) => ({
  [Symbol.asyncIterator]: jest.fn(function* () {
    for (const page of pages) {
      yield page;
    }
  }),
});

describe("useFeed memory cap", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const { storageService } = require("@lib/storage");
    storageService.getCachedPosts = jest.fn().mockResolvedValue(null);
    storageService.isCacheValid = jest.fn().mockReturnValue(false);
    storageService.saveCachedPosts = jest.fn().mockResolvedValue(undefined);
  });

  it("trims initial load to MAX_TOTAL_POSTS", async () => {
    const { getActiveClient } = require("@lib/api/client");

    const largePage = buildStatuses(120);
    const mockList = createIterator(largePage);

    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn(() => mockList),
            },
          },
        },
      },
    });

    const { result } = renderHook(() =>
      useFeed({
        feedType: "home",
        limit: 120,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.posts.length).toBe(50);
    expect(result.current.posts[0].id).toBe("post-0");
  });

  it("trims after loadMore while keeping newest posts", async () => {
    const { getActiveClient } = require("@lib/api/client");
    const { getDirectionalTimelinePaginator } = require("@lib/api/mastodonRequests");

    const firstPage = buildStatuses(40); // Newest -> oldest
    const mockList = createIterator(firstPage);

    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn(() => mockList),
            },
          },
        },
      },
    });

    // Older page (appended at end)
    const olderPage = buildStatuses(30, 40);
    getDirectionalTimelinePaginator.mockImplementation(() => {
      let called = false;
      return {
        next: jest.fn(async () => {
          if (called) {
            return { done: true, value: [] };
          }
          called = true;
          return { done: false, value: olderPage };
        }),
      };
    });

    const { result } = renderHook(() =>
      useFeed({
        feedType: "home",
        limit: 40,
      }),
    );

    await waitFor(() => expect(result.current.posts.length).toBe(40));

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    // Should be capped at 50, dropping from the opposite end (newest side) when loading older posts
    expect(result.current.posts.length).toBe(50);
    expect(result.current.posts[0].id).toBe("post-20");
    expect(result.current.posts[result.current.posts.length - 1].id).toBe(
      "post-69",
    );
    expect(result.current.hasMore).toBe(true);
  });

  it("drops oldest posts when applying newer posts beyond the cap", async () => {
    const { getActiveClient } = require("@lib/api/client");
    const { getDirectionalTimelinePaginator } = require("@lib/api/mastodonRequests");

    const firstPage = buildStatuses(40); // Newest -> oldest
    const mockList = createIterator(firstPage);

    // Newer posts (prepend); unique IDs to avoid duplicates
    const newerPage = buildStatuses(15, -15); // post--15 ... post--1

    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn(() => mockList),
            },
          },
        },
      },
    });

    getDirectionalTimelinePaginator.mockImplementation(() => {
      let called = false;
      return {
        next: jest.fn(async () => {
          if (called) {
            return { done: true, value: [] };
          }
          called = true;
          return { done: false, value: newerPage };
        }),
      };
    });

    const { result } = renderHook(() =>
      useFeed({
        feedType: "home",
        limit: 40,
      }),
    );

    await waitFor(() => expect(result.current.posts.length).toBe(40));

    await act(async () => {
      await result.current.loadNewer();
    });

    // Apply pending newer posts
    act(() => {
      result.current.applyPendingNewPosts();
    });

    // Should cap at 50, dropping from the oldest side after prepending newer posts
    await waitFor(() => expect(result.current.posts.length).toBe(50));
    expect(result.current.posts[0].id).toBe("post--15");
    expect(result.current.posts[result.current.posts.length - 1].id).toBe(
      "post-34",
    );
  });
});

