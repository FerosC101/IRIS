/** Preserve user-entered resource units; the backend remains the plan validator. */
export function parseBudget(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 2000 ? value : null;
}

export function withinBudget(cost: number, budget: number): boolean {
  return Number.isFinite(cost) && Number.isFinite(budget) && cost <= budget + 1e-9;
}

export function validExperiment(replications: number, seed: number): boolean {
  return Number.isInteger(replications) && replications >= 3 && replications <= 60 &&
    Number.isInteger(seed) && seed >= 0 && seed <= 10_000_000;
}

/** Undefined metric comparisons must never be described as unchanged. */
export function metricChange(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "not available";
  if (Math.abs(value) < 0.0005) return "unchanged";
  return value > 0 ? "increased" : "decreased";
}
