/**
 * usePostInteractions Sync Tests
 * Tests that usePostInteractions syncs localPost when post prop changes
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { usePostInteractions } from "../usePostInteractions";
import type { Post } from "@types";

// Mock dependencies
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock("@lib/api/client", () => ({
  getActiveClient: jest.fn(),
}));

jest.mock("react-native", () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

const mockPost: Post = {
  id: "post-1",
  uri: "https://example.com/posts/1",
  url: "https://example.com/@user/1",
  createdAt: "2024-01-01T00:00:00Z",
  content: "Test post",
  visibility: "public",
  sensitive: false,
  spoilerText: "",
  mediaAttachments: [],
  mentions: [],
  tags: [],
  emojis: [],
  reblogsCount: 0,
  favouritesCount: 5,
  repliesCount: 0,
  reblogged: false,
  favourited: false,
  bookmarked: false,
  account: {
    id: "user-1",
    username: "testuser",
    acct: "testuser",
    displayName: "Test User",
    avatar: "https://example.com/avatar.jpg",
    header: "",
    followersCount: 100,
    followingCount: 50,
    statusesCount: 10,
    note: "",
    url: "https://example.com/@testuser",
    createdAt: "2024-01-01T00:00:00Z",
  },
  reblog: null,
  inReplyToId: null,
  inReplyToAccountId: null,
};

describe("usePostInteractions - Post Prop Sync", () => {
  it("should sync localPost when post prop favourited changes externally", async () => {
    const onUpdate = jest.fn();
    const { result, rerender } = renderHook(
      (props: { post: Post }) =>
        usePostInteractions({ post: props.post, onUpdate }),
      {
        initialProps: { post: mockPost },
      },
    );

    // Initial state
    expect(result.current.post.favourited).toBe(false);

    // Update post prop to be favorited (e.g., from another component or parent update)
    const favoritedPost = { ...mockPost, favourited: true, favouritesCount: 6 };
    rerender({ post: favoritedPost });

    // localPost should sync with the new post prop
    await waitFor(() => {
      expect(result.current.post.favourited).toBe(true);
      expect(result.current.post.favouritesCount).toBe(6);
    });
  });
});
