/**
 * useFeed Hook Tests
 * Phase 8: Testing & Release
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useFeed } from "../useFeed";

// Mock dependencies
jest.mock("@lib/api/client", () => ({
  getActiveClient: jest.fn(),
  withRetry: jest.fn((fn) => fn()), // Mock withRetry to just execute the function
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
  generateOlderId: jest.fn((id, ms) => id),
}));
jest.mock("@contexts/AuthContext", () => ({
  useAuth: jest.fn(() => ({
    currentUser: {
      id: "test-user",
      username: "testuser",
      acct: "testuser@example.com",
    },
    accessToken: "test-token",
    instance: { id: "test-instance", url: "https://test.social" },
  })),
}));

describe("useFeed", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock storage service
    const { storageService } = require("@lib/storage");
    storageService.getCachedPosts = jest.fn().mockResolvedValue(null);
    storageService.isCacheValid = jest.fn().mockReturnValue(false);
    storageService.saveCachedPosts = jest.fn().mockResolvedValue(undefined);

    // Mock API client
    const { getActiveClient } = require("@lib/api/client");
    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockReturnValue({
                [Symbol.asyncIterator]: async function* () {
                  yield [];
                },
              }),
            },
          },
        },
      },
    });
  });

  it("should initialize with empty posts and loading state", async () => {
    const { result } = renderHook(() =>
      useFeed({
        feedType: "home",
        limit: 20,
        cacheKey: "test_feed",
      }),
    );

    expect(result.current.posts).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.hasMore).toBe(true);

    // Wait for initial load to complete
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("should handle refresh correctly", async () => {
    const mockPosts = [
      {
        id: "1",
        content: "Post 1",
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user1" },
      },
      {
        id: "2",
        content: "Post 2",
        createdAt: new Date().toISOString(),
        account: { id: "acc2", username: "user2" },
      },
    ];

    const { getActiveClient } = require("@lib/api/client");
    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockReturnValue({
                [Symbol.asyncIterator]: async function* () {
                  yield mockPosts;
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
        cacheKey: "test_feed",
      }),
    );

    // Wait for initial load
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(result.current.posts.length).toBe(2);
  });

  it("should handle load more correctly", async () => {
    const mockPosts = [
      {
        id: "1",
        content: "Post 1",
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user1" },
      },
    ];

    const { getActiveClient } = require("@lib/api/client");
    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockReturnValue({
                [Symbol.asyncIterator]: async function* () {
                  yield mockPosts;
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
        cacheKey: "test_feed",
      }),
    );

    // Wait for initial load
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
  });
});
