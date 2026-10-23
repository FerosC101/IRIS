import type {
  Assignment, AuditRow, Comparison, ConcernDetail, DatasetDetail, Dataset, DemoScenario, Experiment, ExperimentSummary,
  FilterOptions, ImportPreview, ImportRecord, ImportValidation, Meta, NetworkGraphData, Overview, Paged, Plan, Quality,
  QueueRow, RecordDetail, Reminder, Severity, RecordRow, Recovery, SurveillanceSummary, Task, Trends, UnitDetail, UnitRow, CandidateAction, Assumptions,
} from "@/types/api";
import { qs, request } from "./client";

type Params = Record<string, string | number | boolean | null | undefined>;

export const api = {
  meta: () => request<Meta>("/meta"),
  scenarios: () => request<DemoScenario[]>("/demo/scenarios"),
  /** Destructive: `confirm` must be the typed word RESET. */
  resetDemo: (confirm: string, scenario_ids?: string[]) =>
    request<{ concerns: number; records: number; scenarios: string[] }>("/demo/reset", { method: "POST", json: { scenario_ids: scenario_ids ?? null, confirm } }),

  overview: (p: Params) => request<Overview>(`/overview${qs(p)}`),
  concerns: (p: Params) => request<Paged<QueueRow>>(`/concerns${qs(p)}`),
  concern: (id: string) => request<ConcernDetail>(`/concerns/${id}`),
  concernAction: (id: string, action: "review" | "confirm" | "dismiss" | "clarify" | "respond" | "assign" | "notes" | "evidence" | "resolve" | "reopen", body: object) =>
    request<ConcernDetail>(`/concerns/${id}/${action}`, { method: "POST", json: body }),
  /** Open an investigation by hand. It starts unverified, with an owner and a checklist. */
  createConcern: (body: { unit_ids: string[]; category_code?: string | null; week_from: number; week_to: number; title: string; reason: string;
    severity?: Severity; assignee_user_id?: string | null; due?: string | null }) => request<ConcernDetail>("/concerns", { method: "POST", json: body }),
  /** Add one corrective action; it is recorded as an approved single-action plan and tracked as follow-up. */
  addAction: (id: string, body: { action_type: string; title: string; assignee_user_id?: string | null; due_date?: string | null; note?: string }) =>
    request<ConcernDetail>(`/concerns/${id}/actions`, { method: "POST", json: body }),
  /** Records a simulated reminder for a missing submission; nothing is sent. */
  sendReminder: (body: { unit_id: string; category_code: string; period_start: string; message?: string }) =>
    request<Reminder>("/reminders", { method: "POST", json: body }),
  reminders: (p: Params) => request<Reminder[]>(`/reminders${qs(p)}`),
  updateChecklist: (id: string, itemId: number, body: { done?: boolean; note?: string }) =>
    request<ConcernDetail>(`/concerns/${id}/checklist/${itemId}`, { method: "PATCH", json: body }),
  runDetection: (method: string) => request<{ created: string[]; skipped_existing: number; method: string; method_label: string }>("/detection/run", { method: "POST", json: { method } }),

  tasks: () => request<Task[]>("/tasks"),
  submitReport: (body: { unit_id: string; category_code: string; period_start: string; value: number | null; blank: boolean; note?: string }) =>
    request<{ id: number; revision: number; late: boolean }>("/reports", { method: "POST", json: body }),

  network: (p: Params) => request<NetworkGraphData>(`/network${qs(p)}`),
  unit: (id: string) => request<UnitDetail>(`/network/units/${id}`),
  units: () => request<UnitRow[]>("/units"),
  patchUnit: (id: string, body: Partial<Pick<UnitRow, "name" | "active" | "is_sentinel" | "notes">>) => request<UnitRow>(`/units/${id}`, { method: "PATCH", json: body }),

  datasets: () => request<Dataset[]>("/datasets"),
  dataset: (id: string) => request<DatasetDetail>(`/datasets/${id}`),
  deleteDataset: (id: string) => request<{ deleted: string }>(`/datasets/${id}`, { method: "DELETE" }),
  records: (id: string, p: Params) => request<Paged<RecordRow>>(`/datasets/${id}/records${qs(p)}`),
  record: (id: string, rid: number) => request<RecordDetail>(`/datasets/${id}/records/${rid}`),
  /** A report by its display id (RPT-0042), in whichever dataset holds it. */
  report: (reportId: string) => request<RecordDetail>(`/reports/${encodeURIComponent(reportId)}`),
  trends: (id: string, p: Params) => request<Trends>(`/datasets/${id}/trends${qs(p)}`),
  quality: (id: string, p: Params) => request<Quality>(`/datasets/${id}/quality${qs(p)}`),
  filters: (id: string) => request<FilterOptions>(`/datasets/${id}/filters`),

  importPreview: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ImportPreview>("/imports/preview", { method: "POST", body: fd });
  },
  importValidate: (body: { token: string; mapping: Record<string, string>; date_format: string; keep_last_duplicate: boolean }) =>
    request<ImportValidation>("/imports/validate", { method: "POST", json: body }),
  importCommit: (body: { token: string; mapping: Record<string, string>; date_format: string; keep_last_duplicate: boolean; metadata: object }) =>
    request<Dataset>("/imports/commit", { method: "POST", json: body }),
  importCancel: (token: string) => request<{ cancelled: boolean }>(`/imports/${token}`, { method: "DELETE" }),
  imports: () => request<ImportRecord[]>("/imports"),

  actions: () => request<{ actions: CandidateAction[]; assumptions: Assumptions; action_types: Record<string, string>; default_assumptions: Assumptions }>("/actions"),
  compare: (body: { budget_hours: number; action_ids?: string[] | null; assumptions?: Partial<Assumptions> | null }) => request<Comparison>("/plans/compare", { method: "POST", json: body }),
  plans: () => request<Plan[]>("/plans"),
  plan: (id: string) => request<Plan>(`/plans/${id}`),
  savePlan: (body: { name: string; method: string; budget_hours: number; action_ids: string[]; assumptions?: Partial<Assumptions> | null; notes?: string }) =>
    request<Plan>("/plans", { method: "POST", json: body }),
  decidePlan: (id: string, decision: "approve" | "reject", note: string) => request<Plan>(`/plans/${id}/decision`, { method: "POST", json: { decision, note } }),
  assignments: (p: Params) => request<Assignment[]>(`/assignments${qs(p)}`),
  assignment: (id: string) => request<Assignment>(`/assignments/${id}`),
  patchAssignment: (id: string, body: { status?: string; note?: string; evidence?: string; follow_up_date?: string }) =>
    request<Assignment>(`/assignments/${id}`, { method: "PATCH", json: body }),
  addOutcome: (id: string, body: { outcome_status: string; summary: string }) => request<Assignment>(`/assignments/${id}/outcomes`, { method: "POST", json: body }),

  recovery: (p: Params) => request<Recovery>(`/recovery${qs(p)}`),
  surveillanceSummary: (p: Params) => request<SurveillanceSummary>(`/surveillance/summary${qs(p)}`),
  experiments: () => request<ExperimentSummary[]>("/experiments"),
  experiment: (id: string) => request<Experiment>(`/experiments/${id}`),
  runExperiment: (body: { name?: string; replications: number; base_seed: number }) => request<Experiment>("/experiments", { method: "POST", json: body }),
  audit: (p: Params) => request<Paged<AuditRow>>(`/audit${qs(p)}`),
};
