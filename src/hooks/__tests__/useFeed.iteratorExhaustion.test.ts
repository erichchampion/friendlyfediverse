/**
 * Test to debug iterator exhaustion behavior
 * This test simulates the scenario where an iterator returns empty then done,
 * and we need to verify that pagination continues correctly
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useFeed } from "../useFeed";
import { getDirectionalTimelinePaginator } from "@lib/api/mastodonRequests";

// Mock dependencies
jest.mock("@/config", () => {
  const actual = jest.requireActual("@/config");
  return {
    ...actual,
    FEED_CONFIG: {
      ...actual.FEED_CONFIG,
      MAX_TOTAL_POSTS: 50,
    },
    UI_CONFIG: {
      ...actual.UI_CONFIG,
      POST_BUFFER_SIZE: 50,
      TRIM_THRESHOLD: 50,
      TRIM_CHUNK_SIZE: 200,
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
jest.mock("@lib/api/mastodonRequests");
jest.mock("@contexts/AuthContext", () => ({
  useAuth: () => ({
    instance: { id: "test-instance", url: "https://test.social" },
  }),
}));

describe("useFeed - Iterator Exhaustion Debug", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock storage service
    const { storageService } = require("@lib/storage");
    storageService.getCachedPosts = jest.fn().mockResolvedValue(null);
    storageService.isCacheValid = jest.fn().mockReturnValue(false);
    storageService.saveCachedPosts = jest.fn().mockResolvedValue(undefined);
  });

  it("should continue pagination after iterator returns empty then done", async () => {
    const { getActiveClient } = require("@lib/api/client");

    // Scenario: First iterator returns some posts, then empty, then done
    // Second iterator (with same maxId) should also return empty then done
    // But what if there ARE more posts? This test helps us understand the behavior

    // Create posts with IDs that decrease (older posts have lower IDs)
    const createPosts = (startId: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `post-${startId - i}`,
        content: `Post ${startId - i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user", displayName: "User" },
      }));

    // First iterator: returns 20 posts, then empty, then done
    let iterator1CallCount = 0;
    const iterator1 = {
      next: jest.fn(async () => {
        iterator1CallCount++;
        if (iterator1CallCount === 1) {
          // First call: return 20 posts
          return { done: false, value: createPosts(100, 20) };
        } else if (iterator1CallCount === 2) {
          // Second call: return empty array (but not done)
          return { done: false, value: [] };
        } else {
          // Third call: return done
          return { done: true, value: undefined };
        }
      }),
    };

    // Second iterator: created with same maxId (post-80), also returns empty then done
    let iterator2CallCount = 0;
    const iterator2 = {
      next: jest.fn(async () => {
        iterator2CallCount++;
        if (iterator2CallCount === 1) {
          // First call: return empty array (but not done)
          return { done: false, value: [] };
        } else {
          // Second call: return done
          return { done: true, value: undefined };
        }
      }),
    };

    // Third iterator: created with same maxId again
    let iterator3CallCount = 0;
    const iterator3 = {
      next: jest.fn(async () => {
        iterator3CallCount++;
        if (iterator3CallCount === 1) {
          return { done: false, value: [] };
        } else {
          return { done: true, value: undefined };
        }
      }),
    };

    // Fourth iterator: created with same maxId again
    let iterator4CallCount = 0;
    const iterator4 = {
      next: jest.fn(async () => {
        iterator4CallCount++;
        if (iterator4CallCount === 1) {
          return { done: false, value: [] };
        } else {
          return { done: true, value: undefined };
        }
      }),
    };

    // Fifth iterator: created with same maxId again
    let iterator5CallCount = 0;
    const iterator5 = {
      next: jest.fn(async () => {
        iterator5CallCount++;
        if (iterator5CallCount === 1) {
          return { done: false, value: [] };
        } else {
          return { done: true, value: undefined };
        }
      }),
    };

    // Sixth iterator: created with same maxId again (to reach counter = 5)
    let iterator6CallCount = 0;
    const iterator6 = {
      next: jest.fn(async () => {
        iterator6CallCount++;
        if (iterator6CallCount === 1) {
          return { done: false, value: [] };
        } else {
          return { done: true, value: undefined };
        }
      }),
    };

    // Mock getDirectionalTimelinePaginator to return different iterators based on maxId
    let paginatorCallCount = 0;
    (getDirectionalTimelinePaginator as jest.Mock).mockImplementation(() => {
      paginatorCallCount++;
      if (paginatorCallCount === 1) {
        return iterator1;
      } else if (paginatorCallCount === 2) {
        return iterator2;
      } else if (paginatorCallCount === 3) {
        return iterator3;
      } else if (paginatorCallCount === 4) {
        return iterator4;
      } else if (paginatorCallCount === 5) {
        return iterator5;
      } else {
        return iterator6;
      }
    });

    // Mock initial fetch - use the same pattern as other tests
    const initialPage = createPosts(120, 20);
    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn(() => ({
                [Symbol.asyncIterator]: jest.fn(function* () {
                  yield initialPage;
                }),
              })),
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
    expect(result.current.posts[0].id).toBe("post-120");
    expect(result.current.posts[19].id).toBe("post-101");

    // Call loadMore - should use iterator1, get 20 more posts
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.posts.length).toBe(40));
    expect(result.current.hasMore).toBe(true);
    expect(iterator1CallCount).toBe(1); // First call returned posts

    // Call loadMore again - iterator1 should return empty
    await act(async () => {
      await result.current.loadMore();
    });
    expect(iterator1CallCount).toBe(2); // Second call returned empty

    // Call loadMore again - iterator1 should return done, iterator should be reset
    await act(async () => {
      await result.current.loadMore();
    });
    expect(iterator1CallCount).toBe(3); // Third call returned done
    expect(paginatorCallCount).toBe(1); // Still using first iterator

    // Call loadMore again - should create iterator2 with same maxId
    await act(async () => {
      await result.current.loadMore();
    });
    expect(paginatorCallCount).toBe(2); // Created second iterator
    expect(iterator2CallCount).toBe(1); // First call returned empty

    // Call loadMore again - iterator2 should return done
    await act(async () => {
      await result.current.loadMore();
    });
    expect(iterator2CallCount).toBe(2); // Second call returned done

    // Call loadMore again - should create iterator3 with same maxId
    await act(async () => {
      await result.current.loadMore();
    });
    expect(paginatorCallCount).toBe(3); // Created third iterator
    expect(iterator3CallCount).toBe(1); // First call returned empty

    // Call loadMore again - iterator3 should return done (counter = 2 at this point)
    await act(async () => {
      await result.current.loadMore();
    });
    expect(iterator3CallCount).toBe(2); // Second call returned done
    expect(paginatorCallCount).toBe(3); // Created third iterator

    // After 5 consecutive empty results, should mark as exhausted
    // Counter progression:
    // - iterator1: got posts, so counter reset to 0
    // - iterator2 created (retrying): counter = 1, returns empty then done
    // - iterator3 created (retrying): counter = 2, returns empty then done
    // - iterator4 created (retrying): counter = 3, returns empty then done
    // - iterator5 created (retrying): counter = 4, returns empty then done
    // - iterator6 created (retrying): counter = 5, returns empty then done -> mark exhausted

    // Continue calling loadMore until exhausted (should be 2 more iterations to reach 5)
    // Iterator 4
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.loadMore();
      });
    }

    // Iterator 5
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.loadMore();
      });
    }

    // Iterator 6 - this should mark as exhausted when done
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.loadMore();
      });
    }

    // After iterator6 returns done with counter = 5, should mark as exhausted
    await waitFor(
      () => {
        expect(result.current.hasMore).toBe(false);
      },
      { timeout: 5000 },
    );
  });

  it("should continue pagination when new posts are available after empty result", async () => {
    const { getActiveClient } = require("@lib/api/client");

    // Scenario: First iterator returns posts, then empty, then done
    // Second iterator (with same maxId initially) actually has more posts available
    // This tests if our logic correctly continues when posts ARE available

    const createPosts = (startId: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `post-${startId - i}`,
        content: `Post ${startId - i}`,
        createdAt: new Date().toISOString(),
        account: { id: "acc1", username: "user", displayName: "User" },
      }));

    // First iterator: returns 20 posts, then empty, then done
    let iterator1CallCount = 0;
    const iterator1 = {
      next: jest.fn(async () => {
        iterator1CallCount++;
        if (iterator1CallCount === 1) {
          return { done: false, value: createPosts(100, 20) };
        } else if (iterator1CallCount === 2) {
          return { done: false, value: [] };
        } else {
          return { done: true, value: undefined };
        }
      }),
    };

    // Second iterator: has MORE posts available (simulating that API has posts but first iterator didn't get them)
    let iterator2CallCount = 0;
    const iterator2 = {
      next: jest.fn(async () => {
        iterator2CallCount++;
        if (iterator2CallCount === 1) {
          // This time we actually get posts!
          return { done: false, value: createPosts(80, 20) };
        } else {
          return { done: true, value: undefined };
        }
      }),
    };

    let paginatorCallCount = 0;
    (getDirectionalTimelinePaginator as jest.Mock).mockImplementation(() => {
      paginatorCallCount++;
      if (paginatorCallCount === 1) {
        return iterator1;
      } else {
        return iterator2;
      }
    });

    const initialPage = createPosts(120, 20);
    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn(() => ({
                [Symbol.asyncIterator]: jest.fn(function* () {
                  yield initialPage;
                }),
              })),
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

    // Load more - get 20 posts from iterator1
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.posts.length).toBe(40));

    // Load more - iterator1 returns empty
    await act(async () => {
      await result.current.loadMore();
    });

    // Load more - iterator1 returns done, should reset and create iterator2
    await act(async () => {
      await result.current.loadMore();
    });

    // Load more - iterator2 should return posts
    await act(async () => {
      await result.current.loadMore();
    });

    // Should have more posts now (but trimmed to 50 due to memory cap)
    await waitFor(() => {
      // Posts are trimmed to 50 due to POST_BUFFER_SIZE, but we did fetch 60
      expect(result.current.posts.length).toBe(50);
      expect(result.current.hasMore).toBe(true);
    });

    // Consecutive empty results counter should be reset because we got posts
    expect(paginatorCallCount).toBe(2);
  });
});
