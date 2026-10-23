import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { DesignationBadge } from "@/components/data-display/badges";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtDate } from "@/lib/format";
import { canAccess } from "@/lib/navigation";
import { api } from "@/services/api";

function ProvenanceDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { role } = useSession();
  const q = useQuery({ queryKey: ["datasets"], queryFn: api.datasets, enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Data provenance" description="Where the data on these screens comes from. Every demo dataset is synthetic.">
        <div className="flex flex-col gap-4 px-5 py-4 text-sm">
          {q.isLoading && <Loading label="Loading datasets" />}
          {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} title="Datasets could not be loaded" />}
          {q.data?.map((d) => (
            <section key={d.id} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold">{d.name}</h3>
                <DesignationBadge designation={d.designation} />
              </div>
              <p className="mt-1 text-ink-2">{d.source}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-ink-2">Coverage</dt><dd>{d.coverage_start ? `${fmtDate(d.coverage_start)} – ${fmtDate(d.coverage_end)}` : "Not recorded"}</dd>
                <dt className="text-ink-2">Records</dt><dd className="tabular">{d.row_count.toLocaleString()}</dd>
                <dt className="text-ink-2">Checksum</dt>
                <dd className="break-all">{d.checksum ? <><span className="font-mono text-xs">{d.checksum.slice(0, 16)}…</span> <span className="text-ink-2">({d.checksum_algorithm}, {d.checksum_basis === "uploaded_file" ? "uploaded file" : "canonical records"})</span></> : "Not recorded"}</dd>
              </dl>
              {d.known_limitations.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-ink-2">{d.known_limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              )}
              {role && canAccess(`/data/datasets/${d.id}`, role) && (
                <Link to={`/data/datasets/${d.id}`} onClick={() => onOpenChange(false)} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-teal-800 hover:underline">
                  Inspect dataset <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </section>
          ))}
          <p className="text-xs text-ink-2">IRIS is a research prototype. It is not an officially deployed Department of Health system and connects to no government system.</p>
        </div>
      </SheetContent>
    </Dialog>
  );
}

/** Dark footer with the standing disclaimer on every screen. */
export function Footer() {
  const [open, setOpen] = useState(false);
  return (
    <footer className="iris-footer">
      <div className="iris-container iris-footer__inner">
        <p className="text-white">IRIS <span aria-hidden>/</span> Integrated Reporting Intervention System</p>
        <p className="text-white">Synthetic demo records · Not verified public-health statistics · PHT (UTC+8)</p>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-1 hover:underline">
          Data provenance <ArrowUpRight className="size-3.5" aria-hidden />
        </button>
      </div>
      <ProvenanceDrawer open={open} onOpenChange={setOpen} />
    </footer>
  );
}
