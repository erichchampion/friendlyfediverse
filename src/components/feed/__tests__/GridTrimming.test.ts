import { trimPostsToLimit } from "../../../hooks/useFeed";

describe("trimPostsToLimit", () => {
  it("preserves the currently visible posts even if direction contradicts the viewport", () => {
    // We have 400 posts. We are currently looking at indexes 0-20.
    const posts = Array.from(
      { length: 400 },
      (_, i) => ({ id: `${i}` }) as any,
    );
    const validViewportPosition = {
      firstVisibleIndex: 0,
      lastVisibleIndex: 20,
    };

    // Test dropping from start (what loadMore uses when appending bottom)
    const trimmedFromStart = trimPostsToLimit(
      posts,
      "dropFromStart",
      validViewportPosition,
    );

    // Test dropping from end (what loadNewer uses when prepending top)
    const trimmedFromEnd = trimPostsToLimit(posts, "dropFromEnd", {
      firstVisibleIndex: 380,
      lastVisibleIndex: 400,
    });

    expect(trimmedFromStart[0].id).toBe("0"); // It MUST not trim the start if we are looking at 0.
    expect(trimmedFromEnd[trimmedFromEnd.length - 1].id).toBe("399"); // It MUST not trim the end if we are looking at 399.
  });
});
