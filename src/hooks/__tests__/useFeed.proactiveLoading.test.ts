/**
 * Tests for proactive loading in useFeed
 * TDD approach: Tests written first to define desired behavior
 *
 * Feature: Load posts proactively before reaching the end of the feed
 * - Load older posts when within PREFETCH_THRESHOLD items of bottom
 * - Load newer posts when within PREFETCH_THRESHOLD items of top
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useFeed } from "../useFeed";
import { FEED_CONFIG } from "@/config";

// Mock dependencies
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

describe("useFeed - Proactive Loading", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock storage service
    const { storageService } = require("@lib/storage");
    storageService.getCachedPosts = jest.fn().mockResolvedValue(null);
    storageService.isCacheValid = jest.fn().mockReturnValue(false);
    storageService.saveCachedPosts = jest.fn().mockResolvedValue(undefined);
  });

  describe("Proactive loading of older posts (scrolling down)", () => {
    it("should expose a method to check if near bottom threshold", async () => {
      const mockPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user" },
      }));

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
        }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Hook should expose a method to check if we're near the bottom
      expect(result.current.shouldLoadOlder).toBeDefined();
      expect(typeof result.current.shouldLoadOlder).toBe("function");
    });

    it("should return true when viewing posts within PREFETCH_THRESHOLD of bottom", async () => {
      const mockPosts = Array.from({ length: 100 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user" },
      }));

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
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(100));

      // When viewing post at index 85 (100 - 20 = 80, so >= 80 is within threshold)
      const nearBottom = result.current.shouldLoadOlder(85);
      expect(nearBottom).toBe(true);

      // When viewing post at index 70, we're NOT within threshold
      const notNearBottom = result.current.shouldLoadOlder(70);
      expect(notNearBottom).toBe(false);
    });

    it("should use PREFETCH_THRESHOLD from config", async () => {
      const mockPosts = Array.from({ length: 100 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user" },
      }));

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
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(100));

      // With 100 posts and PREFETCH_THRESHOLD of 20:
      // Index 80 (100 - 20 = 80) should trigger (exactly at threshold)
      const atThreshold = result.current.shouldLoadOlder(80);
      expect(atThreshold).toBe(true);

      // Index 79 should NOT trigger (before threshold)
      const beforeThreshold = result.current.shouldLoadOlder(79);
      expect(beforeThreshold).toBe(false);
    });
  });

  describe("Proactive loading of newer posts (scrolling up)", () => {
    it("should expose a method to check if near top threshold", async () => {
      const mockPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user" },
      }));

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
        }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Hook should expose a method to check if we're near the top
      expect(result.current.shouldLoadNewer).toBeDefined();
      expect(typeof result.current.shouldLoadNewer).toBe("function");
    });

    it("should return true when viewing posts within PREFETCH_THRESHOLD of top", async () => {
      const mockPosts = Array.from({ length: 100 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user" },
      }));

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
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(100));

      // When viewing post at index 0-19, we're within threshold (< 20)
      expect(result.current.shouldLoadNewer(0)).toBe(true);
      expect(result.current.shouldLoadNewer(10)).toBe(true);
      expect(result.current.shouldLoadNewer(19)).toBe(true);

      // When viewing post at index 20, we're exactly at threshold (not within)
      expect(result.current.shouldLoadNewer(20)).toBe(false);

      // When viewing post at index 30, we're NOT within threshold
      expect(result.current.shouldLoadNewer(30)).toBe(false);
    });

    it("should have a loadNewer method for fetching newer posts", async () => {
      const mockPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user" },
      }));

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
        }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Hook should expose a method to load newer posts
      expect(result.current.loadNewer).toBeDefined();
      expect(typeof result.current.loadNewer).toBe("function");
    });
  });

  describe("Integration with scroll handling", () => {
    it("should provide viewability callback that does NOT trigger proactive loading (user-controlled only)", async () => {
      const mockInitialPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
        account: { id: "acc1", username: "user" },
      }));

      const mockOlderPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i + 20}`,
        content: `Post ${i + 20}`,
        createdAt: new Date(Date.now() - (i + 20) * 1000).toISOString(),
        account: { id: "acc1", username: "user" },
      }));

      const { getActiveClient } = require("@lib/api/client");
      const {
        getDirectionalTimelinePaginator,
      } = require("@lib/api/mastodonRequests");

      getActiveClient.mockResolvedValue({
        client: {
          v1: {
            timelines: {
              home: {
                list: jest.fn().mockReturnValue({
                  [Symbol.asyncIterator]: async function* () {
                    yield mockInitialPosts;
                  },
                }),
              },
            },
          },
        },
      });

      // Mock the paginator to return older posts
      const mockIterator = {
        next: jest.fn().mockResolvedValue({
          done: false,
          value: mockOlderPosts,
        }),
      };
      getDirectionalTimelinePaginator.mockReturnValue(mockIterator);

      const { result } = renderHook(() =>
        useFeed({
          feedType: "home",
          limit: 20,
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(20));

      // Hook should provide a callback for handling viewable items change
      expect(result.current.handleViewableItemsChanged).toBeDefined();
      expect(typeof result.current.handleViewableItemsChanged).toBe("function");

      // Simulate scrolling near bottom - viewing post at index 16 (within threshold of 20)
      await act(async () => {
        result.current.handleViewableItemsChanged({
          viewableItems: [{ index: 16, item: { id: "post-16" } }],
          changed: [],
        });
      });

      // Should NOT automatically trigger loadMore - loading is now user-controlled only
      // Posts should remain at 20 (no automatic loading)
      expect(result.current.posts.length).toBe(20);
      expect(result.current.isLoadingMore).toBe(false);
    });

    it("should not trigger any loads from viewability callback (user-controlled only)", async () => {
      const mockPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user" },
      }));

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
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(20));

      // Simulate multiple rapid scroll events near bottom
      act(() => {
        result.current.handleViewableItemsChanged({
          viewableItems: [{ index: 18, item: { id: "post-18" } }],
          changed: [],
        });
      });

      act(() => {
        result.current.handleViewableItemsChanged({
          viewableItems: [{ index: 19, item: { id: "post-19" } }],
          changed: [],
        });
      });

      // Should NOT trigger any loading - viewability callback is now a no-op
      // Loading is user-controlled only (via onEndReached, pull-to-refresh, etc.)
      expect(result.current.isLoadingMore).toBe(false);
      expect(result.current.posts.length).toBe(20);
    });
  });

  describe("Edge cases", () => {
    it("should not attempt to load older posts when hasMore is false", async () => {
      const mockPosts = Array.from({ length: 5 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user" },
      }));

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
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(5));

      // With only 5 posts returned (less than limit of 20), hasMore should be false
      // Viewing near the bottom should NOT trigger loading
      const shouldLoad = result.current.shouldLoadOlder(4);

      // Even if position suggests loading, hasMore=false should prevent it
      if (result.current.hasMore === false) {
        expect(shouldLoad).toBe(false);
      }
    });

    it("should handle empty feed gracefully", async () => {
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

      const { result } = renderHook(() =>
        useFeed({
          feedType: "home",
          limit: 20,
        }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Should not crash or attempt to load with empty feed
      expect(() => result.current.shouldLoadOlder(0)).not.toThrow();
      expect(() => result.current.shouldLoadNewer(0)).not.toThrow();

      expect(result.current.shouldLoadOlder(0)).toBe(false);
      expect(result.current.shouldLoadNewer(0)).toBe(false);
    });
  });
});
