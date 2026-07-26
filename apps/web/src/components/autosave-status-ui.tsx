/**
 * autosave-status-ui
 *
 * Shared visual and screen-reader status for blur-autosave fields.
 *
 * Responsibilities:
 * - Define the autosave status union and reset timing constant
 * - Render right-aligned status icons (pencil, spinner, check, error)
 * - Provide an sr-only live region for save announcements
 *
 * Related:
 * - `AutosaveTextField`, `AutosaveFieldWrap`
 */
import { Check, Loader2, Pencil, X } from "lucide-react";

/** Align with blur-autosave reset delay (see `AutosaveTextField`). */
export const AUTOSAVE_UI_RESET_MS = 2200;

/** UI phase for an autosave field (maps to icon + live-region copy). */
export type AutosaveUiStatus = "idle" | "saving" | "saved" | "error";

type IconsProps = {
  status: AutosaveUiStatus;
  /** Focus / interaction — shows pencil when status is idle. */
  isActive: boolean;
};

/** Right-aligned pencil · spinner · check · error icons (absolute layer). */
export function AutosaveStatusIcons({ status, isActive }: IconsProps) {
  const showPencil = isActive && status !== "saving" && status !== "saved";
  const showSpinner = status === "saving";
  const showCheck = status === "saved";
  const showError = status === "error";

  return (
    <span
      className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-10 items-center justify-center text-slate-500"
      aria-hidden
    >
      {showPencil ? <Pencil className="h-4 w-4" aria-hidden strokeWidth={2} /> : null}
      {showSpinner ? (
        <Loader2 className="h-4 w-4 animate-spin text-indigo-600" aria-hidden strokeWidth={2} />
      ) : null}
      {showCheck ? <Check className="h-4 w-4 text-emerald-600" aria-hidden strokeWidth={2} /> : null}
      {showError ? <X className="h-4 w-4 text-rose-600" aria-hidden strokeWidth={2} /> : null}
    </span>
  );
}

type LiveProps = {
  statusId: string;
  status: AutosaveUiStatus;
  /** When true (blur autosave text fields), error announces revert copy. */
  errorAnnounceRevert?: boolean;
};

export function AutosaveStatusLiveRegion({ statusId, status, errorAnnounceRevert }: LiveProps) {
  return (
    <p id={statusId} className="sr-only" role="status" aria-live="polite">
      {status === "saving" ? "Saving…" : ""}
      {status === "saved" ? "Saved." : ""}
      {status === "error"
        ? errorAnnounceRevert
          ? "Could not save. Reverted to last saved value."
          : "Could not save."
        : ""}
    </p>
  );
}
