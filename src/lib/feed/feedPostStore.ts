/**
 * Feed Post Store
 * Persistent store for timeline post data per feed (server + account + feed).
 * Keyed by feedKey; max 4K posts per feed; ordered by post id for range reads.
 * Platform: in-memory for tests; IndexedDB on web; chunked key-value on native.
 */
import type { Post } from "@types";
import { FEED_CACHE_CONFIG } from "@lib/storage/constants";

export interface GetPostsRangeOptions {
  olderThanId?: string;
  newerThanId?: string;
  limit: number;
}

export interface GetSliceAroundResult {
  posts: Post[];
  found: boolean;
}

export interface IFeedPostStore {
  getPostsRange(
    feedKey: string,
    options: GetPostsRangeOptions,
  ): Promise<Post[]>;
  addPosts(feedKey: string, posts: Post[]): Promise<void>;
  getSliceAround(
    feedKey: string,
    targetPostId: string,
    contextSize: number,
  ): Promise<GetSliceAroundResult>;
  hasPost(feedKey: string, postId: string): Promise<boolean>;
  clearAll(): Promise<void>;
}

const MAX_POSTS = FEED_CACHE_CONFIG.MAX_POSTS_PER_FEED;

/**
 * In-memory implementation: map feedKey -> sorted (by id desc) array of posts.
 * Mastodon ids are sortable (snowflake); newer = larger id.
 */
function createInMemoryStore(): IFeedPostStore {
  const byFeed = new Map<string, Post[]>();

  function getSorted(feedKey: string): Post[] {
    const posts = byFeed.get(feedKey) ?? [];
    return [...posts].sort((a, b) => {
      return String(b.id).localeCompare(String(a.id), undefined, {
        numeric: true,
      });
    });
  }

  function setSorted(feedKey: string, posts: Post[]): void {
    const sorted = [...posts].sort((a, b) => {
      return String(b.id).localeCompare(String(a.id), undefined, {
        numeric: true,
      });
    });
    const trimmed = sorted.slice(0, MAX_POSTS);
    byFeed.set(feedKey, trimmed);
  }

  return {
    async getPostsRange(
      feedKey: string,
      options: GetPostsRangeOptions,
    ): Promise<Post[]> {
      const { olderThanId, newerThanId, limit } = options;
      let posts = getSorted(feedKey);
      if (newerThanId != null) {
        posts = posts.filter(
          (p) =>
            String(p.id).localeCompare(String(newerThanId), undefined, {
              numeric: true,
            }) > 0,
        );
      }
      if (olderThanId != null) {
        posts = posts.filter(
          (p) =>
            String(p.id).localeCompare(String(olderThanId), undefined, {
              numeric: true,
            }) < 0,
        );
      }
      return posts.slice(0, limit);
    },

    async addPosts(feedKey: string, incoming: Post[]): Promise<void> {
      const existing = byFeed.get(feedKey) ?? [];
      const byId = new Map<string, Post>();
      for (const p of existing) {
        byId.set(p.id, p);
      }
      for (const p of incoming) {
        byId.set(p.id, p);
      }
      const merged = Array.from(byId.values());
      setSorted(feedKey, merged);
    },

    async getSliceAround(
      feedKey: string,
      targetPostId: string,
      contextSize: number,
    ): Promise<GetSliceAroundResult> {
      const sorted = getSorted(feedKey);
      const index = sorted.findIndex((p) => p.id === targetPostId);
      if (index === -1) {
        return { posts: [], found: false };
      }
      const start = Math.max(0, index - contextSize);
      const end = Math.min(sorted.length, index + contextSize + 1);
      const posts = sorted.slice(start, end);
      return { posts, found: true };
    },

    async hasPost(feedKey: string, postId: string): Promise<boolean> {
      const posts = byFeed.get(feedKey) ?? [];
      return posts.some((p) => p.id === postId);
    },

    async clearAll(): Promise<void> {
      byFeed.clear();
    },
  };
}

/**
 * Create the feed post store for the current environment.
 * Uses in-memory store (tests and fallback); can be extended for IndexedDB (web) and chunked storage (native).
 */
export function createFeedPostStore(): IFeedPostStore {
  return createInMemoryStore();
}
