/**
 * Post Comparison Utility Tests
 * Tests for media attachment comparison logic
 */

import { haveMediaAttachmentsChanged } from "../postComparison";
import type { MediaAttachment } from "@types";

describe("haveMediaAttachmentsChanged", () => {
  const createMockMedia = (id: string, url: string): MediaAttachment => ({
    id,
    type: "image",
    url,
    previewUrl: url,
    description: null,
  });

  it("should return false when media attachments are identical", () => {
    const media1 = createMockMedia("1", "https://example.com/image1.jpg");
    const media2 = createMockMedia("2", "https://example.com/image2.jpg");

    const prev = [media1, media2];
    const next = [media1, media2]; // Same references

    expect(haveMediaAttachmentsChanged(prev, next)).toBe(false);
  });

  it("should return true when array lengths differ", () => {
    const media1 = createMockMedia("1", "https://example.com/image1.jpg");
    const prev = [media1];
    const next = [
      media1,
      createMockMedia("2", "https://example.com/image2.jpg"),
    ];

    expect(haveMediaAttachmentsChanged(prev, next)).toBe(true);
  });

  it("should return true when media URL changes but length stays same", () => {
    const prev = [createMockMedia("1", "https://example.com/image1.jpg")];
    const next = [createMockMedia("1", "https://example.com/image2.jpg")];

    // Same ID, different URL - should detect change
    expect(haveMediaAttachmentsChanged(prev, next)).toBe(true);
  });

  it("should return true when media ID changes but length stays same", () => {
    const prev = [createMockMedia("1", "https://example.com/image1.jpg")];
    const next = [createMockMedia("2", "https://example.com/image1.jpg")];

    // Same URL, different ID - should detect change
    expect(haveMediaAttachmentsChanged(prev, next)).toBe(true);
  });

  it("should return false for empty arrays", () => {
    expect(haveMediaAttachmentsChanged([], [])).toBe(false);
  });

  it("should handle multiple media items correctly", () => {
    const prev = [
      createMockMedia("1", "https://example.com/image1.jpg"),
      createMockMedia("2", "https://example.com/image2.jpg"),
      createMockMedia("3", "https://example.com/image3.jpg"),
    ];

    const next = [
      createMockMedia("1", "https://example.com/image1.jpg"),
      createMockMedia("2", "https://example.com/image2-updated.jpg"), // Changed URL
      createMockMedia("3", "https://example.com/image3.jpg"),
    ];

    expect(haveMediaAttachmentsChanged(prev, next)).toBe(true);
  });

  it("should handle arrays with same length and different media", () => {
    const prev = [
      createMockMedia("1", "https://example.com/image1.jpg"),
      createMockMedia("2", "https://example.com/image2.jpg"),
    ];

    const next = [
      createMockMedia("1", "https://example.com/image1.jpg"),
      createMockMedia("3", "https://example.com/image3.jpg"), // Different ID
    ];

    expect(haveMediaAttachmentsChanged(prev, next)).toBe(true);
  });
});
