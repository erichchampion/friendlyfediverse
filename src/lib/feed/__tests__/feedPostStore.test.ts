/**
 * Tests for FeedPostStore
 * TDD: feed cache layer - persistent store for post data per feed
 */
import type { Post } from "@types";
import { createFeedPostStore } from "../feedPostStore";

const FEED_KEY_A = "instance1_feed_home";
const FEED_KEY_B = "instance1_feed_public";

function makePost(id: string, createdAt?: string): Post {
  return {
    id,
    uri: `https://example.com/posts/${id}`,
    createdAt: createdAt ?? "2024-01-01T00:00:00Z",
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

describe("FeedPostStore", () => {
  let store: ReturnType<typeof createFeedPostStore>;

  beforeEach(async () => {
    store = createFeedPostStore();
    await store.clearAll();
  });

  describe("getPostsRange", () => {
    it("returns empty array when store is empty", async () => {
      const result = await store.getPostsRange(FEED_KEY_A, { limit: 20 });
      expect(result).toEqual([]);
    });

    it("returns posts after addPosts (newest first by id)", async () => {
      const posts = [makePost("100"), makePost("200"), makePost("300")];
      await store.addPosts(FEED_KEY_A, posts);
      const result = await store.getPostsRange(FEED_KEY_A, { limit: 10 });
      expect(result).toHaveLength(3);
      expect(result.map((p) => p.id)).toEqual(["300", "200", "100"]);
    });

    it("respects olderThanId - returns posts older than given id", async () => {
      const posts = [
        makePost("100"),
        makePost("200"),
        makePost("300"),
        makePost("400"),
      ];
      await store.addPosts(FEED_KEY_A, posts);
      const result = await store.getPostsRange(FEED_KEY_A, {
        olderThanId: "300",
        limit: 10,
      });
      expect(result.map((p) => p.id)).toEqual(["200", "100"]);
    });

    it("respects newerThanId - returns posts newer than given id", async () => {
      const posts = [
        makePost("100"),
        makePost("200"),
        makePost("300"),
        makePost("400"),
      ];
      await store.addPosts(FEED_KEY_A, posts);
      const result = await store.getPostsRange(FEED_KEY_A, {
        newerThanId: "200",
        limit: 10,
      });
      expect(result.map((p) => p.id)).toEqual(["400", "300"]);
    });

    it("respects limit", async () => {
      const posts = Array.from({ length: 50 }, (_, i) =>
        makePost(String(100 + i)),
      );
      await store.addPosts(FEED_KEY_A, posts);
      const result = await store.getPostsRange(FEED_KEY_A, { limit: 5 });
      expect(result).toHaveLength(5);
      expect(result.map((p) => p.id)).toEqual([
        "149",
        "148",
        "147",
        "146",
        "145",
      ]);
    });
  });

  describe("key isolation", () => {
    it("isolates data by feedKey - different feeds do not overlap", async () => {
      await store.addPosts(FEED_KEY_A, [makePost("1"), makePost("2")]);
      await store.addPosts(FEED_KEY_B, [makePost("3"), makePost("4")]);

      const fromA = await store.getPostsRange(FEED_KEY_A, { limit: 10 });
      const fromB = await store.getPostsRange(FEED_KEY_B, { limit: 10 });

      expect(fromA.map((p) => p.id)).toEqual(["2", "1"]);
      expect(fromB.map((p) => p.id)).toEqual(["4", "3"]);
    });
  });

  describe("trim to 4K", () => {
    it("trims to max posts per feed when exceeding limit", async () => {
      const max = 4096;
      const posts = Array.from({ length: max + 100 }, (_, i) =>
        makePost(String(100000 + i)),
      );
      await store.addPosts(FEED_KEY_A, posts);

      const result = await store.getPostsRange(FEED_KEY_A, { limit: max + 1 });
      expect(result.length).toBeLessThanOrEqual(max);
      expect(result.length).toBe(max);
      // Newest should be kept (highest ids)
      expect(result[0].id).toBe(String(100000 + max + 100 - 1));
      expect(result[result.length - 1].id).toBe(String(100000 + 100));
    });
  });

  describe("getSliceAround", () => {
    it("returns slice around target post id when target in store", async () => {
      const posts = Array.from({ length: 20 }, (_, i) =>
        makePost(String(100 + i)),
      );
      await store.addPosts(FEED_KEY_A, posts);
      const { posts: slice, found } = await store.getSliceAround(
        FEED_KEY_A,
        "105",
        5,
      );
      expect(found).toBe(true);
      expect(slice.map((p) => p.id)).toContain("105");
      expect(slice.length).toBeLessThanOrEqual(11);
    });

    it("returns found: false when target not in store", async () => {
      await store.addPosts(FEED_KEY_A, [makePost("100"), makePost("200")]);
      const { posts: slice, found } = await store.getSliceAround(
        FEED_KEY_A,
        "999",
        5,
      );
      expect(found).toBe(false);
      expect(slice).toEqual([]);
    });
  });

  describe("hasPost", () => {
    it("returns true when post id exists in feed", async () => {
      await store.addPosts(FEED_KEY_A, [makePost("100"), makePost("200")]);
      expect(await store.hasPost(FEED_KEY_A, "100")).toBe(true);
      expect(await store.hasPost(FEED_KEY_A, "200")).toBe(true);
    });

    it("returns false when post id not in feed", async () => {
      await store.addPosts(FEED_KEY_A, [makePost("100")]);
      expect(await store.hasPost(FEED_KEY_A, "999")).toBe(false);
    });

    it("returns false for different feedKey", async () => {
      await store.addPosts(FEED_KEY_A, [makePost("100")]);
      expect(await store.hasPost(FEED_KEY_B, "100")).toBe(false);
    });
  });
});
