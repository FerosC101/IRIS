import { cn } from "@/lib/utils";

export type LogoVariant = "updated" | "glossy" | "flat" | "vector";

export const IRIS_LOGOS: Record<LogoVariant, string> = {
  updated: "/brand/iris_logo_updated.png",
  glossy: "/brand/iris_logo_glossy_original.png",
  flat: "/brand/iris_logo_flat_transparent.png",
  vector: "/brand/iris_logo_vector.svg",
};

/** Supplied artwork only. Contain preserves its native proportions at any size.
 * Glossy and flat variants are ready for the future access-screen composition. */
export function LogoMark({ className, tone = "light", variant }: {
  className?: string; tone?: "light" | "dark"; variant?: LogoVariant;
}) {
  return (
    <img src={IRIS_LOGOS[variant ?? (tone === "dark" ? "vector" : "updated")]}
      alt="" aria-hidden="true" className={cn("size-12 shrink-0 object-contain", className)} />
  );
}

export function Logo({ tone = "light", subtitle = false, className }: {
  tone?: "light" | "dark"; subtitle?: boolean; className?: string;
}) {
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
