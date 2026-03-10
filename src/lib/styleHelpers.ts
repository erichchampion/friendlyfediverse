/**
 * Style Helpers
 * Reusable style objects and helper functions for common styling patterns
 */

import { Platform } from "react-native";
import { STYLE_CONSTANTS } from "./styleConstants";

/**
 * Full size constraints for elements that should fill their container
 * while respecting max dimensions
 */
export const fullSizeConstraints = {
  maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
  maxHeight: STYLE_CONSTANTS.FULL_HEIGHT,
} as const;

/**
 * Flex constraints for web to prevent React Native Web from generating
 * fixed-width classes that cause overflow issues
 */
export const flexWebConstraints = {
  maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
  minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
} as const;

/**
 * Web-specific grid container style
 * Uses flex instead of width to avoid React Native Web generating fixed-width classes
 *
 * @param mode - "grid" or "list" mode
 * @returns Style object for web grid containers, empty object otherwise
 */
export const getWebGridContainerStyle = (mode: "grid" | "list") => {
  if (mode === "grid" && Platform.OS === "web") {
    return {
      flex: 1,
      ...flexWebConstraints,
    };
  }
  return {};
};

/**
 * Web-specific list mode container style
 * Ensures containers use percentage widths instead of calculated pixel widths
 *
 * @param mode - "grid" or "list" mode
 * @returns Style object for web list containers, empty object otherwise
 */
export const getWebListContainerStyle = (mode: "grid" | "list") => {
  if (mode === "list" && Platform.OS === "web") {
    return {
      width: STYLE_CONSTANTS.FULL_WIDTH,
      maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
      minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
    };
  }
  return {};
};

/**
 * Web-specific list mode media item style
 * Prevents React Native Web from calculating fixed widths based on content
 *
 * @returns Style object for web list media items, empty object otherwise
 */
export const getWebListItemStyle = () => {
  if (Platform.OS === "web") {
    return {
      width: STYLE_CONSTANTS.FULL_WIDTH,
      maxWidth: STYLE_CONSTANTS.FULL_WIDTH,
      minWidth: STYLE_CONSTANTS.FLEX_MIN_WIDTH,
    };
  }
  return {};
};
