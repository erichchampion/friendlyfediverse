/**
 * Feed Cache Controller
 * Per-feed instance: reads from FeedPostStore and fills via fetcher.
 * Initial load: no target -> fetch latest from server; with target -> check cache first.
 * Scroll: getOlderSlice / getNewerSlice from cache; background prefetch fills store.
 * Older exhaustion: when older page returns only already-cached IDs, stop older API.
 */
import type { Post } from "@types";
import type { IFeedPostStore } from "./feedPostStore";

export interface FeedCacheControllerFetcher {
  fetchLatest(): Promise<Post[]>;
  fetchContextAround(targetPostId: string): Promise<Post[]>;
  fetchOlderPage(maxId: string, limit: number): Promise<Post[]>;
  fetchNewerPage(sinceId: string, limit: number): Promise<Post[]>;
}

export interface FeedCacheControllerOptions {
  feedKey: string;
  fetchLatest: () => Promise<Post[]>;
  fetchContextAround: (targetPostId: string) => Promise<Post[]>;
  fetchOlderPage: (maxId: string, limit: number) => Promise<Post[]>;
  fetchNewerPage: (sinceId: string, limit: number) => Promise<Post[]>;
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
    fetchOlderPage,
    fetchNewerPage,
    pageSize = DEFAULT_PAGE_SIZE,
    contextSize = DEFAULT_CONTEXT_SIZE,
  } = options;

  let olderServerExhausted = false;

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
      const posts = await fetchOlderPage(maxId, pageSize);
      if (!posts || posts.length === 0) return;
      const allAlreadyCached = await Promise.all(
        posts.map((p) => store.hasPost(feedKey, p.id)),
      ).then((bools) => bools.every(Boolean));
      if (allAlreadyCached) {
        olderServerExhausted = true;
        return;
      }
      await store.addPosts(feedKey, posts);
    },

    async prefetchNewerPage(sinceId: string): Promise<void> {
      const posts = await fetchNewerPage(sinceId, pageSize);
      if (posts && posts.length > 0) {
        await store.addPosts(feedKey, posts);
      }
    },

    isOlderServerExhausted(): boolean {
      return olderServerExhausted;
    },

    clearOlderServerExhausted(): void {
      olderServerExhausted = false;
    },
  };
}
