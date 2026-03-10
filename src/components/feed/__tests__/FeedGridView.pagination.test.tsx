import { render, fireEvent, act } from "@testing-library/react-native";
import { FeedGridView } from "../FeedGridView";
import type { Post, MediaAttachment } from "@types";

// Mock MediaGrid to avoid rendering heavy content
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
    },
  }),
}));

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

const createMockPost = (id: string): Post => {
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

describe("FeedGridView - Pagination resilience", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("re-triggers onEndReached after a load finishes while user stays near bottom", () => {
    const posts = [createMockPost("1"), createMockPost("2")];
    const onEndReached = jest.fn();

    const { UNSAFE_getByType, rerender } = render(
      <FeedGridView
        posts={posts}
        onMediaPress={jest.fn()}
        onEndReached={onEndReached}
        hasMore={true}
        isLoadingMore={true}
      />,
    );

    const ScrollView = require("react-native").ScrollView;
    const scrollView = UNSAFE_getByType(ScrollView);

    // User scrolls near bottom while a load is already in progress
    fireEvent.scroll(scrollView, {
      nativeEvent: {
        contentOffset: { y: 1100 },
        layoutMeasurement: { height: 700 },
        contentSize: { height: 1800 },
      },
    });

    expect(onEndReached).not.toHaveBeenCalled();

    // Load finishes, more content is added, and user is still near bottom
    rerender(
      <FeedGridView
        posts={[...posts, createMockPost("3")]}
        onMediaPress={jest.fn()}
        onEndReached={onEndReached}
        hasMore={true}
        isLoadingMore={false}
      />,
    );

    // Simulate content height increase after new items render
    act(() => {
      scrollView.props.onContentSizeChange?.(0, 2000);
    });

    // With the previous scroll position still near the end, pagination should fire
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });
});
