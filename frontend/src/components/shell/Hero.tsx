import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { PHOTOS, type PhotoKey } from "@/assets";
import { cn } from "@/lib/utils";

export type HeroVariant = "bright" | "deep";

/**
 * Screen banner: the raw photo in grayscale under a teal gradient (CSS only).
 * If the photo cannot load, the gradient alone is shown. The photo is
 * decorative; the headline carries the meaning.
 */
export function Hero({ variant, photo, position = "50% 50%", zoom = 1, showPhoto = true, eyebrow, title, subtitle, updated, actions, className, size = "full" }: {
  variant: HeroVariant;
  /** "compact" is a slim title strip for working screens, so their content starts higher. */
  size?: "full" | "compact";
  photo: PhotoKey;
  /** CSS object-position for the crop, e.g. "62% 40%". */
  position?: string;
  /** Extra magnification of the crop around `position` (1 = cover). */
  zoom?: number;
  /** false shows the gradient alone, as when the photo fails to load. */
  showPhoto?: boolean;
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** e.g. "Updated 08 Oct 2026 · 09:00 PHT"; shown top right on its own scrim. */
  updated?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const p = PHOTOS[photo];
  const [failed, setFailed] = useState(false);
  const titleId = useId();
  const style = { "--hero-photo-position": position, "--hero-photo-scale": p.edgeCrop * zoom } as CSSProperties;
  return (
    <section className={cn("iris-hero", className)} data-variant={variant} data-size={size} style={style} aria-labelledby={titleId}>
      {showPhoto && !failed && (
        <picture className="iris-hero__photo" aria-hidden="true">
          <source type="image/avif" srcSet={p.avif} sizes="(min-width: 1440px) 1344px, 100vw" />
          <source type="image/webp" srcSet={p.webp} sizes="(min-width: 1440px) 1344px, 100vw" />
          <img src={p.png} alt="" width={p.width} height={p.height} loading="eager" decoding="async" fetchPriority="high"
            style={{ objectPosition: position }} onError={() => setFailed(true)} />
        </picture>
      )}
      <div className="iris-hero__overlay" aria-hidden="true" />
      <div className="iris-hero__vignette" aria-hidden="true" />
      {updated && <p className="iris-hero__updated">{updated}</p>}
      <div className="iris-hero__content">
        <p className="iris-hero__eyebrow">{eyebrow}</p>
        <h1 id={titleId} className="iris-hero__title">{title}</h1>
        {subtitle && <p className="iris-hero__subtitle">{subtitle}</p>}
        {actions && <div className="iris-hero__actions">{actions}</div>}
      </div>
    </section>
  );
}

/** The white button used inside a hero. */
export function HeroAction({ icon, children, ...props }: { icon?: ReactNode; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="iris-hero__action" {...props}>
      {icon}
      {children}
    </button>
  );
}
