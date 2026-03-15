/**
 * Application constants
 * Phase 1: Updated with storage constants
 */

export const ROUTES = {
  INDEX: "/",
  LOGIN: "/(auth)/login",
  INSTANCE_SELECTOR: "/(auth)/instance-selector",
  FEED: "/(tabs)/feed",
  SEARCH: "/(tabs)/search",
  SETTINGS: "/(tabs)/settings",
  COMPOSE: "/modals/compose",
  IMAGE_VIEWER: "/modals/image-viewer",
} as const;

export const STORAGE_KEYS = {
  AUTH_STATE: "auth_state",
  ACTIVE_INSTANCE: "active_instance",
  THEME_PREFERENCE: "theme_preference",
  GRID_VIEW_PREFERENCE: "grid_view_preference",
} as const;

export const ERROR_MESSAGES = {
  NETWORK_ERROR: "Network error. Please check your connection.",
  AUTH_FAILED: "Authentication failed. Please try again.",
  INSTANCE_NOT_FOUND: "Instance not found. Please check the URL.",
  RATE_LIMITED: "Too many requests. Please wait a moment.",
  UNKNOWN_ERROR: "An unknown error occurred.",
} as const;
