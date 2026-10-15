import { FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";

/** One quiet line that keeps the prototype status visible on every page. */
export function DemoBanner() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-mist-50 px-4 py-1.5 text-xs text-info-ink lg:px-8">
      <p className="flex items-center gap-1.5 font-medium">
        <FlaskConical className="size-3.5 shrink-0" aria-hidden />
        <span>Demo — simulated data<span className="hidden sm:inline"> · research prototype, not a DOH system</span></span>
      </p>
      <Link to="/help#limitations" className="shrink-0 text-ink-2 underline-offset-2 hover:text-teal-900 hover:underline">About this demo</Link>
    </div>
  );
}
