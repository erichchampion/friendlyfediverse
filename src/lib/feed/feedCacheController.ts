/**
 * Feed Cache Controller
 * Per-feed instance: reads from FeedPostStore and fills via fetcher.
 * Initial load: no target -> fetch latest from server; with target -> check cache first.
 * Scroll: getOlderSlice / getNewerSlice from cache; background prefetch fills store.
 * Older exhaustion: when older page returns only already-cached IDs, stop older API.
 */
import type { Post } from "@types";
import type { IFeedPostStore } from "./feedPostStore";
import { generateOlderId } from "../api/mastodonRequests";

export interface FeedCacheControllerFetcher {
  fetchLatest(): Promise<Post[]>;
  fetchContextAround(targetPostId: string): Promise<Post[]>;
  getOlderPaginator(maxId: string, limit: number): any; // Paginator that preserves Link headers
  getNewerPaginator(sinceId: string, limit: number): any;
}

export interface FeedCacheControllerOptions {
  feedKey: string;
  fetchLatest: () => Promise<Post[]>;
  fetchContextAround: (targetPostId: string) => Promise<Post[]>;
  getOlderPaginator: (maxId: string, limit: number) => any;
  getNewerPaginator: (sinceId: string, limit: number) => any;
  pageSize?: number;
  contextSize?: number;
}

export interface GetInitialSliceOptions {
  targetPostId?: string;
  limit: number;
  contextSize?: number;
}

export interface FeedCacheController {
  getInitialSlice(options: GetInitialSliceOptions): Promise<Post[]>;
  getOlderSlice(olderThanId: string, limit: number): Promise<Post[]>;
  getNewerSlice(newerThanId: string, limit: number): Promise<Post[]>;
  prefetchOlderPage(maxId: string): Promise<void>;
  prefetchNewerPage(sinceId: string): Promise<void>;
  isOlderServerExhausted(): boolean;
  /** Clear older exhausted state so we can request older posts from server again (e.g. when user reaches end of cache). */
  clearOlderServerExhausted(): void;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_CONTEXT_SIZE = 10;

export function createFeedCacheController(
  store: IFeedPostStore,
  options: FeedCacheControllerOptions,
): FeedCacheController {
  const {
    feedKey,
    fetchLatest,
    fetchContextAround,
    getOlderPaginator,
    getNewerPaginator,
    pageSize = DEFAULT_PAGE_SIZE,
    contextSize = DEFAULT_CONTEXT_SIZE,
  } = options;

  let olderServerExhausted = false;
  let consecutiveEmptyOlderResults = 0;
  const MAX_EMPTY_JUMPS = 5;
  let olderPaginator: any = null;
  let newerPaginator: any = null;

  return {
    async getInitialSlice(opts: GetInitialSliceOptions): Promise<Post[]> {
      const { targetPostId, limit, contextSize: ctx = contextSize } = opts;

      if (!targetPostId) {
        const posts = await fetchLatest();
        if (posts.length > 0) {
          await store.addPosts(feedKey, posts);
        }
        return posts;
      }

      const inCache = await store.hasPost(feedKey, targetPostId);
      if (inCache) {
        const { posts, found } = await store.getSliceAround(
          feedKey,
          targetPostId,
          ctx,
        );
        if (found) return posts;
      }

      const posts = await fetchContextAround(targetPostId);
      if (posts.length > 0) {
        await store.addPosts(feedKey, posts);
      }
      return posts;
    },

    async getOlderSlice(olderThanId: string, limit: number): Promise<Post[]> {
      return store.getPostsRange(feedKey, {
        olderThanId,
        limit,
      });
    },

    async getNewerSlice(newerThanId: string, limit: number): Promise<Post[]> {
      return store.getPostsRange(feedKey, {
        newerThanId: newerThanId,
        limit,
      });
    },

    async prefetchOlderPage(maxId: string): Promise<void> {
      if (olderServerExhausted) return;
      
      let posts: Post[] = [];
      let jumps = 0;
      let currentMaxId = maxId;

      // Ensure we have an active Native Iterator, using maxId as the initial starting point
      if (!olderPaginator) {
        olderPaginator = getOlderPaginator(currentMaxId, pageSize);
      }

      while (jumps <= consecutiveEmptyOlderResults && jumps < MAX_EMPTY_JUMPS) {
        // Await the native Mastodon iterator `.next()` (automatically tracks opaque/Snowflake Links internally)
        const result = await olderPaginator.next();
        posts = result.value || [];

        if (posts && posts.length > 0) {
          consecutiveEmptyOlderResults = 0;
          break;
        }

        // If the native iterator is NOT truly exhausted, just natively empty, allow it to continue cleanly
        if (!result.done) {
          consecutiveEmptyOlderResults++;
          return; // Wait for next caller scroll cycle to try again natively
        }

        // If the native iterator completely completely gives up, initiate gap jump sequence
        jumps++;
        consecutiveEmptyOlderResults++;
        olderPaginator = null; // Discard broken native iterator
        
        if (consecutiveEmptyOlderResults >= MAX_EMPTY_JUMPS) {
          console.log(`[feedCacheController] Server exhausted after ${MAX_EMPTY_JUMPS} consecutive empty results for feed ${feedKey}`);
          olderServerExhausted = true;
          return;
        }

        // Exclude completely opaque feeds from gap jumping (favourites/bookmarks cannot synthesize older IDs)
        if (feedKey.includes("favourites") || feedKey.includes("bookmarks")) {
           console.log(`[feedCacheController] Opaque feed type completely exhausted. Feed: ${feedKey}`);
           olderServerExhausted = true;
           return;
        }

        const jumpHours = Math.pow(2, consecutiveEmptyOlderResults - 1);
        const jumpMs = jumpHours * 60 * 60 * 1000;
        currentMaxId = generateOlderId(maxId, jumpMs);
        console.log(`[feedCacheController] gap detected, jumping back ${jumpHours} hours to ${currentMaxId} for feed ${feedKey}`);
        
        // Seed the gap-jumped retry iterator
        olderPaginator = getOlderPaginator(currentMaxId, pageSize);
      }

      if (!posts || posts.length === 0) return;

      const allAlreadyCached = await Promise.all(
        posts.map((p) => store.hasPost(feedKey, p.id)),
      ).then((bools) => bools.every(Boolean));
      
      if (allAlreadyCached) {
        olderServerExhausted = true;
        olderPaginator = null;
        return;
      }
      await store.addPosts(feedKey, posts);
    },

    async prefetchNewerPage(sinceId: string): Promise<void> {
      if (!newerPaginator) {
        newerPaginator = getNewerPaginator(sinceId, pageSize);
      }
      const result = await newerPaginator.next();
      const posts = result.value || [];
      if (posts && posts.length > 0) {
        await store.addPosts(feedKey, posts);
      }
      if (result.done) newerPaginator = null;
    },

    isOlderServerExhausted(): boolean {
      return olderServerExhausted;
    },

    clearOlderServerExhausted(): void {
      olderServerExhausted = false;
      consecutiveEmptyOlderResults = 0;
    },
  };
}
