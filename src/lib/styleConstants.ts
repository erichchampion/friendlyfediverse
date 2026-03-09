/**
 * Style Constants
 * Shared constants for common style values to avoid magic strings and numbers
 */

export const STYLE_CONSTANTS = {
  FULL_WIDTH: "100%",
  FULL_HEIGHT: "100%",
  FLEX_MIN_WIDTH: 0, // Critical for flex items to respect container constraints on web
} as const;

export const ASPECT_RATIOS = {
  LINK_CARD: 1.91, // Common preview aspect ratio (1200x628)
} as const;
