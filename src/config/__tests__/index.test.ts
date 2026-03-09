/**
 * Tests for application configuration
 */

import {
  APP_CONFIG,
  API_CONFIG,
  CACHE_CONFIG,
  FEED_CONFIG,
  VIDEO_CONFIG,
  SECURITY,
  UI_CONFIG,
  VIRTUAL_SCROLL_UI_CONFIG,
  API_LIMITS,
} from "../index";

describe("Application Configuration", () => {
  describe("APP_CONFIG", () => {
    it("should have all required properties", () => {
      expect(APP_CONFIG).toHaveProperty("APP_NAME");
      expect(APP_CONFIG).toHaveProperty("VERSION");
      expect(APP_CONFIG).toHaveProperty("URL_SCHEME");
    });

    it("should have string values", () => {
      expect(typeof APP_CONFIG.APP_NAME).toBe("string");
      expect(typeof APP_CONFIG.VERSION).toBe("string");
      expect(typeof APP_CONFIG.URL_SCHEME).toBe("string");
    });
  });

  describe("API_CONFIG", () => {
    it("should have all required properties", () => {
      expect(API_CONFIG).toHaveProperty("DEFAULT_TIMEOUT");
      expect(API_CONFIG).toHaveProperty("MAX_RETRIES");
      expect(API_CONFIG).toHaveProperty("RETRY_DELAY");
    });

    it("should have all values as positive numbers", () => {
      Object.values(API_CONFIG).forEach((value) => {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThan(0);
      });
    });
  });

  describe("FEED_CONFIG", () => {
    it("should have all required properties", () => {
      expect(FEED_CONFIG).toHaveProperty("DEFAULT_PAGE_SIZE");
      expect(FEED_CONFIG).toHaveProperty("MAX_PAGE_SIZE");
      expect(FEED_CONFIG).toHaveProperty("PREFETCH_THRESHOLD");
    });

    it("should have DEFAULT_PAGE_SIZE of 20", () => {
      expect(FEED_CONFIG.DEFAULT_PAGE_SIZE).toBe(20);
    });

    it("should have all values as positive integers", () => {
      Object.values(FEED_CONFIG).forEach((value) => {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      });
    });
  });

  describe("UI_CONFIG", () => {
    it("should have all required properties", () => {
      expect(UI_CONFIG).toHaveProperty("CONTENT_PREVIEW_LENGTH");
      expect(UI_CONFIG).toHaveProperty("PROFILE_BIO_MAX_LENGTH");
      expect(UI_CONFIG).toHaveProperty("PROFILE_DISPLAY_NAME_MAX_LENGTH");
      expect(UI_CONFIG).toHaveProperty("PROFILE_MAX_FIELDS");
      expect(UI_CONFIG).toHaveProperty("VISIBILITY_UPDATE_INTERVAL");
      expect(UI_CONFIG).toHaveProperty("SCROLL_DEBOUNCE_DELAY");
      expect(UI_CONFIG).toHaveProperty("SCROLL_RECOVERY_DELAY");
    });

    it("should have CONTENT_PREVIEW_LENGTH of 100", () => {
      expect(UI_CONFIG.CONTENT_PREVIEW_LENGTH).toBe(100);
    });

    it("should have PROFILE_BIO_MAX_LENGTH of 500", () => {
      expect(UI_CONFIG.PROFILE_BIO_MAX_LENGTH).toBe(500);
    });

    it("should have PROFILE_DISPLAY_NAME_MAX_LENGTH of 30", () => {
      expect(UI_CONFIG.PROFILE_DISPLAY_NAME_MAX_LENGTH).toBe(30);
    });

    it("should have PROFILE_MAX_FIELDS of 4", () => {
      expect(UI_CONFIG.PROFILE_MAX_FIELDS).toBe(4);
    });

    it("should have all values as positive numbers", () => {
      Object.values(UI_CONFIG).forEach((value) => {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThan(0);
      });
    });
  });

  describe("VIRTUAL_SCROLL_UI_CONFIG", () => {
    it("should have all required properties", () => {
      expect(VIRTUAL_SCROLL_UI_CONFIG).toHaveProperty("INITIAL_NUM_TO_RENDER");
      expect(VIRTUAL_SCROLL_UI_CONFIG).toHaveProperty(
        "MAX_TO_RENDER_PER_BATCH",
      );
      expect(VIRTUAL_SCROLL_UI_CONFIG).toHaveProperty("WINDOW_SIZE");
      expect(VIRTUAL_SCROLL_UI_CONFIG).toHaveProperty(
        "UPDATE_CELLS_BATCHING_PERIOD",
      );
      expect(VIRTUAL_SCROLL_UI_CONFIG).toHaveProperty(
        "ITEM_VISIBLE_PERCENT_THRESHOLD",
      );
      expect(VIRTUAL_SCROLL_UI_CONFIG).toHaveProperty("MINIMUM_VIEW_TIME");
    });

    it("should have INITIAL_NUM_TO_RENDER of 10", () => {
      // Optimized value to prevent blank screens during updates
      expect(VIRTUAL_SCROLL_UI_CONFIG.INITIAL_NUM_TO_RENDER).toBe(10);
    });

    it("should have MAX_TO_RENDER_PER_BATCH of 5", () => {
      // Increased from 3 for smoother loading and better stability
      expect(VIRTUAL_SCROLL_UI_CONFIG.MAX_TO_RENDER_PER_BATCH).toBe(5);
    });

    it("should have WINDOW_SIZE of 21", () => {
      // Increased from 10 to maintain larger virtual window
      // Prevents VirtualizedList from resetting when new posts are appended
      expect(VIRTUAL_SCROLL_UI_CONFIG.WINDOW_SIZE).toBe(21);
    });

    it("should have UPDATE_CELLS_BATCHING_PERIOD of 200", () => {
      // Increased value to give React Native more time to batch updates
      expect(VIRTUAL_SCROLL_UI_CONFIG.UPDATE_CELLS_BATCHING_PERIOD).toBe(200);
    });

    it("should have ITEM_VISIBLE_PERCENT_THRESHOLD of 50", () => {
      expect(VIRTUAL_SCROLL_UI_CONFIG.ITEM_VISIBLE_PERCENT_THRESHOLD).toBe(50);
    });

    it("should have all values as positive numbers", () => {
      Object.values(VIRTUAL_SCROLL_UI_CONFIG).forEach((value) => {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThan(0);
      });
    });
  });

  describe("API_LIMITS", () => {
    it("should have all required properties", () => {
      expect(API_LIMITS).toHaveProperty("FOLLOWED_ACCOUNTS");
      expect(API_LIMITS).toHaveProperty("FOLLOWED_HASHTAGS");
      expect(API_LIMITS).toHaveProperty("TRENDING_HASHTAGS");
    });

    it("should have FOLLOWED_ACCOUNTS of 80", () => {
      expect(API_LIMITS.FOLLOWED_ACCOUNTS).toBe(80);
    });

    it("should have FOLLOWED_HASHTAGS of 80", () => {
      expect(API_LIMITS.FOLLOWED_HASHTAGS).toBe(80);
    });

    it("should have TRENDING_HASHTAGS of 5", () => {
      expect(API_LIMITS.TRENDING_HASHTAGS).toBe(5);
    });

    it("should have all values as positive integers", () => {
      Object.values(API_LIMITS).forEach((value) => {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      });
    });
  });
});
