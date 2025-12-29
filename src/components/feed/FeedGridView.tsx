import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Text,
  RefreshControl,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { Image } from "expo-image";
import type { Post, MediaAttachment, Card } from "@types";
import { useTheme } from "@contexts/ThemeContext";
import { MediaGrid } from "../media/MediaGrid";
import { stripHtml } from "@lib/utils/html";
import { useDelayedClick } from "@hooks/useDelayedClick";
import { STYLE_CONSTANTS } from "@lib/styleConstants";
import { fullSizeConstraints } from "@lib/styleHelpers";
import { UI_CONFIG } from "@/config";

/**
 * Feed Grid View Component
 * Displays items from posts in a masonry layout (Pinterest-style)
 * Supports media, URL cards, and text-only posts with variable heights
 */

interface FeedGridViewProps {
  posts: Post[];
  onMediaPress?: (postId: string, mediaIndex: number) => void;
  onToggleFavorite?: (postId: string) => void;
  onEndReached?: () => void;
  hasMore?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLoadingMore?: boolean;
  scrollToPostId?: string | null; // Post ID to scroll to on mount
  scrollToTopSignal?: number;
  onViewableItemsChanged?: (info: {
    viewableItems: { index: number | null; item: any }[];
    changed: any[];
  }) => void;
  onItemOffset?: (postId: string, offsetY: number) => void; // report item top offset
  onScrollComplete?: () => void; // Called when scroll restoration completes
}

type GridItemType = "media" | "card" | "text";

interface BaseGridItem {
  id: string;
  feedItemId: string; // wrapper post id used for list scroll restore
  displayPostId: string; // underlying status id (handles reblogs)
  type: GridItemType;
}

interface MediaGridItem extends BaseGridItem {
  type: "media";
  mediaIndex: number;
  media: MediaAttachment;
  sensitive: boolean;
}

interface CardGridItem extends BaseGridItem {
  type: "card";
  card: Card;
}

interface TextGridItem extends BaseGridItem {
  type: "text";
  content: string;
}

type GridItem = MediaGridItem | CardGridItem | TextGridItem;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLUMN_COUNT = 3;
const GRID_GAP = 2;
const COLUMN_WIDTH =
  (SCREEN_WIDTH - GRID_GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;

// Calculate item height based on media aspect ratio
const getItemHeight = (item: GridItem): number => {
  // Min height based on 16:9 aspect ratio (landscape)
  const minHeight = COLUMN_WIDTH * (9 / 16);
  // Max height based on 9:16 aspect ratio (portrait)
  const maxHeight = COLUMN_WIDTH * (16 / 9);

  if (item.type === "media") {
    // Try to get aspect ratio from meta
    let aspectRatio =
      item.media.meta?.original?.aspect || item.media.meta?.small?.aspect;

    // If aspect ratio isn't available, calculate it from width and height
    if (!aspectRatio) {
      const width =
        item.media.meta?.original?.width || item.media.meta?.small?.width;
      const height =
        item.media.meta?.original?.height || item.media.meta?.small?.height;

      // Only calculate if both width and height are valid numbers (not 0 or undefined)
      if (width && height && width > 0 && height > 0) {
        aspectRatio = width / height;
      }
    }

    if (aspectRatio) {
      // Height = width / aspectRatio
      const calculatedHeight = COLUMN_WIDTH / aspectRatio;
      // Constrain between min (16:9) and max (9:16)
      const finalHeight = Math.max(
        minHeight,
        Math.min(maxHeight, calculatedHeight),
      );
      return finalHeight;
    }
    // Default to square if no aspect ratio available, but still respect constraints
    return Math.max(minHeight, Math.min(maxHeight, COLUMN_WIDTH));
  }

  if (item.type === "card") {
    // Cards have a fixed aspect ratio, but respect constraints
    const cardHeight = COLUMN_WIDTH * 1.2;
    return Math.max(minHeight, Math.min(maxHeight, cardHeight));
  }

  // Text items: estimate height based on content length
  const charCount = item.content.length;
  const estimatedLines = Math.ceil(charCount / 25); // ~25 chars per line
  const lineHeight = 13;
  const padding = 16;
  const calculatedHeight = estimatedLines * lineHeight + padding;

  // Use same aspect ratio constraints as media items
  return Math.max(minHeight, Math.min(maxHeight, calculatedHeight));
};

// Distribute items across columns for masonry layout with stable column assignments
// Returns columns and a map of item positions for visibility tracking
const distributeItemsToColumns = (
  items: GridItem[],
  columnCount: number,
  itemColumnMap: Map<string, number>,
) => {
  const columns: GridItem[][] = Array.from({ length: columnCount }, () => []);
  const columnHeights = Array(columnCount).fill(0);
  const itemPositions = new Map<
    string,
    { yPosition: number; height: number; columnIndex: number }
  >();

  // Remove stale column assignments
  const currentIds = new Set(items.map((item) => item.id));
  Array.from(itemColumnMap.keys()).forEach((id) => {
    if (!currentIds.has(id)) {
      itemColumnMap.delete(id);
    }
  });

  items.forEach((item) => {
    const existingColumn = itemColumnMap.get(item.id);

    // Choose a stable column: reuse previous assignment, otherwise pick shortest
    const columnIndex =
      existingColumn ??
      columnHeights.indexOf(Math.min(...columnHeights));

    // Persist the assignment
    itemColumnMap.set(item.id, columnIndex);

    // Calculate item height
    const itemHeight = getItemHeight(item);

    // Store item position (before adding the item height)
    itemPositions.set(item.id, {
      yPosition: columnHeights[columnIndex] + GRID_GAP, // Add gap for top padding
      height: itemHeight,
      columnIndex,
    });

    // Add item to that column
    columns[columnIndex].push(item);

    // Update column height (add item height + gap for next item)
    columnHeights[columnIndex] += itemHeight + GRID_GAP;
  });

  return { columns, itemPositions };
};

export function FeedGridView({
  posts,
  onMediaPress,
  onToggleFavorite,
  onEndReached,
  hasMore = true,
  onRefresh,
  isRefreshing = false,
  isLoadingMore = false,
  scrollToPostId = null,
  scrollToTopSignal,
  onViewableItemsChanged,
  onItemOffset,
  onScrollComplete,
}: FeedGridViewProps) {
  const { colors } = useTheme();
  const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set());
  const visibleItemsRef = useRef<Set<string>>(new Set());
  const scrollViewRef = useRef<ScrollView>(null);
  const lastScrollSignalRef = useRef<number | null>(null);
  const lastScrolledToPostIdRef = useRef<string | null>(null); // Track what we've scrolled to
  const lastScrollContentHeightRef = useRef<number>(0); // Track content height when we last scrolled
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Track retry timeout for cleanup
  const lastCompensationRef = useRef<number>(0); // Track when we last compensated scroll to prevent double compensation
  const [isAtEnd, setIsAtEnd] = useState(false);

  // Store item positions for visibility tracking (estimated from distributeItemsToColumns)
  const itemPositionsRef = useRef<
    Map<string, { yPosition: number; height: number; columnIndex: number }>
  >(new Map());
  const previousItemPositionsRef = useRef<
    Map<string, { yPosition: number; height: number; columnIndex: number }>
  >(new Map());
  // Store actual measured positions from onLayout handlers
  const actualItemPositionsRef = useRef<
    Map<string, { y: number; height: number }>
  >(new Map());
  // Track which items have been measured to avoid redundant measurements
  const measuredItemsRef = useRef<Set<string>>(new Set());
  // Persist column choices to avoid reshuffling when items are trimmed/added
  const itemColumnMapRef = useRef<Map<string, number>>(new Map());
  const lastVisibilityUpdateRef = useRef<number>(0);
  const lastScrollMetricsRef = useRef<{
    scrollY: number;
    viewportHeight: number;
    contentHeight: number;
  }>({ scrollY: 0, viewportHeight: 0, contentHeight: 0 });

  // Track visible posts for proactive loading
  const visiblePostsRef = useRef<Set<string>>(new Set());
  const lastProactiveLoadCheckRef = useRef<number>(0);
  const endReachedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use centralized HTML utility
  const stripHtmlTags = stripHtml;

  // Helper function for efficient Set comparison (avoids array spread in hot path)
  const setsEqual = useCallback((a: Set<string>, b: Set<string>) => {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }, []);

  // Clear timers on unmount to avoid leaks
  useEffect(() => {
    return () => {
      if (endReachedResetRef.current) {
        clearTimeout(endReachedResetRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Helper to determine if the user is near the bottom of the scrollable area
  const isNearBottom = useCallback(
    (metrics: { scrollY: number; viewportHeight: number; contentHeight: number }) => {
      const { scrollY, viewportHeight, contentHeight } = metrics;
      return viewportHeight + scrollY >= contentHeight - UI_CONFIG.PAGINATION_THRESHOLD;
    },
    [],
  );

  const maybeTriggerEndReached = useCallback(
    (overrideMetrics?: {
      scrollY: number;
      viewportHeight: number;
      contentHeight: number;
    }) => {
      if (!onEndReached || isAtEnd || isLoadingMore || !hasMore) {
        return;
      }

      const metrics = overrideMetrics ?? lastScrollMetricsRef.current;
      if (metrics.contentHeight === 0) {
        return;
      }

      if (isNearBottom(metrics)) {
        setIsAtEnd(true);
        onEndReached();
        if (endReachedResetRef.current) {
          clearTimeout(endReachedResetRef.current);
        }
        endReachedResetRef.current = setTimeout(() => setIsAtEnd(false), 1000);
      }
    },
    [hasMore, isAtEnd, isLoadingMore, onEndReached, isNearBottom],
  );

  // Extract all items from posts (media, cards, or text) and distribute to columns
  const { gridItems, columns } = useMemo(() => {
    const items: GridItem[] = [];

    posts.forEach((post) => {
      // Get the actual post (handle reblogs)
      const displayPost = post.reblog || post;

      // Priority 1: Include posts with media
      if (
        displayPost.mediaAttachments &&
        displayPost.mediaAttachments.length > 0
      ) {
        displayPost.mediaAttachments.forEach((media, index) => {
          // Only include image and video media
          if (
            media.type === "image" ||
            media.type === "video" ||
            media.type === "gifv"
          ) {
            items.push({
              id: `${post.id}-media-${index}`, // Use post.id (unique feed item) and index instead of media.id
              feedItemId: post.id,
              displayPostId: displayPost.id,
              type: "media",
              mediaIndex: index,
              media,
              sensitive: displayPost.sensitive || false,
            });
          }
        });
      }
      // Priority 2: Include posts with URL cards (that have images)
      else if (displayPost.card && displayPost.card.image) {
        items.push({
          id: `${post.id}-card`, // Use post.id for uniqueness
          feedItemId: post.id,
          displayPostId: displayPost.id,
          type: "card",
          card: displayPost.card,
        });
      }
      // Priority 3: Include text-only posts
      else if (displayPost.content) {
        const textContent = stripHtmlTags(displayPost.content);
        if (textContent.length > 0) {
          items.push({
            id: `${post.id}-text`, // Use post.id for uniqueness
            feedItemId: post.id,
            displayPostId: displayPost.id,
            type: "text",
            content: textContent,
          });
        }
      }
    });

    // Distribute items across columns for masonry layout and get position info
    const { columns: distributedColumns, itemPositions } =
      distributeItemsToColumns(
        items,
        COLUMN_COUNT,
        itemColumnMapRef.current,
      );

    // Store positions in ref for visibility tracking
    itemPositionsRef.current = itemPositions;

    return { gridItems: items, columns: distributedColumns };
  }, [posts]);

  // Clean up stale actual positions when items are removed
  useEffect(() => {
    const currentIds = new Set(gridItems.map((item) => item.id));
    // Remove positions for items that no longer exist
    actualItemPositionsRef.current.forEach((_, itemId) => {
      if (!currentIds.has(itemId)) {
        actualItemPositionsRef.current.delete(itemId);
        measuredItemsRef.current.delete(itemId);
      }
    });
    // Clean up refs as well
    itemRefsRef.current.forEach((_, itemId) => {
      if (!currentIds.has(itemId)) {
        itemRefsRef.current.delete(itemId);
      }
    });
  }, [gridItems]);

  // Preserve scroll offset when items are trimmed from the top (e.g., at cap)
  useEffect(() => {
    const prevPositions = previousItemPositionsRef.current;
    if (!prevPositions || prevPositions.size === 0) {
      previousItemPositionsRef.current = new Map(itemPositionsRef.current);
      return;
    }

    // Detect removed items
    const currentIds = new Set(gridItems.map((item) => item.id));
    const removedPositions: {
      yPosition: number;
      height: number;
      columnIndex: number;
    }[] = [];

    prevPositions.forEach((pos, id) => {
      if (!currentIds.has(id)) {
        removedPositions.push(pos);
      }
    });

    if (removedPositions.length > 0 && scrollViewRef.current) {
      // Always compensate for removed items, even if near bottom
      // This prevents visual jumps when items are removed from the top
      // regardless of where the user is scrolled

      // Sum removed heights per column to approximate vertical shift
      const removedByColumn = Array(COLUMN_COUNT).fill(0);
      removedPositions.forEach((pos) => {
        removedByColumn[pos.columnIndex] += pos.height + GRID_GAP;
      });

      const shift = Math.max(...removedByColumn);
      if (shift > 0) {
        const currentY = lastScrollMetricsRef.current.scrollY;
        const nextY = Math.max(0, currentY - shift);
        scrollViewRef.current.scrollTo({ y: nextY, animated: false });
        lastScrollMetricsRef.current = {
          ...lastScrollMetricsRef.current,
          scrollY: nextY,
        };
        // Mark that we compensated to prevent double compensation in onContentSizeChange
        lastCompensationRef.current = Date.now();
      }
    }

    // Update previous positions snapshot
    previousItemPositionsRef.current = new Map(itemPositionsRef.current);
  }, [gridItems, isNearBottom]);

  // Create mapping from wrapper postId to post index for proactive loading
  const postIdToIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    posts.forEach((post, index) => {
      map.set(post.id, index);
    });
    return map;
  }, [posts]);

  // Pre-compute itemId to feedItemId map for efficient visibility tracking
  const itemIdToFeedItemIdMap = useMemo(() => {
    const map = new Map<string, string>();
    gridItems.forEach((item) => map.set(item.id, item.feedItemId));
    return map;
  }, [gridItems]);

  // Create mapping from display postId (handles reblogs) to post for checking favorited status
  const postIdToPostMap = useMemo(() => {
    const map = new Map<string, Post>();
    posts.forEach((post) => {
      const displayPost = post.reblog || post;
      map.set(displayPost.id, displayPost);
    });
    return map;
  }, [posts]);

  // Calculate which items are visible based on scroll position and viewport
  // Note: Grid view uses ScrollView (renders all items), so this is only for visibility tracking
  // (media loading/autoplay), not for virtualization like list view's windowSize
  const calculateVisibleItems = useCallback(
    (scrollY: number, viewportHeight: number) => {
      const visible = new Set<string>();
      const positions = itemPositionsRef.current;

      // Buffer zone for visibility tracking (media loading/autoplay)
      // Smaller buffer than list view's windowSize since grid renders all items anyway
      const bufferZone = viewportHeight * UI_CONFIG.VISIBILITY_BUFFER_RATIO;
      const visibleTop = Math.max(0, scrollY - bufferZone);
      const visibleBottom = scrollY + viewportHeight + bufferZone;

      // Check each item's position against the visible range
      positions.forEach(
        (
          position: { yPosition: number; height: number; columnIndex: number },
          itemId: string,
        ) => {
          const itemTop = position.yPosition;
          const itemBottom = position.yPosition + position.height;

          // Item is visible if it intersects with the visible range
          if (itemBottom >= visibleTop && itemTop <= visibleBottom) {
            visible.add(itemId);
          }
        },
      );

      return visible;
    },
    [],
  );

  // Initialize visible items when grid items load (calculate based on initial viewport)
  useEffect(() => {
    if (gridItems.length > 0 && visibleItems.size === 0) {
      // Get viewport height from Dimensions
      const { height: screenHeight } = Dimensions.get("window");

      // Calculate initially visible items (from scroll position 0)
      const initialVisible = calculateVisibleItems(0, screenHeight);

      setVisibleItems(initialVisible);
    }
  }, [gridItems, calculateVisibleItems]);

  // Scroll to target post when switching to grid view
  // Allow re-scrolling if content height has increased significantly (layout changed)
  useEffect(() => {
    // Clear any pending retry timeout when scrollToPostId changes or component unmounts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Reset lastScrolledToPostIdRef when scrollToPostId changes (new transition)
    if (scrollToPostId && scrollToPostId !== lastScrolledToPostIdRef.current) {
      lastScrolledToPostIdRef.current = null;
      lastScrollContentHeightRef.current = 0;
    }

    // Check if we should scroll:
    // 1. scrollToPostId is set
    // 2. We have grid items
    // 3. Either we haven't scrolled to this post yet, OR content height has increased significantly (layout changed)
    const contentHeight = lastScrollMetricsRef.current.contentHeight;
    const contentHeightIncreased = contentHeight > 0 &&
      lastScrollContentHeightRef.current > 0 &&
      contentHeight > lastScrollContentHeightRef.current * 1.2; // 20% increase indicates significant layout change

    const shouldScroll = scrollToPostId &&
      gridItems.length > 0 &&
      scrollViewRef.current &&
      (scrollToPostId !== lastScrolledToPostIdRef.current || contentHeightIncreased);

    if (shouldScroll) {
      // Find the first grid item for this post (check both feedItemId and displayPostId for reblogs)
      const targetItem = gridItems.find(
        (item) => item.feedItemId === scrollToPostId || item.displayPostId === scrollToPostId,
      );

      if (targetItem) {
        // Helper to calculate padding offset for scroll positioning
        const calculatePaddingOffset = (viewportHeight: number): number => {
          return Math.min(
            UI_CONFIG.GRID_SCROLL_PADDING_MAX,
            viewportHeight * UI_CONFIG.GRID_SCROLL_PADDING_RATIO,
          );
        };

        // Helper to scroll to target item with padding
        const scrollToItem = (position: { y: number; height: number }) => {
          const offset = position.y;
          const viewportHeight = lastScrollMetricsRef.current.viewportHeight || Dimensions.get("window").height;
          const paddingOffset = calculatePaddingOffset(viewportHeight);
          const adjustedOffset = Math.max(0, offset - paddingOffset);

          // Report offset for consumers
          if (onItemOffset) {
            onItemOffset(targetItem.feedItemId, offset);
          }

          scrollViewRef.current?.scrollTo({
            y: adjustedOffset,
            animated: false,
          });
          lastScrolledToPostIdRef.current = scrollToPostId;
          lastScrollContentHeightRef.current = lastScrollMetricsRef.current.contentHeight;

          // Notify parent that scroll restoration completed
          if (onScrollComplete) {
            onScrollComplete();
          }
        };

        // Check if we have the actual measured position for this item
        const actualPosition = actualItemPositionsRef.current.get(targetItem.id);

        if (actualPosition) {
          // Use actual measured position - this is accurate
          // Scroll immediately since we have the actual position
          setTimeout(() => {
            scrollToItem(actualPosition);
          }, UI_CONFIG.SCROLL_RECOVERY_DELAY);
        } else {
          // Actual position not yet measured - wait for it
          // Set up a retry mechanism that checks periodically
          // Retry after a delay to allow layout to complete
          const maxRetries = UI_CONFIG.GRID_POSITION_MEASURE_RETRIES;
          const retryDelay = UI_CONFIG.SCROLL_RECOVERY_DELAY;
          let retryCount = 0;

          const checkAndScroll = () => {
            // Clear previous timeout ref
            retryTimeoutRef.current = null;

            const measuredPosition = actualItemPositionsRef.current.get(targetItem.id);
            if (measuredPosition) {
              // Found it! Scroll now
              scrollToItem(measuredPosition);
            } else if (retryCount < maxRetries) {
              retryCount++;
              retryTimeoutRef.current = setTimeout(checkAndScroll, retryDelay);
            }
          };

          // Start checking after initial delay
          retryTimeoutRef.current = setTimeout(checkAndScroll, UI_CONFIG.SCROLL_RECOVERY_DELAY);
        }
      }
      // If post not found, don't mark as scrolled - allow retry when new items load via pagination
      // The effect will re-run when gridItems changes, enabling automatic retry
    }

    // Cleanup function to clear retry timeout on unmount or dependency change
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [scrollToPostId, gridItems, columns, onItemOffset]);

  useEffect(() => {
    if (
      scrollToTopSignal &&
      scrollToTopSignal !== lastScrollSignalRef.current
    ) {
      lastScrollSignalRef.current = scrollToTopSignal;
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [scrollToTopSignal]);

  const handleItemPress = useCallback(
    (item: GridItem) => {
      if (onMediaPress) {
        // For media items, pass the media index; for others, pass 0 to show the full post
        const mediaIndex = item.type === "media" ? item.mediaIndex : 0;
        onMediaPress(item.feedItemId, mediaIndex);
      }
    },
    [onMediaPress],
  );

  // Shared delayed click handler; per-item callbacks are supplied at call time
  const handleDelayedItemClick = useDelayedClick({
    onSingleClick: () => { },
    onDoubleClick: () => { },
  });

  // Create click handler for an item
  const createItemClickHandler = useCallback(
    (item: GridItem) => {
      if (!onToggleFavorite) {
        return () => handleItemPress(item);
      }

      return () => {
        handleDelayedItemClick(item.id, {
          onSingleClick: () => handleItemPress(item),
          onDoubleClick: () => onToggleFavorite(item.displayPostId),
        });
      };
    },
    [onToggleFavorite, handleItemPress, handleDelayedItemClick],
  );

  // Store refs for items to measure their absolute positions
  const itemRefsRef = useRef<Map<string, any>>(new Map());

  // Handler to measure actual item positions using measureInWindow
  const handleItemLayout = useCallback((itemId: string, ref: any) => {
    if (!ref) return;

    // Use measureInWindow to get absolute position, then convert to ScrollView-relative
    ref.measureInWindow?.((x: number, y: number, width: number, height: number) => {
      // Validate measurements
      if (typeof y !== 'number' || y < 0 || typeof height !== 'number' || height <= 0) {
        return;
      }

      // We need the position relative to the ScrollView content, not the window
      // measureInWindow gives us window-relative position
      // We need to measure the ScrollView's position in window and subtract
      if (scrollViewRef.current) {
        scrollViewRef.current.measureInWindow?.((scrollX: number, scrollY: number) => {
          // Validate scroll view measurements
          if (typeof scrollY !== 'number' || scrollY < 0) {
            return;
          }

          // Get current scroll position
          const scrollOffset = lastScrollMetricsRef.current.scrollY;
          // Calculate position relative to ScrollView content
          // y from measureInWindow is window-relative, scrollY is also window-relative
          // We need content-relative position = (item window y - scrollView window y) + scrollOffset
          const contentRelativeY = (y - scrollY) + scrollOffset;

          actualItemPositionsRef.current.set(itemId, { y: contentRelativeY, height });
        });
      }
    });
  }, []);

  const renderItem = useCallback(
    (item: GridItem) => {
      const isItemVisible = visibleItems.has(item.id);
      const itemHeight = getItemHeight(item);
      // Check if the post is favorited
      const post = postIdToPostMap.get(item.displayPostId);
      const isFavorited = post?.favourited || false;

      // Render based on item type
      if (item.type === "media") {
        const isVideo =
          item.media.type === "video" || item.media.type === "gifv";
        const itemClickHandler = createItemClickHandler(item);

        // Store ref for this item
        const itemRef = (ref: any) => {
          if (ref) {
            itemRefsRef.current.set(item.id, ref);
            // Only measure if we haven't measured this item yet
            if (!measuredItemsRef.current.has(item.id)) {
              measuredItemsRef.current.add(item.id);
              // Measure position after ref is set
              setTimeout(() => handleItemLayout(item.id, ref), 0);
            }
          }
        };

        return (
          <TouchableOpacity
            key={item.id}
            ref={itemRef}
            style={[
              styles.gridItem,
              {
                width: STYLE_CONSTANTS.FULL_WIDTH,
                height: itemHeight,
                marginBottom: GRID_GAP,
                maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
              },
            ]}
            onPress={itemClickHandler}
            activeOpacity={0.8}
          >
            <MediaGrid
              media={[item.media]}
              mode="grid"
              isVisible={isItemVisible}
              sensitive={item.sensitive}
            />

            {/* Favorite indicator */}
            {isFavorited && (
              <View style={styles.favoriteIndicator}>
                <Text style={styles.favoriteIcon}>❤️</Text>
              </View>
            )}

            {/* Video indicator */}
            {isVideo && (
              <View style={styles.videoIndicator}>
                <Text style={styles.videoIcon}>▶️</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      }

      if (item.type === "card") {
        const itemClickHandler = createItemClickHandler(item);

        // Store ref for this item
        const itemRef = (ref: any) => {
          if (ref) {
            itemRefsRef.current.set(item.id, ref);
            // Only measure if we haven't measured this item yet
            if (!measuredItemsRef.current.has(item.id)) {
              measuredItemsRef.current.add(item.id);
              // Measure position after ref is set
              setTimeout(() => handleItemLayout(item.id, ref), 0);
            }
          }
        };

        return (
          <TouchableOpacity
            key={item.id}
            ref={itemRef}
            style={[
              styles.gridItem,
              {
                width: STYLE_CONSTANTS.FULL_WIDTH,
                height: itemHeight,
                marginBottom: GRID_GAP,
                maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
              },
            ]}
            onPress={itemClickHandler}
            activeOpacity={0.8}
          >
            {/* URL Card Image */}
            {item.card.image && (
              <Image
                source={{ uri: item.card.image }}
                style={styles.image}
                contentFit="cover"
                transition={200}
              />
            )}

            {/* Card overlay with title */}
            <View
              style={[
                styles.cardOverlay,
                { backgroundColor: "rgba(0, 0, 0, 0.6)" },
              ]}
            >
              <Text
                style={styles.cardTitle}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {item.card.title}
              </Text>
            </View>

            {/* Favorite indicator */}
            {isFavorited && (
              <View style={styles.favoriteIndicator}>
                <Text style={styles.favoriteIcon}>❤️</Text>
              </View>
            )}

            {/* Link indicator */}
            <View style={styles.linkIndicator}>
              <Text style={styles.linkIcon}>🔗</Text>
            </View>
          </TouchableOpacity>
        );
      }

      // Text-only tile
      const itemClickHandler = createItemClickHandler(item);

      // Store ref for this item
      const itemRef = (ref: any) => {
        if (ref) {
          itemRefsRef.current.set(item.id, ref);
          // Measure position after ref is set
          setTimeout(() => handleItemLayout(item.id, ref), 0);
        }
      };

      return (
        <TouchableOpacity
          key={item.id}
          ref={itemRef}
          style={[
            styles.gridItem,
            styles.textItem,
            {
              width: STYLE_CONSTANTS.FULL_WIDTH,
              height: itemHeight,
              marginBottom: GRID_GAP,
              backgroundColor: colors.card,
              maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
            },
          ]}
          onPress={itemClickHandler}
          activeOpacity={0.8}
        >
          <View style={styles.textContent}>
            <Text
              style={[styles.textPreview, { color: colors.text }]}
              numberOfLines={Math.floor((itemHeight - 16) / 16)}
              ellipsizeMode="tail"
              adjustsFontSizeToFit={false}
            >
              {item.content}
            </Text>
          </View>

          {/* Favorite indicator */}
          {isFavorited && (
            <View style={styles.favoriteIndicator}>
              <Text style={styles.favoriteIcon}>❤️</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [handleItemPress, colors, visibleItems, postIdToPostMap],
  );

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;

    return (
      <View style={styles.footerLoader}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Loading more...
        </Text>
      </View>
    );
  }, [isLoadingMore, colors.textSecondary]);

  const renderEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyIcon, { color: colors.textSecondary }]}>
          📱
        </Text>
        <Text style={[styles.emptyText, { color: colors.text }]}>
          No posts yet
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
          Posts will appear here in grid view
        </Text>
      </View>
    );
  }, [colors.text, colors.textSecondary]);

  // Handle scroll event for pagination and visibility tracking
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const scrollY = contentOffset.y;
      const viewportHeight = layoutMeasurement.height;
      const contentHeight = contentSize.height;

      // Persist latest scroll metrics for re-evaluation on content changes
      lastScrollMetricsRef.current = {
        scrollY,
        viewportHeight,
        contentHeight,
      };

      // 1. Handle visibility tracking for video autoplay
      const now = Date.now();
      const timeSinceLastUpdate = now - lastVisibilityUpdateRef.current;

      // Update visibility at same interval as list view for consistent behavior
      if (timeSinceLastUpdate >= UI_CONFIG.VISIBILITY_UPDATE_INTERVAL) {
        lastVisibilityUpdateRef.current = now;

        const newVisibleItems = calculateVisibleItems(scrollY, viewportHeight);

        // Only update state if the visible set actually changed (use ref to avoid stale closure)
        if (!setsEqual(newVisibleItems, visibleItemsRef.current)) {
          visibleItemsRef.current = newVisibleItems;
          setVisibleItems(newVisibleItems);
        }

        // 2. Track visible posts for proactive loading
        // Convert visible grid items to visible posts using pre-computed map
        const newVisiblePosts = new Set<string>();
        newVisibleItems.forEach((itemId) => {
          const feedItemId = itemIdToFeedItemIdMap.get(itemId);
          if (feedItemId) {
            newVisiblePosts.add(feedItemId);
          }
        });

        // Check if visible posts changed and call proactive loading callback
        const timeSinceLastProactiveCheck =
          now - lastProactiveLoadCheckRef.current;
        if (
          timeSinceLastProactiveCheck >=
          UI_CONFIG.PROACTIVE_LOAD_CHECK_INTERVAL &&
          onViewableItemsChanged
        ) {
          const visiblePostsChanged = !setsEqual(
            newVisiblePosts,
            visiblePostsRef.current,
          );

          if (visiblePostsChanged) {
            visiblePostsRef.current = newVisiblePosts;
            lastProactiveLoadCheckRef.current = now;

            // Get the indices of visible posts
            const visiblePostIndices = Array.from(newVisiblePosts)
              .map((postId) => postIdToIndexMap.get(postId))
              .filter((index): index is number => index !== undefined)
              .sort((a, b) => a - b);

            if (visiblePostIndices.length > 0) {
              // Create viewableItems array with post indices
              const viewableItems = visiblePostIndices.map((index) => ({
                index,
                item: posts[index],
              }));

              onViewableItemsChanged({ viewableItems, changed: [] });
            }
          }
        }
      }

      // 3. Handle legacy pagination (fallback for old onEndReached prop)
      maybeTriggerEndReached();
    },
    [
      onViewableItemsChanged,
      calculateVisibleItems,
      visibleItems,
      gridItems,
      postIdToIndexMap,
      posts,
      maybeTriggerEndReached,
    ],
  );

  // If no items, show empty state
  if (gridItems.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyList}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {renderEmpty()}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onContentSizeChange={(_, height) => {
        const previousHeight = lastScrollMetricsRef.current.contentHeight;
        const heightDelta = previousHeight - height;

        // Update metrics first so downstream consumers see the latest size
        lastScrollMetricsRef.current = {
          ...lastScrollMetricsRef.current,
          contentHeight: height,
        };

        // If content height shrinks (e.g., posts trimmed from top), compensate scroll to avoid jumps
        // Skip if we already compensated in the items effect (within last 100ms)
        // Also skip if user is near bottom loading more posts
        const timeSinceLastCompensation = Date.now() - lastCompensationRef.current;
        const userIsNearBottom = isNearBottom(lastScrollMetricsRef.current);
        if (
          heightDelta > 0 &&
          scrollViewRef.current &&
          timeSinceLastCompensation > 100 &&
          !userIsNearBottom
        ) {
          const currentY = lastScrollMetricsRef.current.scrollY;
          const nextY = Math.max(0, currentY - heightDelta);
          scrollViewRef.current.scrollTo({
            y: nextY,
            animated: false,
          });
          // Keep scroll metrics in sync with the manual adjustment
          lastScrollMetricsRef.current = {
            ...lastScrollMetricsRef.current,
            scrollY: nextY,
          };
        }

        maybeTriggerEndReached();
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      <View style={styles.masonryContainer}>
        {/* Render each column */}
        {columns.map((columnItems, columnIndex) => (
          <View key={`column-${columnIndex}`} style={styles.column}>
            {columnItems.map((item) => renderItem(item))}
          </View>
        ))}
      </View>

      {/* Loading footer */}
      {renderFooter()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyList: {
    flexGrow: 1,
  },
  masonryContainer: {
    flexDirection: "row",
    paddingHorizontal: GRID_GAP,
    paddingVertical: GRID_GAP,
    gap: GRID_GAP,
    width: STYLE_CONSTANTS.FULL_WIDTH,
    maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
    minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
  },
  column: {
    flex: 1,
    minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
    maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
  },
  gridItem: {
    backgroundColor: "#F0F0F0",
    overflow: "hidden",
    position: "relative",
    borderRadius: 4,
    maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
    minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
  },
  image: {
    width: STYLE_CONSTANTS.FULL_WIDTH,
    height: STYLE_CONSTANTS.FULL_HEIGHT,
    ...fullSizeConstraints,
  },
  videoIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    padding: 4,
  },
  videoIcon: {
    fontSize: 12,
  },
  favoriteIndicator: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    padding: 4,
  },
  favoriteIcon: {
    fontSize: 12,
  },
  // Card tile styles
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
  },
  linkIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    padding: 4,
  },
  linkIcon: {
    fontSize: 12,
  },
  // Text tile styles
  textItem: {
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  textContent: {
    padding: 8,
    width: "100%",
    flex: 1,
    justifyContent: "flex-start",
  },
  textPreview: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "left",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  footerLoader: {
    padding: 20,
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
  },
});
