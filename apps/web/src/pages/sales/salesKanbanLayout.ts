/** Kanban fills the viewport below shell header, sales tabs, and filter toolbar. */
export const salesKanbanRootClass =
  "flex h-[calc(100dvh-12rem)] max-h-[calc(100dvh-12rem)] min-h-[18rem] w-full min-w-0 flex-col gap-4 overflow-hidden sm:h-[calc(100dvh-12.5rem)] sm:max-h-[calc(100dvh-12.5rem)] lg:h-[calc(100dvh-13.25rem)] lg:max-h-[calc(100dvh-13.25rem)]";

/** Full width like the search toolbar; lanes share space equally (`flex-1`). Horizontal scroll only if min-width forces overflow. */
export const salesKanbanBoardRowClass =
  "flex min-h-0 w-full min-w-0 flex-1 items-stretch gap-4 overflow-x-auto overflow-y-hidden pb-1";

export const salesKanbanLaneShellClass =
  "flex h-full min-h-0 min-w-[12rem] flex-1 basis-0 flex-col rounded-xl border bg-stone-50/90 ring-1";

export const salesKanbanLaneScrollClass = "min-h-0 flex-1 overflow-x-hidden overflow-y-auto";
