/**
 * CrmModal
 *
 * Accessible modal shell for CRM create/edit dialogs.
 *
 * Responsibilities:
 * - Lock body scroll and close on Escape while open
 * - Backdrop click to dismiss; optional wide panel variant
 * - Single vertical scroll on the dialog body (sticky title bar); no nested page scroll
 * - Spread extra props onto the dialog panel (e.g. drag-and-drop handlers)
 *
 * Related:
 * - All CRM `*Modal` components under this folder
 */
import { X } from "lucide-react";
import { useEffect, type HTMLAttributes, type ReactNode } from "react";

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** ~20% wider than default on `md+` (60vw cap vs 50vw) for dense edit forms. */
  wide?: boolean;
  /** Spread onto the white dialog panel (e.g. whole-dialog drag-and-drop). */
  panelProps?: HTMLAttributes<HTMLDivElement>;
};

/** Shared CRM dialog wrapper with title bar and close control. */
export const CrmModal = ({ title, open, onClose, children, wide, panelProps }: Props) => {
  const { className: panelClassFromProps, ...panelRest } = panelProps ?? {};
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-900/50 px-4 py-6 sm:py-10">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-modal-title"
        className={[
          "relative z-10 flex max-h-[min(90dvh,920px)] w-full max-w-none flex-col rounded-2xl border border-stone-200 bg-white shadow-xl",
          wide ? "md:w-[min(92vw,60vw)]" : "md:w-[min(92vw,50vw)]",
          panelClassFromProps ?? ""
        ]
          .filter(Boolean)
          .join(" ")}
        {...panelRest}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-100 px-5 py-4 sm:px-6">
          <h2 id="crm-modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            title="Close"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            <span className="sr-only">Close</span>
            <X className="h-5 w-5" aria-hidden strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:pb-6">{children}</div>
      </div>
    </div>
  );
};
