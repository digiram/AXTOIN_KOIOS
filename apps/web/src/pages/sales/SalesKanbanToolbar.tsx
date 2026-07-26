/**
 * SalesKanbanToolbar.
 *
 * Shared filter and action bar above BDR and pipeline kanban boards.
 *
 * Responsibilities:
 * - Debounced search input bound to parent draft state
 * - Expose add-lane and add-record actions when `canEdit` is true
 */

const inputClass =
  "h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";

const btnSecondaryClass =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50";

const btnPrimaryClass =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50";
type Props = {
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  searchPlaceholder?: string;
  canEdit: boolean;
  readOnlyHint?: string;
  onAddLane: () => void;
  onAddRecord: () => void;
  addRecordLabel: string;
  busy?: boolean;
};

/**
 * Kanban toolbar with search, add-lane, and add-record controls.
 *
 * @param props.canEdit - Shows mutation buttons; otherwise optional read-only hint
 * @param props.addRecordLabel - Board-specific label (e.g. "Add lead" / "Add deal")
 */
export const SalesKanbanToolbar = ({
  searchDraft,
  onSearchDraftChange,
  searchPlaceholder = "Title or description",
  canEdit,
  readOnlyHint,
  onAddLane,
  onAddRecord,
  addRecordLabel,
  busy = false
}: Props) => {
  return (
    <div className="shrink-0 rounded-xl border border-stone-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-stone-600">
          Search
          <input
            className={inputClass}
            value={searchDraft}
            onChange={(e) => onSearchDraftChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search pipeline by title or description"
          />
        </label>
        {canEdit ? (
          <>
            <button
              type="button"
              disabled={busy}
              className={btnSecondaryClass}
              onClick={onAddLane}
            >
              Add lane
            </button>
            <button
              type="button"
              disabled={busy}
              className={btnPrimaryClass}
              onClick={onAddRecord}
            >
              {addRecordLabel}
            </button>
          </>
        ) : readOnlyHint ? (
          <p className="text-xs text-stone-500">{readOnlyHint}</p>
        ) : null}
      </div>
    </div>
  );
};
