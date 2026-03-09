import { computeVisibleIds } from "../visibility";

const layoutMap = (...entries: [string, number, number][]) => {
  const map = new Map<string, { y: number; height: number }>();
  entries.forEach(([id, y, height]) => map.set(id, { y, height }));
  return map;
};

describe("computeVisibleIds", () => {
  it("returns items intersecting the viewport", () => {
    const layouts = layoutMap(["a", 0, 100], ["b", 120, 150], ["c", 400, 50]);

    const visible = computeVisibleIds(layouts, 0, 250);
    expect(Array.from(visible)).toEqual(expect.arrayContaining(["a", "b"]));
    expect(visible.has("c")).toBe(false);
  });

  it("applies buffer ratio to include nearby items", () => {
    const layouts = layoutMap(["a", 140, 20]);
    // Without buffer (0.5 * 100 = 50) this would be outside the 0-100 viewport
    const visible = computeVisibleIds(layouts, 0, 100, 0.5);
    expect(visible.has("a")).toBe(true);
  });

  it("handles empty layout map", () => {
    const visible = computeVisibleIds(new Map(), 0, 200);
    expect(visible.size).toBe(0);
  });
});
