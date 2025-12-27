/**
 * Application configuration
 * Phase 0: Basic configuration structure
 */

export const APP_CONFIG = {
  APP_NAME: "Friendly Fediverse",
  VERSION: "1.0.0",
  URL_SCHEME: "friendlyfediverse.com",
};

export const API_CONFIG = {
  DEFAULT_TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
};

export const CACHE_CONFIG = {
  POST_TTL: 30000, // 30 seconds
  STATUS_TTL: 120000, // 2 minutes
  CONTEXT_TTL: 60000, // 1 minute
  MAX_CACHE_SIZE: 1000, // Maximum number of cached items
};

export const FEED_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 40,
  PREFETCH_THRESHOLD: 20, // Load more when 20 items from top/bottom (reduced from 60 to prevent loading during active scrolling)
  MAX_TOTAL_POSTS: 200, // Cap total posts kept in memory/cache to prevent unbounded growth
};

export const VIDEO_CONFIG = {
  AUTO_PLAY: true,
  MUTED_BY_DEFAULT: true,
  PRELOAD: "metadata" as const,
};

export const SECURITY = {
  ENABLE_TOKEN_LOGGING: false, // Never enable in production
};

export const UI_CONFIG = {
  CONTENT_PREVIEW_LENGTH: 100, // characters
  PROFILE_BIO_MAX_LENGTH: 500,
  PROFILE_DISPLAY_NAME_MAX_LENGTH: 30,
  PROFILE_MAX_FIELDS: 4,
  VISIBILITY_UPDATE_INTERVAL: 2000, // ms
  VISIBILITY_BUFFER_RATIO: 0.5, // proportion of viewport added above/below when checking visibility
  SCROLL_DEBOUNCE_DELAY: 1000, // ms - debounce for pagination and end reached
  SCROLL_RECOVERY_DELAY: 100, // ms
  SCROLL_RESTORE_MAX_ATTEMPTS: 3, // number of retries when waiting for layout measurement
  PAGINATION_THRESHOLD: 200, // px from bottom to trigger pagination
  PROACTIVE_LOAD_CHECK_INTERVAL: 1000, // ms - interval for checking visible posts changes for proactive loading
  // Grid view scroll positioning
  GRID_SCROLL_PADDING_MAX: 50, // Maximum padding offset in pixels for grid scroll positioning
  GRID_SCROLL_PADDING_RATIO: 0.05, // 5% of viewport height for grid scroll padding
  GRID_POSITION_MEASURE_RETRIES: 10, // Number of retries when waiting for grid item position measurement
} as const;

export const VIRTUAL_SCROLL_UI_CONFIG = {
  // Optimized for stability when loading more posts
  // Larger window size prevents VirtualizedList from resetting when new posts load
  INITIAL_NUM_TO_RENDER: 10, // Initial items to render
  MAX_TO_RENDER_PER_BATCH: 5, // Increased from 3 for smoother loading
  WINDOW_SIZE: 21, // Increased from 10 to maintain larger virtual window
  // This prevents the window from resetting when new posts are appended
  // Window size of 21 means ~10 screens above and below visible area
  // Increased batching period to reduce VirtualizedList update warnings
  // Higher value gives React Native more time to batch updates
  UPDATE_CELLS_BATCHING_PERIOD: 200, // ms (increased from 50ms)
  ITEM_VISIBLE_PERCENT_THRESHOLD: 50, // %
  MINIMUM_VIEW_TIME: 200, // ms
} as const;

export const API_LIMITS = {
  FOLLOWED_ACCOUNTS: 80,
  FOLLOWED_HASHTAGS: 80,
  TRENDING_HASHTAGS: 5,
} as const;
