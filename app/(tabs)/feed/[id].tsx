import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  InteractionManager,
  Dimensions,
  type LayoutChangeEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@contexts/ThemeContext";
import { useFeed } from "@hooks/useFeed";
import { useFeedViewPreference } from "@hooks/useFeedViewPreference";
import {
  PostSectionHeader,
  PostSectionContent,
  PostCardSkeleton,
  FeedGridView,
} from "@components/feed";
import { FloatingButtons } from "@components/base";
import { UI_CONFIG } from "@/config";
import { getActiveClient } from "@lib/api/client";
import { transformStatus } from "@lib/api/timeline";
import { applyFavouriteStateToPost } from "@lib/feed/favourites";
import type { Post } from "@types";
import { computeVisibleIds } from "@lib/utils/visibility";
import {
  transformPostsToFeedItems,
  calculateStickyIndices,
  type FeedItem,
} from "@lib/feed/feedItemTransforms";

/**
 * Main feed screen with pagination and pull-to-refresh
 * Phase 3: Full implementation
 * Phase 7: Performance optimized with React Native's native virtualization
 * Phase 8: Converted to ScrollView for better stability (no virtualization)
 *
 * `FeedScreenBase` accepts a routeId so it can be reused by
 * account/hashtag/list feed routes for consistent behavior.
 */

// Parse feed type and ID from route parameter
// Format: "home", "public", "favourites", "bookmarks", "list/123", "hashtag/tag", "account/456"
const parseFeedParams = (routeId: string) => {
  if (routeId === "home")
    return { feedType: "home" as const, feedId: undefined };
  if (routeId === "local")
    return { feedType: "local" as const, feedId: undefined };
  if (routeId === "public")
    return { feedType: "public" as const, feedId: undefined };
  if (routeId === "favourites")
    return { feedType: "favourites" as const, feedId: undefined };
  if (routeId === "bookmarks")
    return { feedType: "bookmarks" as const, feedId: undefined };
  if (routeId.startsWith("list/"))
    return {
      feedType: "list" as const,
      feedId: routeId.replace("list/", ""),
    };
  if (routeId.startsWith("hashtag/"))
    return {
      feedType: "hashtag" as const,
      feedId: routeId.replace("hashtag/", ""),
    };
  if (routeId.startsWith("account/"))
    return {
      feedType: "account" as const,
      feedId: routeId.replace("account/", ""),
    };
  return { feedType: "public" as const, feedId: undefined };
};

export function FeedScreenBase({ routeId }: { routeId: string }) {
  const { colors } = useTheme();

  const { feedType, feedId } = parseFeedParams(routeId || "public");

  // View mode state (list or grid) - persisted across navigation
  const { isGridView, setIsGridView } = useFeedViewPreference();
  const [gridScrollSignal, setGridScrollSignal] = useState(0);

  // Track view transition state (for smooth transitions when switching views)
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Track current visible post ID for scroll position restoration
  const currentPostIdRef = useRef<string | null>(null);
  const flashListRef = useRef<FlashListRef<FeedItem>>(null);

  // Simple debounce for pagination
  const lastEndReachedRef = useRef<number>(0);

  // Track visible items for video autoplay using ref to avoid render cycles
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    new Set(),
  );
  const visibleSectionsRef = useRef<Set<string>>(new Set());
  const lastVisibilityUpdateRef = useRef<number>(0);
  const postLayoutsRef = useRef<
    Map<string, { y: number; height: number }>
  >(new Map());
  const itemLayoutsRef = useRef<
    Map<string, { y: number; height: number }>
  >(new Map());
  const averagePostHeightRef = useRef<number>(
    Dimensions.get("window").height * 0.6,
  ); // runtime-derived fallback
  const prevPostsRef = useRef<Post[]>([]);
  const lastScrollMetricsRef = useRef<{ y: number; viewportHeight: number }>({
    y: 0,
    viewportHeight: 0,
  });
  const isJumpingRef = useRef(false);

  // Track first visible post for view transitions
  const firstVisiblePostIdRef = useRef<string | null>(null);

  // Helper to scroll with InteractionManager wrapper
  const scrollToPosition = useCallback(
    (y: number, animated: boolean = false) => {
      InteractionManager.runAfterInteractions(() => {
        flashListRef.current?.scrollToOffset({ offset: y, animated });
      });
    },
    [],
  );

  // Use feed hook
  const {
    posts,
    pendingNewPosts,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    reload,
    jumpToPost,
    loadFromAnchor,
    removePost,
    applyPendingNewPosts,
    handleViewableItemsChanged: feedHandleViewableItemsChanged,
    updatePost,
  } = useFeed({
    feedType,
    feedId,
    limit: 20,
    cacheKey: `feed_${feedType}${feedId ? `_${feedId}` : ""}`,
    enableCache: true,
  });

  // Limit posts in memory for performance (ScrollView renders all items)
  // Keep only the most recent posts to prevent unbounded memory growth
  const MAX_POSTS_IN_MEMORY = 200;
  const visiblePosts = useMemo(() => {
    const filteredPosts = posts.filter((post) => post && post.id);
    if (filteredPosts.length <= MAX_POSTS_IN_MEMORY) {
      return filteredPosts;
    }
    // Keep last N posts (most recent)
    return filteredPosts.slice(-MAX_POSTS_IN_MEMORY);
  }, [posts]);
  
  const displayPosts = visiblePosts;
  const pendingNewCount = pendingNewPosts.length;

  // Transform posts into header/content items for sticky headers
  const feedItems = useMemo(
    () => transformPostsToFeedItems(displayPosts),
    [displayPosts]
  );

  // Calculate sticky header indices (all even indices: 0, 2, 4, ...)
  const stickyIndices = useMemo(
    () => calculateStickyIndices(feedItems),
    [feedItems]
  );

  // Initialize visible sections when posts load
  useEffect(() => {
    if (displayPosts.length > 0 && visibleSections.size === 0) {
      // Mark first 5 posts as visible on initial load
      // Filter out undefined items to prevent "Cannot read property 'id' of undefined" errors
      const initialVisible = new Set(
        displayPosts
          .slice(0, 5)
          .filter((p) => p && p.id)
          .map((p) => p.id),
      );
      setVisibleSections(initialVisible);
    }
  }, [displayPosts]);

  // Phase 1: Estimated layouts for all posts (pre-render)
  // Pre-populate estimates so scroll calculations work immediately
  useEffect(() => {
    displayPosts.forEach((post, index) => {
      if (!postLayoutsRef.current.has(post.id)) {
        const estimatedY = index * averagePostHeightRef.current;
        postLayoutsRef.current.set(post.id, {
          y: estimatedY,
          height: averagePostHeightRef.current,
        });
      }
    });
  }, [displayPosts, isGridView]);

  // Scroll to target post when switching to list view
  useEffect(() => {
    if (!isGridView && currentPostIdRef.current && flashListRef.current && feedItems.length > 0) {
      const targetPostId = currentPostIdRef.current;
      const targetIndex = feedItems.findIndex(
        (item) => item.post.id === targetPostId || item.post.reblog?.id === targetPostId
      );

      if (targetIndex >= 0) {
        // Scroll to header (even indices: 0, 2, 4...)
        const headerIndex = targetIndex % 2 === 0 ? targetIndex : targetIndex - 1;

        // Use InteractionManager to scroll after render completes
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            flashListRef.current?.scrollToIndex({
              index: headerIndex,
              animated: false,
              viewPosition: 0.5, // Center the post in viewport
            });
          }, UI_CONFIG.SCROLL_RECOVERY_DELAY);
        });
      }
    }
  }, [isGridView, feedItems]);

  // Preserve scroll position when posts are trimmed from the top (dropping newest while loading older)
  useEffect(() => {
    const prevPosts = prevPostsRef.current;
    if (prevPosts.length === 0) {
      prevPostsRef.current = posts;
      return;
    }

    // Detect when the first post changes while length stays capped (indicates trimming from the start)
    const firstChanged =
      prevPosts[0]?.id && posts[0]?.id && prevPosts[0].id !== posts[0].id;
    const lengthStable = posts.length === prevPosts.length;

    if (firstChanged && lengthStable && !isGridView && flashListRef.current) {
      const currentIds = new Set(posts.map((p) => p.id));
      const removedIds = prevPosts
        .filter((p) => !currentIds.has(p.id))
        .map((p) => p.id);

      if (removedIds.length > 0) {
        // Calculate removed height from item layouts (header + content)
        const removedItemIds = new Set<string>();
        removedIds.forEach((postId) => {
          removedItemIds.add(`${postId}-header`);
          removedItemIds.add(`${postId}-content`);
        });

        let removedHeight = 0;
        removedItemIds.forEach((itemId) => {
          const layout = itemLayoutsRef.current.get(itemId);
          if (layout) {
            removedHeight += layout.height;
          }
        });

        if (removedHeight > 0) {
          const { y } = lastScrollMetricsRef.current;
          flashListRef.current.scrollToOffset({
            offset: Math.max(0, y - removedHeight),
            animated: false,
          });
        }
      }
    }

    prevPostsRef.current = posts;
  }, [posts, isGridView]);

  // Remove stale layout entries when posts change
  useEffect(() => {
    const validIds = new Set(displayPosts.map((p) => p.id));
    const validItemIds = new Set(
      displayPosts.flatMap((p) => [`${p.id}-header`, `${p.id}-content`])
    );

    // Clean up post layouts
    postLayoutsRef.current.forEach((_, id) => {
      if (!validIds.has(id)) {
        postLayoutsRef.current.delete(id);
      }
    });

    // Clean up item layouts (headers and content)
    itemLayoutsRef.current.forEach((_, id) => {
      if (!validItemIds.has(id)) {
        itemLayoutsRef.current.delete(id);
      }
    });
  }, [displayPosts]);

  // Update visibility tracking based on scroll position (for lazy loading)
  // Throttled to prevent excessive updates
  const updateVisiblePosts = useCallback(
    (scrollY: number, viewportHeight: number) => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastVisibilityUpdateRef.current;

      lastScrollMetricsRef.current = { y: scrollY, viewportHeight };

      const visiblePostIds = computeVisibleIds(
        postLayoutsRef.current,
        scrollY,
        viewportHeight,
        UI_CONFIG.VISIBILITY_BUFFER_RATIO,
      );

      // Track first visible post for view transitions
      for (const post of displayPosts) {
        if (visiblePostIds.has(post.id)) {
          firstVisiblePostIdRef.current = post.id;
          break;
        }
      }

      // Always update ref immediately (no render triggered)
      visibleSectionsRef.current = visiblePostIds;

      // Update state periodically (triggers re-render for video autoplay)
      // Throttle to VISIBILITY_UPDATE_INTERVAL to prevent render thrashing
      if (timeSinceLastUpdate >= UI_CONFIG.VISIBILITY_UPDATE_INTERVAL) {
        lastVisibilityUpdateRef.current = now;
        setVisibleSections(new Set(visiblePostIds));
      }
    },
    [displayPosts],
  );

  // Handle post deletion
  const handlePostDelete = useCallback(
    (postId: string) => {
      console.log("[FeedScreen] Removing deleted post:", postId);
      removePost(postId);
    },
    [removePost],
  );

  // Keep feed state in sync with interactive updates (favorite/bookmark/boost)
  const handlePostUpdate = useCallback(
    (updatedPost: Post) => {
      if (!updatedPost?.id) return;

      // Update the wrapper post (or matching boosted wrapper)
      updatePost(updatedPost.id, () => updatedPost);

      // If this was a boosted post, also update any entries keyed by the boosted status
      if (updatedPost.reblog?.id) {
        const boostedId = updatedPost.reblog.id;
        updatePost(boostedId, (post) => ({
          ...post,
          ...updatedPost,
        }));
      }
    },
    [updatePost],
  );

  // Track layout per post for accurate visibility
  const handlePostLayout = useCallback(
    (postId: string, layout: { y: number; height: number }) => {
      postLayoutsRef.current.set(postId, {
        y: layout.y,
        height: layout.height,
      });

      // Update running average height for fallback scroll positioning
      const heights = Array.from(postLayoutsRef.current.values()).map(
        (l) => l.height,
      );
      if (heights.length > 0) {
        averagePostHeightRef.current =
          heights.reduce((sum, h) => sum + h, 0) / heights.length;
      }

      const { y, viewportHeight } = lastScrollMetricsRef.current;
      if (viewportHeight > 0) {
        updateVisiblePosts(y, viewportHeight);
      }
    },
    [updateVisiblePosts],
  );

  // Track layout per item (header/content) for sticky header positioning
  const handleItemLayout = useCallback(
    (itemId: string, postId: string, layout: { y: number; height: number }) => {
      itemLayoutsRef.current.set(itemId, {
        y: layout.y,
        height: layout.height,
      });

      // Aggregate header + content for total post height
      const headerLayout = itemLayoutsRef.current.get(`${postId}-header`);
      const contentLayout = itemLayoutsRef.current.get(`${postId}-content`);

      if (headerLayout && contentLayout) {
        postLayoutsRef.current.set(postId, {
          y: headerLayout.y,
          height: headerLayout.height + contentLayout.height,
        });

        // Update average for estimatedItemSize
        const heights = Array.from(postLayoutsRef.current.values()).map(
          (l) => l.height,
        );
        if (heights.length > 0) {
          averagePostHeightRef.current =
            heights.reduce((sum, h) => sum + h, 0) / heights.length;
        }
      }

      const { y, viewportHeight } = lastScrollMetricsRef.current;
      if (viewportHeight > 0) {
        updateVisiblePosts(y, viewportHeight);
      }
    },
    [updateVisiblePosts],
  );

  const handleShowPendingPosts = useCallback(() => {
    if (pendingNewCount === 0) return;
    applyPendingNewPosts();

    if (isGridView) {
      setGridScrollSignal(Date.now());
    } else {
      // Scroll to top after showing pending posts
      flashListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [pendingNewCount, applyPendingNewPosts, isGridView]);

  // Render a single post (header + content)
  // Simplified for ScrollView - no sections needed
  const renderPost = useCallback(
    (post: Post, index: number) => {
      if (!post || !post.id) return null;

      // Use state for visibility to enable re-renders when visibility changes
      // This ensures videos autoplay and media loads when posts scroll into view
      const isVisible = visibleSections.has(post.id);

      return (
        <View
          key={post.id}
          onLayout={(event: LayoutChangeEvent) =>
            handlePostLayout(post.id, event.nativeEvent.layout)
          }
        >
          <PostSectionHeader
            post={post}
            onDelete={handlePostDelete}
            onUpdate={handlePostUpdate}
          />
          <PostSectionContent
            post={post}
            isVisible={isVisible}
            onDelete={handlePostDelete}
            onUpdate={handlePostUpdate}
          />
        </View>
      );
    },
    [handlePostDelete, handlePostLayout, handlePostUpdate, visibleSections],
  );

  // FlashList render item wrapper - handles header and content items separately
  const renderFlashListItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      const { post } = item;

      if (item.type === "header") {
        return (
          <View
            key={item.id}
            onLayout={(event: LayoutChangeEvent) =>
              handleItemLayout(item.id, post.id, event.nativeEvent.layout)
            }
          >
            <PostSectionHeader
              post={post}
              onDelete={handlePostDelete}
              onUpdate={handlePostUpdate}
            />
          </View>
        );
      }

      // type === "content"
      const isVisible = visibleSections.has(post.id);
      return (
        <View
          key={item.id}
          onLayout={(event: LayoutChangeEvent) =>
            handleItemLayout(item.id, post.id, event.nativeEvent.layout)
          }
        >
          <PostSectionContent
            post={post}
            isVisible={isVisible}
            onDelete={handlePostDelete}
            onUpdate={handlePostUpdate}
          />
        </View>
      );
    },
    [handlePostDelete, handleItemLayout, handlePostUpdate, visibleSections],
  );

  // Render footer (loading more indicator) - memoized
  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;

    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Loading more posts...
        </Text>
      </View>
    );
  }, [isLoadingMore, colors.primary, colors.textSecondary]);

  // Render empty state - memoized
  const renderEmpty = useCallback(() => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyIcon, { color: colors.textSecondary }]}>
          📭
        </Text>
        <Text style={[styles.emptyText, { color: colors.text }]}>
          No posts yet
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
          {feedType === "home"
            ? "Follow some accounts to see their posts here"
            : feedType === "favourites"
              ? "Posts you favourite will appear here"
              : feedType === "bookmarks"
                ? "Posts you bookmark will appear here"
                : "Check back later for new posts"}
        </Text>
      </View>
    );
  }, [isLoading, feedType, colors.text, colors.textSecondary]);

  // Handle scroll event for end detection and visibility tracking
  const handleScroll = useCallback(
    (event: any) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const scrollY = contentOffset.y;
      const viewportHeight = layoutMeasurement.height;
      const contentHeight = contentSize.height;

      // Update visibility tracking for lazy loading (throttled internally)
      updateVisiblePosts(scrollY, viewportHeight);

      // Check if near bottom (similar to grid view)
      const paddingToBottom = 200; // Trigger pagination when 200px from bottom
      const isNearBottom =
        viewportHeight + scrollY >= contentHeight - paddingToBottom;

      if (isNearBottom && !isLoadingMore && hasMore) {
        const now = Date.now();
        const timeSinceLastCall = now - lastEndReachedRef.current;

        // Debounce to prevent rapid-fire calls
        if (timeSinceLastCall >= UI_CONFIG.SCROLL_DEBOUNCE_DELAY) {
          lastEndReachedRef.current = now;
          loadMore();
        }
      }
    },
    [isLoadingMore, hasMore, loadMore, updateVisiblePosts],
  );

  // Handle end reached - kept for compatibility but now handled in handleScroll
  const handleEndReached = useCallback(() => {
    const now = Date.now();
    const timeSinceLastCall = now - lastEndReachedRef.current;

    // Debounce to prevent rapid-fire calls
    if (timeSinceLastCall < UI_CONFIG.SCROLL_DEBOUNCE_DELAY) {
      return;
    }

    // useFeed.loadMore already has guards for isLoadingMore, hasMore, etc.
    lastEndReachedRef.current = now;
    loadMore();
  }, [loadMore]);

  // Handle view toggle (list <-> grid)
  const handleViewToggle = useCallback(() => {
    if (!isGridView) {
      // Switching from list to grid: save the first visible post
      const visiblePostId =
        firstVisiblePostIdRef.current ||
        (displayPosts.length > 0 ? displayPosts[0].id : null);
      if (visiblePostId) {
        currentPostIdRef.current = visiblePostId;
      }
    } else {
      // Switching from grid to list: clear currentPostIdRef to allow fresh scroll in list view
      currentPostIdRef.current = null;
    }

    // Toggle view
    setIsGridView(!isGridView);
  }, [isGridView, displayPosts]);

  // Handle reload
  const handleReload = useCallback(async () => {
    if (!isRefreshing && !isLoading) {
      await reload();
      // Scroll to top after reload in list view
      if (!isGridView && displayPosts.length > 0) {
        setTimeout(() => {
          flashListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, UI_CONFIG.SCROLL_RECOVERY_DELAY);
      }
    }
  }, [isRefreshing, isLoading, reload, isGridView, displayPosts]);

  // Handle media press in grid view
  const handleMediaPress = useCallback(
    async (postId: string, mediaIndex: number) => {
      // Switch to list view
      setIsGridView(false);

      // Save the target post ID for scroll restoration
      currentPostIdRef.current = postId;

      // Check if post exists in current feed
      const postExists = posts.some(
        (p) => p.id === postId || p.reblog?.id === postId,
      );

      // If post doesn't exist, fetch it with surrounding context
      if (!postExists && !isJumpingRef.current) {
        isJumpingRef.current = true;
        setIsTransitioning(true);
        try {
          await jumpToPost(postId);
        } catch (error) {
          console.error("[FeedScreen] jumpToPost failed", error);
        } finally {
          isJumpingRef.current = false;
          setIsTransitioning(false);
        }
      }
    },
    [posts, jumpToPost],
  );

  // Handle toggle favorite for grid view double-click
  const handleToggleFavorite = useCallback(
    async (postId: string) => {
      const timelinePost = posts.find(
        (p) => p.id === postId || p.reblog?.id === postId,
      );
      if (!timelinePost) return;

      const displayPost =
        timelinePost.reblog && timelinePost.reblog.id === postId
          ? timelinePost.reblog
          : timelinePost;
      const previousState = displayPost.favourited ?? false;
      const previousCount = displayPost.favouritesCount ?? 0;

      // Optimistic UI update so the grid heart toggles immediately
      updatePost(postId, (post) =>
        applyFavouriteStateToPost(
          post,
          postId,
          !previousState,
          previousState ? Math.max(0, previousCount - 1) : previousCount + 1,
        ),
      );

      try {
        const activeClient = await getActiveClient();
        if (!activeClient) {
          // Roll back if we cannot reach the server
          updatePost(postId, (post) =>
            applyFavouriteStateToPost(
              post,
              postId,
              previousState,
              previousCount,
            ),
          );
          Alert.alert("Error", "Could not connect to Mastodon");
          return;
        }

        const { client } = activeClient;
        const updatedStatus = previousState
          ? await client.v1.statuses.$select(postId).unfavourite()
          : await client.v1.statuses.$select(postId).favourite();

        const serverPost = transformStatus(updatedStatus);
        const serverFavourited =
          serverPost.favourited ??
          serverPost.reblog?.favourited ??
          !previousState;
        const serverCount =
          serverPost.favouritesCount ??
          serverPost.reblog?.favouritesCount ??
          previousCount;

        updatePost(postId, (post) =>
          applyFavouriteStateToPost(
            post,
            postId,
            serverFavourited,
            serverCount,
          ),
        );
      } catch (error) {
        console.error("Error toggling favorite:", error);
        // Roll back on error
        updatePost(postId, (post) =>
          applyFavouriteStateToPost(
            post,
            postId,
            previousState,
            previousCount,
          ),
        );
        Alert.alert("Error", "Failed to update favorite. Please try again.");
      }
    },
    [posts, updatePost],
  );

  // Render error state - only if no cached posts available
  if (error && !isLoading && posts.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Text
            style={[
              styles.errorIcon,
              { color: colors.error || colors.textSecondary },
            ]}
          >
            ⚠️
          </Text>
          <Text style={[styles.errorText, { color: colors.text }]}>
            Failed to load feed
          </Text>
          <Text style={[styles.errorSubtext, { color: colors.textSecondary }]}>
            {error}
          </Text>
        </View>
      </View>
    );
  }

  // Render loading state with skeletons
  if (isLoading && posts.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Show notification banner if there's an error but we have cached posts */}
      {error && posts.length > 0 && (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: colors.error || "#FF3B30" },
          ]}
        >
          <Text style={styles.errorBannerText}>
            {error.includes("Too many requests") || error.includes("429")
              ? "⏱️ Rate limited - showing cached posts"
              : "⚠️ Network error - showing cached posts"}
          </Text>
        </View>
      )}

      {pendingNewCount > 0 && (
        <TouchableOpacity
          style={[
            styles.newPostsBanner,
            { backgroundColor: colors.primary + "E0" },
          ]}
          activeOpacity={0.85}
          onPress={handleShowPendingPosts}
        >
          <Text style={styles.newPostsText}>
            {pendingNewCount === 1
              ? "Show 1 new post"
              : `Show ${pendingNewCount} new posts`}
          </Text>
        </TouchableOpacity>
      )}

      {isGridView ? (
        <FeedGridView
          posts={displayPosts}
          onMediaPress={handleMediaPress}
          onToggleFavorite={handleToggleFavorite}
          onEndReached={handleEndReached}
          hasMore={hasMore}
          onRefresh={refresh}
          isRefreshing={isRefreshing}
          isLoadingMore={isLoadingMore}
          scrollToPostId={currentPostIdRef.current}
          onViewableItemsChanged={feedHandleViewableItemsChanged}
          scrollToTopSignal={gridScrollSignal}
        />
      ) : !isTransitioning ? (
        <FlashList<FeedItem>
          key={`feed-list-${feedType}-${feedId || 'default'}`}
          ref={flashListRef}
          data={feedItems}
          renderItem={renderFlashListItem}
          keyExtractor={(item) => item.id}
          // Sticky headers - makes post headers stick to top while scrolling
          stickyHeaderIndices={stickyIndices}
          // Scroll behavior
          onScroll={handleScroll}
          scrollEventThrottle={16}
          // Refresh
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          // Footer and empty state
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          // Performance
          drawDistance={500}
        />
      ) : null}

      {/* Floating action buttons */}
      <FloatingButtons
        onGridToggle={handleViewToggle}
        onReload={handleReload}
        isGridView={isGridView}
        isLoading={isRefreshing || isLoading}
      />

      {/* Transition loading overlay when switching from grid to list view */}
      {isTransitioning && (
        <View style={styles.transitionOverlay}>
          <View
            style={[styles.transitionLoader, { backgroundColor: colors.card }]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.transitionText, { color: colors.text }]}>
              Loading post...
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// Default export uses route params
export default function FeedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FeedScreenBase routeId={id || "public"} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  errorSubtext: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  footerLoader: {
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  footerText: {
    fontSize: 13,
  },
  errorBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBannerText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  newPostsBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  newPostsText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  transitionOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  transitionLoader: {
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  transitionText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
