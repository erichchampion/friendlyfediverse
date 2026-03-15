/**
 * Tests verifying debug telemetry has been removed from production code
 * TDD: These tests should pass after cleanup of #region agent log blocks
 */

import { trimPostsToLimit } from "../useFeed";

// Mock fetch globally to detect any calls
const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Replace fetch with a spy that records calls
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Debug telemetry cleanup", () => {
  it("trimPostsToLimit should NOT call fetch() for debug logging", () => {
    const posts = Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      content: `Post ${i}`,
      createdAt: new Date().toISOString(),
      account: {
        id: "1",
        username: "test",
        displayName: "Test",
        avatar: "",
        header: "",
        followersCount: 0,
        followingCount: 0,
        statusesCount: 0,
      },
      mediaAttachments: [],
      favouritesCount: 0,
      reblogsCount: 0,
      repliesCount: 0,
      favourited: false,
      reblogged: false,
      bookmarked: false,
      sensitive: false,
      spoilerText: "",
      visibility: "public" as const,
      inReplyToId: null,
      inReplyToAccountId: null,
      reblog: null,
      card: null,
      tags: [],
      mentions: [],
      emojis: [],
      uri: `https://example.com/${i}`,
    }));

    // Trigger trim with viewport position so the trim code path runs
    const viewportPosition = {
      firstVisibleIndex: 200,
      lastVisibleIndex: 210,
    };

    trimPostsToLimit(posts, "dropFromEnd", viewportPosition);

    // fetch should NOT have been called - debug telemetry must be removed
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("trimPostsToLimit should not contain debug console.log with [dbg] prefix", () => {
    // Read the source code of trimPostsToLimit and verify no debug logs
    // This is a structural test - we verify the function string doesn't contain debug markers
    const fnSource = trimPostsToLimit.toString();
    expect(fnSource).not.toContain("[dbg]");
    expect(fnSource).not.toContain("127.0.0.1");
    expect(fnSource).not.toContain("hypothesisId");
  });
});
