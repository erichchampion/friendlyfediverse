import type { Post } from "@types";
import { applyFavouriteStateToPost } from "../favourites";

const basePost: Post = {
  id: "post-1",
  uri: "https://example.com/posts/1",
  url: "https://example.com/@user/1",
  createdAt: "2024-01-01T00:00:00Z",
  content: "hello",
  visibility: "public",
  sensitive: false,
  spoilerText: "",
  mediaAttachments: [],
  mentions: [],
  tags: [],
  emojis: [],
  reblogsCount: 0,
  favouritesCount: 2,
  repliesCount: 0,
  reblogged: false,
  favourited: false,
  bookmarked: false,
  account: {
    id: "acct-1",
    username: "user",
    acct: "user",
    displayName: "User",
    avatar: "https://example.com/avatar.png",
    header: "https://example.com/header.png",
    followersCount: 0,
    followingCount: 0,
    statusesCount: 0,
    note: "",
    url: "https://example.com/@user",
    createdAt: "2024-01-01T00:00:00Z",
  },
  reblog: null,
  inReplyToId: null,
  inReplyToAccountId: null,
};

describe("applyFavouriteStateToPost", () => {
  it("updates top-level post favourite state and count", () => {
    const updated = applyFavouriteStateToPost(
      basePost,
      "post-1",
      true,
      basePost.favouritesCount + 1,
    );

    expect(updated.favourited).toBe(true);
    expect(updated.favouritesCount).toBe(3);
  });

  it("updates both wrapper and reblog when targeting boosted status", () => {
    const boosted: Post = {
      ...basePost,
      id: "boost-99",
      favourited: false,
      favouritesCount: 0,
      reblog: { ...basePost, id: "post-boosted", favourited: false },
    };

    const updated = applyFavouriteStateToPost(
      boosted,
      "post-boosted",
      true,
      10,
    );

    expect(updated.favourited).toBe(true);
    expect(updated.favouritesCount).toBe(10);
    expect(updated.reblog?.favourited).toBe(true);
    expect(updated.reblog?.favouritesCount).toBe(10);
  });

  it("falls back to existing favourite count when none provided", () => {
    const updated = applyFavouriteStateToPost(basePost, "post-1", true);
    expect(updated.favouritesCount).toBe(basePost.favouritesCount);
  });
});
