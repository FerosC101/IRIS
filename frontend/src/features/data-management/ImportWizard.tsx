import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { InlineError } from "@/components/ui/states";
import { useToast } from "@/hooks/useToast";
import { fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { ApiError } from "@/services/client";
import type { ImportIssue, ImportPreview, ImportValidation } from "@/types/api";

const STEPS = ["Upload file", "Map columns", "Validate", "Describe & confirm"];

export const metaSchema = z.object({
  name: z.string().trim().min(3, "Give the dataset a name (at least 3 characters).").max(200),
  source: z.string().trim().min(3, "Describe where the data came from."),
  designation: z.enum(["real", "synthetic", "unknown"], { message: "Declare whether the data is real, synthetic or of unknown origin." }),
  geographic_level: z.enum(["facility", "municipality", "province", "region"], { message: "Choose the geographic level." }),
  description: z.string().max(2000).optional(),
  known_limitations: z.string().max(4000).optional(),
});
type Meta = z.infer<typeof metaSchema>;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Import steps">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === step ? "step" : undefined}
          className={cn("rounded-md border px-3 py-2 text-[13px]", i === step ? "border-teal-900 bg-aqua-50 font-medium text-teal-900" : i < step ? "border-line bg-white text-ink" : "border-line bg-porcelain text-ink-2")}>
          <span className="mr-1 tabular">{i + 1}.</span>{s}{i < step && <CheckCircle2 className="ml-1 inline size-3.5 text-positive-ink" aria-label="done" />}
        </li>
      ))}
    </ol>
  );
}

function IssueList({ issues, tone }: { issues: ImportIssue[]; tone: "error" | "warning" }) {
  if (!issues.length) return null;
  return (
    <div className={cn("rounded-md border px-3 py-2", tone === "error" ? "border-critical/30 bg-critical-bg" : "border-attention/35 bg-attention-bg")} role={tone === "error" ? "alert" : undefined}>
      <p className={cn("mb-1 flex items-center gap-1.5 text-sm font-medium", tone === "error" ? "text-critical-ink" : "text-attention-ink")}>
        <AlertTriangle className="size-4" aria-hidden />{tone === "error" ? `${issues.length} problem(s) must be fixed` : `${issues.length} warning(s)`}
      </p>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-xs text-ink-2"><tr><th scope="col" className="py-1 pr-3 font-semibold">Row</th><th scope="col" className="py-1 pr-3 font-semibold">Column</th><th scope="col" className="py-1 font-semibold">Problem</th></tr></thead>
          <tbody>
            {issues.map((e, i) => (
              <tr key={i} className="border-t border-black/5 align-top">
                <td className="py-1 pr-3 tabular">{e.row ?? "—"}</td>
                <td className="py-1 pr-3 font-mono text-xs">{e.column ?? "—"}</td>
                <td className="py-1 text-ink">{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ImportWizard() {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dateFormat, setDateFormat] = useState("YYYY-MM-DD");
  const [keepLast, setKeepLast] = useState(false);
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [confirm, setConfirm] = useState<Meta | null>(null);
  const form = useForm<Meta>({ resolver: zodResolver(metaSchema), defaultValues: { name: "", source: "", description: "", known_limitations: "" } });

  const up = useMutation({ mutationFn: (f: File) => api.importPreview(f), onSuccess: (p) => { setPreview(p); setMapping(p.suggested_mapping); setStep(1); form.setValue("name", p.filename.replace(/\.csv$/i, "")); } });
  const val = useMutation({ mutationFn: (keep: boolean) => api.importValidate({ token: preview!.token, mapping, date_format: dateFormat, keep_last_duplicate: keep }), onSuccess: (v) => { setValidation(v); setStep(2); } });
  const commit = useMutation({
    mutationFn: (m: Meta) => api.importCommit({ token: preview!.token, mapping, date_format: dateFormat, keep_last_duplicate: keepLast, metadata: m }),
    onSuccess: (ds) => { qc.invalidateQueries(); toast(`Imported '${ds.name}' (${ds.row_count} rows).`); nav(`/data-management/${ds.id}`); },
    onError: () => setConfirm(null),
  });
  const cancel = () => {
    if (preview) api.importCancel(preview.token).catch(() => {});
    setStep(0); setPreview(null); setFile(null); setValidation(null); setMapping({}); up.reset(); val.reset(); commit.reset(); form.reset();
    if (fileRef.current) fileRef.current.value = "";
  };
  const expired = [val.error, commit.error].some((e) => e instanceof ApiError && e.status === 410);
  const hasDupError = validation?.errors.some((e) => e.message.includes("share the same"));

  return (
    <>
      <PageHeader title="Import a CSV dataset" breadcrumbs={[{ label: "Data sources", to: "/data-management" }, { label: "Import CSV" }]}
        description="Four short steps. Nothing is saved until you confirm at the end." />
      <Stepper step={step} />
      {expired && <div className="mb-4"><InlineError error={new Error("This upload expired (the server may have restarted). Please start again.")} /><Button className="mt-2" variant="secondary" onClick={cancel}>Start again</Button></div>}

      {step === 0 && (
        <Panel title="1. Choose a CSV file" description="UTF-8 CSV with a header row, up to 5 MB and 50,000 rows. Required: a period start date and a value column.">
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (file) up.mutate(file); }}>
            <div>
              <label htmlFor="csv" className="mb-1 block text-[13px] font-medium">CSV file</label>
              <input ref={fileRef} id="csv" type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); up.reset(); }}
                className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-line-strong file:bg-white file:px-3 file:text-sm file:font-medium file:text-teal-900 hover:file:bg-aqua-50 sm:file:min-h-10" />
            </div>
            {up.error && <InlineError error={up.error} />}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={!file || up.isPending}><FileUp aria-hidden />{up.isPending ? "Reading file…" : "Upload and preview"}</Button>
              <Link to="/data-management" className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-medium text-teal-900 hover:underline sm:min-h-10">Back to data sources</Link>
            </div>
            <details className="text-[13px] text-ink-2">
              <summary className="cursor-pointer font-medium text-teal-900">Example of an accepted file</summary>
              <pre className="mt-2 overflow-x-auto rounded-sm border border-line bg-porcelain p-3 font-mono text-xs text-ink">{"week_start,disease,province,cases\n2026-05-04,Dengue,Masagana,12\n2026-05-11,Dengue,Masagana,\n2026-05-18,Dengue,Masagana,0"}</pre>
              <p className="mt-1">The empty value on the second row is imported as blank (not reported), separate from the zero on the third.</p>
            </details>
          </form>
        </Panel>
      )}

      {step === 1 && preview && (
        <div className="flex flex-col gap-4">
          <Panel title="2. Map columns" description={`${preview.filename} · ${fmtNum(preview.row_count)} rows · ${preview.columns.length} columns. Suggested matches are pre-selected; check them.`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {preview.target_fields.map((t) => (
                <Field key={t.key} label={t.label} optional={!t.required} hint={t.description}>
                  {(p) => (
                    <Select {...p} value={mapping[t.key] ?? ""} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value) n[t.key] = e.target.value; else delete n[t.key]; return n; })}>
                      <option value="">{t.required ? "Choose a column…" : "Not in this file"}</option>
                      {preview.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </Select>
                  )}
                </Field>
              ))}
              <Field label="Date format used in the file" hint="Applies to all date columns.">
                {(p) => <Select {...p} value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>{preview.date_formats.map((d) => <option key={d}>{d}</option>)}</Select>}
              </Field>
            </div>
          </Panel>
          <Panel title="Column preview" description="First rows of the file, exactly as read." bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-[13px]">
                <thead className="bg-porcelain text-left text-xs"><tr>{preview.columns.map((c) => <th key={c.name} scope="col" className="px-3 py-2 font-semibold">{c.name}<span className="block font-normal text-ink-2">{c.blank} blank · {c.distinct} distinct</span></th>)}</tr></thead>
                <tbody>{preview.preview.map((r, i) => <tr key={i} className="border-t border-line">{preview.columns.map((c) => <td key={c.name} className="px-3 py-1.5 font-mono text-xs">{r[c.name] === "" ? <span className="text-ink-2 italic">blank</span> : r[c.name]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </Panel>
          <InlineError error={val.error} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={cancel}>Cancel import</Button>
            <Button onClick={() => val.mutate(keepLast)} disabled={val.isPending}>{val.isPending ? "Validating…" : "Validate"}</Button>
          </div>
        </div>
      )}

      {step === 2 && validation && (
        <div className="flex flex-col gap-4">
          <Panel title="3. Validation results">
            <div className="flex flex-col gap-4">
              {validation.can_accept ? (
                <p className="flex items-center gap-2 text-sm font-medium text-positive-ink"><CheckCircle2 className="size-4" aria-hidden /> The file passed validation{validation.warnings.length ? " with warnings" : ""}.</p>
              ) : (
                <p className="text-sm text-ink">The file cannot be imported yet. Fix the problems below in your spreadsheet and upload it again, or go back and change the column mapping.</p>
              )}
              <IssueList issues={validation.errors} tone="error" />
              <IssueList issues={validation.warnings} tone="warning" />
              {hasDupError || keepLast ? (
                <Checkbox label="Keep only the last occurrence of duplicate rows" description="Earlier duplicates are skipped. Use this only if later rows are corrections."
                  checked={keepLast} onChange={(v) => { setKeepLast(v); val.mutate(v); }} />
              ) : null}
              {validation.summary && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="text-sm">
                    <p><span className="text-ink-2">Rows to import:</span> <span className="font-medium tabular">{fmtNum(validation.summary.rows_to_import)}</span> of {fmtNum(validation.summary.rows)}</p>
                    <p><span className="text-ink-2">Period coverage:</span> {validation.summary.coverage_start ?? "—"} to {validation.summary.coverage_end ?? "—"}</p>
                    {validation.summary.value_status && <p><span className="text-ink-2">Values:</span> {validation.summary.value_status.reported} reported · {validation.summary.value_status.zero} zero · {validation.summary.value_status.blank} blank</p>}
                    <p><span className="text-ink-2">Timeliness:</span> {validation.summary.has_timestamps ? "can be calculated (due and received dates mapped)" : "not calculable (no due/received dates)"}</p>
                    <p><span className="text-ink-2">Completeness:</span> not calculable — imported files do not define expected submissions</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]"><caption className="mb-1 text-left text-xs font-semibold text-ink-2">Missingness by mapped field</caption>
                      <thead className="text-left text-xs text-ink-2"><tr><th scope="col" className="py-1 font-semibold">Field</th><th scope="col" className="py-1 text-right font-semibold">Blank</th><th scope="col" className="py-1 text-right font-semibold">Share</th></tr></thead>
                      <tbody>{validation.summary.missingness.map((m) => <tr key={m.field} className="border-t border-line"><td className="py-1">{m.label} <span className="font-mono text-xs text-ink-2">({m.column})</span></td><td className="py-1 text-right tabular">{m.blank}</td><td className="py-1 text-right tabular">{fmtPct(m.share, 1)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </Panel>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" onClick={cancel}>Cancel import</Button>
              <Button variant="secondary" onClick={() => setStep(1)}>Back to mapping</Button>
            </div>
            <Button disabled={!validation.can_accept} onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Panel title="4. Describe the dataset" description="Provenance is required. IRIS never assumes imported data is official or verified.">
          <form noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit((m) => setConfirm(m))}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Dataset name" error={form.formState.errors.name?.message}>{(p) => <Input {...p} {...form.register("name")} />}</Field>
              <Field label="Geographic level" error={form.formState.errors.geographic_level?.message}>
                {(p) => <Select {...p} defaultValue="" {...form.register("geographic_level")}><option value="" disabled>Choose…</option><option value="facility">Facility</option><option value="municipality">Municipality</option><option value="province">Province</option><option value="region">Region</option></Select>}
              </Field>
            </div>
            <Field label="Source" hint="Who produced the data and how you obtained it." error={form.formState.errors.source?.message}>{(p) => <Input {...p} {...form.register("source")} />}</Field>
            <fieldset aria-describedby="desig-err">
              <legend className="mb-1 text-[13px] font-medium">Is this real or synthetic data?</legend>
              <div className="flex flex-col gap-2">
                {[["synthetic", "Synthetic / simulated", "Generated for testing or teaching."], ["real", "Real observational data", "Collected from actual reporting. IRIS records this as declared, not verified."], ["unknown", "Unknown origin", "Results will be treated as unverified."]].map(([v, l, d]) => (
                  <label key={v} className="flex items-start gap-2.5 text-sm">
                    <input type="radio" value={v} className="mt-0.5 size-5 accent-teal-900 sm:size-4" {...form.register("designation")} />
                    <span><span className="text-ink">{l}</span><span className="block text-xs text-ink-2">{d}</span></span>
                  </label>
                ))}
              </div>
              {form.formState.errors.designation && <p id="desig-err" className="mt-1 text-xs font-medium text-critical-ink">{form.formState.errors.designation.message}</p>}
            </fieldset>
            <Field label="Description" optional>{(p) => <Textarea {...p} rows={2} {...form.register("description")} />}</Field>
            <Field label="Known limitations" optional hint="One per line. IRIS adds limitations it can detect (e.g. no timestamps).">{(p) => <Textarea {...p} rows={3} {...form.register("known_limitations")} />}</Field>
            <InlineError error={commit.error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="secondary" onClick={cancel}>Cancel import</Button>
                <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
              </div>
              <Button type="submit">Review and import</Button>
            </div>
          </form>
        </Panel>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent title="Import this dataset?" description="This adds a new dataset to the prototype database. It can be deleted later from Data Management."
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Go back</Button><Button onClick={() => confirm && commit.mutate(confirm)} disabled={commit.isPending}>{commit.isPending ? "Importing…" : "Confirm import"}</Button></>}>
          {confirm && validation?.summary && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li><strong>{confirm.name}</strong> — {fmtNum(validation.summary.rows_to_import)} rows</li>
              <li>Declared as: {confirm.designation === "real" ? "real observational data (unverified)" : confirm.designation === "synthetic" ? "synthetic data" : "unknown origin"}</li>
              <li>Geographic level: {confirm.geographic_level}</li>
              <li>Columns mapped: {Object.entries(mapping).map(([k, v]) => `${v} → ${k}`).join(", ")}</li>
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
