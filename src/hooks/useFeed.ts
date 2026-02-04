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
import { createFeedPostStore } from "@lib/feed/feedPostStore";
import {
  createFeedCacheController,
  type FeedCacheController,
} from "@lib/feed/feedCacheController";

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
  /** Optional feed cache controller (for testing or when using intermediate cache layer) */
  feedCacheController?: FeedCacheController;
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
    feedCacheController: injectedFeedCacheController,
  } = options;
  const { instance } = useAuth();

  const feedStoreRef = useRef<ReturnType<typeof createFeedPostStore> | null>(null);
  const feedControllerRef = useRef<FeedCacheController | null>(null);
  const prefetchOlderInFlightRef = useRef(false);
  const prefetchNewerInFlightRef = useRef(false);
  const lastPrefetchedOlderMaxIdRef = useRef<string | null>(null);
  const lastPrefetchedNewerSinceIdRef = useRef<string | null>(null);

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
  
  // Track the last maxId/sinceId used to create iterators to detect when we've truly reached the end
  // If a freshly created iterator with the same maxId/sinceId returns empty, we've reached the end
  const lastOlderMaxIdRef = useRef<string | null>(null);
  const lastNewerSinceIdRef = useRef<string | null>(null);
  
  // Track the last successfully fetched post ID to use for iterator creation
  // This ensures we continue from where we actually fetched, not where the trimmed array ends
  const lastFetchedOlderPostIdRef = useRef<string | null>(null);
  const lastFetchedNewerPostIdRef = useRef<string | null>(null);
  
  // Track the lastFetchedOlderPostIdRef value at the time we created the current iterator
  // This allows us to detect if lastFetchedOlderPostIdRef hasn't changed (meaning no new posts
  // were fetched), which indicates we've truly reached the end
  const lastFetchedOlderPostIdAtIteratorCreationRef = useRef<string | null>(null);
  
  // Track consecutive empty results (when an iterator returns empty then done) to detect true exhaustion
  // After multiple consecutive empty results with the same maxId, we mark as exhausted
  const consecutiveEmptyResultsRef = useRef<number>(0);
  const MAX_CONSECUTIVE_EMPTY_RESULTS = 5; // Increased from 3 to reduce false positives

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
    lastOlderMaxIdRef.current = null;
    lastNewerSinceIdRef.current = null;
    lastFetchedOlderPostIdRef.current = null;
    lastFetchedNewerPostIdRef.current = null;
    lastFetchedOlderPostIdAtIteratorCreationRef.current = null;
    consecutiveEmptyResultsRef.current = 0;
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

  // Feed cache layer: use injected controller (tests) or create one when enableCache && cacheKey
  useEffect(() => {
    prefetchOlderInFlightRef.current = false;
    prefetchNewerInFlightRef.current = false;
    lastPrefetchedOlderMaxIdRef.current = null;
    lastPrefetchedNewerSinceIdRef.current = null;

    if (injectedFeedCacheController) {
      feedControllerRef.current = injectedFeedCacheController;
      return;
    }
    if (!enableCache || !cacheKey) {
      feedControllerRef.current = null;
      feedStoreRef.current = null;
      return;
    }
    const store = feedStoreRef.current ?? createFeedPostStore();
    feedStoreRef.current = store;
    const cacheServerPageSize = FEED_CONFIG.MAX_PAGE_SIZE;
    feedControllerRef.current = createFeedCacheController(store, {
      feedKey: cacheKey,
      pageSize: cacheServerPageSize,
      fetchLatest: () => fetchPosts({ limit: cacheServerPageSize }),
      fetchContextAround: async (targetPostId: string) => {
        const activeClient = await getActiveClient();
        if (!activeClient) throw new Error("No active client");
        const anchorStatus = await withRetry(
          () => activeClient.client.v1.statuses.$select(targetPostId).fetch(),
          RequestPriority.NORMAL,
          `status_${targetPostId}`,
        );
        const context = await withRetry(
          () => activeClient.client.v1.statuses.$select(targetPostId).context.fetch(),
          RequestPriority.NORMAL,
          `context_${targetPostId}`,
        );
        const anchorPost = transformStatus(anchorStatus);
        const ancestors = context.ancestors.map(transformStatus);
        const descendants = context.descendants.map(transformStatus);
        return [...descendants.reverse(), anchorPost, ...ancestors];
      },
      fetchOlderPage: async (maxId: string, pageLimit: number) => {
        const activeClient = await getActiveClient();
        if (!activeClient) throw new Error("No active client");
        const paginator = getDirectionalTimelinePaginator(
          activeClient.client,
          feedType,
          feedId,
          "older",
          { maxId, limit: pageLimit },
        );
        const result = await withRetry(
          async () => {
            const page = await paginator.next();
            return page.value || [];
          },
          RequestPriority.LOW,
        );
        return result.map(transformStatus);
      },
      fetchNewerPage: async (sinceId: string, pageLimit: number) => {
        const activeClient = await getActiveClient();
        if (!activeClient) throw new Error("No active client");
        const paginator = getDirectionalTimelinePaginator(
          activeClient.client,
          feedType,
          feedId,
          "newer",
          { sinceId, limit: pageLimit },
        );
        const result = await withRetry(
          async () => {
            const page = await paginator.next();
            return page.value || [];
          },
          RequestPriority.LOW,
        );
        return result.map(transformStatus);
      },
    });
  }, [
    enableCache,
    cacheKey,
    injectedFeedCacheController,
    fetchPosts,
    feedType,
    feedId,
  ]);

  /**
   * Initial load - always request latest from server first (no cache as initial source).
   * When using feed cache layer, controller.getInitialSlice({ limit }) does fetchLatest and populates store.
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
      const controller = feedControllerRef.current;

      if (controller) {
        const posts = await controller.getInitialSlice({ limit: config.limit });
        const boundedPosts = trimPostsToLimit(posts, "dropFromEnd", state.viewportPosition);
        const hasMore = posts.length > 0;
        console.log(`[useFeed] load CACHE_LAYER: ${posts.length} posts, hasMore=${hasMore}`);
        dispatch({ type: "LOAD_SUCCESS", posts: boundedPosts, hasMore, anchorPostId: null });
        return;
      }

      console.log("[useFeed] load NO CACHE LAYER, fetching from API");
      const posts = await fetchPosts();
      const boundedPosts = trimPostsToLimit(posts, "dropFromEnd", state.viewportPosition);
      const hasMore = posts.length > 0;
      console.log(`[useFeed] load API: ${posts.length} posts, hasMore=${hasMore}`);
      dispatch({ type: "LOAD_SUCCESS", posts: boundedPosts, hasMore, anchorPostId: null });

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
  }, [instance, fetchPosts]);

  /**
   * Refresh - pull to refresh
   * Resets iterators and fetches fresh posts from the top (same as initial load with no target)
   */
  const refresh = useCallback(async () => {
    try {
      console.log("[useFeed] refresh START");
      dispatch({ type: "REFRESH_START" });

      resetIterators();
      lastPrefetchedOlderMaxIdRef.current = null;
      lastPrefetchedNewerSinceIdRef.current = null;

      const config = feedConfigRef.current;
      const controller = feedControllerRef.current;

      if (controller) {
        const posts = await controller.getInitialSlice({ limit: config.limit });
        const boundedPosts = trimPostsToLimit(posts, "dropFromEnd", state.viewportPosition);
        const hasMore = posts.length > 0;
        dispatch({ type: "REFRESH_SUCCESS", posts: boundedPosts, hasMore });
        return;
      }

      const posts = await fetchPosts();
      const boundedPosts = trimPostsToLimit(posts, "dropFromEnd", state.viewportPosition);
      const hasMore = posts.length > 0;
      dispatch({ type: "REFRESH_SUCCESS", posts: boundedPosts, hasMore });

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
   * 
   * IMPORTANT: Iterator lifecycle and recreation strategy
   * 
   * Masto.js iterators paginate through a specific range defined by maxId.
   * When an iterator exhausts (returns done: true), it means that particular
   * range is done, not that the entire feed is exhausted.
   * 
   * Strategy:
   * 1. On first call, create iterator with maxId from oldest post
   * 2. Call iterator.next() to get next page
   * 3. When iterator exhausts, reset the iterator ref to null
   * 4. On next loadMore() call, create NEW iterator with updated maxId
   *    (based on the new oldest post after the previous batch was loaded)
   * 
   * This allows continuous pagination through the entire feed by creating
   * new iterators with updated pagination parameters when needed.
   */
  const loadMore = useCallback(async () => {
    console.log(
      `[useFeed] loadMore CALLED: hasMore=${state.hasMore}, isLoadingMore=${state.isLoadingMore}, postsCount=${state.posts.length}`,
    );

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

    const controller = feedControllerRef.current;
    if (controller) {
      try {
        dispatch({ type: "LOAD_MORE_START" });
        const config = feedConfigRef.current;
        const oldestId = state.posts[state.posts.length - 1].id;
        let olderPosts = await controller.getOlderSlice(oldestId, config.limit);
        let didRetryFromEndOfCache = false;

        // Cache empty for this boundary: either server was marked exhausted (retry once) or we need first prefetch
        if (olderPosts.length === 0) {
          if (controller.isOlderServerExhausted()) {
            controller.clearOlderServerExhausted();
            await controller.prefetchOlderPage(oldestId);
            olderPosts = await controller.getOlderSlice(oldestId, config.limit);
            didRetryFromEndOfCache = true;
          } else if (
            !prefetchOlderInFlightRef.current &&
            lastPrefetchedOlderMaxIdRef.current !== oldestId
          ) {
            // No older posts in cache yet; fetch one page now so this loadMore returns results
            lastPrefetchedOlderMaxIdRef.current = oldestId;
            prefetchOlderInFlightRef.current = true;
            await controller
              .prefetchOlderPage(oldestId)
              .catch((err) => {
                console.error("[useFeed] prefetchOlderPage error:", err);
                if (lastPrefetchedOlderMaxIdRef.current === oldestId) {
                  lastPrefetchedOlderMaxIdRef.current = null;
                }
              })
              .finally(() => {
                prefetchOlderInFlightRef.current = false;
              });
            olderPosts = await controller.getOlderSlice(oldestId, config.limit);
          }
        }

        const existingIds = new Set(state.posts.map((p) => p.id));
        const uniqueNew = olderPosts.filter((p) => !existingIds.has(p.id));
        const updatedPosts = [...state.posts, ...uniqueNew];
        const boundedPosts = trimPostsToLimit(updatedPosts, "dropFromStart", state.viewportPosition);
        const exhausted = controller.isOlderServerExhausted();
        const hasMore =
          uniqueNew.length > 0
            ? true
            : didRetryFromEndOfCache
              ? false
              : exhausted
                ? true
                : true; // Keep true when cache was empty but server not exhausted (e.g. prefetch failed)
        dispatch({
          type: "LOAD_MORE_SUCCESS",
          posts: boundedPosts,
          trimDirection: "dropFromStart",
          hasMore,
        });
        // Background prefetch next page when we have posts and more may exist
        const nextOldestId =
          uniqueNew.length > 0 ? uniqueNew[uniqueNew.length - 1].id : oldestId;
        const shouldPrefetchOlder =
          uniqueNew.length > 0 &&
          !controller.isOlderServerExhausted() &&
          !prefetchOlderInFlightRef.current &&
          lastPrefetchedOlderMaxIdRef.current !== nextOldestId;
        if (shouldPrefetchOlder) {
          lastPrefetchedOlderMaxIdRef.current = nextOldestId;
          prefetchOlderInFlightRef.current = true;
          controller
            .prefetchOlderPage(nextOldestId)
            .catch((err) => {
              console.error("[useFeed] prefetchOlderPage error:", err);
              if (lastPrefetchedOlderMaxIdRef.current === nextOldestId) {
                lastPrefetchedOlderMaxIdRef.current = null;
              }
            })
            .finally(() => {
              prefetchOlderInFlightRef.current = false;
            });
        }
      } catch (error) {
        console.error("[useFeed] Error loading more posts:", error);
        dispatch({
          type: "LOAD_MORE_ERROR",
          error: error instanceof Error ? error.message : "Failed to load more posts",
        });
      }
      return;
    }

    try {
      dispatch({ type: "LOAD_MORE_START" });

      const config = feedConfigRef.current;

      // Initialize the older posts iterator if it doesn't exist
      // This happens on first loadMore() call, or after the previous iterator was reset
      // (when it exhausted). By resetting to null on exhaustion, we enable iterator
      // recreation with updated maxId based on the last successfully fetched post.
      const wasIteratorCreated = !olderPaginatorRef.current;
      if (!olderPaginatorRef.current) {
        const activeClient = await getActiveClient();
        if (!activeClient) {
          throw new Error("No active client");
        }

        const { client } = activeClient;
        
        // Use the last successfully fetched post ID if available, otherwise use the oldest post
        // This ensures we continue from where we actually fetched, not from the trimmed array
        const maxId = lastFetchedOlderPostIdRef.current ?? state.posts[state.posts.length - 1].id;
        
        // Track the lastFetchedOlderPostIdRef value at iterator creation time
        // This allows us to detect if lastFetchedOlderPostIdRef hasn't changed (no new posts fetched)
        const lastFetchedAtCreation = lastFetchedOlderPostIdRef.current;
        
        // Store the previous value BEFORE updating the ref (for logging and comparison)
        const previousLastFetched = lastFetchedOlderPostIdAtIteratorCreationRef.current;
        
        // Check if we're retrying with the same lastFetched value BEFORE updating the ref
        // This means no new posts were fetched since the last iterator was created
        const isRetryingWithSameLastFetched = previousLastFetched !== null &&
                                              previousLastFetched === lastFetchedAtCreation;
        
        // If we're using the same maxId again, increment the consecutive empty results counter
        // Otherwise, reset it (we got new posts, so reset the counter)
        if (isRetryingWithSameLastFetched) {
          consecutiveEmptyResultsRef.current += 1;
        } else {
          consecutiveEmptyResultsRef.current = 0;
        }
        
        // Update the ref AFTER the comparison
        lastFetchedOlderPostIdAtIteratorCreationRef.current = lastFetchedAtCreation;
        
        // Update the maxId we're using for this iterator
        lastOlderMaxIdRef.current = maxId;

        console.log(
          `[useFeed] loadMore: Initializing older posts iterator with maxId=${maxId} (lastFetched=${lastFetchedAtCreation ?? 'none'}, previousLastFetched=${previousLastFetched ?? 'none'}, retryingWithSame=${isRetryingWithSameLastFetched})`,
        );

        // Create a new iterator with maxId from the last fetched post (or oldest if none)
        // This iterator will paginate through posts older than this maxId
        olderPaginatorRef.current = getDirectionalTimelinePaginator(
          client,
          config.feedType,
          config.feedId,
          "older",
          { maxId, limit: config.limit },
        );
        
        // Store the retry flag for use when checking iterator results (across function calls)
        // This flag persists on the paginator object, so we can check it even after multiple next() calls
        (olderPaginatorRef.current as any)._isRetryingWithSameLastFetched = isRetryingWithSameLastFetched;
        // Track if this is the first next() call on this iterator (only mark as exhausted on first call)
        (olderPaginatorRef.current as any)._nextCallCount = 0;
      }

      // Get next page from iterator
      // The iterator handles internal pagination through Link headers
      console.log("[useFeed] loadMore: Calling iterator.next()");

      // Track the call count for this iterator (to detect first call)
      const nextCallCount = ((olderPaginatorRef.current as any)?._nextCallCount ?? 0) + 1;
      (olderPaginatorRef.current as any)._nextCallCount = nextCallCount;
      const isFirstCall = nextCallCount === 1;

      const result = await olderPaginatorRef.current.next();

      // Handle iterator exhaustion
      // IMPORTANT: When an iterator returns done: true, it means that particular iterator's
      // range is exhausted, NOT the entire feed. We should reset the iterator and keep
      // hasMore=true to allow creating a new iterator on the next call.
      // However, if this iterator was created with retryingWithSame=true (meaning we're
      // retrying with the same maxId), then we've truly reached the end.
      if (result.done) {
        // Check if we're retrying with the same lastFetched value
        // If so, this iterator was created with the same maxId as the previous one,
        // which means no new posts were fetched. Mark as exhausted.
        const paginatorFlag = (olderPaginatorRef.current as any)?._isRetryingWithSameLastFetched;
        const isRetryingWithSameLastFetched = paginatorFlag === true;

        console.log(`[useFeed] loadMore: Iterator done (range exhausted), consecutiveEmptyResults=${consecutiveEmptyResultsRef.current}, max=${MAX_CONSECUTIVE_EMPTY_RESULTS}, resetting to allow new iterator`);
        // Check if we've had too many consecutive empty results (iterator returns empty then done)
        // with the same maxId - this indicates true exhaustion
        if (consecutiveEmptyResultsRef.current >= MAX_CONSECUTIVE_EMPTY_RESULTS) {
          console.log(`[useFeed] loadMore: ${consecutiveEmptyResultsRef.current} consecutive empty results (>= ${MAX_CONSECUTIVE_EMPTY_RESULTS}), truly exhausted`);
          olderPaginatorRef.current = null;
          consecutiveEmptyResultsRef.current = 0;
          dispatch({
            type: "LOAD_MORE_SUCCESS",
            posts: state.posts,
            hasMore: false,
          });
          return;
        }
        // Reset iterator ref to null to allow recreation with updated maxId on next call
        // Keep hasMore=true - allow iterators to continue until we hit the consecutive empty threshold
        olderPaginatorRef.current = null;
        dispatch({
          type: "LOAD_MORE_SUCCESS",
          posts: state.posts,
          hasMore: true, // Keep true to allow creating new iterator
        });
        return;
      }

      // Check for empty array (but iterator not done yet)
      // IMPORTANT: If an iterator returns an empty array but not done: true,
      // we should continue calling next() on the SAME iterator. An empty array just means
      // there are no posts in that page, but the iterator may have more pages.
      // The iterator maintains its internal pagination state and will eventually return
      // done: true when it's truly exhausted.
      // We do NOT mark as exhausted based on empty arrays alone - only when done: true
      // and retryingWithSame=true on the first call.
      if (!result.value || result.value.length === 0) {
        console.log("[useFeed] loadMore: Iterator returned empty array (but not done), continuing with same iterator");
        // Continue with the same iterator - don't reset it
        // The iterator will eventually return done: true when exhausted
        dispatch({
          type: "LOAD_MORE_SUCCESS",
          posts: state.posts,
          hasMore: true,
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

        // Track the last successfully fetched post ID (the oldest post from the fetched batch)
        // This ensures we continue from where we actually fetched, even if posts get trimmed
        if (uniqueNewPosts.length > 0) {
          const oldestFetchedPost = uniqueNewPosts[uniqueNewPosts.length - 1];
          lastFetchedOlderPostIdRef.current = oldestFetchedPost.id;
          // Reset consecutive empty results counter since we successfully fetched posts
          consecutiveEmptyResultsRef.current = 0;
          console.log(`[useFeed] loadMore: Tracking last fetched older post ID: ${lastFetchedOlderPostIdRef.current}`);
        }

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
   * 
   * IMPORTANT: Iterator lifecycle and recreation strategy
   * 
   * Similar to loadMore(), but for newer posts using sinceId:
   * 1. On first call, create iterator with sinceId from newest post
   * 2. Call iterator.next() to get next page of newer posts
   * 3. When iterator exhausts, reset the iterator ref to null
   * 4. On next loadNewer() call, create NEW iterator with updated sinceId
   *    (based on the new newest post after the previous batch was loaded)
   * 
   * This allows continuous pagination backward through the feed by creating
   * new iterators with updated pagination parameters when needed.
   */
  const loadNewer = useCallback(async () => {
    console.log(
      `[useFeed] loadNewer CALLED: postsCount=${state.posts.length}, isLoadingMore=${state.isLoadingMore}`,
    );

    if (state.posts.length === 0) {
      console.log("[useFeed] loadNewer BLOCKED: No posts yet");
      return;
    }

    if (state.isLoadingMore) {
      console.log("[useFeed] loadNewer BLOCKED: Already loading");
      return;
    }

    const controller = feedControllerRef.current;
    if (controller) {
      try {
        dispatch({ type: "LOAD_NEWER_START" });
        const config = feedConfigRef.current;
        const newestId = state.posts[0].id;
        const newerPosts = await controller.getNewerSlice(newestId, config.limit);
        const existingIds = new Set(state.posts.map((p) => p.id));
        const uniqueNew = newerPosts.filter((p) => !existingIds.has(p.id));
        if (uniqueNew.length === 0) {
          dispatch({ type: "LOAD_NEWER_ERROR", error: null });
          return;
        }
        dispatch({ type: "QUEUE_NEWER_POSTS", newPosts: uniqueNew });
        const shouldPrefetchNewer =
          !prefetchNewerInFlightRef.current &&
          lastPrefetchedNewerSinceIdRef.current !== newestId;
        if (shouldPrefetchNewer) {
          lastPrefetchedNewerSinceIdRef.current = newestId;
          prefetchNewerInFlightRef.current = true;
          controller
            .prefetchNewerPage(newestId)
            .catch((err) => {
              console.error("[useFeed] prefetchNewerPage error:", err);
              if (lastPrefetchedNewerSinceIdRef.current === newestId) {
                lastPrefetchedNewerSinceIdRef.current = null;
              }
            })
            .finally(() => {
              prefetchNewerInFlightRef.current = false;
            });
        }
      } catch (error) {
        console.error("[useFeed] Error loading newer posts:", error);
        dispatch({ type: "LOAD_NEWER_ERROR", error: error instanceof Error ? error.message : "Failed to load newer" });
      }
      return;
    }

    try {
      dispatch({ type: "LOAD_NEWER_START" });

      const config = feedConfigRef.current;

      // Initialize the newer posts iterator if it doesn't exist
      // This happens on first loadNewer() call, or after the previous iterator was reset
      // (when it exhausted). By resetting to null on exhaustion, we enable iterator
      // recreation with updated sinceId based on the current newest post.
      const wasIteratorCreated = !newerPaginatorRef.current;
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

        // Create a new iterator with sinceId from the current newest post
        // This iterator will paginate through posts newer than this sinceId
        newerPaginatorRef.current = getDirectionalTimelinePaginator(
          client,
          config.feedType,
          config.feedId,
          "newer",
          { sinceId, limit: config.limit },
        );
        
        // Track the sinceId we used to create this iterator
        lastNewerSinceIdRef.current = sinceId;
      }

      // Get next page from iterator
      // The iterator handles internal pagination through Link headers
      console.log("[useFeed] loadNewer: Calling iterator.next()");
      const result = await newerPaginatorRef.current.next();

      // Handle iterator exhaustion or empty results
      // Same strategy as loadMore: distinguish between done: true vs empty array
      if (result.done) {
        console.log("[useFeed] loadNewer: Iterator done (truly exhausted)");
        // Reset iterator ref to null to allow recreation with updated params on next call
        newerPaginatorRef.current = null;
        // Don't dispatch if no new posts - prevents unnecessary re-render
        dispatch({ type: "LOAD_NEWER_ERROR", error: null });
        return;
      }

      // Check for empty array (but iterator not done yet)
      // IMPORTANT: If an iterator returns an empty array but not done: true,
      // we should continue calling next() on the SAME iterator. The iterator
      // maintains its internal pagination state and may have more pages.
      // Only reset the iterator when it returns done: true, which indicates
      // that particular pagination range is exhausted.
      if (!result.value || result.value.length === 0) {
        console.log("[useFeed] loadNewer: Iterator returned empty array (but not done), continuing with same iterator");
        // Continue with the same iterator - don't reset it
        // The iterator will eventually return done: true when exhausted
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
   * When using feed cache layer: check cache first; if target in cache use slice (no server); else fetch context from server
   */
  const loadFromAnchor = useCallback(
    async (postId: string) => {
      try {
        console.log(`[useFeed] loadFromAnchor START: postId=${postId}`);
        dispatch({ type: "LOAD_FROM_ANCHOR_START" });

        resetIterators();

        const config = feedConfigRef.current;
        const controller = feedControllerRef.current;

        if (controller) {
          const posts = await controller.getInitialSlice({
            targetPostId: postId,
            limit: config.limit,
            contextSize: 10,
          });
          dispatch({
            type: "LOAD_FROM_ANCHOR_SUCCESS",
            posts,
            hasMore: posts.length > 0,
            anchorPostId: postId,
          });
          resetIterators();
          return;
        }

        const activeClient = await getActiveClient();
        if (!activeClient) throw new Error("No active client");
        const { client } = activeClient;

        const anchorStatus = await withRetry(
          () => client.v1.statuses.$select(postId).fetch(),
          RequestPriority.NORMAL,
          `status_${postId}`,
        );
        const anchorPost = transformStatus(anchorStatus);
        const context = await withRetry(
          () => client.v1.statuses.$select(postId).context.fetch(),
          RequestPriority.NORMAL,
          `context_${postId}`,
        );
        const ancestors = context.ancestors.map(transformStatus);
        const descendants = context.descendants.map(transformStatus);
        const posts = [...descendants.reverse(), anchorPost, ...ancestors];

        dispatch({
          type: "LOAD_FROM_ANCHOR_SUCCESS",
          posts,
          hasMore: ancestors.length > 0,
          anchorPostId: postId,
        });
        resetIterators();

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
