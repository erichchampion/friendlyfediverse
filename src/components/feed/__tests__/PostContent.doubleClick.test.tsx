import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { PostContent } from "../PostContent";
import type { Post } from "@types";

// Shared spies for mocks
const mockMediaSinglePress = jest.fn();

jest.mock("@components/base", () => {
  const { Text } = require("react-native");
  return {
    RichText: ({ content }: any) => <Text testID="rich-text">{content}</Text>,
  };
});

jest.mock("@components/media/MediaGrid", () => {
  const { useDelayedClick } = require("@hooks/useDelayedClick");
  const { TouchableOpacity, Text } = require("react-native");
  return {
    MediaGrid: ({ onDoubleClick }: any) => {
      const handleClick = useDelayedClick({
        onSingleClick: () => mockMediaSinglePress(),
        onDoubleClick: onDoubleClick || (() => {}),
      });
      return (
        <TouchableOpacity
          testID="media-grid"
          onPress={() => handleClick("media")}
        >
          <Text>media</Text>
        </TouchableOpacity>
      );
    },
  };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

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

const createMockPost = (overrides: Partial<Post> = {}): Post => ({
  id: "post-1",
  uri: "https://example.com/posts/post-1",
  url: "https://example.com/@user/post-1",
  createdAt: "2024-01-01T00:00:00Z",
  content: "Test post content",
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
    id: "user-1",
    username: "tester",
    acct: "tester",
    displayName: "Tester",
    avatar: "https://example.com/avatar.jpg",
    header: "https://example.com/header.jpg",
    followersCount: 1,
    followingCount: 1,
    statusesCount: 1,
    note: "",
    url: "https://example.com/@tester",
    createdAt: "2024-01-01T00:00:00Z",
  },
  reblog: null,
  inReplyToId: null,
  inReplyToAccountId: null,
  ...overrides,
});

describe("PostContent double-click handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockMediaSinglePress.mockReset();
  });

  afterEach(() => {
    // Run all pending timers before switching back to real timers
    jest.runOnlyPendingTimers();
    // Clear any remaining timers
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("triggers onDoubleClick when double-tapping text content and skips single action", async () => {
    const onPress = jest.fn();
    const onDoubleClick = jest.fn();

    const { getByTestId } = render(
      <PostContent
        post={createMockPost()}
        onPress={onPress}
        onDoubleClick={onDoubleClick}
      />,
    );

    const root = getByTestId("post-content");

    fireEvent.press(root);
    fireEvent.press(root);

    jest.advanceTimersByTime(100);

    await waitFor(() => {
      expect(onDoubleClick).toHaveBeenCalledTimes(1);
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it("makes double-tap take precedence over link opening", async () => {
    const onDoubleClick = jest.fn();
    const openUrlSpy = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValueOnce(undefined as never);

    const post = createMockPost({
      mediaAttachments: [],
      card: {
        url: "https://example.com",
        title: "Example",
        description: "Example site",
        type: "link",
        image: "https://example.com/card.jpg",
      },
    });

    const { getByTestId } = render(
      <PostContent post={post} onDoubleClick={onDoubleClick} />,
    );

    const linkCard = getByTestId("link-card");

    fireEvent.press(linkCard);
    fireEvent.press(linkCard);

    jest.advanceTimersByTime(120);

    await waitFor(() => {
      expect(onDoubleClick).toHaveBeenCalledTimes(1);
    });
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it("runs post-level double-tap even when media handles presses", async () => {
    const onDoubleClick = jest.fn();

    const postWithMedia = createMockPost({
      mediaAttachments: [
        {
          id: "media-1",
          type: "video",
          url: "https://example.com/video.mp4",
          previewUrl: "https://example.com/video.jpg",
          description: "Video",
        },
      ],
    });

    const { getByTestId } = render(
      <PostContent post={postWithMedia} onDoubleClick={onDoubleClick} />,
    );

    const mediaGrid = getByTestId("media-grid");

    fireEvent.press(mediaGrid);
    fireEvent.press(mediaGrid);

    jest.advanceTimersByTime(120);

    await waitFor(() => {
      expect(onDoubleClick).toHaveBeenCalledTimes(1);
    });
    expect(mockMediaSinglePress).not.toHaveBeenCalled();
  });
});
