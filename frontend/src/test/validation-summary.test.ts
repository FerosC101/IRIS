import { describe, expect, it } from "vitest";
import { validationMetrics } from "@/features/data-management/validation-summary";
import type { ImportValidation } from "@/types/api";

const blocked: ImportValidation = { can_accept: false, errors: [], warnings: [], error_count: 0, summary: null };

describe("validation metric semantics", () => {
  it("counts distinct rejected source rows rather than validation failures", () => {
    const result = validationMetrics({ ...blocked, error_count: 3, errors: [
      { row: 2, column: "date", message: "Invalid date" },
      { row: 2, column: "value", message: "Negative value" },
      { row: 4, column: "value", message: "Not a number" },
    ] });
    expect(result.rejected).toBe(2);
    expect(result.accepted).toBeNull();
  });

  it("does not invent row totals from schema errors or truncated issue lists", () => {
    expect(validationMetrics({ ...blocked, error_count: 1, errors: [{ row: null, column: null, message: "Required mapping missing" }] }).rejected).toBeNull();
    expect(validationMetrics({ ...blocked, error_count: 205, errors: [{ row: 2, column: "value", message: "Negative" }] }).rejected).toBeNull();
  });

  it("uses the post-duplicate count only when the complete file passes", () => {
    const result = validationMetrics({ ...blocked, can_accept: true, warnings: [{ row: null, column: null, message: "One duplicate skipped" }], summary: {
      rows: 4, rows_to_import: 3, coverage_start: null, coverage_end: null, missingness: [], value_status: { reported: 2, zero: 1, blank: 1 }, duplicates: 2, has_timestamps: false, has_units: false,
    } });
    expect(result).toEqual({ accepted: 3, rejected: 0, warnings: 1 });
  });

  it("keeps an unavailable accepted count separate from a legitimate zero", () => {
    expect(validationMetrics({ ...blocked, can_accept: true }).accepted).toBeNull();
  });
});
