import type { Post } from "@types";

/**
 * Apply a favourite state change to a post, handling boosts by updating both
 * the wrapper and the boosted status. Counts are optional; when omitted the
 * existing count is preserved.
 */
export function applyFavouriteStateToPost(
  post: Post,
  targetPostId: string,
  favourited: boolean,
  favouritesCount?: number,
): Post {
  const applyState = (target: Post): Post => ({
    ...target,
    favourited,
    favouritesCount:
      typeof favouritesCount === "number"
        ? favouritesCount
        : target.favouritesCount,
  });

  if (post.id === targetPostId) {
    return applyState(post);
  }

  if (post.reblog && post.reblog.id === targetPostId) {
    const updatedReblog = applyState(post.reblog);
    return {
      ...post,
      favourited,
      favouritesCount:
        typeof favouritesCount === "number"
          ? favouritesCount
          : post.favouritesCount,
      reblog: updatedReblog,
    };
  }

  return post;
}
