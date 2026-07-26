/**
 * Tailwind-style form controls (ring inset + indigo focus), shared by login/signup and settings.
 * Fixed **`h-10`** keeps inputs, native `<select>`s, and searchable combobox shells visually aligned.
 */
export const authFieldClass =
  "block h-10 min-h-10 w-full rounded-md border-0 bg-white px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6";

/** Shell wrapper for searchable selects — same outer height as `authFieldClass`. */
export const authSearchableShellClass =
  "flex h-10 min-h-10 w-full min-w-0 items-stretch overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm transition-[color,box-shadow] focus-within:border-transparent focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-0";

/** Leading adornment column inside `authSearchableShellClass` (flag, icon, currency symbol slot). */
export const authSearchableLeadingClass =
  "flex shrink-0 items-center justify-center self-stretch border-r border-gray-200 bg-slate-50";

/** Inner text field for searchable comboboxes — pairs with `authSearchableShellClass`. */
export const authSearchableInputClass =
  "min-h-0 min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 sm:text-sm sm:leading-6";

export const authLabelClass = "mb-2 block text-sm font-medium leading-6 text-gray-900";

/** Supporting line between label and control (contrast-safe on white). */
export const authHintClass = "mb-2 text-sm text-slate-600";

/** Supporting line **below** the control — default pattern for field-level help or previews. */
export const authFieldDescriptionClass = "mt-2 text-sm leading-relaxed text-slate-600";

/**
 * Read-only values that must stay visible and copyable (e.g. account email).
 *
 * Prefer **`readOnly`** over **`disabled`**: disabled controls are skipped or de-emphasized by
 * assistive tech, often fail contrast checks for their values, and typically cannot receive focus
 * for selection/copy. Use `readOnly` + this class for non-editable identity fields; reserve
 * `disabled` for controls that are temporarily unavailable (e.g. while submitting).
 */
export const authFieldReadOnlyClass =
  "block w-full cursor-text select-text rounded-md border-0 bg-slate-100 px-3 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 sm:text-sm sm:leading-6 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-500";

/** Small pill next to a label marking a field as read-only (not only color). */
export const authReadOnlyBadgeClass =
  "inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700";
