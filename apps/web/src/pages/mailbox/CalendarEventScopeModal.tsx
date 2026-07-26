/**
 * Calendar Event Scope modal.
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
import type { CalendarRecurrenceScope } from "@starter/shared";

import { CalendarEventModalShell } from "./CalendarEventModalShell.js";

type Props = {
  open: boolean;
  mode: "save" | "delete";
  onClose: () => void;
  onSelect: (scope: CalendarRecurrenceScope) => void;
};

const OPTIONS: { scope: CalendarRecurrenceScope; label: string; description: string }[] = [
  {
    scope: "this",
    label: "This occurrence",
    description: "Only this instance of the recurring event."
  },
  {
    scope: "future",
    label: "This and future",
    description: "This instance and all events after it."
  },
  {
    scope: "series",
    label: "Entire series",
    description: "Every occurrence in the series."
  }
];

/** Modal UI for a focused mailbox workflow. */
export const CalendarEventScopeModal = ({ open, mode, onClose, onSelect }: Props) => (
  <CalendarEventModalShell
    title={mode === "delete" ? "Delete recurring event" : "Edit recurring event"}
    open={open}
    onClose={onClose}
  >
    <p className="mb-4 text-sm text-slate-600">
      {mode === "delete"
        ? "Which occurrences should be deleted?"
        : "Which occurrences should be updated?"}
    </p>
    <div className="space-y-2">
      {OPTIONS.map((option) => (
        <button
          key={option.scope}
          type="button"
          className={[
            "w-full rounded-md border px-4 py-3 text-left transition-colors",
            mode === "delete"
              ? "border-red-200 bg-white hover:border-red-300 hover:bg-red-50"
              : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50"
          ].join(" ")}
          onClick={() => onSelect(option.scope)}
        >
          <span className="block text-sm font-medium text-slate-900">{option.label}</span>
          <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
        </button>
      ))}
    </div>
  </CalendarEventModalShell>
);
