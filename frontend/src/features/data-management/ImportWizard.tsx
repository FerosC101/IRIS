import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { EmptyState, InlineError } from "@/components/ui/states";
import { useToast } from "@/hooks/useToast";
import { useSession } from "@/hooks/useSession";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { ApiError } from "@/services/client";
import type { ImportPreview, ImportValidation } from "@/types/api";
import { ValidationFindings } from "./ValidationFindings";

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
    <ol className="iris-import-steps mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Import steps">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === step ? "step" : undefined}
          className={cn("border-b-2 px-3 py-3 text-[13px]", i === step ? "border-brand-bright bg-info-bg font-semibold text-teal-800" : "border-line text-ink-2")}>
          <span className="mr-1 tabular">{i + 1}.</span>{s}{i < step && <CheckCircle2 className="ml-1 inline size-3.5 text-positive-ink" aria-label="done" />}
        </li>
      ))}
    </ol>
  );
}

function SourceFile({ preview, file }: { preview: ImportPreview; file: File | null }) {
  return <Panel title="Source file" variant="secondary" motif="records">
    <div className="flex flex-wrap items-center gap-3">
      <FileUp className="size-8 shrink-0 text-teal-800" aria-hidden />
      <div className="min-w-0"><p className="break-words text-sm font-semibold">{preview.filename}</p><p className="mt-1 text-xs text-ink-2">{fmtNum(preview.row_count)} rows · {preview.columns.length} columns{file ? ` · ${fmtNum(file.size / 1024, 1)} KB` : ""}</p></div>
    </div>
    <p className="mt-4 text-xs text-ink-2">Staged on the local server. Provenance is declared before confirmation; this upload is not a saved draft.</p>
  </Panel>;
}

function SchemaPreview({ preview }: { preview: ImportPreview }) {
  return <Panel title="Schema preview" description="First rows, exactly as read from the source." bodyClassName="p-0" motif="records" className="iris-records-table">
    <div className="overflow-x-auto" role="region" aria-label="Source column preview" tabIndex={0}>
      <table className="w-full min-w-max text-[13px]">
        <caption className="sr-only">Source columns and preview values</caption>
        <thead className="text-left text-xs"><tr>{preview.columns.map((column) => <th key={column.name} scope="col" className="px-4 py-3 font-semibold">{column.name}<span className="mt-1 block font-normal text-ink-2">{column.blank} blank · {column.distinct} distinct</span></th>)}</tr></thead>
        <tbody>{preview.preview.map((row, index) => <tr key={index} className="border-t border-line">{preview.columns.map((column) => <td key={column.name} className="max-w-64 break-words px-4 py-3 text-xs">{row[column.name] === "" ? <span className="italic text-ink-2">blank</span> : row[column.name]}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="border-t border-line p-4 text-xs text-ink-2">Empty values stay blank. An explicit 0 remains zero. A missing expected submission requires a reporting schedule, which this import does not create.</p>
  </Panel>;
}

export function ImportWizard() {
  const { can } = useSession();
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
    onSuccess: (ds) => { qc.invalidateQueries(); toast(`Imported '${ds.name}' (${ds.row_count} rows).`); nav(`/data/datasets/${ds.id}`); },
    onError: () => setConfirm(null),
  });
  const cancel = () => {
    if (preview) api.importCancel(preview.token).catch(() => {});
    setKeepLast(false); setDateFormat("YYYY-MM-DD"); setConfirm(null);
    setStep(0); setPreview(null); setFile(null); setValidation(null); setMapping({}); up.reset(); val.reset(); commit.reset(); form.reset();
    if (fileRef.current) fileRef.current.value = "";
  };
  const expired = [val.error, commit.error].some((e) => e instanceof ApiError && e.status === 410);
  const hasDupError = validation?.errors.some((e) => e.message.includes("share the same"));

  if (!can("dataset.import")) return <><PageHeader title="Dataset Import & Validation" description="Prepare reporting data for analysis." /><EmptyState title="Import is not available for this role">Your current role does not have dataset-import permission. <Link to="/data" className="underline">Browse available records</Link>.</EmptyState></>;

  return (
    <>
      <PageHeader title="Dataset Import & Validation" breadcrumbs={[{ label: "Data & Models", to: "/data" }, { label: "Import CSV" }]}
        description="Review mappings, validate source data, and confirm provenance before importing." />
      <p className="mb-4 text-xs text-ink-2">CSV ingestion · Step {step + 1} of {STEPS.length} · Preview, validate, declare provenance, then confirm.</p>
      <Stepper step={step} />
      {expired && <div className="mb-4"><InlineError error={new Error("This upload expired (the server may have restarted). Please start again.")} /><Button className="mt-2" variant="secondary" onClick={cancel}>Start again</Button></div>}

      {step === 0 && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="1. Choose a CSV file" description="UTF-8 CSV with a header row, up to 5 MB and 50,000 rows." motif="records">
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (file) up.mutate(file); }}>
            <div className="iris-upload-target">
              <FileUp className="mb-4 size-9 text-teal-800" aria-hidden />
              <label htmlFor="csv" className="mb-1 block text-[13px] font-medium">CSV file</label>
              <input ref={fileRef} id="csv" type="file" accept=".csv,text/csv" disabled={up.isPending} onChange={(e) => { setFile(e.target.files?.[0] ?? null); up.reset(); }}
                className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-line-strong file:bg-brand-light file:px-3 file:text-sm file:font-semibold file:text-brand-surface hover:file:bg-brand-soft" />
              <p className="mt-4 text-xs text-ink-2">Choose a file to inspect its columns before importing.</p>
            </div>
            {up.error && <InlineError error={up.error} />}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={!file || up.isPending}><FileUp aria-hidden />{up.isPending ? "Reading file…" : "Upload and preview"}</Button>
              <Link to="/data" className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-medium text-teal-900 hover:underline sm:min-h-10">Back to data sources</Link>
            </div>
            <details className="text-[13px] text-ink-2">
              <summary className="cursor-pointer font-medium text-teal-900">Example of an accepted file</summary>
              <pre className="mt-2 overflow-x-auto rounded-sm border border-line bg-porcelain p-3 font-mono text-xs text-ink">{"week_start,disease,province,cases\n2026-05-04,Dengue,Masagana,12\n2026-05-11,Dengue,Masagana,\n2026-05-18,Dengue,Masagana,0"}</pre>
              <p className="mt-1">The empty value is kept as a blank received value. The explicit 0 remains zero; neither represents a missing submission.</p>
            </details>
          </form>
        </Panel>
        <Panel title="Before you import" variant="secondary" motif="verify">
          <div className="space-y-5 text-sm">
            <p>Map a reporting period and a value column. Keep blank values distinct from observed zero counts.</p>
            <p>Source and data classification are required before confirmation. Declaring real data does not verify its origin.</p>
            <p className="border-l-2 border-brand-bright pl-3 text-xs text-ink-2">Uploaded files do not create reporting schedules or network relationships. Arrival rates and some analyses may remain unavailable.</p>
          </div>
        </Panel>
        </div>
      )}

      {step === 1 && preview && (
        <div className="iris-workspace-stack">
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
            <div className="iris-workspace-stack">
              <SourceFile preview={preview} file={file} />
              <SchemaPreview preview={preview} />
            </div>
            <Panel title="2. Map columns" description="Match each target field to a source column. Check every suggested mapping before validation." motif="network">
              <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                {preview.target_fields.map((target) => (
                  <Field key={target.key} label={target.label} optional={!target.required} hint={target.description}>
                    {(props) => <Select {...props} disabled={val.isPending} value={mapping[target.key] ?? ""} onChange={(event) => setMapping((current) => {
                      const next = { ...current };
                      if (event.target.value) next[target.key] = event.target.value;
                      else delete next[target.key];
                      return next;
                    })}>
                      <option value="">{target.required ? "Choose a column..." : "Not in this file"}</option>
                      {preview.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                    </Select>}
                  </Field>
                ))}
                <Field label="Date format used in the file" hint="Applies to all date columns.">
                  {(props) => <Select {...props} disabled={val.isPending} value={dateFormat} onChange={(event) => setDateFormat(event.target.value)}>{preview.date_formats.map((format) => <option key={format}>{format}</option>)}</Select>}
                </Field>
              </div>
            </Panel>
          </div>
          <InlineError error={val.error} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={cancel} disabled={val.isPending}>Cancel import</Button>
            <Button onClick={() => val.mutate(keepLast)} disabled={val.isPending}>{val.isPending ? "Validating..." : "Validate"}</Button>
          </div>
        </div>
      )}

      {step === 2 && validation && (
        <div className="iris-workspace-stack">
          {preview && <SourceFile preview={preview} file={file} />}
          <ValidationFindings validation={validation} pending={val.isPending}>
            {(hasDupError || keepLast) && <Checkbox label="Keep only the last occurrence of duplicate rows" description="Earlier duplicates are skipped. Use this only if later rows are corrections." checked={keepLast} disabled={val.isPending} onChange={(value) => { setKeepLast(value); val.mutate(value); }} />}
          </ValidationFindings>
          <InlineError error={val.error} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" onClick={cancel} disabled={val.isPending}>Cancel import</Button>
              <Button variant="secondary" onClick={() => setStep(1)} disabled={val.isPending}>Back to mapping</Button>
            </div>
            <Button disabled={!validation.can_accept || val.isPending || expired} onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Panel title="4. Describe the dataset" description="Provenance is required. IRIS never assumes imported data is official or verified." motif="verify">
          <form noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit((m) => setConfirm(m))}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Dataset name" error={form.formState.errors.name?.message}>{(p) => <Input {...p} {...form.register("name")} />}</Field>
              <Field label="Geographic level" error={form.formState.errors.geographic_level?.message}>
                {(p) => <Select {...p} defaultValue="" {...form.register("geographic_level")}><option value="" disabled>Choose…</option><option value="facility">Facility</option><option value="municipality">Municipality</option><option value="province">Province</option><option value="region">Region</option></Select>}
              </Field>
            </div>
            <Field label="Source" hint="Who produced the data and how you obtained it." error={form.formState.errors.source?.message}>{(p) => <Input {...p} {...form.register("source")} />}</Field>
            <fieldset aria-describedby={form.formState.errors.designation ? "desig-err" : undefined}>
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
            <Field label="Description" optional error={form.formState.errors.description?.message}>{(p) => <Textarea {...p} rows={2} {...form.register("description")} />}</Field>
            <Field label="Known limitations" optional error={form.formState.errors.known_limitations?.message} hint="One per line. IRIS adds limitations it can detect (e.g. no timestamps).">{(p) => <Textarea {...p} rows={3} {...form.register("known_limitations")} />}</Field>
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

      <Dialog open={!!confirm} onOpenChange={(open) => !open && !commit.isPending && setConfirm(null)}>
        <DialogContent title="Import this dataset?" description="This adds a new dataset to the prototype database. It can be deleted later from Data Management."
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)} disabled={commit.isPending}>Go back</Button><Button onClick={() => confirm && commit.mutate(confirm)} disabled={commit.isPending}>{commit.isPending ? "Importing…" : "Confirm import"}</Button></>}>
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
