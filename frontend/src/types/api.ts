/** Types mirroring the IRIS FastAPI responses. */

export type Role = "rhu_staff" | "provincial_coordinator" | "resu_analyst" | "admin";
export type Severity = "high" | "medium" | "low";
export type ConcernStatus = "open" | "under_review" | "clarification_requested" | "in_investigation" | "resolved" | "dismissed";
export type Verification = "unverified" | "confirmed" | "dismissed";
export type ConcernType = "missing_submission" | "late_report" | "incomplete_record" | "count_drop" | "shared_problem";
export type EvidenceKind = "observed" | "possible_explanation" | "requires_verification" | "confirmed_by_reviewer" | "simulated_example";
export type SlotStatus = "on_time" | "late" | "not_received" | "received";
export type ValueStatus = "reported" | "zero" | "blank";
export type Method = "threshold" | "ewma" | "network";
export type Designation = "synthetic" | "real" | "unknown";
export type AssignmentStatus = "approved" | "in_progress" | "completed" | "closed" | "cancelled";
export type OutcomeStatus = "not_yet_verified" | "observed_unverified" | "verified";

export interface Paged<T> { rows: T[]; total: number; page: number; page_size: number; pages: number }

export interface WeekLabel { week: number; start: string; end: string; iso_week: number; label: string }
export interface Category { code: string; name: string; description: string; frequency: "weekly" | "monthly" }
export interface DemoUser { id: string; display_name: string; role: Role; reporting_unit_id: string | null; province: string | null }
export interface UnitSummary { id: string; name: string; unit_type: UnitType; province: string; municipality: string | null; active: boolean }
export type UnitType = "rhu" | "hospital" | "laboratory" | "hub";

export interface Meta {
  app: { name: string; full_name: string; tagline: string; prototype_notice: string };
  as_of: string;
  demo_dataset_id: string;
  actor: { user_id: string; role: Role; display_name: string; reporting_unit_id: string | null; province: string | null; permissions: string[] };
  roles: { id: Role; name: string; description: string }[];
  users: DemoUser[];
  units: UnitSummary[];
  provinces: string[];
  categories: Category[];
  weeks: WeekLabel[];
  labels: {
    status: Record<ConcernStatus, string>;
    concern_type: Record<ConcernType, string>;
    method: Record<Method, string>;
    action_type: Record<string, string>;
    scenario_kind: Record<string, string>;
  };
}

export interface QueueRow {
  kind: "concern" | "follow_up";
  id: string;
  title: string;
  units: string[];
  units_label: string;
  province: string | null;
  category: string | null;
  period_start: string;
  period_end: string;
  concern_type: ConcernType;
  concern_type_label: string;
  severity: Severity;
  status: string;
  status_label: string;
  verification: Verification | null;
  updated_at: string;
  assigned: string | null;
  due: string | null;
  overdue: boolean;
  link: string;
}

export interface Task {
  kind: "missing_report" | "clarification";
  id: string;
  title: string;
  category_code?: string;
  category?: string;
  period_start?: string;
  period_end?: string;
  due_at: string | null;
  frequency?: "weekly" | "monthly";
  unit_id: string;
  concern_id?: string;
  message?: string | null;
}

export interface Overview {
  period: { key: string; label: string; from_week: number; to_week: number; start: string; end: string };
  scope: { role: Role; province: string | null; unit_id: string | null };
  counts: { new: number; under_review: number; clarification_requested: number; in_investigation: number; overdue_follow_ups: number; follow_ups_active: number; tasks: number };
  queue: QueueRow[];
  tasks: Task[];
  trend: { week: number; period_start: string; completeness: number | null; timeliness: number | null }[];
  recently_closed: { id: string; title: string; status: ConcernStatus; status_label: string; units_label: string; closed_at: string; concern_type_label: string }[];
  intervention_updates: { id: number; at: string; summary: string; entity_type: string; entity_id: string }[];
  dataset_as_of: string;
}

export interface ConcernUnit { id: string; name: string; unit_type: UnitType; province: string }

export interface Concern {
  id: string; dataset_id: string; concern_type: ConcernType; concern_type_label: string; title: string; summary: string;
  severity: Severity; status: ConcernStatus; status_label: string; verification: Verification; category_code: string | null; categories: string[];
  period_start: string; period_end: string; week_start_index: number; week_end_index: number; primary_unit_id: string | null;
  province: string | null; shared_via: string | null; detection_method: Method; detection_method_label: string; score: number;
  uncertainty_note: string; created_at: string; updated_at: string; assigned_user_id: string | null; assigned_user: string | null;
  assigned_role: string | null; follow_up_due: string | null; confirmation_reason: string | null; dismissal_reason: string | null;
  resolution_summary: string | null; resolved_at: string | null; simulated: boolean; units: ConcernUnit[];
}

export interface Evidence { id: number; kind: EvidenceKind; title: string; detail: string; data: Record<string, unknown>; created_at: string; created_by: string | null }

export interface TimelineRow {
  week: number; in_concern: boolean; expected: number; on_time: number; late: number; not_received: number; incomplete: number;
  cases: number; deficit: number; baseline_median: number; history_weeks: number; own_z: number; score: number; flagged: boolean;
  count_expected: number | null; count_p: number | null; peer_support: number; peer_affected: string[];
}

export interface ConcernDetail {
  concern: Concern;
  via_label: string | null;
  evidence: Evidence[];
  timeline: { units: Record<string, TimelineRow[]>; weeks: WeekLabel[] };
  notes: { id: number; note_type: string; body: string; created_at: string; author: string }[];
  investigation: { id: string; owner: string; owner_user_id: string; status: "open" | "closed"; opened_at: string; closed_at: string | null } | null;
  next_step: { text: string; action: string | null };
  activity: { id: number; at: string; action: string; summary: string; actor: string; detail: Record<string, unknown> }[];
  related: QueueRow[];
  actions: { id: string; title: string; action_type: string; status: string }[];
  assignments: { id: string; title: string; status: AssignmentStatus; due_date: string }[];
  assignable_users: { id: string; display_name: string; role: Role }[];
  detection_params: Record<string, number>;
}

export interface NetworkNode {
  id: string; name: string; unit_type: UnitType; province: string; municipality: string | null; active: boolean; is_sentinel: boolean;
  x: number; y: number; status: "normal" | "delayed" | "missing" | "no_schedule"; status_label: string;
  completeness: number | null; timeliness: number | null; expected: number; open_concerns: number; downstream_units: number | null;
  degree: number; simulated: boolean;
}
export interface NetworkEdge { id: string; source: string; target: string; relationship_type: RelationshipType; description: string; simulated: boolean }
export type RelationshipType = "reports_through" | "specimen_referral" | "shared_resource";
export interface NetworkGraphData {
  defined: boolean; message?: string; nodes: NetworkNode[]; edges: NetworkEdge[];
  relationship_types: { type: RelationshipType; description: string }[]; status_labels: Record<string, string>;
  window: { from: number; to: number }; note: string;
}
export interface SlotSummary { expected: number; received: number; on_time: number; late: number; not_received: number; completeness: number | null; timeliness: number | null }
export interface UnitDetail {
  unit: { id: string; name: string; unit_type: UnitType; province: string; municipality: string | null; active: boolean; is_sentinel: boolean; notes: string; simulated: boolean };
  relationships: { id: string; direction: "incoming" | "outgoing"; other_id: string; other_name: string; relationship_type: RelationshipType; description: string; simulated: boolean }[];
  expectations: { category_code: string; frequency: string; start_date: string; end_date: string }[];
  history: ({ week: number; period_start: string } & SlotSummary)[];
  history_note: string | null;
  concerns: { id: string; title: string; status: ConcernStatus; severity: Severity; concern_type: ConcernType; period_start: string; period_end: string }[];
}

export interface Dataset {
  id: string; name: string; description: string; source: string; designation: Designation; geographic_level: string;
  imported_at: string; imported_by: string | null; coverage_start: string | null; coverage_end: string | null; row_count: number;
  validation_status: "valid" | "valid_with_warnings" | "invalid"; known_limitations: string[]; has_expectations: boolean;
  has_timestamps: boolean; has_units: boolean; is_demo: boolean;
}
export interface ImportIssue { row: number | null; column: string | null; value?: string | null; message: string }
export interface ImportRecord { id: string; dataset_id?: string | null; filename: string; at: string; by: string | null; status: "accepted" | "rejected" | "cancelled"; row_count: number; errors: ImportIssue[]; warnings: ImportIssue[] }
export interface Quality {
  dataset_id: string; rows: number; expected_available: boolean; not_received: number; late: number;
  value_status: Record<ValueStatus, number>;
  fields: { field: string; label: string; records: number; missing: number; missing_share: number | null }[];
  duplicates: number;
  per_unit: { unit_id: string; unit_name: string; expected: number; not_received: number; late: number; blank: number; zero: number; incomplete_forms: number }[];
  notes: string[];
}
export interface DatasetDetail extends Dataset {
  data_dictionary: { field: string; label: string; description: string; source_column?: string }[];
  column_mapping: Record<string, string>;
  imported_by_name: string | null;
  imports: ImportRecord[];
  quality: Quality;
  concerns: number;
}
export interface RecordRow {
  record_id: number | null; unit_id: string | null; unit_name: string | null; province: string | null; area: string | null; unit_type: UnitType | null;
  category_code: string | null; frequency: string | null; period_start: string; period_end: string | null; week: number | null;
  value: number | null; value_status: ValueStatus | null; due_at: string | null; received_at: string | null; status: SlotStatus;
  days_late: number | null; fields_complete: number | null; revision: number | null;
}
export interface RecordDetail {
  id: number; dataset_id: string; unit: { id: string; name: string; province: string } | null; area: string | null; category_code: string | null;
  period_start: string; period_end: string | null; value: number | null; value_status: ValueStatus; due_at: string | null; received_at: string | null;
  status: "on_time" | "late" | null; fields_complete: number | null; source_row: number | null; revision: number; note: string;
  history: { at: string; summary: string; action: string }[];
}
export interface FilterOptions {
  provinces: string[]; categories: string[]; units: { id: string; name: string }[]; statuses: string[]; value_statuses: string[];
  date_min: string | null; date_max: string | null; has_units: boolean; has_expectations: boolean; has_timestamps: boolean;
}
export interface Trends { available: boolean; message?: string; series: Record<string, string | number | null>[]; groups: string[]; note?: string | null }

export interface TargetField { key: string; label: string; required: boolean; kind: string; description: string }
export interface ImportPreview {
  token: string; filename: string; row_count: number;
  columns: { name: string; blank: number; distinct: number; samples: string[] }[];
  preview: Record<string, string>[]; suggested_mapping: Record<string, string>; target_fields: TargetField[]; date_formats: string[];
}
export interface ImportValidation {
  can_accept: boolean; errors: ImportIssue[]; warnings: ImportIssue[]; error_count: number;
  summary: null | {
    rows: number; rows_to_import: number; coverage_start: string | null; coverage_end: string | null;
    missingness: { field: string; label: string; column: string; blank: number; share: number }[];
    value_status: Record<ValueStatus, number> | null; duplicates: number; has_timestamps: boolean; has_units: boolean;
  };
}

export interface ActionTypeAssumption { base_hours: number; hours_per_unit: number; success_probability: number; time_days: number }
export interface Assumptions { horizon_weeks: number; action_types: Record<string, ActionTypeAssumption> }
export interface CandidateAction {
  id: string; concern_id: string; concern_title: string | null; concern_severity: Severity | null; concern_status: ConcernStatus | null;
  action_type: string; action_type_label: string; title: string; unit_ids: string[]; priority: number; depends_on: string[];
  rationale: string; status: string; expected_reports_per_week: number; cost_hours: number | null; expected_benefit: number | null;
  success_probability: number | null; time_days: number | null; responsible_role: Role | null; uncertainty: string;
}
export interface PlanSummary {
  method: "optimized" | "baseline"; action_ids: string[]; total_cost_hours: number; total_expected_benefit: number; budget_hours: number;
  remaining_hours: number; units_covered: string[]; concerns_covered: string[]; max_time_days: number;
  explanations: { id: string; selected: boolean; reason: string }[];
}
export interface Comparison { assumptions: Assumptions; candidates: CandidateAction[]; optimized: PlanSummary; baseline: PlanSummary }
export interface Plan {
  id: string; name: string; method: "optimized" | "baseline" | "manual"; budget_hours: number; action_ids: string[];
  total_cost_hours: number; total_expected_benefit: number; status: "draft" | "approved" | "rejected"; notes: string;
  created_by: string; created_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null;
  assumptions?: Assumptions; actions?: CandidateAction[]; assignments?: { id: string; title: string; status: AssignmentStatus; due_date: string }[];
}
export interface Assignment {
  id: string; title: string; plan_id: string; plan_name: string | null; action_id: string; action_type: string | null; action_type_label: string | null;
  concern_id: string | null; concern_title: string | null; concern_status: ConcernStatus | null; severity: Severity | null; responsible_role: Role;
  assignee_user_id: string | null; assignee: string | null; target_unit_ids: string[]; target_units: string[]; due_date: string;
  follow_up_date: string | null; overdue: boolean; status: AssignmentStatus;
  stage: "approved" | "completed_outcome_not_verified" | "outcome_observed" | "outcome_verified" | "cancelled";
  follow_up_notes: { at: string; by: string; by_name: string; text: string }[]; evidence_of_completion: string | null;
  completed_at: string | null; closed_at: string | null; created_at: string; updated_at: string;
  outcomes: { id: number; outcome_status: OutcomeStatus; source: "simulated" | "observed_in_data" | "reviewer"; summary: string; recorded_by: string; recorded_at: string }[];
  allowed_transitions: AssignmentStatus[];
}

export interface WindowMetrics extends SlotSummary { weeks: [number, number]; completeness_ci: [number, number] | null; timeliness_ci: [number, number] | null; incomplete: number; incomplete_share: number | null }
export interface Recovery {
  dataset: { id: string; name: string; designation: Designation };
  completeness_available: boolean; timeliness_available: boolean; messages: string[];
  frequency?: "weekly" | "monthly";
  series: ({ period_start: string; week: number } & SlotSummary)[];
  overall: SlotSummary | null;
  concerns: { week: number; period_start: string; new: number; resolved: number; dismissed: number; open_at_end: number }[];
  concerns_after_snapshot?: number;
  concern_totals?: { open: number; resolved: number; dismissed: number };
  resolution: { concern_type: ConcernType; resolved: number; median_days_to_resolution: number | null; dismissed: number; median_days_to_dismissal: number | null; open: number }[];
  before_after: {
    assignment_id: string; title: string; concern_id: string; target_unit_ids: string[]; completed_at: string | null;
    before: WindowMetrics | null; during: WindowMetrics | null; after: WindowMetrics | null; after_message: string | null;
    change_vs_during: number | null; outcomes: { status: OutcomeStatus; source: string; summary: string; recorded_at: string }[]; data_label: string;
  }[];
  causality_note?: string;
  received_records_on_time_share?: { on_time: number; records: number; share: number; note: string };
}

export interface BinaryMetrics { tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null; false_alarm_rate: number | null; f1: number | null }
export interface MethodResult {
  method: Method; label: string; overall: BinaryMetrics; events: number; event_detection_rate: number | null;
  median_delay_weeks: number | null; mean_delay_weeks: number | null;
  by_kind: { kind: string; label: string; unit_weeks: number; recall: number | null; events: number; event_detection_rate: number | null; median_delay_weeks: number | null }[];
  by_severity: { severity: Severity; unit_weeks: number; recall: number | null }[];
  false_alarm_context: Record<"background" | "holiday" | "outbreak" | "after_disruption", number>;
  false_alarm_channel: Record<"reporting_delay" | "count_drop_only" | "incomplete_only", number>;
  shared_identification: null | { shared_detections: number; shared_labelled_shared: number | null; isolated_detections: number; isolated_labelled_shared: number | null };
}
export interface ExperimentSummary {
  id: string; name: string; created_at: string; created_by: string; status: "completed" | "failed"; config: { replications: number; base_seed: number; n_weeks: number };
  duration_ms: number; error: string | null; headline: Record<Method, { precision: number | null; recall: number | null; false_alarm_rate: number | null }>;
}
export interface Experiment extends ExperimentSummary {
  results: {
    config: { replications: number; base_seed: number; n_weeks: number }; params: Record<string, number>; unit_weeks_per_method: number; positives: number;
    methods: Record<Method, MethodResult>;
    network_effect: { compared: [Method, Method]; precision_change: number | null; recall_change: number | null; false_alarm_rate_change: number | null; by_kind: { kind: string; label: string; recall_change: number | null }[] };
    elapsed_seconds: number; scenario_mix: string;
  };
}

export interface AuditRow { id: number; at: string; actor: string; actor_role: Role | null; entity_type: string; entity_id: string; action: string; summary: string }
export interface UnitRow { id: string; name: string; unit_type: UnitType; province: string; municipality: string | null; active: boolean; is_sentinel: boolean; notes: string; simulated: boolean; updated_at: string | null }
export interface DemoScenario { id: string; kind: string; kind_label: string; units: string[]; unit_names: string[]; start_week: number; end_week: number; severity: Severity; description: string; is_disruption: boolean; period: string }
