import { useId, useState, type ReactNode } from "react";

/** Data-table alternatives for charts. No chart library, so any chart can use them. */
export function DataTableToggle({ children, label = "Show data table" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-2">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="min-h-11 text-xs font-medium text-teal-900 underline-offset-2 hover:underline sm:min-h-0">
        {open ? "Hide data table" : label}
      </button>
      {open && <div id={id} className="mt-2 max-h-72 overflow-auto rounded-sm border border-line">{children}</div>}
    </div>
  );
}

export function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className={`w-full text-xs ${head.length >= 4 ? "min-w-[34rem]" : ""}`}>
      <thead className="sticky top-0 bg-porcelain">
        <tr>{head.map((h) => <th key={h} scope="col" className="px-2 py-1.5 text-left font-semibold text-ink-2">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-2 py-1 tabular">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
