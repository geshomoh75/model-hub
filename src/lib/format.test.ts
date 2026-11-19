import { describe, expect, it } from "vitest";
import { candidateIds, costOf, csvField, formatCost, formatModalities } from "./format";

describe("routing helpers", () => {
  it("tries model first, then the fallbacks in order, once each", () => {
    expect(candidateIds("a/x", ["b/y", "a/x", "c/z"])).toEqual(["a/x", "b/y", "c/z"]);
    expect(candidateIds(undefined, ["b/y"])).toEqual(["b/y"]);
    expect(candidateIds()).toEqual([]);
  });

  it("prices by tokens and per-million prices", () => {
    expect(costOf({ inputPrice: 0.59, outputPrice: 0.79 }, 38, 41)).toBeCloseTo(
      (38 * 0.59 + 41 * 0.79) / 1e6,
      12,
    );
    expect(costOf({ inputPrice: 2, outputPrice: 8 }, 0, 0)).toBe(0);
  });

  it("formats costs, modalities and CSV fields", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.000079)).toBe("$0.000079");
    expect(formatModalities("text,image", "text")).toBe("Text, Image → Text");
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
  });
});
