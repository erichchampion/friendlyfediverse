import { render, fireEvent } from "@testing-library/react-native";
import { MediaGrid } from "../MediaGrid";
import type { MediaAttachment } from "@types";

// Mock VideoPlayer
jest.mock("../VideoPlayer", () => ({
  VideoPlayer: ({ media, mode, isVisible, style, testID }: any) => {
    const { View, Text } = require("react-native");
    return (
      <View testID={testID || "video-player"} style={style}>
        <Text testID="video-player-media-id">{media.id}</Text>
        <Text testID="video-player-mode">{mode}</Text>
        <Text testID="video-player-visible">{String(isVisible)}</Text>
      </View>
    );
  },
}));

// Mock ImageViewer
jest.mock("../ImageViewer", () => ({
  ImageViewer: () => null,
}));

// Mock expo-image
jest.mock("expo-image", () => ({
  Image: ({ source, testID }: any) => {
    const { View, Text } = require("react-native");
    return (
      <View testID={testID || "image"}>
        <Text>{source.uri}</Text>
      </View>
    );
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
    },
  }),
}));

// Mock settings hook
jest.mock("@hooks/useSettings", () => ({
  useSettings: () => ({
    autoPlayMedia: true,
    highQualityUploads: true,
    isLoading: false,
  }),
}));

describe("MediaGrid", () => {
  const mockImageMedia: MediaAttachment = {
    id: "1",
    type: "image",
    url: "https://example.com/image.jpg",
    previewUrl: "https://example.com/preview.jpg",
    description: "Test image",
  };

  const mockVideoMedia: MediaAttachment = {
    id: "2",
    type: "video",
    url: "https://example.com/video.mp4",
    previewUrl: "https://example.com/preview.jpg",
    description: "Test video",
  };

  const mockGifMedia: MediaAttachment = {
    id: "3",
    type: "gifv",
    url: "https://example.com/animation.gif",
    previewUrl: "https://example.com/preview.jpg",
    description: "Test GIF",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Grid mode (used by FeedGridView)", () => {
    it("should render video with grid mode prop", () => {
      const { getByTestId } = render(
        <MediaGrid media={[mockVideoMedia]} mode="grid" isVisible={true} />,
      );

      const videoMode = getByTestId("video-player-mode");
      expect(videoMode.props.children).toBe("grid");
    });

    it("should render GIF with grid mode prop", () => {
      const { getByTestId } = render(
        <MediaGrid media={[mockGifMedia]} mode="grid" isVisible={true} />,
      );

      const videoMode = getByTestId("video-player-mode");
      expect(videoMode.props.children).toBe("grid");
    });

    it("should pass isVisible prop to videos in grid mode", () => {
      const { getByTestId } = render(
        <MediaGrid media={[mockVideoMedia]} mode="grid" isVisible={true} />,
      );

      const videoVisible = getByTestId("video-player-visible");
      expect(videoVisible.props.children).toBe("true");
    });

    it("should mark videos as not visible when grid item is not visible", () => {
      const { getByTestId } = render(
        <MediaGrid media={[mockVideoMedia]} mode="grid" isVisible={false} />,
      );

      const videoVisible = getByTestId("video-player-visible");
      expect(videoVisible.props.children).toBe("false");
    });
  });

  describe("List mode (used by PostCard)", () => {
    it("should render video with list mode prop", () => {
      const { getByTestId } = render(
        <MediaGrid media={[mockVideoMedia]} mode="list" isVisible={true} />,
      );

      const videoMode = getByTestId("video-player-mode");
      expect(videoMode.props.children).toBe("list");
    });

    it("should render GIF with list mode prop", () => {
      const { getByTestId } = render(
        <MediaGrid media={[mockGifMedia]} mode="list" isVisible={true} />,
      );

      const videoMode = getByTestId("video-player-mode");
      expect(videoMode.props.children).toBe("list");
    });

    it("should pass isVisible prop to videos in list mode", () => {
      const { getByTestId } = render(
        <MediaGrid media={[mockVideoMedia]} mode="list" isVisible={true} />,
      );

      const videoVisible = getByTestId("video-player-visible");
      expect(videoVisible.props.children).toBe("true");
    });

    it("should handle multiple videos in list mode", () => {
      const { getAllByTestId } = render(
        <MediaGrid
          media={[mockVideoMedia, mockGifMedia]}
          mode="list"
          isVisible={true}
        />,
      );

      const videoModes = getAllByTestId("video-player-mode");
      expect(videoModes).toHaveLength(2);
      videoModes.forEach((mode) => {
        expect(mode.props.children).toBe("list");
      });
    });

    it("should size list videos using their aspect ratio so tall videos fill the reserved space", () => {
      const portraitVideo: MediaAttachment = {
        ...mockVideoMedia,
        id: "portrait-video",
        meta: { original: { width: 9, height: 16 } },
      };

      const { getByTestId } = render(
        <MediaGrid media={[portraitVideo]} mode="list" isVisible={true} />,
      );

      const videoPlayer = getByTestId("video-player");
      const stylesArray = Array.isArray(videoPlayer.props.style)
        ? videoPlayer.props.style.flat().filter(Boolean)
        : [videoPlayer.props.style];
      const aspectStyle = stylesArray.find(
        (style) => style && typeof style === "object" && "aspectRatio" in style,
      );

      expect(aspectStyle?.aspectRatio).toBeCloseTo(9 / 16);
    });
  });

  describe("Mixed media handling", () => {
    it("should render both images and videos in grid mode", () => {
      const { getByTestId, getAllByTestId } = render(
        <MediaGrid
          media={[mockImageMedia, mockVideoMedia]}
          mode="grid"
          isVisible={true}
        />,
      );

      // Should have one image
      const images = getAllByTestId("image");
      expect(images).toHaveLength(1);

      // Should have one video player
      const videoPlayer = getByTestId("video-player");
      expect(videoPlayer).toBeTruthy();
    });

    it("should render all media types in list mode", () => {
      const { getAllByTestId } = render(
        <MediaGrid
          media={[mockImageMedia, mockVideoMedia, mockGifMedia]}
          mode="list"
          isVisible={true}
        />,
      );

      // Should have one image
      const images = getAllByTestId("image");
      expect(images).toHaveLength(1);

      // Should have two video players (video + gif)
      const videoPlayers = getAllByTestId("video-player-mode");
      expect(videoPlayers).toHaveLength(2);
    });
  });

  describe("Sensitive content handling", () => {
    it("should hide videos when sensitive content is not revealed", () => {
      const { queryByTestId, getByText } = render(
        <MediaGrid
          media={[mockVideoMedia]}
          sensitive={true}
          mode="list"
          isVisible={true}
        />,
      );

      // Video should not be rendered yet
      const videoPlayer = queryByTestId("video-player");
      expect(videoPlayer).toBeNull();

      // Sensitive content warning should be visible
      const warning = getByText("Sensitive Content");
      expect(warning).toBeTruthy();
    });

    it("should show videos after revealing sensitive content", () => {
      const { getByText, getByTestId } = render(
        <MediaGrid
          media={[mockVideoMedia]}
          sensitive={true}
          mode="list"
          isVisible={true}
        />,
      );

      // Click show media button
      const showButton = getByText("Show Media");
      fireEvent.press(showButton);

      // Video should now be rendered
      const videoPlayer = getByTestId("video-player");
      expect(videoPlayer).toBeTruthy();
    });

    it("should not autoplay videos until sensitive content is revealed", () => {
      const { queryByTestId, getByText, getByTestId } = render(
        <MediaGrid
          media={[mockVideoMedia]}
          sensitive={true}
          mode="list"
          isVisible={true}
        />,
      );

      // Video should not be playing
      let videoPlayer = queryByTestId("video-player");
      expect(videoPlayer).toBeNull();

      // Reveal content
      const showButton = getByText("Show Media");
      fireEvent.press(showButton);

      // Now video should be visible and can play
      videoPlayer = queryByTestId("video-player");
      expect(videoPlayer).toBeTruthy();

      const videoVisible = getByTestId("video-player-visible");
      expect(videoVisible.props.children).toBe("true");
    });
  });

  describe("Default mode behavior", () => {
    it("should default to list mode when mode prop is not provided", () => {
      const { getByTestId } = render(
        <MediaGrid media={[mockVideoMedia]} isVisible={true} />,
      );

      const videoMode = getByTestId("video-player-mode");
      // Should default to 'list' mode
      expect(videoMode.props.children).toBe("list");
    });
  });

  describe("Dimension constraints", () => {
    it("should set maxWidth and maxHeight in list mode to prevent clipping on web", () => {
      const { UNSAFE_getAllByType } = render(
        <MediaGrid media={[mockImageMedia]} mode="list" isVisible={true} />,
      );

      // Find the media item container (TouchableOpacity in list mode)
      const { TouchableOpacity } = require("react-native");
      const mediaItems = UNSAFE_getAllByType(TouchableOpacity);

      // Should have at least one media item (the sensitive overlay button and media item)
      expect(mediaItems.length).toBeGreaterThan(0);

      // Find the media item (not the sensitive overlay button)
      // Media items have onPress handler, sensitive button has onPress too but different structure
      const mediaItem =
        mediaItems.find(
          (item: any) =>
            item.props.onPress &&
            !item.props.children?.props?.children?.includes("Show Media"),
        ) || mediaItems[mediaItems.length - 1]; // Fallback to last item

      expect(mediaItem).toBeDefined();

      if (mediaItem) {
        const style = mediaItem.props.style;

        // Flatten style array if needed
        const flattenedStyle = Array.isArray(style)
          ? Object.assign({}, ...style.filter((s: any) => s))
          : style;

        // Check that maxWidth and maxHeight are set to "100%" to respect parent container
        // This prevents expo-image on web from setting dimensions larger than the container
        expect(flattenedStyle.maxWidth).toBeDefined();
        expect(flattenedStyle.maxWidth).toBe("100%");
        expect(flattenedStyle.maxHeight).toBeDefined();
        expect(flattenedStyle.maxHeight).toBe("100%");
      }
    });

    it("should set maxWidth and maxHeight in grid mode to prevent clipping on web", () => {
      const { UNSAFE_getAllByType } = render(
        <MediaGrid media={[mockImageMedia]} mode="grid" isVisible={true} />,
      );

      // Find the media item container (View in grid mode)
      const { View } = require("react-native");
      const mediaItems = UNSAFE_getAllByType(View);

      // Find the media item (has pointerEvents="box-none" in grid mode)
      const mediaItem = mediaItems.find(
        (item: any) => item.props.pointerEvents === "box-none",
      );

      expect(mediaItem).toBeDefined();

      if (mediaItem) {
        const style = mediaItem.props.style;
        const flattenedStyle = Array.isArray(style)
          ? Object.assign({}, ...style.filter((s: any) => s))
          : style;

        // Check that maxWidth and maxHeight are set to "100%" to respect parent container
        expect(flattenedStyle.maxWidth).toBeDefined();
        expect(flattenedStyle.maxWidth).toBe("100%");
        expect(flattenedStyle.maxHeight).toBeDefined();
        expect(flattenedStyle.maxHeight).toBe("100%");
      }
    });
  });
});
