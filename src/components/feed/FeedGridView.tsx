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
import {
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
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
 * Displays items from posts in a uniform square grid
 * Supports media, URL cards, and text-only posts with cover-fit imagery
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
  containerWidth: number; // exact width of the container
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

const COLUMN_COUNT = 3;
const GRID_GAP = 2;

type ItemPosition = {
  xPosition: number;
  yPosition: number;
  height: number;
  columnIndex: number;
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
  containerWidth,
}: FeedGridViewProps) {
  const { colors, isDark } = useTheme();

  const actualContainerWidth = containerWidth;

  const columnWidth = useMemo(() =>
    (actualContainerWidth - GRID_GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT,
    [actualContainerWidth]);

  const xForColumn = useCallback((columnIndex: number): number =>
    GRID_GAP + columnIndex * (columnWidth + GRID_GAP),
    [columnWidth]);

  const getItemHeight = useCallback((_item: GridItem): number => columnWidth, [columnWidth]);

  const prevColumnWidthRef = useRef<number>(columnWidth);

  const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set());
  const visibleItemsRef = useRef<Set<string>>(new Set());
  const scrollViewRef = useRef<ScrollView>(null);
  const lastScrollSignalRef = useRef<number | null>(null);
  const lastScrolledToPostIdRef = useRef<string | null>(null); // Track what we've scrolled to
  const lastScrollContentHeightRef = useRef<number>(0); // Track content height when we last scrolled
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Track retry timeout for cleanup
  const [isAtEnd, setIsAtEnd] = useState(false);

  // Store item positions for visibility tracking (from distributeItemsToColumns)
  const itemPositionsRef = useRef<
    Map<string, { yPosition: number; height: number; columnIndex: number }>
  >(new Map());

  // Store actual measured positions from onLayout handlers
  const actualItemPositionsRef = useRef<
    Map<string, { y: number; height: number }>
  >(new Map());
  // Track which items have been measured to avoid redundant measurements
  const measuredItemsRef = useRef<Set<string>>(new Set());
  const lastVisibilityUpdateRef = useRef<number>(0);
  const lastScrollMetricsRef = useRef<{
    scrollY: number;
    viewportHeight: number;
    contentHeight: number;
  }>({ scrollY: 0, viewportHeight: 0, contentHeight: 0 });

  // Track visible posts for proactive loading
  const visiblePostsRef = useRef<Set<string>>(new Set());
  const lastProactiveLoadCheckRef = useRef<number>(0);
  const anchorItemRef = useRef<{
    id: string;
    offset: number;
    inViewport: boolean;
    scrollY: number;
    timestamp: number;
    captureFirstId?: string;
  } | null>(null);
  const prevAnchorItemRef = useRef<typeof anchorItemRef.current>(null);
  const endReachedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track previous grid item IDs for cleanup
  const prevGridItemIdsRef = useRef<Set<string>>(new Set());

  // Persistent layout cache – once an item is assigned a column, it keeps that
  // column assignment forever. This prevents the entire grid from reflowing when
  // items are trimmed from the start of the array (which may remove a number of
  // GridItems not divisible by COLUMN_COUNT).
  const layoutCacheRef = useRef<Map<string, ItemPosition>>(new Map());

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
  // Uses viewport-based proactive loading to maintain large buffer
  const isNearBottom = useCallback(
    (metrics: {
      scrollY: number;
      viewportHeight: number;
      contentHeight: number;
    }) => {
      const { scrollY, viewportHeight, contentHeight } = metrics;

      // Proactive loading: trigger when within N viewport heights from bottom
      // This ensures posts load well before reaching the end, maintaining a large buffer
      const distanceFromBottom = contentHeight - (scrollY + viewportHeight);
      const proactiveThreshold =
        viewportHeight * UI_CONFIG.PROACTIVE_LOAD_BUFFER_RATIO;
      const isNearBottomViewport = distanceFromBottom <= proactiveThreshold;

      // Fallback to pixel-based threshold for very small viewports
      const isNearBottomPixels =
        viewportHeight + scrollY >=
        contentHeight - UI_CONFIG.PAGINATION_THRESHOLD;

      return isNearBottomViewport || isNearBottomPixels;
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
  const { gridItems, maxColumnHeight } = useMemo(() => {
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
              id: `${post.id}-media-${index}`,
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
          id: `${post.id}-card`,
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
            id: `${post.id}-text`,
            feedItemId: post.id,
            displayPostId: displayPost.id,
            type: "text",
            content: textContent,
          });
        }
      }
    });

    // ── Persistent layout cache ──────────────────────────────────────────
    // Reuse cached column assignments for items that survived a trim so they
    // stay in the exact same column.  Only newly-appended items get fresh
    // positions assigned via shortest-column-first.
    const cache = layoutCacheRef.current;

    // Clear cache if column width changed (e.g., orientation or layout switch)
    if (prevColumnWidthRef.current !== columnWidth) {
      cache.clear();
      prevColumnWidthRef.current = columnWidth;
    }

    const currentIds = new Set(items.map((i) => i.id));

    // 1. Prune cache entries for items that are no longer in the array
    cache.forEach((_, id) => {
      if (!currentIds.has(id)) cache.delete(id);
    });

    // 2. Rebase: shift all remaining cached positions up to eliminate
    //    dead space left by trimmed items at the top.
    if (cache.size > 0) {
      let minY = Infinity;
      cache.forEach((pos) => {
        if (pos.yPosition < minY) minY = pos.yPosition;
      });
      // Keep the GRID_GAP top padding intact
      const rebaseOffset = minY - GRID_GAP;
      if (rebaseOffset > 0) {
        cache.forEach((pos, id) => {
          cache.set(id, { ...pos, yPosition: pos.yPosition - rebaseOffset });
        });
      }
    }

    // 3. Derive current column heights from surviving cached positions
    const columnHeights = Array(COLUMN_COUNT).fill(GRID_GAP);
    cache.forEach((pos) => {
      const bottom = pos.yPosition + pos.height + GRID_GAP;
      columnHeights[pos.columnIndex] = Math.max(
        columnHeights[pos.columnIndex],
        bottom,
      );
    });

    // 4. Assign positions to un-cached (new) items using shortest-column-first
    const itemPositions = new Map<string, ItemPosition>();
    items.forEach((item) => {
      const cached = cache.get(item.id);
      if (cached) {
        // Reuse cached position – column assignment is permanent
        itemPositions.set(item.id, cached);
      } else {
        // Find shortest column
        let shortestCol = 0;
        for (let i = 1; i < COLUMN_COUNT; i++) {
          if (columnHeights[i] < columnHeights[shortestCol]) shortestCol = i;
        }
        const pos: ItemPosition = {
          xPosition: xForColumn(shortestCol),
          yPosition: columnHeights[shortestCol],
          height: columnWidth,
          columnIndex: shortestCol,
        };
        itemPositions.set(item.id, pos);
        cache.set(item.id, pos);
        columnHeights[shortestCol] = pos.yPosition + columnWidth + GRID_GAP;
      }
    });

    // 5. Compute container height
    const maxHeight = columnHeights.length > 0 ? Math.max(...columnHeights) : 0;

    // Store positions in ref for visibility tracking
    itemPositionsRef.current = itemPositions;

    return {
      gridItems: items,
      maxColumnHeight: maxHeight,
    };
  }, [posts, columnWidth, xForColumn]);

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

  useEffect(() => {
    prevGridItemIdsRef.current = new Set(gridItems.map((item) => item.id));
  }, [gridItems]);

  // Note: With array-based layout, items always start from yPosition 0.
  // No scroll compensation needed - the grid naturally fills from top to bottom.

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

      // Initialize anchor to top-most visible item
      let anchorId: string | null = null;
      let anchorTop = Infinity;
      initialVisible.forEach((itemId) => {
        const pos = itemPositionsRef.current.get(itemId);
        if (!pos) return;
        if (pos.yPosition < anchorTop) {
          anchorTop = pos.yPosition;
          anchorId = itemId;
        }
      });
      if (anchorId && Number.isFinite(anchorTop)) {
        prevAnchorItemRef.current = anchorItemRef.current;
        anchorItemRef.current = {
          id: anchorId,
          offset: anchorTop - 0,
          inViewport: true,
          scrollY: 0,
          timestamp: Date.now(),
          captureFirstId: posts[0]?.id,
        };
      }
    }
  }, [gridItems, calculateVisibleItems]);

  // Scroll to target post when switching to grid view
  // Track successful scrolling natively to prevent re-entering on layout bounds expansion
  useEffect(() => {
    // Clear any pending retry timeout when scrollToPostId changes or component unmounts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Reset indicator lock when scrollToPostId actively prop-swaps
    if (scrollToPostId && scrollToPostId !== lastScrolledToPostIdRef.current) {
      lastScrolledToPostIdRef.current = null;
      lastScrollContentHeightRef.current = 0;
    }

    // Only scroll if we have NOT fulfilled the restoration request
    const shouldScroll =
      scrollToPostId &&
      gridItems.length > 0 &&
      scrollViewRef.current &&
      scrollToPostId !== lastScrolledToPostIdRef.current;

    if (shouldScroll) {
      // Find the first grid item for this post (check both feedItemId and displayPostId for reblogs)
      const targetItem = gridItems.find(
        (item) =>
          item.feedItemId === scrollToPostId ||
          item.displayPostId === scrollToPostId,
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
          const viewportHeight =
            lastScrollMetricsRef.current.viewportHeight ||
            Dimensions.get("window").height;
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
          lastScrollContentHeightRef.current =
            lastScrollMetricsRef.current.contentHeight;

          // Notify parent that scroll restoration completed
          if (onScrollComplete) {
            onScrollComplete();
          }
        };

        // Check if we have the actual measured position for this item
        const actualPosition = actualItemPositionsRef.current.get(
          targetItem.id,
        );

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

            const measuredPosition = actualItemPositionsRef.current.get(
              targetItem.id,
            );
            if (measuredPosition) {
              // Found it! Scroll now
              scrollToItem(measuredPosition);
            } else if (retryCount < maxRetries) {
              retryCount++;
              retryTimeoutRef.current = setTimeout(checkAndScroll, retryDelay);
            }
          };

          // Start checking after initial delay
          retryTimeoutRef.current = setTimeout(
            checkAndScroll,
            UI_CONFIG.SCROLL_RECOVERY_DELAY,
          );
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
  }, [scrollToPostId, gridItems, onItemOffset]);

  useEffect(() => {
    if (
      scrollToTopSignal &&
      scrollToTopSignal !== lastScrollSignalRef.current
    ) {
      lastScrollSignalRef.current = scrollToTopSignal;
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [scrollToTopSignal]);

  // Restore scroll position when items are inserted/removed
  // We use useLayoutEffect because onContentSizeChange doesn't fire if height remains the same
  // (e.g. trimming 40 posts from top while adding 40 posts to bottom in a uniform grid)
  useLayoutEffect(() => {
    // Only care about compensating if we have an anchor
    const anchor = anchorItemRef.current;
    if (!anchor || !scrollViewRef.current) return;

    // Get the new position of our anchor item (which might have shifted indices)
    const newPos = itemPositionsRef.current.get(anchor.id);
    if (!newPos) return;

    const currentScrollY = lastScrollMetricsRef.current.scrollY;

    // Calculate expected scroll position to maintain anchor at exact screen offset
    const expectedScrollY = Math.max(0, newPos.yPosition - anchor.offset);

    // Check if we are physically pinned near the bottom
    const contentHeight = lastScrollMetricsRef.current.contentHeight;
    const viewportHeight = lastScrollMetricsRef.current.viewportHeight;

    const distanceFromBottom =
      contentHeight - (currentScrollY + viewportHeight);
    const isAtBottom = distanceFromBottom < Math.max(200, viewportHeight * 0.2);

    // If the expected position is significantly different from current,
    // it means the grid items physically shifted (e.g. from array trimming)
    // IMPORTANT: If we are near the very bottom, DO NOT correct the scroll upwards.
    // The user's intended action is to read the newly appended posts flowing downward.
    if (!isAtBottom && Math.abs(expectedScrollY - currentScrollY) > 1) {
      scrollViewRef.current.scrollTo({ y: expectedScrollY, animated: false });

      // Update metrics synchronously to prevent fight with native scrolling momentum
      lastScrollMetricsRef.current.scrollY = expectedScrollY;

      // Update anchor with new values so we don't infinitely trigger
      const nextAnchor = {
        ...anchor,
        scrollY: expectedScrollY,
      };
      anchorItemRef.current = nextAnchor;
      prevAnchorItemRef.current = nextAnchor;
    }
  }, [gridItems]);

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
    ref.measureInWindow?.(
      (x: number, y: number, width: number, height: number) => {
        // Validate measurements
        if (
          typeof y !== "number" ||
          y < 0 ||
          typeof height !== "number" ||
          height <= 0
        ) {
          return;
        }

        // We need the position relative to the ScrollView content, not the window
        // measureInWindow gives us window-relative position
        // We need to measure the ScrollView's position in window and subtract
        if (scrollViewRef.current) {
          scrollViewRef.current.measureInWindow?.(
            (scrollX: number, scrollY: number) => {
              // Validate scroll view measurements
              if (typeof scrollY !== "number" || scrollY < 0) {
                return;
              }

              // Get current scroll position
              const scrollOffset = lastScrollMetricsRef.current.scrollY;
              // Calculate position relative to ScrollView content
              // y from measureInWindow is window-relative, scrollY is also window-relative
              // We need content-relative position = (item window y - scrollView window y) + scrollOffset
              const contentRelativeY = y - scrollY + scrollOffset;

              actualItemPositionsRef.current.set(itemId, {
                y: contentRelativeY,
                height,
              });
            },
          );
        }
      },
    );
  }, []);

  const renderItem = useCallback(
    (item: GridItem) => {
      const isItemVisible = visibleItems.has(item.id);
      const itemHeight = getItemHeight(item);
      // Check if the post is favorited
      const post = postIdToPostMap.get(item.displayPostId);
      const isFavorited = post?.favourited || false;

      // Absolute positioning for square grid layout
      const pos = itemPositionsRef.current.get(item.id);
      const positioningStyle = pos
        ? {
          position: "absolute" as const,
          top: pos.yPosition,
          left: pos.xPosition,
          right: undefined,
        }
        : undefined;
      const sizeStyle = pos
        ? {
          width: columnWidth,
          height: itemHeight,
          maxWidth: columnWidth,
        }
        : {
          width: columnWidth,
          height: itemHeight,
          marginBottom: GRID_GAP,
          maxWidth: columnWidth,
        };

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
              positioningStyle,
              sizeStyle,
              { backgroundColor: "#8E8E8E" },
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
              positioningStyle,
              sizeStyle,
              { backgroundColor: "#8E8E8E" },
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
            positioningStyle,
            sizeStyle,
            { backgroundColor: "#8E8E8E" },
          ]}
          onPress={itemClickHandler}
          activeOpacity={0.8}
        >
          <View style={styles.textContent}>
            <Text
              style={[
                styles.textPreview,
                { color: isDark ? colors.text : "#000000" },
              ]}
              numberOfLines={Math.floor((columnWidth - 16) / 16)}
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
    [handleItemPress, colors, isDark, visibleItems, postIdToPostMap],
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
      const prevScrollY = lastScrollMetricsRef.current.scrollY;
      const scrollY = contentOffset.y;
      const viewportHeight = layoutMeasurement.height;
      const contentHeight = contentSize.height;

      // Persist latest scroll metrics for re-evaluation on content changes
      lastScrollMetricsRef.current = {
        scrollY,
        viewportHeight,
        contentHeight,
      };
      // #region agent log
      const deltaY = scrollY - prevScrollY;
      if (Math.abs(deltaY) > viewportHeight * 0.5) {
        console.log("[dbg][H10] large scroll delta", {
          prevScrollY,
          scrollY,
          deltaY,
          viewportHeight,
          contentHeight,
        });
      }
      // #endregion agent log

      // Note: Compensation is now handled in useLayoutEffect (before paint),
      // so we no longer need to fight momentum here.

      // Continuous anchor tracking (runs every scroll event to guarantee pixel-perfect restoration when bounds change)
      let currentAnchorId: string | null = null;
      let currentAnchorTop = Infinity;
      const clampedScrollY = Math.max(
        0,
        Math.min(scrollY, contentHeight - viewportHeight),
      );
      const clampedViewportBottom = clampedScrollY + viewportHeight;

      itemPositionsRef.current.forEach((pos, itemId) => {
        const itemBottom = pos.yPosition + pos.height;
        // Find highest item that intersects the clamped viewport
        if (
          itemBottom >= clampedScrollY &&
          pos.yPosition <= clampedViewportBottom
        ) {
          if (pos.yPosition < currentAnchorTop) {
            currentAnchorTop = pos.yPosition;
            currentAnchorId = itemId;
          }
        }
      });

      if (currentAnchorId) {
        anchorItemRef.current = {
          id: currentAnchorId,
          offset: currentAnchorTop - scrollY,
          inViewport: true,
          scrollY,
          timestamp: Date.now(),
        };
      }

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

        // Get current viewport height (fallback to window height if not yet measured)
        const viewportHeight =
          lastScrollMetricsRef.current.viewportHeight ||
          Dimensions.get("window").height;

        // Update metrics first so downstream consumers see the latest size
        lastScrollMetricsRef.current = {
          ...lastScrollMetricsRef.current,
          contentHeight: height,
          viewportHeight, // Ensure viewport height is set
        };

        maybeTriggerEndReached();
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      <View
        style={[
          styles.masonryContainer,
          { position: "relative" as const, height: maxColumnHeight },
        ]}
      >
        {/* Render all flat grid items into a single container */}
        {gridItems.map((item) => renderItem(item))}
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
