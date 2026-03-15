/**
 * useComments Hook
 * Manages comment fetching and state for posts
 */

import { useState, useEffect, useCallback } from "react";
import { getActiveClient, withRetry, RequestPriority } from "@lib/api/client";
import { transformStatus } from "@lib/api/timeline";
import type { Post } from "@types";

export interface UseCommentsOptions {
  postId: string;
  parentVisibility?: "public" | "unlisted" | "private" | "direct";
  onCommentCountUpdate?: (count: number) => void;
  autoFetch?: boolean; // If false, comments are only fetched when refreshComments is called
}

export interface UseCommentsResult {
  comments: Post[];
  isLoading: boolean;
  error: string | null;
  createComment: (content: string, inReplyToId?: string) => Promise<void>;
  refreshComments: () => Promise<void>;
  removeComment: (commentId: string) => void;
}

/**
 * Hook for managing comments on a post
 * Set autoFetch to false to prevent fetching on mount (lazy loading)
 */
export function useComments({
  postId,
  parentVisibility = "public",
  onCommentCountUpdate,
  autoFetch = true,
}: UseCommentsOptions): UseCommentsResult {
  const [comments, setComments] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch comments from the API
   */
  const fetchComments = useCallback(async () => {
    if (!postId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const clientData = await getActiveClient();
      if (!clientData) {
        setError("No active client available");
        setIsLoading(false);
        return;
      }

      // Use request queue with deduplication to prevent duplicate API calls
      const context = await withRetry(
        () => clientData.client.v1.statuses.$select(postId).context.fetch(),
        RequestPriority.NORMAL,
        `comments_${postId}`, // Cache key for request deduplication
      );

      // Get descendants (replies to this post) and transform to our Post type
      const fetchedComments = (context.descendants || []).map(transformStatus);
      setComments(fetchedComments);

      // Notify parent of comment count
      if (onCommentCountUpdate) {
        onCommentCountUpdate(fetchedComments.length);
      }
    } catch (err) {
      console.error("[useComments] Error fetching comments:", err);
      setError("Failed to load comments");
    } finally {
      setIsLoading(false);
    }
  }, [postId, onCommentCountUpdate]);

  /**
   * Create a new comment or reply
   */
  const createComment = useCallback(
    async (content: string, inReplyToId?: string) => {
      if (!content.trim()) {
        throw new Error("Comment content cannot be empty");
      }

      try {
        const clientData = await getActiveClient();
        if (!clientData) {
          throw new Error("No active client available");
        }

        // Use request queue with HIGH priority for user-initiated actions
        const newComment = await withRetry(
          () =>
            clientData.client.v1.statuses.create({
              status: content.trim(),
              inReplyToId: inReplyToId || postId,
              visibility: parentVisibility,
            }),
          RequestPriority.HIGH,
        );

        // Transform and add new comment to the list
        const transformedComment = transformStatus(newComment);
        setComments(
          (prevComments) => [transformedComment, ...prevComments],
        );

        // Update comment count
        if (onCommentCountUpdate) {
          onCommentCountUpdate(comments.length + 1);
        }
      } catch (err) {
        console.error("[useComments] Error creating comment:", err);
        throw err;
      }
    },
    [postId, comments.length, onCommentCountUpdate],
  );

  /**
   * Refresh comments manually
   */
  const refreshComments = useCallback(async () => {
    await fetchComments();
  }, [fetchComments]);

  /**
   * Remove a comment from the list (e.g., after deletion)
   */
  const removeComment = useCallback(
    (commentId: string) => {
      console.log(`[useComments] Removing comment: ${commentId}`);
      setComments((prevComments) => {
        const filtered = prevComments.filter(
          (comment) => comment.id !== commentId,
        );
        // Update comment count
        if (onCommentCountUpdate) {
          onCommentCountUpdate(filtered.length);
        }
        return filtered;
      });
    },
    [onCommentCountUpdate],
  );

  // Fetch comments on mount (only if autoFetch is enabled)
  useEffect(() => {
    if (autoFetch) {
      fetchComments();
    }
  }, [fetchComments, autoFetch]);

  return {
    comments,
    isLoading,
    error,
    createComment,
    refreshComments,
    removeComment,
  };
}
