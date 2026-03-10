import { UI_CONFIG } from "@/config";
import type { Post } from "@types";

type LayoutMap = Map<string, { y: number; height: number }>;

export type ScrollRestoreOutcome = "exact" | "pending-layout" | "missing";

export interface AttemptScrollRestoreResult {
  outcome: ScrollRestoreOutcome;
  keepPending: boolean;
}

export interface AttemptScrollRestoreParams {
  targetPostId: string | null;
  postLayouts: LayoutMap;
  displayPosts: Post[];
  posts: Post[];
  averagePostHeight: number;
  scrollTo: (y: number) => void;
  maxAttempts?: number;
  delayMs?: number;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Attempts to restore scroll position to a target post.
 *
 * Returns whether we scrolled via an exact layout or an estimate, and whether
 * callers should keep any "pending scroll" flags set so a later layout pass
 * can refine the scroll position once the target has measured.
 */
export async function attemptScrollRestore({
  targetPostId,
  postLayouts,
  displayPosts,
  posts,
  averagePostHeight,
  scrollTo,
  maxAttempts = UI_CONFIG.SCROLL_RESTORE_MAX_ATTEMPTS,
  delayMs = UI_CONFIG.SCROLL_RECOVERY_DELAY,
}: AttemptScrollRestoreParams): Promise<AttemptScrollRestoreResult> {
  if (!targetPostId) {
    return { outcome: "missing", keepPending: false };
  }

  // Try a few times to find a measured layout for the post
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const layout = postLayouts.get(targetPostId);
    if (layout) {
      scrollTo(layout.y);
      return { outcome: "exact", keepPending: false };
    }
    await wait(delayMs);
  }

  // If the post exists in the current data, keep pending so we can scroll
  // precisely when its layout is measured.
  const existsInDisplay = displayPosts.some((p) => p.id === targetPostId);
  const existsInPosts = posts.some((p) => p.id === targetPostId);
  if (existsInDisplay || existsInPosts) {
    return { outcome: "pending-layout", keepPending: true };
  }

  // Target not present yet; keep pending so callers can retry when data updates
  return { outcome: "missing", keepPending: true };
}
