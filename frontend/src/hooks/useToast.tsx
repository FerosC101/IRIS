import { CheckCircle2, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Toast { id: number; message: string; tone: "success" | "error" }
const Ctx = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

/** Brief confirmations announced to screen readers through a polite live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 8000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-md border border-line bg-white px-3 py-2.5 text-sm shadow-md">
            {t.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive-ink" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-critical-ink" aria-hidden />}
            <p className="flex-1 text-ink">{t.message}</p>
            <button type="button" className="-m-1 rounded p-1 text-ink-2 hover:text-ink" aria-label="Dismiss message" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
