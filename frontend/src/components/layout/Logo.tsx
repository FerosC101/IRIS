import { BRAND } from "@/assets";
import { cn } from "@/lib/utils";

/**
 * IRIS brand: the supplied mark (white on dark surfaces, dark teal on light
 * ones) plus the typeset wordmark, as in the mockups. The mark's file has wide
 * transparent bands above and below; object-fit: cover trims them in CSS. The
 * logo files themselves are never edited or recoloured.
 */
export function Logo({ surface = "dark", className, size = "md" }: { surface?: "dark" | "light"; className?: string; size?: "sm" | "md" }) {
  const mark = surface === "light" ? BRAND.onLight : BRAND.onDark;
  const w = size === "sm" ? 36 : 46;
  const h = Math.round(w * 0.54); // the mark's visible area is 502x268 of its 527x527 canvas
  return (
    <span className={cn("inline-flex items-center gap-[11px]", surface === "dark" ? "text-white" : "text-teal-900", className)}>
      {mark && <img src={mark} alt={BRAND.alt} width={w} height={h} className="shrink-0 object-cover" style={{ width: w, height: h }} />}
      <span className={cn("iris-wordmark", size === "sm" && "text-[20px]")} aria-hidden={mark ? true : undefined}>IRIS</span>
    </span>
  );
}
