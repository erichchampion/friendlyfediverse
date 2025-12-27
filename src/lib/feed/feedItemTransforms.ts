import type { Post } from "@/types/post";

/**
 * Feed item types for virtual scroll with sticky headers
 */
export type FeedItem =
  | { type: "header"; post: Post; id: string }
  | { type: "content"; post: Post; id: string };

/**
 * Transforms a flat array of posts into alternating header/content items
 * for use with FlashList's stickyHeaderIndices feature.
 *
 * @param posts - Array of posts to transform
 * @returns Array of feed items alternating between headers and content
 *
 * @example
 * const posts = [post1, post2];
 * const items = transformPostsToFeedItems(posts);
 * // Returns: [
 * //   { type: 'header', post: post1, id: 'post1-header' },
 * //   { type: 'content', post: post1, id: 'post1-content' },
 * //   { type: 'header', post: post2, id: 'post2-header' },
 * //   { type: 'content', post: post2, id: 'post2-content' }
 * // ]
 */
export function transformPostsToFeedItems(posts: Post[]): FeedItem[] {
  return posts.flatMap((post) => [
    { type: "header", post, id: `${post.id}-header` },
    { type: "content", post, id: `${post.id}-content` },
  ]);
}

/**
 * Calculates which indices in the feed items array should be sticky headers.
 * Headers are always at even indices (0, 2, 4, ...) in the transformed array.
 *
 * @param feedItems - Array of feed items (headers and content)
 * @returns Array of indices where headers are located
 *
 * @example
 * const items = transformPostsToFeedItems([post1, post2]);
 * const indices = calculateStickyIndices(items);
 * // Returns: [0, 2] - indices where headers are located
 */
export function calculateStickyIndices(feedItems: FeedItem[]): number[] {
  return feedItems
    .map((item, index) => (item.type === "header" ? index : null))
    .filter((index): index is number => index !== null);
}
