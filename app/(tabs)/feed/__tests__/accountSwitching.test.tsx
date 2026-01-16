/**
 * Tests for Account-Specific Feed Cache Keys
 * Validates that feed cache keys include instance ID to prevent cross-account data leakage
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { FeedScreenBase } from "../[id]";
import { storageService } from "@lib/storage";

// Mock dependencies
jest.mock("@contexts/AuthContext");
jest.mock("@contexts/ThemeContext", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    colors: {
      background: "#ffffff",
      text: "#000000",
      textSecondary: "#666666",
      primary: "#6364FF",
      card: "#f5f5f5",
      border: "#e0e0e0",
      error: "#dc2626",
    },
  }),
}));
jest.mock("@lib/storage");
jest.mock("@lib/api/client", () => ({
  getActiveClient: jest.fn(),
  withRetry: jest.fn((fn) => fn()),
  RequestPriority: {
    HIGH: 0,
    NORMAL: 1,
    LOW: 2,
  },
}));
jest.mock("@hooks/useFeed", () => ({
  useFeed: jest.fn(),
}));
jest.mock("@hooks/useFeedViewPreference", () => ({
  useFeedViewPreference: jest.fn(() => ({
    isGridView: false,
    setIsGridView: jest.fn(),
  })),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

const mockStorageService = storageService as jest.Mocked<typeof storageService>;
const authContext = require("@contexts/AuthContext");
const { useAuth } = authContext;

describe("FeedScreenBase - Account-Specific Cache Keys", () => {
  const mockInstance1 = {
    id: "https://mastodon.social@38659",
    url: "https://mastodon.social",
    accountId: "38659",
    username: "alice",
    displayName: "Alice Wonderland",
    domain: "mastodon.social",
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    isActive: true,
  };

  const mockInstance2 = {
    id: "https://pixelfed.art@789985506400358219",
    url: "https://pixelfed.art",
    accountId: "789985506400358219",
    username: "bob",
    displayName: "Bob Builder",
    domain: "pixelfed.art",
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    isActive: true,
  };

  const mockUser1 = {
    id: "38659",
    username: "alice",
    displayName: "Alice Wonderland",
    avatar: "https://example.com/alice.jpg",
  };

  const mockUser2 = {
    id: "789985506400358219",
    username: "bob",
    displayName: "Bob Builder",
    avatar: "https://example.com/bob.jpg",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for useAuth
    useAuth.mockReturnValue({
      instance: mockInstance1,
      user: mockUser1,
      isAuthenticated: true,
      isLoading: false,
    });

    // Mock storage
    mockStorageService.getCachedPosts = jest.fn().mockResolvedValue([]);
    mockStorageService.isCacheValid = jest.fn().mockReturnValue(false);
    mockStorageService.saveCachedPosts = jest.fn().mockResolvedValue(undefined);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  );

  it("should generate cache key with instance ID for home feed", () => {
    const { useFeed } = require("@hooks/useFeed");

    useFeed.mockReturnValue({
      posts: [],
      isLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: true,
      error: null,
      refresh: jest.fn(),
      loadMore: jest.fn(),
      reload: jest.fn(),
      jumpToPost: jest.fn(),
      loadFromAnchor: jest.fn(),
      removePost: jest.fn(),
      applyPendingNewPosts: jest.fn(),
      handleViewableItemsChanged: jest.fn(),
      updatePost: jest.fn(),
      updateViewportPosition: jest.fn(),
      pendingNewPosts: [],
    });

    render(<FeedScreenBase routeId="home" />, { wrapper });

    // Verify useFeed was called with account-specific cache key
    expect(useFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        feedType: "home",
        feedId: undefined,
        cacheKey: "https://mastodon.social@38659_feed_home",
        enableCache: true,
      }),
    );
  });

  it("should generate different cache keys for different accounts", () => {
    const { useFeed } = require("@hooks/useFeed");

    useFeed.mockReturnValue({
      posts: [],
      isLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: true,
      error: null,
      refresh: jest.fn(),
      loadMore: jest.fn(),
      reload: jest.fn(),
      jumpToPost: jest.fn(),
      loadFromAnchor: jest.fn(),
      removePost: jest.fn(),
      applyPendingNewPosts: jest.fn(),
      handleViewableItemsChanged: jest.fn(),
      updatePost: jest.fn(),
      updateViewportPosition: jest.fn(),
      pendingNewPosts: [],
    });

    // Render with first account
    const { rerender } = render(<FeedScreenBase routeId="home" />, {
      wrapper,
    });

    expect(useFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: "https://mastodon.social@38659_feed_home",
      }),
    );

    // Switch to second account
    useAuth.mockReturnValue({
      instance: mockInstance2,
      user: mockUser2,
      isAuthenticated: true,
      isLoading: false,
    });

    rerender(<FeedScreenBase routeId="home" />);

    // Verify useFeed was called with different cache key for second account
    expect(useFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: "https://pixelfed.art@789985506400358219_feed_home",
      }),
    );

    // Verify cache keys are different
    const calls = useFeed.mock.calls;
    const firstCacheKey = calls[0][0].cacheKey;
    const secondCacheKey = calls[1][0].cacheKey;
    expect(firstCacheKey).not.toBe(secondCacheKey);
  });

  it("should generate account-specific cache keys for different feed types", () => {
    const { useFeed } = require("@hooks/useFeed");

    useFeed.mockReturnValue({
      posts: [],
      isLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: true,
      error: null,
      refresh: jest.fn(),
      loadMore: jest.fn(),
      reload: jest.fn(),
      jumpToPost: jest.fn(),
      loadFromAnchor: jest.fn(),
      removePost: jest.fn(),
      applyPendingNewPosts: jest.fn(),
      handleViewableItemsChanged: jest.fn(),
      updatePost: jest.fn(),
      updateViewportPosition: jest.fn(),
      pendingNewPosts: [],
    });

    // Test home feed
    const { rerender } = render(<FeedScreenBase routeId="home" />, {
      wrapper,
    });

    expect(useFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: "https://mastodon.social@38659_feed_home",
      }),
    );

    // Test public feed
    rerender(<FeedScreenBase routeId="public" />);

    expect(useFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: "https://mastodon.social@38659_feed_public",
      }),
    );

    // Test account feed
    rerender(<FeedScreenBase routeId="account/123" />);

    expect(useFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: "https://mastodon.social@38659_feed_account_123",
      }),
    );
  });

  it("should use undefined cache key when instance is null", () => {
    const { useFeed } = require("@hooks/useFeed");

    useAuth.mockReturnValue({
      instance: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    useFeed.mockReturnValue({
      posts: [],
      isLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: true,
      error: null,
      refresh: jest.fn(),
      loadMore: jest.fn(),
      reload: jest.fn(),
      jumpToPost: jest.fn(),
      loadFromAnchor: jest.fn(),
      removePost: jest.fn(),
      applyPendingNewPosts: jest.fn(),
      handleViewableItemsChanged: jest.fn(),
      updatePost: jest.fn(),
      updateViewportPosition: jest.fn(),
      pendingNewPosts: [],
    });

    render(<FeedScreenBase routeId="home" />, { wrapper });

    // When instance is null, cacheKey should be undefined
    expect(useFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: undefined,
      }),
    );
  });

  it("should update cache key when instance changes", () => {
    const { useFeed } = require("@hooks/useFeed");

    useFeed.mockReturnValue({
      posts: [],
      isLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: true,
      error: null,
      refresh: jest.fn(),
      loadMore: jest.fn(),
      reload: jest.fn(),
      jumpToPost: jest.fn(),
      loadFromAnchor: jest.fn(),
      removePost: jest.fn(),
      applyPendingNewPosts: jest.fn(),
      handleViewableItemsChanged: jest.fn(),
      updatePost: jest.fn(),
      updateViewportPosition: jest.fn(),
      pendingNewPosts: [],
    });

    // Initial render with account 1
    const { rerender } = render(<FeedScreenBase routeId="home" />, {
      wrapper,
    });

    const firstCall = useFeed.mock.calls[0][0];
    expect(firstCall.cacheKey).toBe("https://mastodon.social@38659_feed_home");

    // Switch to account 2
    useAuth.mockReturnValue({
      instance: mockInstance2,
      user: mockUser2,
      isAuthenticated: true,
      isLoading: false,
    });

    rerender(<FeedScreenBase routeId="home" />);

    // Should have been called again with new cache key
    const calls = useFeed.mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.cacheKey).toBe(
      "https://pixelfed.art@789985506400358219_feed_home",
    );
  });
});
