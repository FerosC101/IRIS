import type { AssignmentStatus, ConcernStatus, EvidenceKind, OutcomeStatus, Role, Severity, SlotStatus, UnitType, ValueStatus } from "@/types/api";

export const ROLE_LABELS: Record<Role, string> = {
  rhu_staff: "RHU reporting staff",
  provincial_coordinator: "Provincial coordinator",
  resu_analyst: "RESU analyst",
  admin: "Administrator / data manager",
};

export type Tone = "neutral" | "critical" | "attention" | "info" | "positive" | "teal";

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  high: { label: "High priority", tone: "critical" },
  medium: { label: "Medium priority", tone: "attention" },
  low: { label: "Low priority", tone: "neutral" },
};

export const CONCERN_STATUS: Record<ConcernStatus, { label: string; tone: Tone; help: string }> = {
  open: { label: "New", tone: "info", help: "Flagged by detection; nobody has looked at it yet." },
  under_review: { label: "Being reviewed", tone: "info", help: "Someone is checking the evidence." },
  clarification_requested: { label: "Waiting for reply", tone: "attention", help: "A question was sent to the reporting unit." },
  in_investigation: { label: "Being fixed", tone: "teal", help: "Confirmed or assigned; someone is working on it." },
  resolved: { label: "Resolved", tone: "positive", help: "Closed with a summary of what was done." },
  dismissed: { label: "Not a problem", tone: "neutral", help: "Closed as a false alarm, with a reason." },
};

export const VERIFICATION: Record<string, { label: string; tone: Tone }> = {
  unverified: { label: "Requires verification", tone: "attention" },
  confirmed: { label: "Confirmed by reviewer", tone: "teal" },
  dismissed: { label: "Dismissed as false alarm", tone: "neutral" },
};

export const EVIDENCE_KIND: Record<EvidenceKind, { label: string; tone: Tone; help: string }> = {
  observed: { label: "Observed in dataset", tone: "teal", help: "A fact computed directly from the records." },
  possible_explanation: { label: "Possible explanation", tone: "info", help: "A hypothesis. It has not been verified." },
  requires_verification: { label: "Requires verification", tone: "attention", help: "Something a person needs to check." },
  confirmed_by_reviewer: { label: "Confirmed by reviewer", tone: "positive", help: "A reviewer recorded this with a reason." },
  attached: { label: "Attached by reviewer", tone: "teal", help: "Evidence a person attached: a description and, optionally, a link." },
  simulated_example: { label: "Simulated example", tone: "neutral", help: "Comes from the simulation, not real data." },
};

export const SLOT_STATUS: Record<SlotStatus, { label: string; tone: Tone }> = {
  on_time: { label: "On time", tone: "positive" },
  late: { label: "Late", tone: "attention" },
  not_received: { label: "Not received", tone: "critical" },
  received: { label: "Received", tone: "neutral" },
};

export const VALUE_STATUS: Record<ValueStatus, { label: string; help: string }> = {
  reported: { label: "Reported", help: "A count greater than zero." },
  zero: { label: "Zero reported", help: "The unit explicitly reported zero." },
  blank: { label: "Blank", help: "The field was left empty. Not the same as zero." },
};

export const UNIT_TYPE: Record<UnitType, string> = {
  rhu: "RHU",
  hospital: "Hospital",
  laboratory: "Laboratory",
  hub: "Reporting hub",
};

export const ASSIGNMENT_STATUS: Record<AssignmentStatus, { label: string; tone: Tone }> = {
  approved: { label: "Not started", tone: "info" },
  in_progress: { label: "In progress", tone: "teal" },
  completed: { label: "Done", tone: "positive" },
  closed: { label: "Closed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const OUTCOME_STATUS: Record<OutcomeStatus, { label: string; tone: Tone }> = {
  not_yet_verified: { label: "Not checked yet", tone: "attention" },
  observed_unverified: { label: "Improvement seen, not confirmed", tone: "info" },
  verified: { label: "Confirmed by reviewer", tone: "positive" },
};

export const OUTCOME_SOURCE: Record<string, string> = {
  simulated: "Simulated outcome",
  observed_in_data: "Observed in data",
  reviewer: "Recorded by reviewer",
};

export const PLAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "info" },
  approved: { label: "Approved", tone: "positive" },
  rejected: { label: "Rejected", tone: "neutral" },
};

export const DESIGNATION: Record<string, { label: string; tone: Tone }> = {
  synthetic: { label: "Synthetic data", tone: "info" },
  real: { label: "Declared real data (unverified)", tone: "attention" },
  unknown: { label: "Origin unknown", tone: "attention" },
};
