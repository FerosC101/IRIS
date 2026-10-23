/**
 * Every image the interface uses is imported here.
 *
 * Photos are the supplied originals, untouched. Grayscale and the teal
 * overlays are applied in CSS (see Hero and PhotoSurface). The optimized
 * WebP/AVIF copies are resized only (scripts/optimize-images.mjs); the PNG is
 * the fallback for browsers without either format.
 */
import lightboxPng from "./hero/hero-lightbox.png";
import maskedPng from "./hero/hero-masked-closeup.png";
import orLightPng from "./hero/hero-or-light.png";
import orWindowPng from "./hero/hero-or-window.png";
import stethoscopePng from "./hero/hero-stethoscope.png";
import lightboxAvif1440 from "./hero/optimized/hero-lightbox-1440.avif";
import lightboxAvif1920 from "./hero/optimized/hero-lightbox-1920.avif";
import lightboxAvif960 from "./hero/optimized/hero-lightbox-960.avif";
import lightboxWebp1440 from "./hero/optimized/hero-lightbox-1440.webp";
import lightboxWebp1920 from "./hero/optimized/hero-lightbox-1920.webp";
import lightboxWebp960 from "./hero/optimized/hero-lightbox-960.webp";
import maskedAvif1440 from "./hero/optimized/hero-masked-closeup-1440.avif";
import maskedAvif1920 from "./hero/optimized/hero-masked-closeup-1920.avif";
import maskedAvif960 from "./hero/optimized/hero-masked-closeup-960.avif";
import maskedWebp1440 from "./hero/optimized/hero-masked-closeup-1440.webp";
import maskedWebp1920 from "./hero/optimized/hero-masked-closeup-1920.webp";
import maskedWebp960 from "./hero/optimized/hero-masked-closeup-960.webp";
import orLightAvif1440 from "./hero/optimized/hero-or-light-1440.avif";
import orLightAvif1920 from "./hero/optimized/hero-or-light-1920.avif";
import orLightAvif960 from "./hero/optimized/hero-or-light-960.avif";
import orLightWebp1440 from "./hero/optimized/hero-or-light-1440.webp";
import orLightWebp1920 from "./hero/optimized/hero-or-light-1920.webp";
import orLightWebp960 from "./hero/optimized/hero-or-light-960.webp";
import orWindowAvif1440 from "./hero/optimized/hero-or-window-1440.avif";
import orWindowAvif1920 from "./hero/optimized/hero-or-window-1920.avif";
import orWindowAvif960 from "./hero/optimized/hero-or-window-960.avif";
import orWindowWebp1440 from "./hero/optimized/hero-or-window-1440.webp";
import orWindowWebp1920 from "./hero/optimized/hero-or-window-1920.webp";
import orWindowWebp960 from "./hero/optimized/hero-or-window-960.webp";
import stethoscopeAvif1440 from "./hero/optimized/hero-stethoscope-1440.avif";
import stethoscopeAvif1920 from "./hero/optimized/hero-stethoscope-1920.avif";
import stethoscopeAvif960 from "./hero/optimized/hero-stethoscope-960.avif";
import stethoscopeWebp1440 from "./hero/optimized/hero-stethoscope-1440.webp";
import stethoscopeWebp1920 from "./hero/optimized/hero-stethoscope-1920.webp";
import stethoscopeWebp960 from "./hero/optimized/hero-stethoscope-960.webp";
import logoDarkTeal from "./brand/logo-dark-teal.png";
import logoWhite from "./brand/logo-white.png";

export type PhotoKey = "stethoscope" | "maskedCloseup" | "orWindow" | "orLight" | "lightbox";

export interface Photo {
  /** Original PNG, used as the fallback source. */
  png: string;
  avif: string;
  webp: string;
  width: number;
  height: number;
  /** What the photo shows, for documentation. Photos are decorative (alt=""). */
  subject: string;
  /** Scale that hides white edge strips in the original file (CSS crop only). */
  edgeCrop: number;
}

const srcset = (s960: string, s1440: string, s1920: string) => `${s960} 960w, ${s1440} 1440w, ${s1920} 1920w`;

export const PHOTOS: Record<PhotoKey, Photo> = {
  stethoscope: {
    png: stethoscopePng, avif: srcset(stethoscopeAvif960, stethoscopeAvif1440, stethoscopeAvif1920),
    webp: srcset(stethoscopeWebp960, stethoscopeWebp1440, stethoscopeWebp1920), width: 1920, height: 1080,
    subject: "Gloved hand on a tablet, stethoscope", edgeCrop: 1,
  },
  maskedCloseup: {
    png: maskedPng, avif: srcset(maskedAvif960, maskedAvif1440, maskedAvif1920),
    webp: srcset(maskedWebp960, maskedWebp1440, maskedWebp1920), width: 1920, height: 1080,
    subject: "Masked clinician under surgical lights, close-up", edgeCrop: 1,
  },
  orWindow: {
    png: orWindowPng, avif: srcset(orWindowAvif960, orWindowAvif1440, orWindowAvif1920),
    webp: srcset(orWindowWebp960, orWindowWebp1440, orWindowWebp1920), width: 1920, height: 1080,
    subject: "Operating-room team beside a window", edgeCrop: 1.004, // 1 px light line at the bottom edge
  },
  orLight: {
    png: orLightPng, avif: srcset(orLightAvif960, orLightAvif1440, orLightAvif1920),
    webp: srcset(orLightWebp960, orLightWebp1440, orLightWebp1920), width: 1920, height: 1080,
    subject: "Operating-room team under a surgical light", edgeCrop: 1.012, // 6 px white strip right, ~2 px top
  },
  lightbox: {
    png: lightboxPng, avif: srcset(lightboxAvif960, lightboxAvif1440, lightboxAvif1920),
    webp: srcset(lightboxWebp960, lightboxWebp1440, lightboxWebp1920), width: 1920, height: 1080,
    subject: "Clinicians at a lightbox of scans (reserved, unused)", edgeCrop: 1,
  },
};

/**
 * Logo marks as supplied (transparent PNG, 527x527, mark only). The dark-teal
 * mark is used on light surfaces and the white mark on dark ones; the "IRIS"
 * wordmark is typeset next to it. Set `onDark` to null to show the wordmark alone.
 */
export const BRAND: { alt: string; onLight: string; onDark: string | null } = {
  alt: "IRIS",
  onLight: logoDarkTeal,
  onDark: logoWhite,
};
