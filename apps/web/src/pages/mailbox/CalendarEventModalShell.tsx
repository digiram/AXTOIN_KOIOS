/**
 * Calendar Event Modal Shell.
 *
 * Modal dialog for a focused mailbox create, edit, or confirmation flow.
 *
 * Responsibilities:
 * - Collect and validate user input for a single action
 * - Submit changes to tenant APIs and surface errors inline
 *
 * Related:
 * - Route: /admin/mailbox
 *
 * Security:
 * - Submissions use authenticated tenant API helpers
 */
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

/** Modal UI for a focused mailbox workflow. */
export const CalendarEventModalShell = ({ title, open, onClose, children, footer }: Props) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-modal-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        style={{ width: "min(80vw, 64rem)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-white px-6 py-4">
          <h2 id="calendar-event-modal-title" className="text-lg font-semibold text-indigo-950">
            {title}
          </h2>
          <button
            type="button"
            title="Close"
            onClick={onClose}
            className="rounded-md p-2 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-800"
          >
            <span className="sr-only">Close</span>
            <X className="h-5 w-5" aria-hidden strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="shrink-0 border-t border-indigo-100 bg-indigo-50/30 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
};
