import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  Platform,
} from "react-native";
import { useState, useCallback, useRef } from "react";
import { RetryableImage as Image } from "./RetryableImage";
import { ImageViewer } from "./ImageViewer";
import { VideoPlayer } from "./VideoPlayer";
import type { MediaAttachment } from "@types";
import { useTheme } from "@contexts/ThemeContext";
import { useSettings } from "@hooks/useSettings";
import { useDelayedClick } from "@hooks/useDelayedClick";
import {
  getWebGridContainerStyle,
  getWebListContainerStyle,
  getWebListItemStyle,
  fullSizeConstraints,
} from "@lib/styleHelpers";
import { STYLE_CONSTANTS } from "@lib/styleConstants";

/**
 * Media Grid Component
 * Displays images and videos in a grid layout
 * Phase 4: Media Handling
 */

interface MediaGridProps {
  media: MediaAttachment[];
  sensitive?: boolean;
  onMediaPress?: (index: number) => void;
  onDoubleClick?: () => void;
  mode?: "grid" | "list";
  isVisible?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 4;
const GRID_WIDTH = SCREEN_WIDTH - 32; // Account for padding

export function MediaGrid({
  media,
  sensitive = false,
  onMediaPress,
  onDoubleClick,
  mode = "list",
  isVisible = true,
}: MediaGridProps) {
  const { colors } = useTheme();
  const { autoPlayMedia } = useSettings();
  const [showSensitive, setShowSensitive] = useState(!sensitive);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const clickedIndexRef = useRef<number>(0);

  if (media.length === 0) return null;

  // Filter images for the viewer (exclude videos)
  const images = media.filter((m) => m.type === "image");

  const handleMediaPress = useCallback(
    (index: number) => {
      const item = media[index];

      if (item.type === "image") {
        // Find the index in the images array
        const imageIndex = images.findIndex((img) => img.id === item.id);
        // Only open viewer if image is found and has valid URL
        if (imageIndex >= 0 && (item.previewUrl || item.url)) {
          setViewerIndex(imageIndex);
          setViewerVisible(true);
        }
      }

      onMediaPress?.(index);
    },
    [media, images, onMediaPress],
  );

  // Create a delayed click handler for list mode with double-click support
  // Store the clicked index in a ref so we can use it in the single-click handler
  const handleDelayedMediaClick = useDelayedClick({
    onSingleClick: () => {
      handleMediaPress(clickedIndexRef.current);
    },
    onDoubleClick: onDoubleClick || (() => {}),
  });

  // Create click handler for a specific media index
  // In grid mode, no click handlers - parent handles all clicks
  const createMediaClickHandler = useCallback(
    (index: number) => {
      // In grid mode, don't handle clicks - parent TouchableOpacity handles them
      if (mode === "grid") {
        return undefined;
      }

      if (onDoubleClick && mode === "list") {
        // Store the index and use delayed click handler
        return () => {
          clickedIndexRef.current = index;
          handleDelayedMediaClick();
        };
      }
      return () => handleMediaPress(index);
    },
    [onDoubleClick, mode, handleMediaPress, handleDelayedMediaClick],
  );

  const handleCloseViewer = useCallback(() => {
    setViewerVisible(false);
  }, []);

  // Helper function to get aspect ratio from media
  const getAspectRatio = (item: MediaAttachment): number | null => {
    // Try to get aspect ratio from meta
    let aspectRatio = item.meta?.original?.aspect || item.meta?.small?.aspect;

    // If aspect ratio isn't available, calculate it from width and height
    if (!aspectRatio) {
      const width = item.meta?.original?.width || item.meta?.small?.width;
      const height = item.meta?.original?.height || item.meta?.small?.height;

      // Only calculate if both width and height are valid numbers (not 0 or undefined)
      if (width && height && width > 0 && height > 0) {
        aspectRatio = width / height;
      }
    }

    return aspectRatio || null;
  };

  const getMediaLayout = (mediaArray: MediaAttachment[] = media) => {
    // In grid mode, no layout calculation needed - items fill container
    if (mode === "grid") {
      return [];
    }

    // In list mode, calculate layout based on media count
    const count = mediaArray.length;

    if (count === 1) {
      // Single media: use full width, calculate height from aspect ratio
      const item = mediaArray[0];
      const aspectRatio = getAspectRatio(item);
      const height = aspectRatio ? GRID_WIDTH / aspectRatio : GRID_WIDTH; // Default to square if no aspect ratio
      return [{ width: GRID_WIDTH, height, span: 1, aspectRatio }];
    } else if (count === 2) {
      // Two media: side by side, each with its own aspect ratio
      const width = (GRID_WIDTH - GRID_GAP) / 2;
      return mediaArray.slice(0, 2).map((item) => {
        const aspectRatio = getAspectRatio(item);
        const height = aspectRatio ? width / aspectRatio : width; // Default to square
        return { width, height, span: 1, aspectRatio };
      });
    } else if (count === 3) {
      // Three media: first spans 2 rows, others on the right
      const width = (GRID_WIDTH - GRID_GAP) / 2;
      const firstItem = mediaArray[0];
      const firstAspectRatio = getAspectRatio(firstItem);
      const firstHeight = firstAspectRatio
        ? width / firstAspectRatio
        : width * 2; // Default to 2x height

      const rightItems = mediaArray.slice(1, 3);
      const rightHeights = rightItems.map((item) => {
        const aspectRatio = getAspectRatio(item);
        return aspectRatio ? width / aspectRatio : width; // Default to square
      });

      // Calculate total height of right column
      const rightTotalHeight =
        rightHeights.reduce((sum, h) => sum + h, 0) + GRID_GAP;

      // Adjust first item height to match right column if needed
      const adjustedFirstHeight = Math.max(firstHeight, rightTotalHeight);

      return [
        {
          width,
          height: adjustedFirstHeight,
          span: 2,
          aspectRatio: firstAspectRatio,
        },
        {
          width,
          height: rightHeights[0],
          span: 1,
          aspectRatio: getAspectRatio(rightItems[0]),
        },
        {
          width,
          height: rightHeights[1],
          span: 1,
          aspectRatio: getAspectRatio(rightItems[1]),
        },
      ];
    } else {
      // 4 or more: 2x2 grid, each with its own aspect ratio
      const width = (GRID_WIDTH - GRID_GAP) / 2;
      return mediaArray.slice(0, 4).map((item) => {
        const aspectRatio = getAspectRatio(item);
        const height = aspectRatio ? width / aspectRatio : width; // Default to square
        return { width, height, span: 1, aspectRatio };
      });
    }
  };

  // Filter out invalid media items before calculating layouts
  // This ensures layout indices match rendered items
  const validMedia = media.filter((item) => {
    const isVideo = item.type === "video" || item.type === "gifv";
    return isVideo ? !!item.url : !!(item.previewUrl || item.url);
  });

  // Calculate layouts based on valid media only (for list mode)
  const layouts = getMediaLayout(mode === "list" ? validMedia : media);

  return (
    <View
      style={[
        mode === "grid" ? styles.containerGrid : styles.container,
        getWebGridContainerStyle(mode),
      ]}
    >
      {!showSensitive && (
        <View
          style={[
            mode === "grid"
              ? styles.sensitiveOverlayGrid
              : styles.sensitiveOverlay,
            { backgroundColor: colors.card },
          ]}
        >
          <Text
            style={[
              mode === "grid" ? styles.sensitiveIconGrid : styles.sensitiveIcon,
              { color: colors.textSecondary },
            ]}
          >
            ⚠️
          </Text>
          <Text
            style={[
              mode === "grid" ? styles.sensitiveTextGrid : styles.sensitiveText,
              { color: colors.text },
            ]}
          >
            Sensitive Content
          </Text>
          {mode !== "grid" && (
            <Text
              style={[styles.sensitiveSubtext, { color: colors.textSecondary }]}
            >
              This media may contain sensitive content
            </Text>
          )}
          <TouchableOpacity
            style={[
              mode === "grid" ? styles.showButtonGrid : styles.showButton,
              { backgroundColor: colors.primary },
            ]}
            onPress={() => setShowSensitive(true)}
          >
            <Text
              style={
                mode === "grid"
                  ? styles.showButtonTextGrid
                  : styles.showButtonText
              }
            >
              Show Media
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {showSensitive && (
        <View
          style={[
            mode === "grid" ? styles.containerGrid : styles.grid,
            mode === "grid"
              ? getWebGridContainerStyle(mode)
              : getWebListContainerStyle(mode),
          ]}
        >
          {validMedia.slice(0, 4).map((item, index) => {
            const isVideo = item.type === "video" || item.type === "gifv";

            // In grid mode, use View instead of TouchableOpacity to allow touches to pass through
            // to the parent TouchableOpacity in FeedGridView
            if (mode === "grid") {
              return (
                <View
                  key={`${item.id}-${index}`}
                  style={[
                    styles.mediaItem,
                    styles.gridMediaItem,
                    { backgroundColor: "#8E8E8E" },
                  ]}
                  pointerEvents="box-none"
                >
                  {isVideo ? (
                    <VideoPlayer
                      media={item}
                      autoPlay={autoPlayMedia}
                      muted
                      mode={mode}
                      isVisible={isVisible && showSensitive}
                    />
                  ) : (
                    <>
                      <Image
                        source={{ uri: item.previewUrl || item.url }}
                        style={styles.image}
                        contentFit="cover"
                        transition={200}
                      />
                      {/* More images indicator */}
                      {index === 3 && validMedia.length > 4 && (
                        <View style={styles.moreOverlay}>
                          <Text style={styles.moreText}>
                            +{validMedia.length - 4}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            }

            // In list mode: use full width, aspectRatio style to maintain proper dimensions
            // Note: layouts are calculated from validMedia, so indices match
            const layout = layouts[index];
            // Safety check: if layout doesn't exist, skip rendering
            if (!layout) {
              return null;
            }
            const aspectRatio = layout.aspectRatio;
            const mediaLayoutStyle = {
              width: STYLE_CONSTANTS.FULL_WIDTH,
              ...(aspectRatio ? { aspectRatio } : { height: layout.height }), // Fallback height if no aspect ratio available
              maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
              minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
              // On web, override any width calculations from React Native Web
              ...getWebListItemStyle(),
            };
            const pressHandler = createMediaClickHandler(index);
            // Add margin for spacing between items (replaces gap)
            const itemSpacing = index > 0 ? { marginLeft: GRID_GAP } : {};
            return (
              <TouchableOpacity
                key={`${item.id}-${index}`}
                style={[styles.mediaItem, mediaLayoutStyle, itemSpacing]}
                onPress={pressHandler}
                activeOpacity={0.9}
                disabled={isVideo && item.type !== "gifv"}
              >
                {isVideo ? (
                  <VideoPlayer
                    media={item}
                    autoPlay={autoPlayMedia}
                    muted
                    mode={mode}
                    isVisible={isVisible && showSensitive}
                    style={mediaLayoutStyle}
                  />
                ) : (
                  <>
                    <Image
                      source={{ uri: item.previewUrl || item.url }}
                      style={styles.image}
                      contentFit="contain"
                      transition={200}
                    />
                    {/* More images indicator */}
                    {index === 3 && validMedia.length > 4 && (
                      <View style={styles.moreOverlay}>
                        <Text style={styles.moreText}>
                          +{validMedia.length - 4}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Image Viewer Modal */}
      {images.length > 0 && (
        <ImageViewer
          visible={viewerVisible}
          images={images}
          initialIndex={viewerIndex}
          onClose={handleCloseViewer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    borderRadius: 12,
    overflow: "hidden",
    width: STYLE_CONSTANTS.FULL_WIDTH,
    maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
  },
  containerGrid: {
    width: Platform.OS === "web" ? undefined : STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
    overflow: "hidden",
    position: "relative", // Needed for absoluteFillObject children (sensitive overlay)
    ...fullSizeConstraints,
    minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: STYLE_CONSTANTS.FULL_WIDTH,
    maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
    minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
  },
  mediaItem: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F0F0F0",
    // Width is set inline to prevent React Native Web from calculating fixed widths
    // On web, width will be overridden by inline styles
    ...(Platform.OS === "web" ? {} : { width: STYLE_CONSTANTS.FULL_WIDTH }),
    ...fullSizeConstraints,
    minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
  },
  gridMediaItem: {
    // In grid mode, ensure the media item fills its parent container
    // This is critical on web to prevent the View from collapsing
    width: STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
  },
  image: {
    width: STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
    ...fullSizeConstraints,
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  moreText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  sensitiveOverlay: {
    padding: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  sensitiveOverlayGrid: {
    ...StyleSheet.absoluteFillObject,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sensitiveIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  sensitiveIconGrid: {
    fontSize: 24,
    marginBottom: 6,
  },
  sensitiveText: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  sensitiveTextGrid: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
    textAlign: "center",
  },
  sensitiveSubtext: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  sensitiveSubtextGrid: {
    fontSize: 10,
    textAlign: "center",
    marginBottom: 8,
  },
  showButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  showButtonGrid: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  showButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  showButtonTextGrid: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
});
