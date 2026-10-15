import { cn } from "@/lib/utils";

/**
 * IRIS symbol: a central reporting unit connected to three others. Flat
 * circles and lines only, so it reproduces at any size.
 */
export function LogoMark({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const line = tone === "light" ? "#E9F5F3" : "#103E46";
  const hub = tone === "light" ? "#E9F5F3" : "#103E46";
  const node = tone === "light" ? "#7FC4BE" : "#188F89";
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden focusable="false">
      <g stroke={line} strokeWidth="2" strokeLinecap="round">
        <line x1="16" y1="16" x2="16" y2="6.5" />
        <line x1="16" y1="16" x2="7.5" y2="21.5" />
        <line x1="16" y1="16" x2="24.5" y2="21.5" />
        <line x1="7.5" y1="21.5" x2="24.5" y2="21.5" strokeOpacity="0.45" />
      </g>
      <circle cx="16" cy="16" r="3.6" fill={hub} />
      <circle cx="16" cy="6.5" r="2.8" fill={node} />
      <circle cx="7.5" cy="21.5" r="2.8" fill={node} />
      <circle cx="24.5" cy="21.5" r="2.8" fill={node} />
    </svg>
  );
}

export function Logo({ tone = "light", subtitle = false, className }: { tone?: "light" | "dark"; subtitle?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark tone={tone} />
      <span className="flex flex-col leading-none">
        <span className={cn("text-xl font-bold tracking-[0.08em]", tone === "light" ? "text-white" : "text-teal-900")}>IRIS</span>
        {subtitle && <span className={cn("mt-1 text-[10.5px] leading-tight", tone === "light" ? "text-aqua-50/80" : "text-ink-2")}>Integrated Reporting Intervention System</span>}
      </span>
      <span className="sr-only">— Integrated Reporting Intervention System</span>
    </span>
  );
}
