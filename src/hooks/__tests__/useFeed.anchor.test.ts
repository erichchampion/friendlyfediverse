/**
 * Anchor-Based Feed Loading Tests (TDD)
 *
 * Tests for loading a feed anchored around a specific post.
 * When clicking a grid item or switching views, instead of scrolling to the post,
 * we load that post as an anchor and fetch surrounding context.
 *
 * This solves the variable height problem - no need for height estimation!
 */

import { renderHook, waitFor, act } from "@testing-library/react-native";
import { useFeed } from "../useFeed";
import * as client from "@lib/api/client";
import type { Post } from "@types";
import type { mastodon } from "masto";

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
    url: `https://test.com/${status.id}`,
    visibility: "public",
    sensitive: false,
    spoilerText: "",
    reblogged: false,
    favourited: false,
    bookmarked: false,
    emojis: [],
    reblog: null,
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
    instance: {
      id: "test-instance",
      url: "https://mastodon.social",
    },
    user: { id: "user123" },
  }),
}));

// Create a mock raw mastodon.v1.Status (before transformation)
const createMockStatus = (
  id: string,
  content: string = "",
): mastodon.v1.Status =>
  ({
    id,
    uri: `https://mastodon.social/@user/${id}`,
    url: `https://mastodon.social/@user/${id}`,
    createdAt: new Date(Date.now() - parseInt(id) * 1000).toISOString(),
    content: content || `Post ${id}`,
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
    reblogged: false,
    favourited: false,
    bookmarked: false,
    account: {
      id: "user123",
      username: "testuser",
      acct: "testuser",
      displayName: "Test User",
      avatar: "https://example.com/avatar.jpg",
      header: "https://example.com/header.jpg",
      followersCount: 100,
      followingCount: 50,
      statusesCount: 200,
      note: "Test bio",
      url: "https://mastodon.social/@testuser",
      bot: false,
      locked: false,
      createdAt: new Date().toISOString(),
    },
    reblog: null,
  }) as mastodon.v1.Status;

// Helper to create a transformed Post for assertions
const createMockPost = (id: string, content: string = ""): Post => ({
  id,
  uri: `https://mastodon.social/@user/${id}`,
  url: `https://mastodon.social/@user/${id}`,
  createdAt: new Date(Date.now() - parseInt(id) * 1000).toISOString(),
  content: content || `Post ${id}`,
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
  reblogged: false,
  favourited: false,
  bookmarked: false,
  account: {
    id: "user123",
    username: "testuser",
    acct: "testuser",
    displayName: "Test User",
    avatar: "https://example.com/avatar.jpg",
    header: "https://example.com/header.jpg",
    followersCount: 100,
    followingCount: 50,
    statusesCount: 200,
    note: "Test bio",
    url: "https://mastodon.social/@testuser",
    bot: false,
    locked: false,
    createdAt: new Date().toISOString(),
  },
  reblog: null,
});

describe("useFeed - Anchor-based loading (TDD)", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock storage service
    const { storageService } = require("@lib/storage");
    storageService.getCachedPosts = jest.fn().mockResolvedValue(null);
    storageService.isCacheValid = jest.fn().mockReturnValue(false);
    storageService.saveCachedPosts = jest.fn().mockResolvedValue(undefined);

    // Default mock for getActiveClient (can be overridden in individual tests)
    const { getActiveClient } = require("@lib/api/client");
    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockReturnValue({
                async *[Symbol.asyncIterator]() {
                  yield [];
                },
              }),
            },
          },
        },
      },
      instanceUrl: "https://mastodon.social",
    });
  });

  describe("loadFromAnchor function", () => {
    it("should expose a loadFromAnchor function", () => {
      const { result } = renderHook(() =>
        useFeed({ feedType: "home", enableCache: false }),
      );

      expect(result.current.loadFromAnchor).toBeDefined();
      expect(typeof result.current.loadFromAnchor).toBe("function");
    });

    it("should load the anchor post and surrounding context", async () => {
      // Create raw mastodon.v1.Status objects (before transformation)
      const anchorStatus = createMockStatus("100", "Anchor post");
      const olderStatuses = [
        createMockStatus("99", "Older 1"),
        createMockStatus("98", "Older 2"),
      ];
      const newerStatuses = [
        createMockStatus("101", "Newer 1"),
        createMockStatus("102", "Newer 2"),
      ];

      // Mock API calls
      const mockGetActiveClient = jest.spyOn(client, "getActiveClient");

      // Create persistent mock functions
      const mockStatusFetch = jest.fn().mockResolvedValue(anchorStatus);
      const mockContextFetch = jest.fn().mockResolvedValue({
        ancestors: olderStatuses,
        descendants: newerStatuses,
      });

      // Mock the client with both timeline and anchor loading capabilities
      const mockClient = {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockReturnValue({
                async *[Symbol.asyncIterator]() {
                  yield [];
                },
              }),
            },
          },
          statuses: {
            $select: jest.fn(() => ({
              fetch: mockStatusFetch,
              context: {
                fetch: mockContextFetch,
              },
            })),
          },
        },
      };

      mockGetActiveClient.mockResolvedValue({
        client: mockClient as any,
        instanceUrl: "https://mastodon.social",
      });

      const { result } = renderHook(() =>
        useFeed({ feedType: "home", enableCache: false }),
      );

      // Wait for initial load to complete (it will return empty array)
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.loadFromAnchor("100");
      });

      await waitFor(() => {
        expect(result.current.posts).toHaveLength(5);
      });

      // Posts should be in chronological order (newest first)
      expect(result.current.posts[0].id).toBe("102");
      expect(result.current.posts[1].id).toBe("101");
      expect(result.current.posts[2].id).toBe("100"); // Anchor in middle
      expect(result.current.posts[3].id).toBe("99");
      expect(result.current.posts[4].id).toBe("98");
    });

    it("should clear existing posts when loading from anchor", async () => {
      const existingStatuses = [
        createMockStatus("1", "Existing 1"),
        createMockStatus("2", "Existing 2"),
      ];
      const anchorStatus = createMockStatus("100", "Anchor post");

      const mockGetActiveClient = jest.spyOn(client, "getActiveClient");

      // Set up mock that handles both timeline and anchor loading
      const mockStatusFetch = jest.fn().mockResolvedValue(anchorStatus);
      const mockContextFetch = jest.fn().mockResolvedValue({
        ancestors: [],
        descendants: [],
      });

      const mockClient = {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockReturnValue({
                async *[Symbol.asyncIterator]() {
                  yield existingStatuses;
                },
              }),
            },
          },
          statuses: {
            $select: jest.fn(() => ({
              fetch: mockStatusFetch,
              context: {
                fetch: mockContextFetch,
              },
            })),
          },
        },
      };

      mockGetActiveClient.mockResolvedValue({
        client: mockClient as any,
        instanceUrl: "https://mastodon.social",
      });

      const { result } = renderHook(() =>
        useFeed({ feedType: "home", enableCache: false }),
      );

      // Wait for initial load with existing posts
      await waitFor(() => {
        expect(result.current.posts).toHaveLength(2);
      });

      await act(async () => {
        await result.current.loadFromAnchor("100");
      });

      await waitFor(() => {
        expect(result.current.posts).toHaveLength(1);
        expect(result.current.posts[0].id).toBe("100");
      });
    });

    it("should set loading state while loading from anchor", async () => {
      const anchorStatus = createMockStatus("100");

      const mockGetActiveClient = jest.spyOn(client, "getActiveClient");
      mockGetActiveClient.mockResolvedValue({
        client: {
          v1: {
            statuses: {
              $select: jest.fn(() => ({
                fetch: jest.fn().mockResolvedValue(anchorStatus),
                context: {
                  fetch: jest.fn().mockResolvedValue({
                    ancestors: [],
                    descendants: [],
                  }),
                },
              })),
            },
          },
        },
      } as any);

      const { result } = renderHook(() =>
        useFeed({ feedType: "home", enableCache: false }),
      );

      let loadingDuringFetch = false;

      const loadPromise = act(async () => {
        const promise = result.current.loadFromAnchor("100");
        loadingDuringFetch = result.current.isLoading;
        await promise;
      });

      expect(loadingDuringFetch).toBe(true);

      await loadPromise;

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should handle errors when loading from anchor", async () => {
      const mockGetActiveClient = jest.spyOn(client, "getActiveClient");
      mockGetActiveClient.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() =>
        useFeed({ feedType: "home", enableCache: false }),
      );

      await act(async () => {
        await result.current.loadFromAnchor("100");
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.posts).toHaveLength(0);
      });
    });

    it("should support loading more posts after anchor load", async () => {
      const anchorStatus = createMockStatus("100");
      const olderStatuses = [createMockStatus("99")];
      const evenOlderStatuses = [
        createMockStatus("98"),
        createMockStatus("97"),
      ];

      const mockGetActiveClient = jest.spyOn(client, "getActiveClient");

      // Mock getDirectionalTimelinePaginator to return evenOlderStatuses
      const {
        getDirectionalTimelinePaginator,
      } = require("@lib/api/mastodonRequests");
      getDirectionalTimelinePaginator.mockReturnValue({
        next: jest.fn().mockResolvedValue({
          done: false,
          value: evenOlderStatuses,
        }),
      });

      // Set up persistent mocks
      const mockStatusFetch = jest.fn().mockResolvedValue(anchorStatus);
      const mockContextFetch = jest.fn().mockResolvedValue({
        ancestors: olderStatuses,
        descendants: [],
      });

      const mockClient = {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockReturnValue({
                async *[Symbol.asyncIterator]() {
                  yield [];
                },
              }),
            },
          },
          statuses: {
            $select: jest.fn(() => ({
              fetch: mockStatusFetch,
              context: {
                fetch: mockContextFetch,
              },
            })),
          },
        },
      };

      mockGetActiveClient.mockResolvedValue({
        client: mockClient as any,
        instanceUrl: "https://mastodon.social",
      });

      const { result } = renderHook(() =>
        useFeed({ feedType: "home", enableCache: false }),
      );

      // Wait for initial load to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.loadFromAnchor("100");
      });

      await waitFor(() => {
        expect(result.current.posts).toHaveLength(2);
      });

      // Load more (older posts) - the mock is already set up to yield evenOlderStatuses
      await act(async () => {
        await result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.posts).toHaveLength(4);
      });

      // Should have all posts in order
      expect(result.current.posts.map((p) => p.id)).toEqual([
        "100",
        "99",
        "98",
        "97",
      ]);
    });
  });

  describe("anchorPostId state", () => {
    it("should track which post is the anchor", async () => {
      const anchorStatus = createMockStatus("100");

      const mockGetActiveClient = jest.spyOn(client, "getActiveClient");
      mockGetActiveClient.mockResolvedValue({
        client: {
          v1: {
            statuses: {
              $select: jest.fn(() => ({
                fetch: jest.fn().mockResolvedValue(anchorStatus),
                context: {
                  fetch: jest.fn().mockResolvedValue({
                    ancestors: [],
                    descendants: [],
                  }),
                },
              })),
            },
          },
        },
      } as any);

      const { result } = renderHook(() =>
        useFeed({ feedType: "home", enableCache: false }),
      );

      expect(result.current.anchorPostId).toBeNull();

      await act(async () => {
        await result.current.loadFromAnchor("100");
      });

      await waitFor(() => {
        expect(result.current.anchorPostId).toBe("100");
      });
    });

    it("should clear anchor when loading normal timeline", async () => {
      const anchorStatus = createMockStatus("100");
      const timelineStatuses = [createMockStatus("1"), createMockStatus("2")];

      const mockGetActiveClient = jest.spyOn(client, "getActiveClient");

      // Set up persistent mocks
      const mockStatusFetch = jest.fn().mockResolvedValue(anchorStatus);
      const mockContextFetch = jest.fn().mockResolvedValue({
        ancestors: [],
        descendants: [],
      });

      // Track which data to return on timeline list calls
      let timelineCallCount = 0;
      const mockClient = {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockImplementation(() => ({
                async *[Symbol.asyncIterator]() {
                  timelineCallCount++;
                  // First call returns empty, second call returns timeline posts
                  yield timelineCallCount === 1 ? [] : timelineStatuses;
                },
              })),
            },
          },
          statuses: {
            $select: jest.fn(() => ({
              fetch: mockStatusFetch,
              context: {
                fetch: mockContextFetch,
              },
            })),
          },
        },
      };

      mockGetActiveClient.mockResolvedValue({
        client: mockClient as any,
        instanceUrl: "https://mastodon.social",
      });

      const { result } = renderHook(() =>
        useFeed({ feedType: "home", enableCache: false }),
      );

      // Wait for initial load to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.loadFromAnchor("100");
      });

      await waitFor(() => {
        expect(result.current.anchorPostId).toBe("100");
      });

      // Reload normal timeline - the mock will return timelineStatuses on the second call
      await act(async () => {
        await result.current.reload();
      });

      await waitFor(() => {
        expect(result.current.anchorPostId).toBeNull();
        expect(result.current.posts).toHaveLength(2);
      });
    });
  });
});
