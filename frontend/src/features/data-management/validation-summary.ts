import type { ImportValidation } from "@/types/api";

/** Error counts are not row counts: one row can fail several rules, while a
 * schema/duplicate error can apply to the whole file. Never estimate from a
 * truncated error list. A blocked file has no accepted-record count yet. */
export function validationMetrics(validation: ImportValidation) {
  const completeRowErrors = validation.error_count === validation.errors.length && validation.errors.every((issue) => issue.row !== null);
  return {
    accepted: validation.can_accept ? validation.summary?.rows_to_import ?? null : null,
    warnings: validation.warnings.length,
    rejected: completeRowErrors ? new Set(validation.errors.map((issue) => issue.row)).size : null,
  };
}
