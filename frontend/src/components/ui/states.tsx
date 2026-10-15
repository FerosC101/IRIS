import { AlertTriangle, Inbox, Loader2, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "@/services/client";
import { Button } from "./button";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-sm text-ink-2">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  );
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-line-strong bg-porcelain px-4 py-6 sm:items-center sm:text-center">
      <span className="text-ink-2">{icon ?? <Inbox className="size-5" aria-hidden />}</span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="max-w-prose text-sm text-ink-2">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "This section could not be loaded" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof ApiError || error instanceof Error ? error.message : "Unknown error.";
  const status = error instanceof ApiError ? error.status : undefined;
  return (
    <div role="alert" className="rounded-md border border-critical/30 bg-critical-bg px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-critical-ink">{title}</p>
          <p className="mt-0.5 text-sm text-ink">{message}</p>
          {status === 403 && <p className="mt-1 text-xs text-ink-2">Use the demo role selector to switch to a role with access.</p>}
          {onRetry && status !== 403 && status !== 404 && (
            <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
              <RotateCw aria-hidden /> Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const issues = error instanceof ApiError ? error.issues : [];
  return (
    <div role="alert" className="rounded-md border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical-ink">
      {message}
      {issues.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-ink">
          {issues.slice(0, 5).map((i, k) => <li key={k}>{i.row ? `Row ${i.row}: ` : ""}{i.message}</li>)}
        </ul>
      )}
    </div>
  );
}
