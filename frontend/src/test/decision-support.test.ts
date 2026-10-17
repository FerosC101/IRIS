import { describe, expect, it } from "vitest";
import { metricChange, parseBudget, validExperiment, withinBudget } from "@/lib/decision-support";

describe("resource input contracts", () => {
  it("preserves fractional and zero budgets exactly", () => {
    expect(parseBudget("1.76")).toBe(1.76);
    expect(parseBudget("0")).toBe(0);
    expect(parseBudget("2000")).toBe(2000);
  });
  it("rejects missing, nonfinite, negative and out-of-range budgets rather than clamping", () => {
    for (const raw of ["", " ", "-1", "2000.01", "Infinity", "NaN", "no budget"]) expect(parseBudget(raw)).toBeNull();
  });
  it("detects a half-hour optimization result exceeding the actual entered budget", () => {
    expect(withinBudget(2, 1.76)).toBe(false);
    expect(withinBudget(1.5, 1.76)).toBe(true);
  });
});
describe("evaluation semantics", () => {
  it("accepts only reproducible integer configurations within the API limits", () => {
    expect(validExperiment(3, 0)).toBe(true);
    expect(validExperiment(60, 10_000_000)).toBe(true);
    for (const [runs, seed] of [[2, 0], [61, 1], [3.5, 1], [3, -1], [3, 1.5], [3, 10_000_001], [NaN, 1]]) expect(validExperiment(runs, seed)).toBe(false);
  });
  it("keeps unavailable changes separate from a real zero change", () => {
    expect(metricChange(null)).toBe("not available");
    expect(metricChange(undefined)).toBe("not available");
    expect(metricChange(0)).toBe("unchanged");
    expect(metricChange(-0.1)).toBe("decreased");
    expect(metricChange(0.1)).toBe("increased");
  });
});
