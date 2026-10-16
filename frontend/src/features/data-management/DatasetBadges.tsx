import { Badge } from "@/components/ui/badge";
import type { Dataset } from "@/types/api";

const VALIDATION = {
  valid: { label: "Valid", tone: "positive" },
  valid_with_warnings: { label: "Valid with warnings", tone: "attention" },
  invalid: { label: "Invalid", tone: "critical" },
} as const;

export function ValidationBadge({ status }: { status: Dataset["validation_status"] }) {
  const value = VALIDATION[status];
  return <Badge tone={value.tone}>{value.label}</Badge>;
}
