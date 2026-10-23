import { BRAND } from "@/assets";
import { cn } from "@/lib/utils";

/**
 * IRIS brand. On light surfaces: the supplied dark-teal mark plus the
 * wordmark. On dark surfaces: the typeset wordmark only, until a transparent
 * light mark is supplied (BRAND.onDark). Logo files are never recoloured.
 */
export function Logo({ surface = "dark", className, size = "md" }: { surface?: "dark" | "light"; className?: string; size?: "sm" | "md" }) {
  const mark = surface === "light" ? BRAND.onLight : BRAND.onDark;
  const px = size === "sm" ? 28 : 36;
  return (
    <span className={cn("inline-flex items-center gap-2", surface === "dark" ? "text-white" : "text-teal-900", className)}>
      {mark && <img src={mark} alt={BRAND.alt} width={px} height={px} className="shrink-0 object-contain" style={{ width: px, height: px }} />}
      <span className={cn("iris-wordmark", size === "sm" && "text-[20px]")} aria-hidden={mark ? true : undefined}>IRIS</span>
    </span>
  );
}
