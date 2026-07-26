/**
 * SortableKanbanLane.
 *
 * Draggable kanban column shell with lane header, count badge, and configure action.
 *
 * Responsibilities:
 * - Wire @dnd-kit `useSortable` when `canEditLanes` is true
 * - Highlight "Ready for Sales" BDR lanes and drop-target hover state
 *
 * Depends on:
 * - {@link laneDndId}, {@link salesKanbanLaneShellClass}
 */

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings } from "lucide-react";

import { laneDndId } from "./salesKanbanDnd.js";
import { salesKanbanLaneShellClass } from "./salesKanbanLayout.js";

type Stage = {
  id: string;
  stageKey: string;
  name: string;
  /** BDR lane marked “Ready for Sales” — purple accent (Sales Won/Lost uses emerald/rose). */
  readyForSales?: boolean;
};

/**
 * Sortable kanban lane column with drag handle and optional configure button.
 *
 * @param props.stage - Lane metadata including optional `readyForSales` accent
 * @param props.canEditLanes - Enables drag reorder and lane settings
 */
export const SortableKanbanLane = ({
  stage,
  count,
  isOver,
  canEditLanes,
  onConfigureLane,
  children
}: {
  stage: Stage;
  count: number;
  isOver?: boolean;
  canEditLanes: boolean;
  onConfigureLane?: () => void;
  children: ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: laneDndId(stage.id),
    disabled: !canEditLanes
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1
  };

  const readyForSales = Boolean(stage.readyForSales);
  const shellAccent = readyForSales
    ? "border-violet-300/45 ring-violet-100/90"
    : isOver
      ? "border-indigo-300 ring-indigo-200"
      : "border-stone-200 ring-slate-900/5";

  const headerRowClass = readyForSales
    ? "border-b border-violet-200/70 bg-gradient-to-r from-violet-50/95 via-purple-50/85 to-fuchsia-50/90"
    : "border-b border-stone-200 bg-stone-50";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${salesKanbanLaneShellClass} ${shellAccent}`}
    >
      <div className={`flex shrink-0 items-center gap-1 rounded-t-xl px-2 py-2 ${headerRowClass}`}>
        {canEditLanes ? (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-stone-400 hover:bg-stone-200/80 hover:text-stone-700 active:cursor-grabbing"
            aria-label={`Drag to reorder ${stage.name}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">{stage.name}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
          {count}
        </span>
        {canEditLanes && onConfigureLane ? (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-200/80 hover:text-stone-800"
            onClick={onConfigureLane}
            aria-label={`Configure lane ${stage.name}`}
          >
            <Settings className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
};
