import { CheckCircle2, CircleDashed, Clock, FlaskConical, HelpCircle, MinusCircle, Search, XCircle } from "lucide-react";
import { Badge, DotLabel } from "@/components/ui/badge";
import { ASSIGNMENT_STATUS, CONCERN_STATUS, DESIGNATION, EVIDENCE_KIND, OUTCOME_STATUS, PLAN_STATUS, SEVERITY, SLOT_STATUS, VERIFICATION } from "@/lib/labels";
import type { AssignmentStatus, ConcernStatus, EvidenceKind, OutcomeStatus, Severity, SlotStatus } from "@/types/api";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return <DotLabel tone={s.tone}><span className="sr-only">Priority: </span>{s.label}</DotLabel>;
}

export function ConcernStatusBadge({ status }: { status: ConcernStatus }) {
  const s = CONCERN_STATUS[status];
  const icon = { open: <CircleDashed aria-hidden />, under_review: <Search aria-hidden />, clarification_requested: <HelpCircle aria-hidden />,
    in_investigation: <Search aria-hidden />, resolved: <CheckCircle2 aria-hidden />, dismissed: <MinusCircle aria-hidden /> }[status];
  return <Badge tone={s.tone} icon={icon}>{s.label}</Badge>;
}

export function VerificationBadge({ verification }: { verification: string }) {
  const v = VERIFICATION[verification] ?? VERIFICATION.unverified;
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const s = SLOT_STATUS[status];
  const icon = status === "on_time" ? <CheckCircle2 aria-hidden /> : status === "late" ? <Clock aria-hidden /> : status === "not_received" ? <XCircle aria-hidden /> : undefined;
  return <Badge tone={s.tone} icon={icon}>{s.label}</Badge>;
}

export function EvidenceKindBadge({ kind }: { kind: EvidenceKind }) {
  const k = EVIDENCE_KIND[kind];
  return <Badge tone={k.tone} icon={kind === "simulated_example" ? <FlaskConical aria-hidden /> : undefined}>{k.label}</Badge>;
}

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const s = ASSIGNMENT_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function OutcomeBadge({ status }: { status: OutcomeStatus }) {
  const s = OUTCOME_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PlanStatusBadge({ status }: { status: string }) {
  const s = PLAN_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function DesignationBadge({ designation }: { designation: string }) {
  const d = DESIGNATION[designation] ?? { label: designation, tone: "neutral" as const };
  return <Badge tone={d.tone} icon={designation === "synthetic" ? <FlaskConical aria-hidden /> : undefined}>{d.label}</Badge>;
}

export function SimulatedTag({ children = "Simulated" }: { children?: string }) {
  return <Badge tone="neutral" icon={<FlaskConical aria-hidden />}>{children}</Badge>;
}

export function OverdueBadge() {
  return <Badge tone="critical" icon={<Clock aria-hidden />}>Overdue</Badge>;
}
