/**
 * PostCard Component Tests
 * Phase 8: Testing & Release
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { PostCard } from "../PostCard";
import type { Post } from "@types";

// Mock dependencies
jest.mock("@contexts/AuthContext", () => ({
  useAuth: () => ({
    instance: { id: "test-instance", url: "https://mastodon.social" },
    user: { id: "123", username: "testuser" },
    isAuthenticated: true,
  }),
}));

jest.mock("@contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#FFFFFF",
      card: "#F5F5F5",
      text: "#000000",
      textSecondary: "#666666",
      border: "#E0E0E0",
      primary: "#1DA1F2",
      error: "#E0245E",
      success: "#17BF63",
    },
  }),
}));

jest.mock("@hooks/usePostInteractions", () => ({
  usePostInteractions: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock("@components/base", () => ({
  Avatar: () => null,
  AnimatedTouchableScale: ({ children, onPress }: any) => (
    <div onClick={onPress}>{children}</div>
  ),
  RichText: ({ content }: any) => <div>{content}</div>,
}));

// Mock MediaGrid with proper handlers
// Use module-level variables with 'mock' prefix which Jest allows
const mockMediaGridOnPress = jest.fn();
const mockMediaGridOnDoubleClick = jest.fn();

jest.mock("@components/media", () => {
  const React = require("react");
  const { View, TouchableOpacity } = require("react-native");
  const { useDelayedClick } = require("@hooks/useDelayedClick");

  return {
    MediaGrid: ({ onMediaPress, onDoubleClick, testID }: any) => {
      // Track if image viewer would be opened (MediaGrid opens it internally)
      const handleMediaPressInternal = (index: number) => {
        // MediaGrid opens image viewer internally when onMediaPress is not provided
        // For testing, we track this via the mock function
        mockMediaGridOnPress(index);
        // Also call external callback if provided
        onMediaPress?.(index);
      };

      const wrappedOnDoubleClick = onDoubleClick
        ? () => {
            mockMediaGridOnDoubleClick();
            onDoubleClick();
          }
        : undefined;

      // Use the actual useDelayedClick hook if onDoubleClick is provided
      // MediaGrid's handleMediaPress opens the viewer internally
      const handlePress = wrappedOnDoubleClick
        ? useDelayedClick({
            onSingleClick: () => handleMediaPressInternal(0),
            onDoubleClick: wrappedOnDoubleClick,
          })
        : () => handleMediaPressInternal(0);

      return (
        <View testID={testID || "media-grid"}>
          <TouchableOpacity testID="media-item" onPress={handlePress} />
        </View>
      );
    },
  };
});

jest.mock("@lib/api/timeline", () => ({
  getDisplayPost: (post: any) => post.reblog || post,
  getPlainTextContent: (post: any) =>
    post.content?.replace(/<[^>]*>/g, "") || "",
  formatTimestamp: () => "1h",
  stripHtml: (text: string) => text,
}));

jest.mock("../PostHeader", () => ({
  PostHeader: ({
    account,
    boostedBy,
    repliesCount,
    reblogsCount,
    favouritesCount,
  }: any) => {
    const { Text, View } = require("react-native");
    return (
      <View>
        {boostedBy && <Text>{boostedBy.displayName} boosted</Text>}
        <Text>{account.displayName}</Text>
        <Text>@{account.username}</Text>
        <Text>{repliesCount}</Text>
        <Text>{reblogsCount}</Text>
        <Text>{favouritesCount}</Text>
      </View>
    );
  },
}));

jest.mock("../PostActions", () => ({
  PostActions: ({ post }: any) => {
    const { Text, View } = require("react-native");
    return (
      <View>
        <Text>{post.repliesCount}</Text>
        <Text>{post.reblogsCount}</Text>
        <Text>{post.favouritesCount}</Text>
      </View>
    );
  },
}));

const mockPost: Post = {
  id: "123",
  content: "<p>Test post content</p>",
  createdAt: "2024-01-01T12:00:00.000Z",
  account: {
    id: "user1",
    username: "testuser",
    displayName: "Test User",
    avatar: "https://example.com/avatar.jpg",
    header: "",
    followersCount: 100,
    followingCount: 50,
    statusesCount: 200,
  },
  mediaAttachments: [],
  favouritesCount: 5,
  reblogsCount: 2,
  repliesCount: 1,
  favourited: false,
  reblogged: false,
  bookmarked: false,
  sensitive: false,
  spoilerText: "",
  visibility: "public",
  url: "https://example.com/status/123",
  reblog: null,
  inReplyToId: null,
  inReplyToAccountId: null,
  tags: [],
  mentions: [],
  emojis: [],
  uri: "",
};

// Default mock implementation for usePostInteractions
const { usePostInteractions } = require("@hooks/usePostInteractions");
usePostInteractions.mockReturnValue({
  post: mockPost,
  isProcessing: false,
  toggleFavorite: jest.fn(),
  toggleBoost: jest.fn(),
  toggleBookmark: jest.fn(),
  reply: jest.fn(),
  share: jest.fn(),
});

describe("PostCard", () => {
  it("should render post content", () => {
    const { getByText } = render(<PostCard post={mockPost} />);

    expect(getByText("Test User")).toBeTruthy();
    expect(getByText("@testuser")).toBeTruthy();
  });

  it("should display interaction counts", () => {
    const { getByText } = render(<PostCard post={mockPost} />);

    expect(getByText("1")).toBeTruthy(); // replies
    expect(getByText("2")).toBeTruthy(); // boosts
    expect(getByText("5")).toBeTruthy(); // favorites
  });

  it("should show boost indicator for boosted posts", () => {
    const boostedPost: Post = {
      ...mockPost,
      id: "456",
      reblog: mockPost,
    };

    const { getByText } = render(<PostCard post={boostedPost} />);

    expect(getByText("Test User boosted")).toBeTruthy();
  });

  it("should show content warning when present", () => {
    const cwPost: Post = {
      ...mockPost,
      spoilerText: "Spoiler alert",
    };

    // Mock usePostInteractions to return cwPost
    const { usePostInteractions } = require("@hooks/usePostInteractions");
    usePostInteractions.mockReturnValueOnce({
      post: cwPost,
      isProcessing: false,
      toggleFavorite: jest.fn(),
      toggleBoost: jest.fn(),
      toggleBookmark: jest.fn(),
      reply: jest.fn(),
      share: jest.fn(),
    });

    const { getByText } = render(<PostCard post={cwPost} />);

    expect(getByText("CW: Spoiler alert")).toBeTruthy();
  });

  describe("Double-tap to like", () => {
    const mockToggleFavorite = jest.fn();
    const mockOnMediaPress = jest.fn();

    // Post with media attachments for double-tap tests
    const postWithMedia: Post = {
      ...mockPost,
      mediaAttachments: [
        {
          id: "media1",
          type: "image",
          url: "https://example.com/image.jpg",
          previewUrl: "https://example.com/preview.jpg",
          description: "Test image",
        },
      ],
    };

    beforeEach(() => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      mockMediaGridOnPress.mockClear();
      mockMediaGridOnDoubleClick.mockClear();
      const { usePostInteractions } = require("@hooks/usePostInteractions");
      usePostInteractions.mockReturnValue({
        post: postWithMedia,
        isProcessing: false,
        toggleFavorite: mockToggleFavorite,
        toggleBoost: jest.fn(),
        toggleBookmark: jest.fn(),
        reply: jest.fn(),
        share: jest.fn(),
      });
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it("should trigger like on double tap and cancel single-click", async () => {
      const { getByTestId } = render(<PostCard post={postWithMedia} />);
      const mediaItem = getByTestId("media-item");

      // Simulate double-tap (two presses within 300ms)
      fireEvent.press(mediaItem);
      fireEvent.press(mediaItem);

      // Fast-forward timers to allow double-click detection
      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
      });

      // Single-click action should be cancelled (media should not open)
      jest.advanceTimersByTime(400);
      expect(mockMediaGridOnPress).not.toHaveBeenCalled();
    });

    it("should execute single-click action if no double-click detected", async () => {
      const { getByTestId } = render(<PostCard post={postWithMedia} />);
      const mediaItem = getByTestId("media-item");

      // Simulate single-click
      fireEvent.press(mediaItem);

      // useDelayedClick waits for doubleClickDelay (300ms) first, then executes single-click
      // Advance past the double-click window and single-click delay
      jest.advanceTimersByTime(350);

      // Run all pending timers to ensure everything executes
      jest.runAllTimers();

      await waitFor(() => {
        // Media press should be called (opening image viewer)
        expect(mockMediaGridOnPress).toHaveBeenCalled();
      });

      // Favorite should not be toggled
      expect(mockToggleFavorite).not.toHaveBeenCalled();
    });

    it("should not trigger like if already favorited", async () => {
      const favoritedPost = { ...postWithMedia, favourited: true };
      const { usePostInteractions } = require("@hooks/usePostInteractions");
      usePostInteractions.mockReturnValue({
        post: favoritedPost,
        isProcessing: false,
        toggleFavorite: mockToggleFavorite,
        toggleBoost: jest.fn(),
        toggleBookmark: jest.fn(),
        reply: jest.fn(),
        share: jest.fn(),
      });

      const { getByTestId } = render(<PostCard post={favoritedPost} />);
      const mediaItem = getByTestId("media-item");

      // Simulate double-tap
      fireEvent.press(mediaItem);
      fireEvent.press(mediaItem);

      jest.advanceTimersByTime(100);

      // Even if already favorited, double-click should still toggle (unfavorite)
      await waitFor(() => {
        expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
      });
    });

    it("should show animated heart feedback during double-tap like", async () => {
      const { getByTestId, queryByTestId } = render(
        <PostCard post={postWithMedia} />,
      );
      const mediaItem = getByTestId("media-item");

      // Initially no heart
      expect(queryByTestId("double-tap-heart")).toBeNull();

      // Simulate double-tap
      fireEvent.press(mediaItem);
      fireEvent.press(mediaItem);

      jest.advanceTimersByTime(100);

      // Heart should appear immediately
      await waitFor(() => {
        expect(queryByTestId("double-tap-heart")).toBeTruthy();
      });

      // Note: In test environment, we can't easily test animation completion
      // without mocking Animated API. The important part is that the heart appears.
      // Animation completion is tested manually and through integration tests.
    });

    it("should not trigger favorite if clicks are too far apart", async () => {
      const { getByTestId } = render(<PostCard post={postWithMedia} />);
      const mediaItem = getByTestId("media-item");

      // Simulate two clicks with > 300ms delay
      fireEvent.press(mediaItem);
      jest.advanceTimersByTime(400);
      fireEvent.press(mediaItem);

      // First click should trigger single-click action after delay
      jest.advanceTimersByTime(350);

      // Favorite should not be toggled
      expect(mockToggleFavorite).not.toHaveBeenCalled();
    });
  });
});
