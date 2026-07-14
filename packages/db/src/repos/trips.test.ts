import { describe, expect, it } from "vitest";
import { roleAtLeast } from "./trips";

describe("trip role ordering (owner > editor > commenter > viewer)", () => {
  it("owner satisfies every requirement", () => {
    for (const min of ["owner", "editor", "commenter", "viewer"] as const) {
      expect(roleAtLeast("owner", min)).toBe(true);
    }
  });

  it("viewer satisfies only viewer", () => {
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "commenter")).toBe(false);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("viewer", "owner")).toBe(false);
  });

  it("editor can comment but not own", () => {
    expect(roleAtLeast("editor", "commenter")).toBe(true);
    expect(roleAtLeast("editor", "owner")).toBe(false);
  });
});
