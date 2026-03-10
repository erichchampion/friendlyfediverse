import { BASE_TIMELINE_OPTIONS } from "../TimelinesContext";

describe("TimelinesContext BASE_TIMELINE_OPTIONS", () => {
  it("includes the local timeline entry", () => {
    const hasLocal = BASE_TIMELINE_OPTIONS.some(
      (option) => option.id === "local" && option.type === "local",
    );
    expect(hasLocal).toBe(true);
  });
});
