import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { canAccess } from "@/lib/navigation";
import { tourFor, type TourStep } from "@/lib/tour";
import { api } from "@/services/api";

interface TourCtx { start: () => void; active: boolean }
const Ctx = createContext<TourCtx>({ start: () => {}, active: false });
export const useTour = () => useContext(Ctx);

const WAIT_MS = 5000;
const PAD = 8;

/** A concern to show: a new count-drop flag if there is one (it has the clearest chart), else the highest-priority
 *  open concern the user can see. The tour never names a fixed id. */
async function firstConcernLink(): Promise<string | null> {
  const drop = await api.concerns({ status: "open", concern_type: "count_drop", sort: "severity", order: "asc", page_size: 5 });
  if (drop.rows[0]) return drop.rows[0].link;
  const any = await api.concerns({ status: "active", sort: "severity", order: "asc", page_size: 5 });
  return any.rows[0]?.link ?? null;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { role } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [i, setI] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const concernLink = useRef<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const active = i >= 0 && i < steps.length;
  const step = active ? steps[i] : null;

  const stop = useCallback(() => { setI(-1); setRect(null); }, []);
  const start = useCallback(() => {
    if (!role) return;
    concernLink.current = null;
    setSteps(tourFor(role).filter((s) => s.route === "first-concern" || canAccess(s.route, role)));
    setMissing(false);
    setI(0);
  }, [role]);

  // Go to the step's page, then wait for its element and bring it into view.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    let timer = 0;
    setRect(null);
    setMissing(false);
    (async () => {
      let route = step.route;
      if (route === "first-concern") {
        concernLink.current = concernLink.current ?? (await firstConcernLink().catch(() => null));
        route = concernLink.current ?? "/investigations";
      }
      if (cancelled) return;
      if (loc.pathname !== route) nav(route);
      const t0 = Date.now();
      const look = () => {
        if (cancelled) return;
        const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
        if (el && el.getBoundingClientRect().height > 0) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          timer = window.setTimeout(() => !cancelled && setRect(el.getBoundingClientRect()), 450);
        } else if (Date.now() - t0 < WAIT_MS) timer = window.setTimeout(look, 120);
        else setMissing(true);
      };
      look();
    })();
    return () => { cancelled = true; window.clearTimeout(timer); };
    // The location is read once per step on purpose; navigating inside the step must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, nav, qc]);

  // Follow the element while the page scrolls or resizes.
  useEffect(() => {
    if (!step) return;
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [step]);

  useEffect(() => { if (missing && active) setI((n) => n + 1); }, [missing, active]);
  useEffect(() => { if (i >= steps.length && steps.length) stop(); }, [i, steps.length, stop]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      else if (e.key === "ArrowRight") setI((n) => n + 1);
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stop]);

  useLayoutEffect(() => { if (rect) card.current?.focus({ preventScroll: true }); }, [rect, i]);

  const value = useMemo(() => ({ start, active }), [start, active]);

  // Card placement: below the element when there is room, otherwise above; clamped to the window.
  let cardStyle: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (rect) {
    const w = Math.min(360, window.innerWidth - 32);
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 16);
    const below = rect.bottom + PAD + 12;
    const fitsBelow = below + 190 < window.innerHeight;
    cardStyle = fitsBelow ? { left, top: below, width: w } : { left, top: Math.max(16, rect.top - PAD - 12 - 190), width: w };
    if (!fitsBelow && rect.top < 220) cardStyle = { left, top: Math.max(16, window.innerHeight - 216), width: w };
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {step && (
        <div className="iris-tour" aria-live="polite">
          {rect ? (
            <div className="iris-tour__spot" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} aria-hidden />
          ) : <div className="iris-tour__dim" aria-hidden />}
          <div ref={card} className="iris-tour__card" role="dialog" aria-modal="false" aria-labelledby="tour-title" tabIndex={-1} style={cardStyle}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold tracking-wide text-teal-700 uppercase">Step {i + 1} of {steps.length}</p>
              <button type="button" onClick={stop} className="-mt-1 -mr-1 rounded p-1 text-ink-2 hover:bg-tint hover:text-ink" aria-label="End the tour"><X className="size-4" aria-hidden /></button>
            </div>
            <h2 id="tour-title" className="mt-1 font-display text-[18px] leading-snug font-medium text-ink">{step.title}</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{rect ? step.body : "Opening the page…"}</p>
            <div className="mt-4 flex items-center gap-2">
              <div className="flex gap-1" aria-hidden>
                {steps.map((_s, n) => <span key={n} className={n === i ? "h-1.5 w-4 rounded-full bg-teal-900" : "size-1.5 rounded-full bg-line-strong"} />)}
              </div>
              <div className="ml-auto flex gap-2">
                {i > 0 && <button type="button" className="iris-tour__btn iris-tour__btn--ghost" onClick={() => setI((n) => n - 1)}>Back</button>}
                <button type="button" className="iris-tour__btn" onClick={() => (i === steps.length - 1 ? stop() : setI((n) => n + 1))}>{i === steps.length - 1 ? "Finish" : "Next"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
