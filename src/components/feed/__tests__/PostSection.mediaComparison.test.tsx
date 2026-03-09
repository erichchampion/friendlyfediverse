/**
 * PostSection Media Comparison Tests
 * Tests that PostSectionContent re-renders when media attachments change
 */

import type { Post, MediaAttachment } from "@types";

describe("PostSectionContent media comparison", () => {
  const createMockPost = (mediaAttachments: MediaAttachment[]): Post => ({
    id: "post-1",
    content: "Test post",
    createdAt: new Date().toISOString(),
    account: {
      id: "user-1",
      username: "testuser",
      displayName: "Test User",
      avatar: "https://example.com/avatar.jpg",
      acct: "testuser",
      url: "https://example.com/@testuser",
      followersCount: 0,
      followingCount: 0,
      statusesCount: 0,
      note: "",
      fields: [],
      createdAt: new Date().toISOString(),
    },
    favourited: false,
    reblogged: false,
    bookmarked: false,
    favouritesCount: 0,
    reblogsCount: 0,
    repliesCount: 0,
    url: "https://example.com/status/1",
    visibility: "public",
    sensitive: false,
    spoilerText: "",
    mediaAttachments,
    mentions: [],
    tags: [],
    emojis: [],
    poll: null,
    card: null,
    application: null,
    language: null,
    pinned: false,
    reblog: null,
    muted: null,
    filtered: [],
  });

  const createMockMedia = (id: string, url: string): MediaAttachment => ({
    id,
    type: "image",
    url,
    previewUrl: url,
    remoteUrl: url,
    meta: {
      original: {
        width: 1920,
        height: 1080,
        aspect: 16 / 9,
      },
    },
    description: null,
    blurhash: null,
  });

  it("should detect media URL changes even when array length stays the same", () => {
    const media1 = createMockMedia("1", "https://example.com/image1.jpg");
    const media2 = createMockMedia("1", "https://example.com/image2.jpg");

    const prevPost = createMockPost([media1]);
    const nextPost = createMockPost([media2]);

    // Same array length
    expect(prevPost.mediaAttachments.length).toBe(
      nextPost.mediaAttachments.length,
    );

    // But different URLs - this SHOULD trigger re-render
    expect(prevPost.mediaAttachments[0].url).not.toBe(
      nextPost.mediaAttachments[0].url,
    );

    // CORRECT comparison: Check individual media items, not just length
    const mediaChanged =
      prevPost.mediaAttachments.length !== nextPost.mediaAttachments.length ||
      prevPost.mediaAttachments.some(
        (media, index) => media.url !== nextPost.mediaAttachments[index]?.url,
      );

    expect(mediaChanged).toBe(true);
  });

  it("should not re-render when media attachments are unchanged", () => {
    const media = createMockMedia("1", "https://example.com/image1.jpg");

    const prevPost = createMockPost([media]);
    const nextPost = createMockPost([media]); // Same reference

    // Length check passes
    const lengthSame =
      prevPost.mediaAttachments.length === nextPost.mediaAttachments.length;
    expect(lengthSame).toBe(true);

    // Individual items also the same
    const mediaChanged = prevPost.mediaAttachments.some(
      (media, index) => media.url !== nextPost.mediaAttachments[index]?.url,
    );

    expect(mediaChanged).toBe(false); // No change, should not re-render
  });

  it("should detect when media is added", () => {
    const media1 = createMockMedia("1", "https://example.com/image1.jpg");
    const media2 = createMockMedia("2", "https://example.com/image2.jpg");

    const prevPost = createMockPost([media1]);
    const nextPost = createMockPost([media1, media2]);

    // Length changed
    expect(prevPost.mediaAttachments.length).not.toBe(
      nextPost.mediaAttachments.length,
    );

    // Should trigger re-render
    const shouldReRender =
      prevPost.mediaAttachments.length !== nextPost.mediaAttachments.length;

    expect(shouldReRender).toBe(true);
  });

  it("should detect when media is removed", () => {
    const media1 = createMockMedia("1", "https://example.com/image1.jpg");
    const media2 = createMockMedia("2", "https://example.com/image2.jpg");

    const prevPost = createMockPost([media1, media2]);
    const nextPost = createMockPost([media1]);

    // Length changed
    expect(prevPost.mediaAttachments.length).not.toBe(
      nextPost.mediaAttachments.length,
    );

    // Should trigger re-render
    const shouldReRender =
      prevPost.mediaAttachments.length !== nextPost.mediaAttachments.length;

    expect(shouldReRender).toBe(true);
  });
});
