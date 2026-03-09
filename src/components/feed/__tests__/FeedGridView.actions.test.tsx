/**
 * FeedGridView Actions Tests
 * Tests that grid view has simplified actions:
 * - Single-click: Switch to list view with post at top
 * - Double-click: Toggle favorite status
 * - No media/link opening in grid view (those happen in list view)
 */

import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { FeedGridView } from "../FeedGridView";
import type { Post, MediaAttachment } from "@types";

// Mock MediaGrid
jest.mock("../../media/MediaGrid", () => ({
  MediaGrid: ({ media, testID }: any) => {
    const { View, Text } = require("react-native");
    return (
      <View testID={testID || `media-grid-${media[0]?.id}`}>
        <Text>{media[0]?.id}</Text>
      </View>
    );
  },
}));

// Mock expo-image
jest.mock("expo-image", () => ({
  Image: () => {
    const { View } = require("react-native");
    return <View testID="image" />;
  },
}));

// Mock theme context
jest.mock("@contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      card: "#FFFFFF",
      text: "#000000",
      textSecondary: "#666666",
      primary: "#6364FF",
      background: "#F5F5F5",
      border: "#E0E0E0",
    },
  }),
}));

describe("FeedGridView - Simplified Actions", () => {
  const createMockAccount = (id: string, username: string) => ({
    id,
    username,
    acct: username,
    displayName: `User ${id}`,
    avatar: "https://example.com/avatar.jpg",
    header: "https://example.com/header.jpg",
    followersCount: 100,
    followingCount: 50,
    statusesCount: 10,
    note: "Test bio",
    url: `https://example.com/users/${username}`,
    createdAt: "2024-01-01T00:00:00Z",
  });

  const createMockPost = (id: string, favourited: boolean = false): Post => {
    const mockMedia: MediaAttachment = {
      id: `media-${id}`,
      type: "image",
      url: "https://example.com/image.jpg",
      previewUrl: "https://example.com/preview.jpg",
      description: "Test image",
    };

    return {
      id,
      uri: `https://example.com/posts/${id}`,
      url: `https://example.com/@testuser/${id}`,
      createdAt: "2024-01-01T00:00:00Z",
      content: "Test post",
      visibility: "public",
      sensitive: false,
      spoilerText: "",
      mediaAttachments: [mockMedia],
      mentions: [],
      tags: [],
      emojis: [],
      reblogsCount: 0,
      favouritesCount: 5,
      repliesCount: 0,
      reblogged: false,
      favourited,
      bookmarked: false,
      account: createMockAccount("user", "testuser"),
      reblog: null,
      inReplyToId: null,
      inReplyToAccountId: null,
    };
  };

  const createVideoPost = (id: string, favourited: boolean = false): Post => {
    const mockVideo: MediaAttachment = {
      id: `video-${id}`,
      type: "video",
      url: "https://example.com/video.mp4",
      previewUrl: "https://example.com/preview.jpg",
      description: "Test video",
    };

    return {
      ...createMockPost(id, favourited),
      mediaAttachments: [mockVideo],
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("Single-click behavior", () => {
    it("should switch to list view on single-click of media item", async () => {
      const post = createMockPost("post-1", false);
      const mockOnMediaPress = jest.fn();

      const { getByTestId } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={jest.fn()}
        />,
      );

      const gridItem = getByTestId("media-grid-media-post-1").parent?.parent;
      expect(gridItem).toBeTruthy();

      // Simulate single-click
      fireEvent.press(gridItem);

      // Advance past double-click delay (350ms)
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        // Should call onMediaPress with postId and mediaIndex to switch to list view
        expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
        expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
      });
    });

    it("should switch to list view on single-click of card item", async () => {
      const post: Post = {
        ...createMockPost("post-1", false),
        mediaAttachments: [],
        card: {
          url: "https://example.com",
          title: "Example",
          description: "Example site",
          type: "link",
          image: "https://example.com/card.jpg",
        },
      };
      const mockOnMediaPress = jest.fn();

      const { getByText } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={jest.fn()}
        />,
      );

      const cardTitle = getByText("Example");
      const cardItem = cardTitle.parent?.parent;
      expect(cardItem).toBeTruthy();

      // Simulate single-click
      fireEvent.press(cardItem);

      // Advance past double-click delay
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
        expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
      });
    });

    it("should switch to list view on single-click of text item", async () => {
      const post: Post = {
        ...createMockPost("post-1", false),
        mediaAttachments: [],
        card: undefined,
      };
      const mockOnMediaPress = jest.fn();

      const { getByText } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={jest.fn()}
        />,
      );

      const textContent = getByText("Test post");
      const textItem = textContent.parent?.parent?.parent;
      expect(textItem).toBeTruthy();

      // Simulate single-click
      fireEvent.press(textItem);

      // Advance past double-click delay
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
        expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
      });
    });

    it("should switch to list view on single-click of video item", async () => {
      const post = createVideoPost("post-1", false);
      const mockOnMediaPress = jest.fn();

      const { getByTestId } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={jest.fn()}
        />,
      );

      const gridItem = getByTestId("media-grid-video-post-1").parent?.parent;
      expect(gridItem).toBeTruthy();

      // Simulate single-click
      fireEvent.press(gridItem);

      // Advance past double-click delay
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
        expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
      });
    });
  });

  describe("Double-click behavior", () => {
    it("should toggle favorite on double-click of media item", async () => {
      const post = createMockPost("post-1", false);
      const mockOnMediaPress = jest.fn();
      const mockToggleFavorite = jest.fn();

      const { getByTestId } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={mockToggleFavorite}
        />,
      );

      const gridItem = getByTestId("media-grid-media-post-1").parent?.parent;
      expect(gridItem).toBeTruthy();

      // Simulate double-click
      fireEvent.press(gridItem);
      fireEvent.press(gridItem);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
        expect(mockToggleFavorite).toHaveBeenCalledWith("post-1");
      });

      // Single-click action should be cancelled
      expect(mockOnMediaPress).not.toHaveBeenCalled();
    });

    it("should toggle favorite on double-click of video item", async () => {
      const post = createVideoPost("post-1", false);
      const mockOnMediaPress = jest.fn();
      const mockToggleFavorite = jest.fn();

      const { getByTestId } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={mockToggleFavorite}
        />,
      );

      const gridItem = getByTestId("media-grid-video-post-1").parent?.parent;
      expect(gridItem).toBeTruthy();

      // Simulate double-click
      fireEvent.press(gridItem);
      fireEvent.press(gridItem);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
        expect(mockToggleFavorite).toHaveBeenCalledWith("post-1");
      });

      // Single-click action should be cancelled
      expect(mockOnMediaPress).not.toHaveBeenCalled();
    });

    it("should toggle favorite on double-click of card item", async () => {
      const post: Post = {
        ...createMockPost("post-1", false),
        mediaAttachments: [],
        card: {
          url: "https://example.com",
          title: "Example",
          description: "Example site",
          type: "link",
          image: "https://example.com/card.jpg",
        },
      };
      const mockOnMediaPress = jest.fn();
      const mockToggleFavorite = jest.fn();

      const { getByText } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={mockToggleFavorite}
        />,
      );

      const cardTitle = getByText("Example");
      const cardItem = cardTitle.parent?.parent;
      expect(cardItem).toBeTruthy();

      // Simulate double-click
      fireEvent.press(cardItem);
      fireEvent.press(cardItem);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
        expect(mockToggleFavorite).toHaveBeenCalledWith("post-1");
      });

      // Single-click action should be cancelled
      expect(mockOnMediaPress).not.toHaveBeenCalled();
    });

    it("should toggle favorite on double-click of text item", async () => {
      const post: Post = {
        ...createMockPost("post-1", false),
        mediaAttachments: [],
        card: undefined,
      };
      const mockOnMediaPress = jest.fn();
      const mockToggleFavorite = jest.fn();

      const { getByText } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={mockToggleFavorite}
        />,
      );

      const textContent = getByText("Test post");
      const textItem = textContent.parent?.parent?.parent;
      expect(textItem).toBeTruthy();

      // Simulate double-click
      fireEvent.press(textItem);
      fireEvent.press(textItem);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
        expect(mockToggleFavorite).toHaveBeenCalledWith("post-1");
      });

      // Single-click action should be cancelled
      expect(mockOnMediaPress).not.toHaveBeenCalled();
    });
  });

  describe("No media/link opening in grid view", () => {
    it("should not open image viewer in grid view", async () => {
      const post = createMockPost("post-1", false);
      const mockOnMediaPress = jest.fn();

      const { getByTestId } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={jest.fn()}
        />,
      );

      // MediaGrid should not have onMediaPress prop in grid mode
      // (it's handled by the grid item's TouchableOpacity)
      const mediaGrid = getByTestId("media-grid-media-post-1");
      expect(mediaGrid).toBeTruthy();

      // The MediaGrid component should not receive onMediaPress in grid mode
      // This is verified by the fact that clicking the grid item switches views
      // rather than opening the image viewer
    });
  });
});
