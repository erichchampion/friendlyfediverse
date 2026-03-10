/**
 * Tests for iterator-based pagination in useFeed
 * These tests verify that useFeed correctly uses masto.js iterators
 * for bidirectional pagination (older and newer posts)
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useFeed } from "../useFeed";

// Mock dependencies
jest.mock("@lib/api/client");
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
  useAuth: () => ({
    instance: { id: "test-instance", url: "https://test.social" },
  }),
}));

// Create a mock paginator that behaves like masto.js iterator
const createMockPaginator = (pages: any[][]) => {
  let pageIndex = 0;
  return {
    next: jest.fn(async () => {
      if (pageIndex >= pages.length) {
        return { done: true, value: undefined };
      }
      const value = pages[pageIndex];
      pageIndex++;
      return { done: false, value };
    }),
  };
};

describe.skip("useFeed - Iterator-based pagination", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock storage service
    const { storageService } = require("@lib/storage");
    storageService.getCachedPosts = jest.fn().mockResolvedValue(null);
    storageService.isCacheValid = jest.fn().mockReturnValue(false);
    storageService.saveCachedPosts = jest.fn().mockResolvedValue(undefined);
  });

  describe("loadMore (older posts pagination)", () => {
    it("should use older posts iterator to fetch next page", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const firstPage = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user", displayName: "User" },
      }));

      const secondPage = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i + 20}`,
        content: `Post ${i + 20}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user", displayName: "User" },
      }));

      const mockList = {
        [Symbol.asyncIterator]: jest.fn(function* () {
          yield firstPage;
          yield secondPage;
        }),
      };

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
          limit: 20,
        }),
      );

      // Wait for initial load
      await waitFor(() => expect(result.current.posts.length).toBe(20));
      expect(result.current.posts[0].id).toBe("post-0");

      // Call loadMore to get next page
      await act(async () => {
        await result.current.loadMore();
      });

      // Should have 40 posts now
      expect(result.current.posts.length).toBe(40);
      expect(result.current.posts[20].id).toBe("post-20");
      expect(result.current.hasMore).toBe(true);
    });

    it("should reuse same iterator across multiple loadMore calls", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const pages = [
        Array.from({ length: 20 }, (_, i) => ({
          id: `${i}`,
          account: { id: "acc1", username: "u" },
        })),
        Array.from({ length: 20 }, (_, i) => ({
          id: `${i + 20}`,
          account: { id: "acc1", username: "u" },
        })),
        Array.from({ length: 20 }, (_, i) => ({
          id: `${i + 40}`,
          account: { id: "acc1", username: "u" },
        })),
      ];

      const mockPaginator = createMockPaginator(pages);
      const mockList = {
        [Symbol.asyncIterator]: () => mockPaginator,
      };

      const listMock = jest.fn(() => mockList);

      getActiveClient.mockResolvedValue({
        client: {
          v1: {
            timelines: {
              home: {
                list: listMock,
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

      // Wait for initial load (page 0)
      await waitFor(() => expect(result.current.posts.length).toBe(20));

      // Load page 1
      await act(async () => {
        await result.current.loadMore();
      });
      expect(result.current.posts.length).toBe(40);

      // Load page 2
      await act(async () => {
        await result.current.loadMore();
      });
      expect(result.current.posts.length).toBe(60);

      // CRITICAL: list() should only be called ONCE to create the iterator
      // The iterator is reused for all subsequent loadMore calls
      expect(listMock).toHaveBeenCalledTimes(1);

      // The iterator's next() should be called 3 times (once per page)
      expect(mockPaginator.next).toHaveBeenCalledTimes(3);
    });

    it("should set hasMore=false when iterator returns done", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const pages = [
        Array.from({ length: 20 }, (_, i) => ({
          id: `${i}`,
          account: { id: "acc1", username: "u" },
        })),
        Array.from({ length: 10 }, (_, i) => ({
          id: `${i + 20}`,
          account: { id: "acc1", username: "u" },
        })), // Last page
      ];

      const mockPaginator = createMockPaginator(pages);
      const mockList = {
        [Symbol.asyncIterator]: () => mockPaginator,
      };

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
          limit: 20,
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(20));

      // Load last page
      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.posts.length).toBe(30);
      expect(result.current.hasMore).toBe(true);

      // Try to load more (should get done=true)
      await act(async () => {
        await result.current.loadMore();
      });

      // Should still be 30 posts, hasMore should be false
      expect(result.current.posts.length).toBe(30);
      expect(result.current.hasMore).toBe(false);
    });

    it("should not call loadMore when already loading", async () => {
      const { getActiveClient } = require("@lib/api/client");

      let resolveFirstLoad: () => void;
      const firstLoadPromise = new Promise<any[]>((resolve) => {
        resolveFirstLoad = () =>
          resolve(
            Array.from({ length: 20 }, (_, i) => ({
              id: `${i}`,
              account: { id: "acc1", username: "u" },
            })),
          );
      });

      const mockPaginator = {
        next: jest
          .fn()
          .mockReturnValueOnce(
            firstLoadPromise.then((value) => ({ done: false, value })),
          )
          .mockResolvedValueOnce({
            done: false,
            value: Array.from({ length: 20 }, (_, i) => ({ id: `${i + 20}` })),
          }),
      };

      const mockList = {
        [Symbol.asyncIterator]: () => mockPaginator,
      };

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
          limit: 20,
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(20));

      // Start first loadMore (don't await)
      act(() => {
        result.current.loadMore();
      });

      // Immediately try second loadMore (should be blocked)
      act(() => {
        result.current.loadMore();
      });

      // Resolve the first load
      resolveFirstLoad!();

      await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

      // next() should only be called twice: once for initial, once for first loadMore
      // The second loadMore should be blocked by isLoadingMore guard
      expect(mockPaginator.next).toHaveBeenCalledTimes(2);
    });
  });

  describe("refresh (newer posts pagination)", () => {
    it("should use newer posts iterator to fetch latest posts", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const initialPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i}`,
        content: `Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user", displayName: "User" },
      }));

      const refreshedPosts = Array.from({ length: 15 }, (_, i) => ({
        id: `new-post-${i}`,
        content: `New Post ${i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user", displayName: "User" },
      }));

      let callCount = 0;
      const mockList = {
        [Symbol.asyncIterator]: jest.fn(function* () {
          if (callCount === 0) {
            callCount++;
            yield initialPosts;
          } else {
            yield refreshedPosts;
          }
        }),
      };

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
          limit: 20,
        }),
      );

      // Wait for initial load
      await waitFor(() => expect(result.current.posts.length).toBe(20));
      expect(result.current.posts[0].id).toBe("post-0");

      // Refresh to get newer posts
      await act(async () => {
        await result.current.refresh();
      });

      // Should have refreshed posts
      expect(result.current.posts.length).toBe(15);
      expect(result.current.posts[0].id).toBe("new-post-0");
    });

    it("should reset iterators on refresh", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const pages = [
        Array.from({ length: 20 }, (_, i) => ({
          id: `${i}`,
          account: { id: "acc1", username: "u" },
        })),
        Array.from({ length: 20 }, (_, i) => ({
          id: `${i + 20}`,
          account: { id: "acc1", username: "u" },
        })),
      ];

      const mockPaginator1 = createMockPaginator([pages[0], pages[1]]);
      const mockPaginator2 = createMockPaginator([pages[0]]); // Fresh iterator after refresh

      let iteratorCount = 0;
      const mockList = {
        [Symbol.asyncIterator]: jest.fn(() => {
          iteratorCount++;
          return iteratorCount === 1 ? mockPaginator1 : mockPaginator2;
        }),
      };

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
          limit: 20,
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(20));

      // Load more (uses first iterator)
      await act(async () => {
        await result.current.loadMore();
      });
      expect(result.current.posts.length).toBe(40);

      // Refresh (should create new iterator)
      await act(async () => {
        await result.current.refresh();
      });

      // After refresh, should have reset to fresh posts
      expect(result.current.posts.length).toBe(20);

      // Symbol.asyncIterator should have been called twice: once for initial, once for refresh
      expect(mockList[Symbol.asyncIterator]).toHaveBeenCalledTimes(2);
    });
  });

  describe("Iterator state management", () => {
    it("should initialize iterator with maxId from oldest post on first loadMore", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const initialPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `${100 - i}`, // Descending IDs
        account: { id: "acc1", username: "u" },
      }));

      const olderPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `${80 - i}`,
        account: { id: "acc1", username: "u" },
      }));

      let capturedParams: any = null;
      const mockList = jest.fn((params) => {
        capturedParams = params;
        const isOlderRequest = params?.maxId !== undefined;
        return {
          [Symbol.asyncIterator]: function* () {
            yield isOlderRequest ? olderPosts : initialPosts;
          },
        };
      });

      getActiveClient.mockResolvedValue({
        client: {
          v1: {
            timelines: {
              home: {
                list: mockList,
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

      // Initial load should not have maxId
      expect(capturedParams).toEqual({ limit: 20 });

      // Call loadMore
      await act(async () => {
        await result.current.loadMore();
      });

      // Should have called list() again with maxId = oldest post ID (81)
      expect(mockList).toHaveBeenCalledTimes(2);
      expect(capturedParams).toEqual({ limit: 20, maxId: "81" }); // Oldest from initial: 100, 99, ..., 81
    });
  });

  describe("jumpToPost", () => {
    it("should display target post at top with older posts below", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const targetPostId = "100";

      // Mock posts older than target (90-99)
      const olderPosts = Array.from({ length: 19 }, (_, i) => ({
        id: `${99 - i}`, // 99, 98, 97... down to 81
        content: `Older ${99 - i}`,
        account: { id: "acc1", username: "u", displayName: "U" },
      }));

      const targetPost = {
        id: targetPostId,
        content: "Target post",
        account: { id: "acc1", username: "u", displayName: "U" },
      };

      const mockClient = {
        v1: {
          timelines: {
            home: {
              list: jest.fn((params) => {
                const asyncIterableGenerator = async function* () {
                  // Should never be called for jumpToPost (it uses direct API calls)
                  yield [];
                };
                return {
                  [Symbol.asyncIterator]: asyncIterableGenerator,
                };
              }),
            },
          },
          statuses: {
            $select: jest.fn((id) => ({
              fetch: jest.fn().mockResolvedValue(targetPost),
            })),
          },
        },
      };

      // Mock fetchPosts calls
      const originalFetch = global.fetch;
      global.fetch = jest.fn((url: string) => {
        if (url.includes("maxId")) {
          // Return older posts
          return Promise.resolve({
            json: () => Promise.resolve(olderPosts),
          });
        }
        return Promise.resolve({
          json: () => Promise.resolve([]),
        });
      }) as any;

      getActiveClient.mockResolvedValue({ client: mockClient });

      const { result } = renderHook(() =>
        useFeed({
          feedType: "home",
          limit: 20,
        }),
      );

      // Call jumpToPost
      await act(async () => {
        await result.current.jumpToPost(targetPostId);
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Should have 20 posts: 1 target + 19 older
      expect(result.current.posts.length).toBe(20);

      // Target post should be at the top (index 0)
      expect(result.current.posts[0].id).toBe(targetPostId);

      // Posts after target should be older (in descending order)
      expect(result.current.posts[1].id).toBe("99");
      expect(result.current.posts[19].id).toBe("81");

      global.fetch = originalFetch;
    });

    it("should reset iterators when jumping to post", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const initialPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `${200 - i}`,
        account: { id: "acc1", username: "u" },
      }));

      const targetPost = { id: "100", account: { id: "acc1", username: "u" } };
      const centeredPosts = Array.from({ length: 10 }, (_, i) => ({
        id: `${95 - i}`,
        account: { id: "acc1", username: "u" },
      }));

      let paginatorCreated = false;
      const mockList = {
        [Symbol.asyncIterator]: function* () {
          paginatorCreated = true;
          yield initialPosts;
        },
      };

      const mockClient = {
        v1: {
          timelines: {
            home: {
              list: jest.fn(() => mockList),
            },
          },
          statuses: {
            $select: jest.fn(() => ({
              fetch: jest.fn().mockResolvedValue(targetPost),
            })),
          },
        },
      };

      getActiveClient.mockResolvedValue({ client: mockClient });

      const { result } = renderHook(() =>
        useFeed({
          feedType: "home",
          limit: 20,
        }),
      );

      // Wait for initial load
      await waitFor(() => expect(result.current.posts.length).toBe(20));

      // Load more to create the older iterator
      await act(async () => {
        await result.current.loadMore();
      });

      const postsBeforeJump = result.current.posts.length;

      // Now jump to a different post - this should reset iterators
      await act(async () => {
        await result.current.jumpToPost("100");
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // After jump, should have new set of posts centered on target
      // This verifies iterators were reset (not continuing from old position)
      expect(result.current.posts).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "200" })]),
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle empty initial response", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const mockList = {
        [Symbol.asyncIterator]: function* () {
          yield []; // Empty response
        },
      };

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
          limit: 20,
        }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.posts.length).toBe(0);
      expect(result.current.hasMore).toBe(false);
    });

    it("should handle iterator errors gracefully", async () => {
      const { getActiveClient } = require("@lib/api/client");

      const mockPaginator = {
        next: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: Array.from({ length: 20 }, (_, i) => ({
              id: `${i}`,
              account: { id: "a" },
            })),
          })
          .mockRejectedValueOnce(new Error("Network error")),
      };

      const mockList = {
        [Symbol.asyncIterator]: () => mockPaginator,
      };

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
          limit: 20,
        }),
      );

      await waitFor(() => expect(result.current.posts.length).toBe(20));

      // Try to load more (will fail)
      await act(async () => {
        await result.current.loadMore();
      });

      // Should handle error gracefully
      expect(result.current.isLoadingMore).toBe(false);
      expect(result.current.error).toBeTruthy();
      expect(result.current.posts.length).toBe(20); // Should keep existing posts
    });
  });
});
