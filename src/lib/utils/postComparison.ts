import type { MediaAttachment } from "@types";

/**
 * Checks if media attachments have changed by comparing length, URLs, and IDs
 * This is more thorough than just checking array length, as it detects
 * when media URLs change even if the count remains the same
 *
 * @param prev - Previous media attachments array
 * @param next - Next media attachments array
 * @returns true if media has changed, false otherwise
 */
export function haveMediaAttachmentsChanged(
  prev: MediaAttachment[],
  next: MediaAttachment[],
): boolean {
  // Quick check: different lengths means change
  if (prev.length !== next.length) {
    return true;
  }

  // Deep check: compare URLs and IDs of each media item
  return prev.some(
    (media, index) =>
      media.url !== next[index]?.url || media.id !== next[index]?.id,
  );
}








