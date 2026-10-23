import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTrigger, SheetContent } from "./dialog";

/**
 * Modal: a centred dialog (a bottom sheet on phones). Escape and the close
 * button dismiss it, focus is trapped while open and returns to the trigger.
 * Pass `trigger` for an uncontrolled modal, or `open`/`onOpenChange`.
 */
export function Modal({ title, description, children, footer, trigger, open, onOpenChange, size = "md", dismissible = true }: {
  title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; trigger?: ReactNode;
  open?: boolean; onOpenChange?: (o: boolean) => void; size?: "sm" | "md" | "lg";
  /** false keeps it open while work is saving (Escape and the overlay do nothing). */
  dismissible?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !dismissible) return; onOpenChange?.(o); }}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent title={title} description={description} footer={footer} size={size}>{children}</DialogContent>
    </Dialog>
  );
}

/** Drawer: a side panel for details (full width on phones). Same keyboard behaviour as Modal. */
export function Drawer({ title, description, children, footer, trigger, open, onOpenChange, size = "md", side = "right" }: {
  title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; trigger?: ReactNode;
  open?: boolean; onOpenChange?: (o: boolean) => void; size?: "md" | "lg"; side?: "right" | "left";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <SheetContent title={title} description={description} footer={footer} size={size} side={side}>
        <div className="px-5 py-4">{children}</div>
      </SheetContent>
    </Dialog>
  );
}
