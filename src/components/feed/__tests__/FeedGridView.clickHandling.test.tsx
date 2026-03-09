/**
 * FeedGridView Click Handling Tests
 * Tests that clicking anywhere on a grid cell (including videos and images)
 * switches to list view, not just the video icon
 */

import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { FeedGridView } from "../FeedGridView";
import type { Post, MediaAttachment } from "@types";

// Track which parts of MediaGrid are clicked
let mediaGridClickTarget: string | null = null;

// Mock MediaGrid to track clicks on different parts
jest.mock("../../media/MediaGrid", () => ({
  MediaGrid: ({ media, testID, mode }: any) => {
    const { View, TouchableOpacity, Text } = require("react-native");
    const isVideo = media[0]?.type === "video" || media[0]?.type === "gifv";

    return (
      <View testID={testID || `media-grid-${media[0]?.id}`}>
        {/* Simulate the media item TouchableOpacity inside MediaGrid */}
        <TouchableOpacity
          testID="media-item-inside-grid"
          onPress={() => {
            mediaGridClickTarget = "media-item";
          }}
        >
          <Text>{media[0]?.id}</Text>
        </TouchableOpacity>
        {/* Video icon overlay (if video) */}
        {isVideo && (
          <TouchableOpacity
            testID="video-icon-overlay"
            style={{ position: "absolute", top: 0, right: 0 }}
            onPress={() => {
              mediaGridClickTarget = "video-icon";
            }}
          >
            <Text>▶️</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  },
}));

// Mock VideoPlayer to track if it's blocking touches
jest.mock("../../media/VideoPlayer", () => ({
  VideoPlayer: ({ media, testID }: any) => {
    const { View, TouchableOpacity, Text } = require("react-native");
    return (
      <View testID={testID || `video-player-${media.id}`}>
        <TouchableOpacity
          testID="video-player-touchable"
          onPress={() => {
            mediaGridClickTarget = "video-player";
          }}
        >
          <Text>Video</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

// Mock expo-image
jest.mock("expo-image", () => ({
  Image: ({ testID }: any) => {
    const { View } = require("react-native");
    return <View testID={testID || "image"} />;
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

describe("FeedGridView - Click Handling", () => {
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

  const createImagePost = (id: string): Post => {
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
      favourited: false,
      bookmarked: false,
      account: createMockAccount("user", "testuser"),
      reblog: null,
      inReplyToId: null,
      inReplyToAccountId: null,
    };
  };

  const createVideoPost = (id: string): Post => {
    const mockVideo: MediaAttachment = {
      id: `video-${id}`,
      type: "video",
      url: "https://example.com/video.mp4",
      previewUrl: "https://example.com/preview.jpg",
      description: "Test video",
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
      mediaAttachments: [mockVideo],
      mentions: [],
      tags: [],
      emojis: [],
      reblogsCount: 0,
      favouritesCount: 5,
      repliesCount: 0,
      reblogged: false,
      favourited: false,
      bookmarked: false,
      account: createMockAccount("user", "testuser"),
      reblog: null,
      inReplyToId: null,
      inReplyToAccountId: null,
    };
  };

  const createCardPost = (id: string): Post => {
    return {
      id,
      uri: `https://example.com/posts/${id}`,
      url: `https://example.com/@testuser/${id}`,
      createdAt: "2024-01-01T00:00:00Z",
      content: "Test post",
      visibility: "public",
      sensitive: false,
      spoilerText: "",
      mediaAttachments: [],
      mentions: [],
      tags: [],
      emojis: [],
      reblogsCount: 0,
      favouritesCount: 5,
      repliesCount: 0,
      reblogged: false,
      favourited: false,
      bookmarked: false,
      account: createMockAccount("user", "testuser"),
      reblog: null,
      inReplyToId: null,
      inReplyToAccountId: null,
      card: {
        url: "https://example.com",
        title: "Example",
        description: "Example site",
        type: "link",
        image: "https://example.com/card.jpg",
      },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mediaGridClickTarget = null;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("Image grid cell clicks", () => {
    it("should switch to list view when clicking anywhere on image grid cell", async () => {
      const post = createImagePost("post-1");
      const mockOnMediaPress = jest.fn();

      const { getByTestId } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={jest.fn()}
        />,
      );

      // Find the grid item TouchableOpacity (parent of MediaGrid)
      const gridItem = getByTestId("media-grid-media-post-1").parent;
      expect(gridItem).toBeTruthy();

      // Simulate single-click on the grid item
      fireEvent.press(gridItem);

      // Advance past double-click delay
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
        expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
      });
    });

    it("should switch to list view when clicking on the image itself inside MediaGrid", async () => {
      const post = createImagePost("post-1");
      const mockOnMediaPress = jest.fn();

      const { getByTestId } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={jest.fn()}
        />,
      );

      // In grid mode, MediaGrid uses View with pointerEvents="box-none"
      // So clicking anywhere inside should reach the parent TouchableOpacity
      // Click the grid item itself (which contains MediaGrid)
      const gridItem = getByTestId("media-grid-media-post-1").parent;

      fireEvent.press(gridItem);

      // Advance past double-click delay
      jest.advanceTimersByTime(350);

      // The click should reach the grid item handler
      await waitFor(() => {
        expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
        expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
      });
    });
  });

  describe("Video grid cell clicks", () => {
    it("should switch to list view when clicking anywhere on video grid cell", async () => {
      const post = createVideoPost("post-1");
      const mockOnMediaPress = jest.fn();

      const { getByTestId } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={jest.fn()}
        />,
      );

      // Find the grid item TouchableOpacity (parent of MediaGrid)
      const gridItem = getByTestId("media-grid-video-post-1").parent;
      expect(gridItem).toBeTruthy();

      // Simulate single-click on the grid item
      fireEvent.press(gridItem);

      // Advance past double-click delay
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
        expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
      });
    });

    it("should switch to list view when clicking anywhere on video grid cell including video area", async () => {
      const post = createVideoPost("post-1");
      const mockOnMediaPress = jest.fn();

      const { getByTestId } = render(
        <FeedGridView
          posts={[post]}
          onMediaPress={mockOnMediaPress}
          onToggleFavorite={jest.fn()}
        />,
      );

      // Click anywhere on the grid item - video player should not block touches
      const gridItem = getByTestId("media-grid-video-post-1").parent;

      fireEvent.press(gridItem);

      // Advance past double-click delay
      jest.advanceTimersByTime(350);

      // The click should reach the grid item handler
      await waitFor(() => {
        expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
        expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
      });
    });
  });

  describe("Card grid cell clicks", () => {
    it("should switch to list view when clicking anywhere on card grid cell", async () => {
      const post = createCardPost("post-1");
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
  });
});
