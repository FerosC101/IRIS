import { X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Role } from "@/types/api";

const KEY = "iris.hideGettingStarted";

const STEPS: Record<"rhu" | "other", { title: string; text: string; to?: string }[]> = {
  rhu: [
    { title: "Send missing reports", text: "Your list below shows reports that have not arrived yet." },
    { title: "Answer questions", text: "Reply when your coordinator asks about a report." },
    { title: "Track actions", text: "See support actions planned for your unit.", to: "/follow-up" },
  ],
  other: [
    { title: "Review", text: "Open a concern to see why it was flagged.", to: "/investigations" },
    { title: "Verify", text: "Confirm it with the unit, or close it as not a problem." },
    { title: "Act", text: "Choose what to fix first within your staff time.", to: "/planner" },
    { title: "Check recovery", text: "See whether reporting improved afterwards.", to: "/recovery" },
  ],
};

export function GettingStarted({ role }: { role: Role }) {
  const [hidden, setHidden] = useState(() => {
    try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  if (hidden) return null;
  const steps = STEPS[role === "rhu_staff" ? "rhu" : "other"].filter((s) => role !== "admin" || !s.to?.startsWith("/planner"));
  return (
    <section aria-labelledby="gs-title" className="relative rounded-md border border-line bg-aqua-50/60 px-4 py-3">
      <button type="button" aria-label="Hide this guide" className="absolute top-1.5 right-1.5 flex size-10 items-center justify-center rounded text-ink-2 hover:bg-white hover:text-ink sm:size-8"
        onClick={() => { setHidden(true); try { window.localStorage.setItem(KEY, "1"); } catch { /* not saved */ } }}>
        <X className="size-4" aria-hidden />
      </button>
      <h2 id="gs-title" className="mb-2 pr-10 text-sm font-semibold">How IRIS works</h2>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-900 text-xs font-semibold text-white">{i + 1}</span>
            <span className="text-[13px] leading-snug">
              {s.to ? <Link to={s.to} className="font-medium text-teal-900 hover:underline">{s.title}</Link> : <span className="font-medium text-ink">{s.title}</span>}
              <span className="block text-ink-2">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
