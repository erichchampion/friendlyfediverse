/**
 * Storage Constants
 * Defines version numbers and constants for storage layer
 */

/**
 * Current cache version
 * Increment this when storage schema changes to trigger migration
 */
export const CACHE_VERSION = 1;

/**
 * Cache expiration times (in milliseconds)
 */
export const CACHE_EXPIRATION = {
  FEED: 60 * 60 * 1000, // 60 minutes (increased from 5 to reduce API calls)
  PROFILE: 30 * 60 * 1000, // 30 minutes (increased from 15)
  INSTANCE_INFO: 24 * 60 * 60 * 1000, // 24 hours
  RELATIONSHIPS: 30 * 60 * 1000, // 30 minutes for follow/block/mute status
  STALE_TIME: 5 * 60 * 1000, // 5 minutes - when to refetch in background
} as const;

/**
 * Storage size limits
 */
export const STORAGE_LIMITS = {
  MAX_CACHED_POSTS: 500, // Increased from 200 with longer cache TTL
  MAX_CACHED_PROFILES: 100, // Increased from 50
  MAX_CACHED_RELATIONSHIPS: 1000, // Cache follow/block/mute status
} as const;

/**
 * Feed cache configuration (intermediate cache layer for timeline posts)
 */
export const FEED_CACHE_CONFIG = {
  MAX_POSTS_PER_FEED: 4096,
  PREFETCH_DELAY_MS: 300, // Optional delay between background prefetch pages
} as const;

/**
 * Request queue configuration
 */
export const REQUEST_QUEUE_CONFIG = {
  MAX_CONCURRENT_REQUESTS: 3, // Max parallel requests
  REQUEST_DELAY: 100, // Min delay between requests (ms)
  RATE_LIMIT_DELAY: 2000, // Delay when rate limited (ms)
  MAX_RETRIES: 3, // Max retry attempts
  RETRY_BACKOFF: 1000, // Base backoff time (ms)
} as const;

/**
 * Virtual scrolling configuration
 */
export const VIRTUAL_SCROLL_CONFIG = {
  WINDOW_SIZE: 30, // Number of posts to keep in memory
  OVERSCAN: 5, // Extra posts to render above/below viewport
  FETCH_THRESHOLD: 10, // Trigger fetch when this many posts from edge
  INITIAL_LOAD: 20, // Initial posts to load
} as const;

/**
 * Relationship batcher configuration
 */
export const RELATIONSHIP_BATCHER_CONFIG = {
  BATCH_SIZE: 40, // Mastodon API limit
  BATCH_DELAY: 50, // ms
  MAX_BATCH_INTERVAL: 2000, // ms
} as const;

/**
 * Request cache configuration
 */
export const REQUEST_CACHE_CONFIG = {
  CLEAR_DELAY: 5000, // ms - delay before clearing request cache
  DRAIN_CHECK_INTERVAL: 100, // ms - interval for checking queue drain
} as const;
