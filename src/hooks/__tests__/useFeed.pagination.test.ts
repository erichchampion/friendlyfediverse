/**
 * Tests for pagination loop issues in useFeed
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

describe.skip("useFeed pagination loop detection", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock storage service
    const { storageService } = require("@lib/storage");
    storageService.getCachedPosts = jest.fn().mockResolvedValue(null);
    storageService.isCacheValid = jest.fn().mockReturnValue(false);
    storageService.saveCachedPosts = jest.fn().mockResolvedValue(undefined);
  });

  it("should detect infinite pagination when API returns same posts", async () => {
    const { getActiveClient } = require("@lib/api/client");
    const mockPosts = Array.from({ length: 20 }, (_, i) => ({
      id: `post-${i}`,
      content: `Post ${i}`,
      createdAt: new Date().toISOString(),
      account: { id: "acc1", username: "user" },
    }));

    // Mock API to return same posts every time (simulating end of feed)
    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest.fn().mockResolvedValue(mockPosts),
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

    // First loadMore
    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    const postsAfterFirst = result.current.posts.length;

    // Second loadMore - should not add duplicates
    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    // ASSERTION: Posts should not grow if API returns duplicates
    expect(result.current.posts.length).toBe(postsAfterFirst);

    // ASSERTION: hasMore should be false if no new unique posts
    expect(result.current.hasMore).toBe(false);
  });

  it("should set hasMore=false when fewer posts returned than limit", async () => {
    const { getActiveClient } = require("@lib/api/client");

    getActiveClient.mockResolvedValue({
      client: {
        v1: {
          timelines: {
            home: {
              list: jest
                .fn()
                .mockResolvedValueOnce(
                  Array.from({ length: 20 }, (_, i) => ({ id: `${i}` })),
                )
                .mockResolvedValueOnce(
                  Array.from({ length: 5 }, (_, i) => ({ id: `${i + 20}` })),
                ), // Only 5 posts
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

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    // ASSERTION: hasMore should be false when API returns fewer than limit
    expect(result.current.hasMore).toBe(false);
    expect(result.current.posts.length).toBe(25);
  });
});
