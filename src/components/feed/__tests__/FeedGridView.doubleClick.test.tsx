/**
 * FeedGridView Double-Click Favorite Toggle Tests
 * Tests that double-clicking on grid items toggles favorite status
 * while preserving single-click behavior (opening media/navigation)
 */

import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { FeedGridView } from "../FeedGridView";
import type { Post, MediaAttachment } from "@types";

// Mock MediaGrid
jest.mock("../../media/MediaGrid", () => ({
  MediaGrid: ({ media, onMediaPress, testID }: any) => {
    const { View, Text, TouchableOpacity } = require("react-native");
    return (
      <View testID={testID || `media-grid-${media[0]?.id}`}>
        <TouchableOpacity testID="media-item" onPress={() => onMediaPress?.(0)}>
          <Text>{media[0]?.id}</Text>
        </TouchableOpacity>
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

// No need to mock usePostInteractions - FeedGridView receives onToggleFavorite as a prop
const mockToggleFavorite = jest.fn();

describe("FeedGridView - Double-Click Favorite Toggle", () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should toggle favorite on double-click of media item", async () => {
    const post = createMockPost("post-1", false);
    const mockOnMediaPress = jest.fn();

    const { getByTestId } = render(
      <FeedGridView
        posts={[post]}
        onMediaPress={mockOnMediaPress}
        onToggleFavorite={mockToggleFavorite}
      />,
    );

    // Find the grid item (TouchableOpacity wrapping the media)
    const gridItem = getByTestId("media-grid-media-post-1").parent?.parent;
    expect(gridItem).toBeTruthy();

    // Simulate double-click (two presses within 300ms)
    const now = Date.now();
    fireEvent.press(gridItem, { timeStamp: now });
    fireEvent.press(gridItem, { timeStamp: now + 100 });

    // Fast-forward timers to allow double-click detection
    jest.advanceTimersByTime(100);

    await waitFor(() => {
      expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
    });

    // Single-click action should be cancelled
    expect(mockOnMediaPress).not.toHaveBeenCalled();
  });

  it("should execute single-click action if no double-click detected", async () => {
    const post = createMockPost("post-1", false);
    const mockOnMediaPress = jest.fn();

    const { getByTestId } = render(
      <FeedGridView
        posts={[post]}
        onMediaPress={mockOnMediaPress}
        onToggleFavorite={mockToggleFavorite}
      />,
    );

    const gridItem = getByTestId("media-grid-media-post-1").parent?.parent;
    expect(gridItem).toBeTruthy();

    // Simulate single-click
    fireEvent.press(gridItem);

    // Fast-forward past the double-click delay (350ms)
    jest.advanceTimersByTime(350);

    await waitFor(() => {
      expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
      expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
    });

    // Favorite should not be toggled
    expect(mockToggleFavorite).not.toHaveBeenCalled();
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

    const { getByText } = render(
      <FeedGridView
        posts={[post]}
        onMediaPress={mockOnMediaPress}
        onToggleFavorite={mockToggleFavorite}
      />,
    );

    // Find the card item by its title
    const cardTitle = getByText("Example");
    const cardItem = cardTitle.parent?.parent;
    expect(cardItem).toBeTruthy();

    // Simulate double-click
    const now = Date.now();
    fireEvent.press(cardItem, { timeStamp: now });
    fireEvent.press(cardItem, { timeStamp: now + 100 });

    jest.advanceTimersByTime(100);

    await waitFor(() => {
      expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
    });

    // Single-click should be cancelled
    expect(mockOnMediaPress).not.toHaveBeenCalled();
  });

  it("should toggle favorite on double-click of text item", async () => {
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
        onToggleFavorite={mockToggleFavorite}
      />,
    );

    // Find the text item
    const textContent = getByText("Test post");
    const textItem = textContent.parent?.parent?.parent;
    expect(textItem).toBeTruthy();

    // Simulate double-click
    const now = Date.now();
    fireEvent.press(textItem, { timeStamp: now });
    fireEvent.press(textItem, { timeStamp: now + 100 });

    jest.advanceTimersByTime(100);

    await waitFor(() => {
      expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
    });

    // Single-click should be cancelled
    expect(mockOnMediaPress).not.toHaveBeenCalled();
  });

  it("should work with already favorited posts (toggle off)", async () => {
    const post = createMockPost("post-1", true);
    const mockOnMediaPress = jest.fn();

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
    const now = Date.now();
    fireEvent.press(gridItem, { timeStamp: now });
    fireEvent.press(gridItem, { timeStamp: now + 100 });

    jest.advanceTimersByTime(100);

    await waitFor(() => {
      expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
    });
  });

  it("should not trigger favorite if clicks are too far apart", async () => {
    const post = createMockPost("post-1", false);
    const mockOnMediaPress = jest.fn();

    const { getByTestId } = render(
      <FeedGridView
        posts={[post]}
        onMediaPress={mockOnMediaPress}
        onToggleFavorite={mockToggleFavorite}
      />,
    );

    const gridItem = getByTestId("media-grid-media-post-1").parent?.parent;
    expect(gridItem).toBeTruthy();

    // Simulate two clicks with > 300ms delay
    const now = Date.now();
    fireEvent.press(gridItem, { timeStamp: now });
    jest.advanceTimersByTime(400);
    fireEvent.press(gridItem, { timeStamp: now + 400 });

    await waitFor(() => {
      expect(mockOnMediaPress).toHaveBeenCalledTimes(1);
    });

    // Favorite should not be toggled
    expect(mockToggleFavorite).not.toHaveBeenCalled();
  });

  it("should not treat taps on different items as a double-click", async () => {
    const post1 = createMockPost("post-1", false);
    const post2 = createMockPost("post-2", false);
    const mockOnMediaPress = jest.fn();

    const { getByTestId } = render(
      <FeedGridView
        posts={[post1, post2]}
        onMediaPress={mockOnMediaPress}
        onToggleFavorite={mockToggleFavorite}
      />,
    );

    const firstItem = getByTestId("media-grid-media-post-1").parent?.parent;
    const secondItem = getByTestId("media-grid-media-post-2").parent?.parent;

    expect(firstItem).toBeTruthy();
    expect(secondItem).toBeTruthy();

    const now = Date.now();
    fireEvent.press(firstItem, { timeStamp: now });
    fireEvent.press(secondItem, { timeStamp: now + 100 });

    // Allow single-click timers to resolve
    jest.advanceTimersByTime(500);

    await waitFor(() => {
      expect(mockToggleFavorite).not.toHaveBeenCalled();
    });

    expect(mockOnMediaPress).toHaveBeenCalledTimes(2);
    expect(mockOnMediaPress).toHaveBeenCalledWith("post-1", 0);
    expect(mockOnMediaPress).toHaveBeenCalledWith("post-2", 0);
  });
});
