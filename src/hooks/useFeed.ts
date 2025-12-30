import { useReducer, useCallback, useEffect, useRef } from "react";
import type { Post, TimelineOptions, FeedState, ViewportPosition } from "@types";
import type { mastodon } from "masto";
import { getActiveClient, withRetry, RequestPriority } from "@lib/api/client";
import { transformStatus } from "@lib/api/timeline";
import { storageService } from "@lib/storage";
import { CACHE_EXPIRATION } from "@lib/storage/constants";
import { FEED_CONFIG, UI_CONFIG } from "@/config";
import { useAuth } from "@contexts/AuthContext";
import {
  getDirectionalTimelinePaginator,
  type TimelinePaginator,
} from "@lib/api/mastodonRequests";

type TrimDirection = "dropFromEnd" | "dropFromStart";


/**
 * Smart trimming that maintains buffer around viewport
 * Only trims posts far from viewport, in chunks
 */
const trimPostsToLimit = (
  posts: Post[],
  direction: TrimDirection = "dropFromEnd",
  viewportPosition?: ViewportPosition,
): Post[] => {
  const bufferSize = UI_CONFIG.POST_BUFFER_SIZE;
  const trimThreshold = UI_CONFIG.TRIM_THRESHOLD;
  const chunkSize = UI_CONFIG.TRIM_CHUNK_SIZE;
  const viewportBuffer = UI_CONFIG.VIEWPORT_BUFFER_POSTS;

  // If below threshold, no trimming needed
  if (posts.length <= trimThreshold) {
    return posts;
  }

  // If viewport position is provided, use smart trimming
  if (viewportPosition) {
    const { firstVisibleIndex, lastVisibleIndex } = viewportPosition;
    const visibleRange = lastVisibleIndex - firstVisibleIndex;
    const bufferStart = Math.max(0, firstVisibleIndex - viewportBuffer);
    const bufferEnd = Math.min(posts.length, lastVisibleIndex + viewportBuffer);

    // Calculate how many posts to trim
    const overflow = posts.length - bufferSize;
    if (overflow <= 0) {
      return posts;
    }

    // Determine which end to trim from based on viewport position
    const distanceFromStart = firstVisibleIndex;
    const distanceFromEnd = posts.length - lastVisibleIndex;

    let trimmed: Post[];

    if (distanceFromStart < distanceFromEnd) {
      // Viewport is closer to start, trim from end
      // But only trim posts beyond the buffer
      const trimFromEnd = Math.min(
        overflow,
        Math.max(0, posts.length - bufferEnd),
        chunkSize,
      );
      trimmed = posts.slice(0, posts.length - trimFromEnd);
    } else {
      // Viewport is closer to end, trim from start
      // But only trim posts before the buffer
      const trimFromStart = Math.min(
        overflow,
        Math.max(0, bufferStart),
        chunkSize,
      );
      trimmed = posts.slice(trimFromStart);
    }

    // If still over threshold, trim more (but respect buffer)
    if (trimmed.length > trimThreshold) {
      const remainingOverflow = trimmed.length - bufferSize;
      if (remainingOverflow > 0) {
        const additionalTrim = Math.min(remainingOverflow, chunkSize);
        if (distanceFromStart < distanceFromEnd) {
          trimmed = trimmed.slice(0, trimmed.length - additionalTrim);
        } else {
          trimmed = trimmed.slice(additionalTrim);
        }
      }
    }

    return trimmed;
  }

  // Fallback to simple trimming if no viewport info
  const max = bufferSize;
  if (posts.length <= max) return posts;

  const overflow = posts.length - max;
  const trimAmount = Math.min(overflow, chunkSize);

  if (direction === "dropFromStart") {
    // Drop from the newest side when we appended older posts
    return posts.slice(trimAmount);
  }

  // Default: drop from the oldest side when we prepended newer posts
  return posts.slice(0, posts.length - trimAmount);
};

/**
 * Custom hook for managing feed state
 * Phase 3: Feed System
 */

interface UseFeedOptions {
  feedType:
    | "home"
    | "local"
    | "public"
    | "favourites"
    | "bookmarks"
    | "list"
    | "hashtag"
    | "account";
  feedId?: string; // For list, hashtag, or account feeds
  limit?: number;
  cacheKey?: string;
  enableCache?: boolean;
}

// Action types for reducer
type FeedAction =
  | { type: "LOAD_START" }
  | {
      type: "LOAD_SUCCESS";
      posts: Post[];
      hasMore: boolean;
      trimDirection?: TrimDirection;
      anchorPostId?: string | null;
    }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "REFRESH_START" }
  | {
      type: "REFRESH_SUCCESS";
      posts: Post[];
      hasMore: boolean;
      trimDirection?: TrimDirection;
    }
  | { type: "REFRESH_ERROR"; error: string }
  | { type: "LOAD_MORE_START" }
  | {
      type: "LOAD_MORE_SUCCESS";
      posts: Post[];
      hasMore: boolean;
      trimDirection?: TrimDirection;
    }
  | { type: "LOAD_MORE_ERROR"; error: string }
  | { type: "LOAD_NEWER_START" }
  | { type: "QUEUE_NEWER_POSTS"; newPosts: Post[] }
  | { type: "LOAD_NEWER_ERROR"; error: string }
  | { type: "APPLY_PENDING_NEW_POSTS" }
  | { type: "REMOVE_POST"; postId: string }
  | { type: "SET_POSTS"; posts: Post[]; pendingNewPosts?: Post[] }
  | { type: "LOAD_FROM_ANCHOR_START" }
  | {
      type: "LOAD_FROM_ANCHOR_SUCCESS";
      posts: Post[];
      hasMore: boolean;
      anchorPostId: string;
    }
  | { type: "LOAD_FROM_ANCHOR_ERROR"; error: string }
  | { type: "UPDATE_VIEWPORT_POSITION"; viewportPosition: ViewportPosition }
  | { type: "RESET" };

// Reducer for managing feed state
function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, isLoading: true, error: null };
    case "LOAD_SUCCESS":
      return {
        ...state,
        posts: trimPostsToLimit(
          action.posts,
          action.trimDirection ?? "dropFromEnd",
          state.viewportPosition,
        ),
        pendingNewPosts: [],
        isLoading: false,
        hasMore: action.hasMore,
        lastFetchedAt: Date.now(),
        error: null,
        anchorPostId: action.anchorPostId !== undefined ? action.anchorPostId : state.anchorPostId,
      };
    case "LOAD_ERROR":
      return { ...state, isLoading: false, error: action.error };
    case "REFRESH_START":
      return { ...state, isRefreshing: true, error: null };
    case "REFRESH_SUCCESS":
      return {
        ...state,
        posts: trimPostsToLimit(
          action.posts,
          action.trimDirection ?? "dropFromEnd",
          state.viewportPosition,
        ),
        pendingNewPosts: [],
        isRefreshing: false,
        hasMore: action.hasMore,
        lastFetchedAt: Date.now(),
        error: null,
        anchorPostId: null,
      };
    case "REFRESH_ERROR":
      return { ...state, isRefreshing: false, error: action.error };
    case "LOAD_MORE_START":
      return { ...state, isLoadingMore: true, error: null };
    case "LOAD_MORE_SUCCESS":
      return {
        ...state,
        posts: trimPostsToLimit(
          action.posts,
          action.trimDirection ?? "dropFromEnd",
          state.viewportPosition,
        ),
        pendingNewPosts: state.pendingNewPosts,
        isLoadingMore: false,
        hasMore: action.hasMore,
        error: null,
      };
    case "LOAD_MORE_ERROR":
      return { ...state, isLoadingMore: false, error: action.error };
    case "LOAD_NEWER_START":
      return { ...state, isLoadingMore: true, error: null };
    case "QUEUE_NEWER_POSTS":
      if (action.newPosts.length === 0) {
        return { ...state, isLoadingMore: false };
      }
      return {
        ...state,
        pendingNewPosts: [...action.newPosts, ...state.pendingNewPosts],
        isLoadingMore: false,
        error: null,
      };
    case "LOAD_NEWER_ERROR":
      // Don't update state if error is null (means no new posts, not an actual error)
      if (action.error === null) {
        return { ...state, isLoadingMore: false };
      }
      return { ...state, isLoadingMore: false, error: action.error };
    case "APPLY_PENDING_NEW_POSTS":
      if (state.pendingNewPosts.length === 0) {
        return state;
      }
      return {
        ...state,
        posts: trimPostsToLimit(
          [...state.pendingNewPosts, ...state.posts],
          "dropFromEnd",
          state.viewportPosition,
        ),
        pendingNewPosts: [],
      };
    case "REMOVE_POST":
      return {
        ...state,
        posts: state.posts.filter((post) => post.id !== action.postId),
      };
    case "SET_POSTS":
      return {
        ...state,
        posts: trimPostsToLimit(action.posts, "dropFromEnd", state.viewportPosition),
        pendingNewPosts: action.pendingNewPosts ?? state.pendingNewPosts,
      };
    case "LOAD_FROM_ANCHOR_START":
      return { ...state, isLoading: true, error: null };
    case "LOAD_FROM_ANCHOR_SUCCESS":
      return {
        ...state,
        posts: trimPostsToLimit(action.posts, "dropFromEnd", state.viewportPosition),
        pendingNewPosts: [],
        isLoading: false,
        hasMore: action.hasMore,
        lastFetchedAt: Date.now(),
        error: null,
        anchorPostId: action.anchorPostId,
      };
    case "LOAD_FROM_ANCHOR_ERROR":
      return { ...state, isLoading: false, error: action.error };
    case "UPDATE_VIEWPORT_POSITION":
      // Update viewport position and re-trim posts if needed
      const updatedState = {
        ...state,
        viewportPosition: action.viewportPosition,
      };
      // Re-trim with new viewport info if posts exceed threshold
      if (state.posts.length > UI_CONFIG.TRIM_THRESHOLD) {
        return {
          ...updatedState,
          posts: trimPostsToLimit(
            state.posts,
            "dropFromEnd",
            action.viewportPosition,
          ),
        };
      }
      return updatedState;
    case "RESET":
      return {
        posts: [],
        pendingNewPosts: [],
        isLoading: true,
        isRefreshing: false,
        isLoadingMore: false,
        hasMore: true,
        error: null,
        lastFetchedAt: null,
        anchorPostId: null,
        viewportPosition: undefined,
      };
    default:
      return state;
  }
}

export function useFeed(options: UseFeedOptions) {
  const {
    feedType,
    feedId,
    limit = FEED_CONFIG.DEFAULT_PAGE_SIZE,
    cacheKey,
    enableCache = true,
  } = options;
  const { instance } = useAuth();

  const [state, dispatch] = useReducer(feedReducer, {
    posts: [],
    pendingNewPosts: [],
    isLoading: true,
    isRefreshing: false,
    isLoadingMore: false,
    hasMore: true,
    error: null,
    lastFetchedAt: null,
    anchorPostId: null,
  });

  // Iterator refs for bidirectional pagination
  const olderPaginatorRef = useRef<TimelinePaginator | null>(null);
  const newerPaginatorRef = useRef<TimelinePaginator | null>(null);

  // Track proactive loading state to prevent too frequent updates
  const lastProactiveLoadRef = useRef<{ newer: number; older: number }>({
    newer: 0,
    older: 0,
  });
  const PROACTIVE_LOAD_THROTTLE_MS = 2000; // Minimum 2 seconds between proactive loads
  
  // Track when jumpToPost was called to prevent proactive loading immediately after
  const lastJumpToPostRef = useRef<number>(0);
  const PROACTIVE_LOAD_DELAY_AFTER_JUMP_MS = 1000; // Wait 1 second after jumpToPost before allowing proactive loads

  /**
   * Reset pagination iterators
   * Called when feed changes or when refreshing
   */
  const resetIterators = () => {
    console.log("[useFeed] Resetting pagination iterators");
    olderPaginatorRef.current = null;
    newerPaginatorRef.current = null;
  };

  /**
   * Fetch posts from API
   */
  const fetchPosts = useCallback(
    async (opts?: TimelineOptions): Promise<Post[]> => {
      const activeClient = await getActiveClient();
      if (!activeClient) {
        throw new Error("No active client");
      }

      const { client } = activeClient;
      let statuses: mastodon.v1.Status[];

      // Fetch based on feed type, using request queue to prevent rate limiting
      switch (feedType) {
        case "home": {
          const paginator = client.v1.timelines.home.list({
            limit: opts?.limit || limit,
            maxId: opts?.maxId,
            minId: opts?.minId,
            sinceId: opts?.sinceId,
          });
          const result = await withRetry<mastodon.v1.Status[]>(async () => {
            const iterator = paginator[Symbol.asyncIterator]();
            const page = await iterator.next();
            return page.value || [];
          }, RequestPriority.NORMAL);
          statuses = result;
          break;
        }

        case "public": {
          const paginator = client.v1.timelines.public.list({
            limit: opts?.limit || limit,
            maxId: opts?.maxId,
            minId: opts?.minId,
            sinceId: opts?.sinceId,
          });
          const result = await withRetry<mastodon.v1.Status[]>(async () => {
            const iterator = paginator[Symbol.asyncIterator]();
            const page = await iterator.next();
            return page.value || [];
          }, RequestPriority.NORMAL);
          statuses = result;
          break;
        }

        case "local": {
          const paginator = client.v1.timelines.public.list({
            local: true,
            limit: opts?.limit || limit,
            maxId: opts?.maxId,
            minId: opts?.minId,
            sinceId: opts?.sinceId,
          });
          const result = await withRetry<mastodon.v1.Status[]>(async () => {
            const iterator = paginator[Symbol.asyncIterator]();
            const page = await iterator.next();
            return page.value || [];
          }, RequestPriority.NORMAL);
          statuses = result;
          break;
        }

        case "favourites": {
          const paginator = client.v1.favourites.list({
            limit: opts?.limit || limit,
            maxId: opts?.maxId,
            minId: opts?.minId,
          });
          const result = await withRetry<mastodon.v1.Status[]>(async () => {
            const iterator = paginator[Symbol.asyncIterator]();
            const page = await iterator.next();
            return page.value || [];
          }, RequestPriority.NORMAL);
          statuses = result;
          break;
        }

        case "bookmarks": {
          const paginator = client.v1.bookmarks.list({
            limit: opts?.limit || limit,
            maxId: opts?.maxId,
            minId: opts?.minId,
          });
          const result = await withRetry<mastodon.v1.Status[]>(async () => {
            const iterator = paginator[Symbol.asyncIterator]();
            const page = await iterator.next();
            return page.value || [];
          }, RequestPriority.NORMAL);
          statuses = result;
          break;
        }

        case "list":
          if (!feedId) throw new Error("List ID is required for list feeds");
          {
            const paginator = client.v1.timelines.list.$select(feedId).list({
              limit: opts?.limit || limit,
              maxId: opts?.maxId,
              minId: opts?.minId,
              sinceId: opts?.sinceId,
            });
            const result = await withRetry<mastodon.v1.Status[]>(async () => {
              const iterator = paginator[Symbol.asyncIterator]();
              const page = await iterator.next();
              return page.value || [];
            }, RequestPriority.NORMAL);
            statuses = result;
          }
          break;

        case "hashtag":
          if (!feedId) throw new Error("Hashtag is required for hashtag feeds");
          {
            const paginator = client.v1.timelines.tag.$select(feedId).list({
              limit: opts?.limit || limit,
              maxId: opts?.maxId,
              minId: opts?.minId,
              sinceId: opts?.sinceId,
            });
            const result = await withRetry<mastodon.v1.Status[]>(async () => {
              const iterator = paginator[Symbol.asyncIterator]();
              const page = await iterator.next();
              return page.value || [];
            }, RequestPriority.NORMAL);
            statuses = result;
          }
          break;

        case "account":
          if (!feedId)
            throw new Error("Account ID is required for account feeds");
          {
            const paginator = client.v1.accounts.$select(feedId).statuses.list({
              limit: opts?.limit || limit,
              maxId: opts?.maxId,
              minId: opts?.minId,
              sinceId: opts?.sinceId,
            });
            const result = await withRetry<mastodon.v1.Status[]>(async () => {
              const iterator = paginator[Symbol.asyncIterator]();
              const page = await iterator.next();
              return page.value || [];
            }, RequestPriority.NORMAL);
            statuses = result;
          }
          break;

        default:
          throw new Error(`Unknown feed type: ${feedType}`);
      }

      // Transform statuses to our Post type
      return statuses.map(transformStatus);
    },
    [feedType, feedId, limit],
  );

  // Stable refs for functions that don't need to be recreated
  const feedConfigRef = useRef({
    feedType,
    feedId,
    limit,
    cacheKey,
    enableCache,
  });
  feedConfigRef.current = { feedType, feedId, limit, cacheKey, enableCache };

  /**
   * Initial load - try cache first, then fetch
   * This function is NOT in useEffect dependencies to avoid infinite loops
   */
  const loadFeed = useCallback(async () => {
    if (!instance) {
      console.log("[useFeed] load SKIPPED: no instance");
      return;
    }

    try {
      console.log("[useFeed] load START");
      dispatch({ type: "LOAD_START" });

      const config = feedConfigRef.current;

      // Try loading from cache first
      if (config.enableCache && config.cacheKey) {
        try {
          const cached = await storageService.getCachedPosts(config.cacheKey);
          if (cached && cached.length > 0) {
            const isValid = await storageService.isCacheValid(
              config.cacheKey,
              CACHE_EXPIRATION.FEED,
            );
            if (isValid) {
              console.log(`[useFeed] load CACHED: ${cached.length} posts`);
              dispatch({
                type: "LOAD_SUCCESS",
                posts: trimPostsToLimit(cached, "dropFromEnd", state.viewportPosition),
                hasMore: true,
                anchorPostId: null,
              });

              // Fetch fresh data in background
              fetchPosts()
                .then((posts) => {
                  const boundedPosts = trimPostsToLimit(posts, "dropFromEnd", state.viewportPosition);
                  const freshHasMore = posts.length > 0;
                  console.log(
                    `[useFeed] load BACKGROUND: ${posts.length} posts`,
                  );
                  dispatch({
                    type: "LOAD_SUCCESS",
                    posts: boundedPosts,
                    hasMore: freshHasMore,
                    anchorPostId: null,
                  });
                  if (config.enableCache && config.cacheKey) {
                    storageService
                      .saveCachedPosts(config.cacheKey, boundedPosts)
                      .catch((err) =>
                        console.error("[useFeed] Cache save error:", err),
                      );
                  }
                })
                .catch((error) => {
                  console.error("[useFeed] Background fetch error:", error);
                });

              return;
            }
          }
        } catch (error) {
          console.error("Error loading from cache:", error);
        }
      }

      // No cache, fetch from API
      console.log("[useFeed] load NO CACHE, fetching from API");
      const posts = await fetchPosts();
      const boundedPosts = trimPostsToLimit(posts, "dropFromEnd", state.viewportPosition);
      const hasMore = posts.length > 0;

      console.log(
        `[useFeed] load API: ${posts.length} posts, hasMore=${hasMore}`,
      );
      dispatch({ type: "LOAD_SUCCESS", posts: boundedPosts, hasMore, anchorPostId: null });

      // Save to cache
      if (config.enableCache && config.cacheKey) {
        await storageService
          .saveCachedPosts(config.cacheKey, boundedPosts)
          .catch((err) => console.error("[useFeed] Cache save error:", err));
      }
    } catch (error) {
      console.error("[useFeed] Error loading feed:", error);
      dispatch({
        type: "LOAD_ERROR",
        error: error instanceof Error ? error.message : "Failed to load feed",
      });
    }
  }, [instance, fetchPosts]); // Only depend on instance and fetchPosts

  /**
   * Refresh - pull to refresh
   * Resets iterators and fetches fresh posts from the top
   */
  const refresh = useCallback(async () => {
    try {
      console.log("[useFeed] refresh START");
      dispatch({ type: "REFRESH_START" });

      // Reset iterators to start fresh
      resetIterators();

      const posts = await fetchPosts();
      const boundedPosts = trimPostsToLimit(posts, "dropFromEnd", state.viewportPosition);
      const hasMore = posts.length > 0;

      console.log(
        `[useFeed] refresh COMPLETE: ${posts.length} posts, hasMore=${hasMore}`,
      );
      dispatch({ type: "REFRESH_SUCCESS", posts: boundedPosts, hasMore });

      // Save to cache
      const config = feedConfigRef.current;
      if (config.enableCache && config.cacheKey) {
        await storageService
          .saveCachedPosts(config.cacheKey, boundedPosts)
          .catch((err) => console.error("[useFeed] Cache save error:", err));
      }
    } catch (error) {
      console.error("[useFeed] Error refreshing feed:", error);
      dispatch({
        type: "REFRESH_ERROR",
        error:
          error instanceof Error ? error.message : "Failed to refresh feed",
      });
    }
  }, [fetchPosts, resetIterators]);

  /**
   * Load more - pagination (older posts)
   * Uses iterator-based approach for reliable pagination
   */
  const loadMore = useCallback(async () => {
    console.log(
      `[useFeed] loadMore CALLED: hasMore=${state.hasMore}, isLoadingMore=${state.isLoadingMore}, postsCount=${state.posts.length}`,
    );

    // Guard checks with detailed logging
    if (state.posts.length === 0) {
      console.log("[useFeed] loadMore BLOCKED: No posts yet");
      return;
    }

    if (!state.hasMore) {
      console.log(
        "[useFeed] loadMore BLOCKED: hasMore=false (no more posts available)",
      );
      return;
    }

    if (state.isLoadingMore) {
      console.log("[useFeed] loadMore BLOCKED: Already loading");
      return;
    }

    try {
      dispatch({ type: "LOAD_MORE_START" });

      const config = feedConfigRef.current;

      // Initialize the older posts iterator if it doesn't exist
      if (!olderPaginatorRef.current) {
        const activeClient = await getActiveClient();
        if (!activeClient) {
          throw new Error("No active client");
        }

        const { client } = activeClient;
        const oldestPost = state.posts[state.posts.length - 1];
        const maxId = oldestPost.id;

        console.log(
          `[useFeed] loadMore: Initializing older posts iterator with maxId=${maxId}`,
        );

        olderPaginatorRef.current = getDirectionalTimelinePaginator(
          client,
          config.feedType,
          config.feedId,
          "older",
          { maxId, limit: config.limit },
        );
      }

      // Get next page from iterator
      console.log("[useFeed] loadMore: Calling iterator.next()");
      const result = await olderPaginatorRef.current.next();

      if (result.done || !result.value || result.value.length === 0) {
        console.log("[useFeed] loadMore: Iterator exhausted (no more posts)");
        dispatch({
          type: "LOAD_MORE_SUCCESS",
          posts: state.posts,
          hasMore: false,
        });
        return;
      }

      // Transform statuses to Post type
      const newPosts = result.value.map(transformStatus);
      console.log(`[useFeed] loadMore FETCHED: ${newPosts.length} posts`);

      // Filter out duplicates
      const existingIds = new Set(
        state.posts.filter((p) => p && p.id).map((p) => p.id),
      );
      const uniqueNewPosts = newPosts.filter(
        (post) => post && post.id && !existingIds.has(post.id),
      );
      const updatedPosts = [...state.posts, ...uniqueNewPosts];
      const boundedPosts = trimPostsToLimit(updatedPosts, "dropFromStart", state.viewportPosition);

      console.log(
        `[useFeed] loadMore RESULT: prevPosts=${state.posts.length}, fetched=${newPosts.length}, unique=${uniqueNewPosts.length}, total=${updatedPosts.length}`,
      );

      dispatch({
        type: "LOAD_MORE_SUCCESS",
        posts: boundedPosts,
        trimDirection: "dropFromStart",
        hasMore: true,
      });

      // Save to cache asynchronously
      if (config.enableCache && config.cacheKey) {
        storageService
          .saveCachedPosts(config.cacheKey, boundedPosts)
          .catch((err) => console.error("[useFeed] Cache save error:", err));
      }
    } catch (error) {
      console.error("[useFeed] Error loading more posts:", error);
      dispatch({
        type: "LOAD_MORE_ERROR",
        error:
          error instanceof Error ? error.message : "Failed to load more posts",
      });
    }
  }, [state.posts, state.hasMore, state.isLoadingMore]);

  /**
   * Check for new posts (since current newest)
   */
  const checkForNew = useCallback(async (): Promise<number> => {
    if (state.posts.length === 0) return 0;

    try {
      const newestPost = state.posts[0];
      const sinceId = newestPost.id;

      const newPosts = await fetchPosts({ sinceId, limit });
      return newPosts.length;
    } catch (error) {
      console.error("Error checking for new posts:", error);
      return 0;
    }
  }, [state.posts, fetchPosts, limit]);

  /**
   * Load newer posts (when scrolling up)
   * Uses iterator-based approach for reliable pagination
   */
  const loadNewer = useCallback(async () => {
    console.log(
      `[useFeed] loadNewer CALLED: postsCount=${state.posts.length}, isLoadingMore=${state.isLoadingMore}`,
    );

    // Guard checks
    if (state.posts.length === 0) {
      console.log("[useFeed] loadNewer BLOCKED: No posts yet");
      return;
    }

    if (state.isLoadingMore) {
      console.log("[useFeed] loadNewer BLOCKED: Already loading");
      return;
    }

    try {
      dispatch({ type: "LOAD_NEWER_START" });

      const config = feedConfigRef.current;

      // Initialize the newer posts iterator if it doesn't exist
      if (!newerPaginatorRef.current) {
        const activeClient = await getActiveClient();
        if (!activeClient) {
          throw new Error("No active client");
        }

        const { client } = activeClient;
        const newestPost = state.posts[0];
        const sinceId = newestPost.id;

        console.log(
          `[useFeed] loadNewer: Initializing newer posts iterator with sinceId=${sinceId}`,
        );

        newerPaginatorRef.current = getDirectionalTimelinePaginator(
          client,
          config.feedType,
          config.feedId,
          "newer",
          { sinceId, limit: config.limit },
        );
      }

      // Get next page from iterator
      console.log("[useFeed] loadNewer: Calling iterator.next()");
      const result = await newerPaginatorRef.current.next();

      if (result.done || !result.value || result.value.length === 0) {
        console.log("[useFeed] loadNewer: Iterator exhausted (no newer posts)");
        // Don't dispatch if no new posts - prevents unnecessary re-render
        dispatch({ type: "LOAD_NEWER_ERROR", error: null });
        return;
      }

      // Transform statuses to Post type
      const newPosts = result.value.map(transformStatus);
      console.log(`[useFeed] loadNewer FETCHED: ${newPosts.length} posts`);

      // Filter out duplicates and prepend new posts
      const existingIds = new Set(
        state.posts.filter((p) => p && p.id).map((p) => p.id),
      );
      const uniqueNewPosts = newPosts.filter(
        (post) => post && post.id && !existingIds.has(post.id),
      );

      // Only dispatch if there are actually new unique posts
      if (uniqueNewPosts.length === 0) {
        console.log(
          "[useFeed] loadNewer: No new unique posts, skipping state update",
        );
        // Don't dispatch if no new posts - prevents unnecessary re-render
        dispatch({ type: "LOAD_NEWER_ERROR", error: null });
        return;
      }

      const pendingSnapshot = [
        ...uniqueNewPosts,
        ...state.pendingNewPosts,
      ];
      const boundedSnapshot = trimPostsToLimit(
        [...pendingSnapshot, ...state.posts],
        "dropFromEnd",
        state.viewportPosition,
      );
      const pendingTotal = pendingSnapshot.length;

      console.log(
        `[useFeed] loadNewer RESULT: prevPosts=${state.posts.length}, fetched=${newPosts.length}, unique=${uniqueNewPosts.length}, pendingTotal=${pendingTotal}`,
      );

      dispatch({ type: "QUEUE_NEWER_POSTS", newPosts: uniqueNewPosts });

      // Save to cache asynchronously
      if (config.enableCache && config.cacheKey) {
        storageService
          .saveCachedPosts(config.cacheKey, boundedSnapshot)
          .catch((err) => console.error("[useFeed] Cache save error:", err));
      }
    } catch (error) {
      console.error("[useFeed] Error loading newer posts:", error);
      dispatch({
        type: "LOAD_NEWER_ERROR",
        error:
          error instanceof Error ? error.message : "Failed to load newer posts",
      });
    }
  }, [state.posts, state.pendingNewPosts.length, state.isLoadingMore]);

  /**
   * Apply pending newer posts once the user chooses to view them
   */
  const applyPendingNewPosts = useCallback(() => {
    dispatch({ type: "APPLY_PENDING_NEW_POSTS" });
  }, []);

  /**
   * Check if should load older posts based on current scroll position
   * Returns true when within PREFETCH_THRESHOLD items of the bottom
   */
  const shouldLoadOlder = useCallback(
    (currentIndex: number): boolean => {
      if (state.posts.length === 0) return false;
      if (!state.hasMore) return false;
      if (state.isLoadingMore) return false;

      // Check if current index is within threshold of bottom
      const threshold = state.posts.length - FEED_CONFIG.PREFETCH_THRESHOLD;
      return currentIndex >= threshold;
    },
    [state.posts.length, state.hasMore, state.isLoadingMore],
  );

  /**
   * Check if should load newer posts based on current scroll position
   * Returns true when within PREFETCH_THRESHOLD items of the top
   */
  const shouldLoadNewer = useCallback(
    (currentIndex: number): boolean => {
      if (state.posts.length === 0) return false;
      if (state.isLoadingMore) return false;

      // Check if current index is within threshold of top
      return currentIndex < FEED_CONFIG.PREFETCH_THRESHOLD;
    },
    [state.posts.length, state.isLoadingMore],
  );

  /**
   * Handle viewable items changed event
   * Only tracks visibility for video autoplay and analytics
   * Does NOT trigger proactive loading - loading is user-controlled only
   */
  const handleViewableItemsChanged = useCallback(
    (info: {
      viewableItems: { index: number | null; item: any }[];
      changed: any[];
    }) => {
      // This callback is now only for visibility tracking
      // Loading is controlled by user actions (pull-to-refresh, scroll to end, manual buttons)
      // No automatic loading here to prevent unwanted scroll jumps
    },
    [],
  );

  /**
   * Jump to a specific post - start feed from that post
   * Displays target post at top and continues pagination from there
   *
   * Note: Mastodon's max_id parameter is exclusive (returns posts older than the ID),
   * so we need to fetch the target post separately to include it in the results.
   */
  const jumpToPost = useCallback(
    async (postId: string) => {
      try {
        console.log(`[useFeed] jumpToPost START: postId=${postId}`);
        dispatch({ type: "LOAD_START" });

        // Reset iterators to clear old pagination state
        resetIterators();

        const activeClient = await getActiveClient();
        if (!activeClient) {
          throw new Error("No active client");
        }

        const { client } = activeClient;
        const config = feedConfigRef.current;

        // Fetch the target post itself using request queue
        const targetStatus = await withRetry(
          () => client.v1.statuses.$select(postId).fetch(),
          RequestPriority.NORMAL,
          `status_${postId}`, // Cache key for deduplication
        );
        const targetPost = transformStatus(targetStatus);

        console.log(`[useFeed] jumpToPost: Fetched target post ${postId}`);

        // Fetch older posts (using maxId to get posts before the target)
        const olderPosts = await fetchPosts({
          maxId: postId,
          limit: config.limit - 1,
        });
        console.log(
          `[useFeed] jumpToPost: Fetched ${olderPosts.length} older posts`,
        );

        // Display target at top, followed by older posts
        const posts = [targetPost, ...olderPosts];
        const boundedPosts = trimPostsToLimit(posts, "dropFromEnd", state.viewportPosition);

        console.log(
          `[useFeed] jumpToPost COMPLETE: total=${posts.length} posts`,
        );

        dispatch({
          type: "LOAD_SUCCESS",
          posts: boundedPosts,
          hasMore: olderPosts.length > 0,
          anchorPostId: null,
        });

        // Reset iterators after jumpToPost to prevent proactive loading
        // from interfering with the initial display
        // The iterators will be re-initialized when loadMore/loadNewer are called
        resetIterators();
        
        // Mark that we just jumped to a post to prevent immediate proactive loading
        lastJumpToPostRef.current = Date.now();

        // Save to cache
        if (config.enableCache && config.cacheKey) {
          await storageService
            .saveCachedPosts(config.cacheKey, boundedPosts)
            .catch((err) => console.error("[useFeed] Cache save error:", err));
        }
      } catch (error) {
        console.error("[useFeed] Error jumping to post:", error);
        dispatch({
          type: "LOAD_ERROR",
          error:
            error instanceof Error ? error.message : "Failed to jump to post",
        });
      }
    },
    [fetchPosts, resetIterators],
  );

  // Load on mount or when instance/feed changes
  // CRITICAL FIX: Don't include loadFeed in dependencies to avoid infinite loop
  // Instead, use a ref to track when the feed configuration changes
  const feedKeyRef = useRef<string>("");
  useEffect(() => {
    const feedKey = `${instance?.id || ""}-${feedType}-${feedId || ""}`;

    // Only load if instance exists and feed configuration actually changed
    if (instance && feedKey !== feedKeyRef.current) {
      console.log("[useFeed] Feed configuration changed, loading:", feedKey);
      feedKeyRef.current = feedKey;
      resetIterators();
      loadFeed();
    }
  }, [instance?.id, feedType, feedId]); // Don't include loadFeed or resetIterators!

  /**
   * Load feed from a specific anchor post
   * Fetches the post and surrounding context (ancestors/descendants)
   * This eliminates the need for scroll position estimation
   */
  const loadFromAnchor = useCallback(
    async (postId: string) => {
      try {
        console.log(`[useFeed] loadFromAnchor START: postId=${postId}`);
        dispatch({ type: "LOAD_FROM_ANCHOR_START" });

        // Reset iterators to clear old pagination state
        resetIterators();

        const activeClient = await getActiveClient();
        if (!activeClient) {
          throw new Error("No active client");
        }

        const { client } = activeClient;

        // Fetch the anchor post itself
        const anchorStatus = await withRetry(
          () => client.v1.statuses.$select(postId).fetch(),
          RequestPriority.NORMAL,
          `status_${postId}`,
        );
        const anchorPost = transformStatus(anchorStatus);

        console.log(`[useFeed] loadFromAnchor: Fetched anchor post ${postId}`);

        // Fetch context (ancestors and descendants)
        const context = await withRetry(
          () => client.v1.statuses.$select(postId).context.fetch(),
          RequestPriority.NORMAL,
          `context_${postId}`,
        );

        console.log(
          `[useFeed] loadFromAnchor: Fetched context - ${context.ancestors.length} ancestors, ${context.descendants.length} descendants`,
        );

        // Transform ancestors and descendants to Post type
        const ancestors = context.ancestors.map(transformStatus);
        const descendants = context.descendants.map(transformStatus);

        // Combine in chronological order (newest first)
        // descendants are newer than anchor, ancestors are older
        const posts = [...descendants.reverse(), anchorPost, ...ancestors];

        console.log(
          `[useFeed] loadFromAnchor COMPLETE: total=${posts.length} posts`,
        );

        dispatch({
          type: "LOAD_FROM_ANCHOR_SUCCESS",
          posts,
          hasMore: ancestors.length > 0,
          anchorPostId: postId,
        });

        // Reset iterators after loading from anchor
        resetIterators();

        // Save to cache
        const config = feedConfigRef.current;
        if (config.enableCache && config.cacheKey) {
          await storageService
            .saveCachedPosts(config.cacheKey, posts)
            .catch((err) => console.error("[useFeed] Cache save error:", err));
        }
      } catch (error) {
        console.error("[useFeed] Error loading from anchor:", error);
        dispatch({
          type: "LOAD_FROM_ANCHOR_ERROR",
          error:
            error instanceof Error
              ? error.message
              : "Failed to load from anchor",
        });
      }
    },
    [resetIterators],
  );

  /**
   * Remove a post from the feed (e.g., after deletion)
   */
  const removePost = useCallback(
    (postId: string) => {
      console.log(`[useFeed] removePost: ${postId}`);
      dispatch({ type: "REMOVE_POST", postId });

      // Update cache
      const config = feedConfigRef.current;
      if (config.enableCache && config.cacheKey) {
        const updatedPosts = state.posts.filter((post) => post.id !== postId);
        storageService
          .saveCachedPosts(config.cacheKey, updatedPosts)
          .catch((err) => console.error("[useFeed] Cache save error:", err));
      }
    },
    [state.posts],
  );

  /**
   * Update a post in-place (optimistic UI updates, relationship changes, etc.)
   */
  const updatePost = useCallback(
    (targetPostId: string, updater: (post: Post) => Post) => {
      const updateList = (list: Post[]) =>
        list.map((post) =>
          post.id === targetPostId || post.reblog?.id === targetPostId
            ? updater(post)
            : post,
        );

      const updatedPosts = updateList(state.posts);
      const updatedPending = updateList(state.pendingNewPosts);

      dispatch({
        type: "SET_POSTS",
        posts: updatedPosts,
        pendingNewPosts: updatedPending,
      });

      const config = feedConfigRef.current;
      if (config.enableCache && config.cacheKey) {
        storageService
          .saveCachedPosts(config.cacheKey, updatedPosts)
          .catch((err) => console.error("[useFeed] Cache save error:", err));
      }
    },
    [state.posts, state.pendingNewPosts],
  );

  /**
   * Update viewport position for smart trimming
   * Call this when visible posts change to enable viewport-aware trimming
   */
  const updateViewportPosition = useCallback(
    (viewportPosition: ViewportPosition) => {
      dispatch({
        type: "UPDATE_VIEWPORT_POSITION",
        viewportPosition,
      });
    },
    [],
  );

  return {
    ...state,
    pendingNewPosts: state.pendingNewPosts,
    refresh,
    loadMore,
    loadNewer,
    applyPendingNewPosts,
    checkForNew,
    jumpToPost,
    loadFromAnchor,
    reload: loadFeed,
    removePost,
    updatePost,
    updateViewportPosition,
    shouldLoadOlder,
    shouldLoadNewer,
    handleViewableItemsChanged,
  };
}
