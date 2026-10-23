import { useState, type ReactNode } from "react";
import { PHOTOS, type PhotoKey } from "@/assets";
import { cn } from "@/lib/utils";

/**
 * Smaller cards and banners that reuse a hero photo under their own overlay.
 * - "deep": dark teal at high opacity, photo faintly visible, white text
 *   (pipeline strip, human-confirmed callout, shared-disruption check)
 * - "light": pale blue-tinted, dark text ("A pattern worth checking")
 * - "teal": teal gradient with a light centre, dark text ("Close the loop")
 * Every variant keeps its text at WCAG AA contrast; the photo is decorative
 * and lazy-loaded, and the overlay alone is shown if it fails to load.
 */
export function PhotoSurface({ variant, photo, position = "50% 50%", as: As = "div", className, children, ...rest }: {
  variant: "deep" | "light" | "teal";
  photo: PhotoKey;
  position?: string;
  as?: "div" | "section" | "aside";
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const p = PHOTOS[photo];
  const [failed, setFailed] = useState(false);
  return (
    <As className={cn("iris-photo-surface", className)} data-variant={variant} {...rest}>
      {!failed && (
        <picture aria-hidden="true">
          <source type="image/avif" srcSet={p.avif} sizes="(min-width: 1024px) 700px, 100vw" />
          <source type="image/webp" srcSet={p.webp} sizes="(min-width: 1024px) 700px, 100vw" />
          <img className="iris-photo-surface__photo" src={p.png} alt="" width={p.width} height={p.height} loading="lazy" decoding="async"
            style={{ objectPosition: position, transform: `scale(${p.edgeCrop})` }} onError={() => setFailed(true)} />
        </picture>
      )}
      <div className="iris-photo-surface__overlay" aria-hidden="true" />
      {children}
    </As>
  );
}
