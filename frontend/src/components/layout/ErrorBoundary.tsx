import { AlertTriangle, RotateCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Catches a rendering error in one part of the screen so the rest of IRIS
 * (navigation, footer) keeps working. `resetKey` (e.g. the path) clears the
 * error when the user navigates away.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string; title?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("IRIS screen error", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto my-8 flex max-w-xl flex-col items-start gap-3 rounded-lg border border-line-strong bg-white p-6">
        <p className="flex items-center gap-2 font-display text-[19px] font-medium"><AlertTriangle className="size-5 text-critical" aria-hidden />{this.props.title ?? "This part of IRIS could not be shown"}</p>
        <p className="text-sm text-ink-2">Something went wrong while drawing this screen. Your data is unchanged. Try again, or go back to the dashboard.</p>
        <p className="font-mono text-xs break-all text-ink-2">{this.state.error.message}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => this.setState({ error: null })}><RotateCw aria-hidden /> Try again</Button>
          <a href="/" className="iris-button iris-button-secondary inline-flex min-h-10 items-center px-4 text-sm font-semibold">Go to the dashboard</a>
        </div>
      </div>
    );
  }
}
