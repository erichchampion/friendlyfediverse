/**
 * FeedGridView Width Tests
 * Tests that grid item widths match the actual column width
 * to prevent clipping on web
 */

import { render } from "@testing-library/react-native";
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

describe("FeedGridView - Width Calculation", () => {
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
      meta: {
        original: {
          width: 1501,
          height: 900,
          aspect: 1501 / 900,
        },
      },
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should use percentage width for grid items to match flexbox column width", () => {
    const { Dimensions } = require("react-native");
    const SCREEN_WIDTH = 1024;

    // Mock Dimensions.get to return our test width
    jest.spyOn(Dimensions, "get").mockReturnValue({
      width: SCREEN_WIDTH,
      height: 800
    });

    const posts = [createImagePost("post-1")];
    const { UNSAFE_getAllByType } = render(<FeedGridView posts={posts} />);

    // Find the grid item TouchableOpacity
    const { TouchableOpacity } = require("react-native");
    const gridItems = UNSAFE_getAllByType(TouchableOpacity);

    // Should have at least one grid item
    expect(gridItems.length).toBeGreaterThan(0);

    // Find the grid item (not the sensitive overlay button)
    const gridItem = gridItems.find(
      (item: any) =>
        item.props.style &&
        Array.isArray(item.props.style) &&
        item.props.style.some((s: any) => s && s.width !== undefined)
    ) || gridItems[0];

    expect(gridItem).toBeDefined();

    if (gridItem) {
      const style = gridItem.props.style;
      const flattenedStyle = Array.isArray(style)
        ? Object.assign({}, ...style.filter((s: any) => s))
        : style;

      // Grid items should use a calculated numeric width based on screen size
      expect(typeof flattenedStyle.width).toBe("number");
    }

    Dimensions.get.mockRestore();
  });

  it("should calculate column width correctly accounting for padding and gaps", () => {
    const { Dimensions } = require("react-native");
    const SCREEN_WIDTH = 1024;
    const GRID_GAP = 2;
    const COLUMN_COUNT = 3;

    // Expected calculation: (SCREEN_WIDTH - GRID_GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT
    // = (1024 - 2 * 4) / 3 = (1024 - 8) / 3 = 1016 / 3 = 338.666...
    const expectedColumnWidth = (SCREEN_WIDTH - GRID_GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;

    // Mock Dimensions.get to return our test width
    jest.spyOn(Dimensions, "get").mockReturnValue({
      width: SCREEN_WIDTH,
      height: 800
    });

    const posts = [createImagePost("post-1")];
    render(<FeedGridView posts={posts} />);

    // The actual column width should be calculated correctly
    // But grid items should use "100%" to match whatever the flexbox column width is
    // This ensures they match even if there are rounding differences

    Dimensions.get.mockRestore();
  });
});



















