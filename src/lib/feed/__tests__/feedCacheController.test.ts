/**
 * Tests for FeedCacheController
 * TDD: feed cache layer - controller that reads from store and fills via fetcher
 */
import type { Post } from "@types";
import { createFeedPostStore } from "../feedPostStore";
import { createFeedCacheController } from "../feedCacheController";

const FEED_KEY = "instance1_feed_home";

function makePost(id: string): Post {
  return {
    id,
    uri: `https://example.com/posts/${id}`,
    createdAt: "2024-01-01T00:00:00Z",
    content: `content-${id}`,
    visibility: "public",
    sensitive: false,
    spoilerText: "",
    mediaAttachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    reblogsCount: 0,
    favouritesCount: 0,
    repliesCount: 0,
    account: {
      id: "acct-1",
      username: "user",
      acct: "user",
      displayName: "User",
      avatar: "",
      header: "",
      followersCount: 0,
      followingCount: 0,
      statusesCount: 0,
      note: "",
      url: "",
      createdAt: "2024-01-01T00:00:00Z",
    },
    reblog: null,
    inReplyToId: null,
    inReplyToAccountId: null,
  };
}

describe("FeedCacheController", () => {
  let store: ReturnType<typeof createFeedPostStore>;
  let fetchLatest: jest.Mock;
  let fetchContextAround: jest.Mock;
  let fetchOlderPage: jest.Mock;
  let fetchNewerPage: jest.Mock;

  beforeEach(async () => {
    store = createFeedPostStore();
    await store.clearAll();
    fetchLatest = jest.fn();
    fetchContextAround = jest.fn();
    fetchOlderPage = jest.fn();
    fetchNewerPage = jest.fn();
  });

  describe("getInitialSlice (no target)", () => {
    it("always triggers server fetch for latest and returns result", async () => {
      const latest = [makePost("1"), makePost("2"), makePost("3")];
      fetchLatest.mockResolvedValue(latest);

      const controller = createFeedCacheController(store, {
        feedKey: FEED_KEY,
        fetchLatest,
        fetchContextAround,
        fetchOlderPage,
        fetchNewerPage,
      });

      const result = await controller.getInitialSlice({ limit: 20 });

      expect(fetchLatest).toHaveBeenCalledTimes(1);
      expect(result).toEqual(latest);
      const fromStore = await store.getPostsRange(FEED_KEY, { limit: 20 });
      expect(fromStore.map((p) => p.id)).toEqual(["3", "2", "1"]);
    });
  });

  describe("getInitialSlice (with target post ID)", () => {
    it("returns from cache when target is in cache (no server call)", async () => {
      await store.addPosts(FEED_KEY, [
        makePost("1"),
        makePost("2"),
        makePost("3"),
        makePost("4"),
        makePost("5"),
      ]);

      const controller = createFeedCacheController(store, {
        feedKey: FEED_KEY,
        fetchLatest,
        fetchContextAround,
        fetchOlderPage,
        fetchNewerPage,
      });

      const result = await controller.getInitialSlice({
        targetPostId: "3",
        limit: 20,
        contextSize: 2,
      });

      expect(fetchLatest).not.toHaveBeenCalled();
      expect(fetchContextAround).not.toHaveBeenCalled();
      expect(result.map((p) => p.id)).toContain("3");
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("triggers server fetch when target not in cache", async () => {
      const contextPosts = [
        makePost("2"),
        makePost("3"),
        makePost("4"),
      ];
      fetchContextAround.mockResolvedValue(contextPosts);

      const controller = createFeedCacheController(store, {
        feedKey: FEED_KEY,
        fetchLatest,
        fetchContextAround,
        fetchOlderPage,
        fetchNewerPage,
      });

      const result = await controller.getInitialSlice({
        targetPostId: "3",
        limit: 20,
        contextSize: 5,
      });

      expect(fetchContextAround).toHaveBeenCalledWith("3");
      expect(fetchLatest).not.toHaveBeenCalled();
      expect(result).toEqual(contextPosts);
      const fromStore = await store.getPostsRange(FEED_KEY, { limit: 10 });
      expect(fromStore.map((p) => p.id).sort()).toEqual(
        ["2", "3", "4"].sort(),
      );
    });
  });

  describe("getOlderSlice", () => {
    it("returns from cache and does not call fetch when posts in cache", async () => {
      await store.addPosts(FEED_KEY, [
        makePost("1"),
        makePost("2"),
        makePost("3"),
        makePost("4"),
      ]);

      const controller = createFeedCacheController(store, {
        feedKey: FEED_KEY,
        fetchLatest,
        fetchContextAround,
        fetchOlderPage,
        fetchNewerPage,
      });

      const result = await controller.getOlderSlice("3", 5);

      expect(result.map((p) => p.id)).toEqual(["2", "1"]);
      expect(fetchOlderPage).not.toHaveBeenCalled();
    });
  });

  describe("getNewerSlice", () => {
    it("returns from cache", async () => {
      await store.addPosts(FEED_KEY, [
        makePost("1"),
        makePost("2"),
        makePost("3"),
        makePost("4"),
      ]);

      const controller = createFeedCacheController(store, {
        feedKey: FEED_KEY,
        fetchLatest,
        fetchContextAround,
        fetchOlderPage,
        fetchNewerPage,
      });

      const result = await controller.getNewerSlice("2", 5);

      expect(result.map((p) => p.id)).toEqual(["4", "3"]);
    });
  });

  describe("older server exhausted", () => {
    it("when older page returns only already-cached IDs, isOlderServerExhausted becomes true", async () => {
      await store.addPosts(FEED_KEY, [
        makePost("100"),
        makePost("99"),
        makePost("98"),
      ]);
      fetchOlderPage.mockResolvedValue([makePost("99"), makePost("98")]);

      const controller = createFeedCacheController(store, {
        feedKey: FEED_KEY,
        fetchLatest,
        fetchContextAround,
        fetchOlderPage,
        fetchNewerPage,
      });

      expect(controller.isOlderServerExhausted()).toBe(false);

      await controller.prefetchOlderPage("100");

      expect(fetchOlderPage).toHaveBeenCalledWith("100", 20);
      expect(controller.isOlderServerExhausted()).toBe(true);

      controller.clearOlderServerExhausted();
      expect(controller.isOlderServerExhausted()).toBe(false);

      fetchOlderPage.mockResolvedValue([makePost("97"), makePost("96")]);
      await controller.prefetchOlderPage("98");
      expect(fetchOlderPage).toHaveBeenCalledWith("98", 20);
      const fromStore = await store.getPostsRange(FEED_KEY, {
        olderThanId: "98",
        limit: 10,
      });
      expect(fromStore.map((p) => p.id)).toContain("97");
    });
  });
});
