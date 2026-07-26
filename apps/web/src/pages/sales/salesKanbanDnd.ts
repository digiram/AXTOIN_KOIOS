/**
 * SalesKanbanDnd.
 *
 * Drag-and-drop identifier helpers for Sales pipeline kanban lanes and outcome columns.
 *
 * Responsibilities:
 * - Define synthetic won/lost outcome stage ids
 * - Prefix lane sortable ids for @dnd-kit parsing
 */

/** Synthetic dnd id for pipeline "Won" outcome column. */
export const SALES_PIPELINE_OUTCOME_WON_ID = "sales-outcome:won" as const;
/** Synthetic dnd id for pipeline "Lost" outcome column. */
export const SALES_PIPELINE_OUTCOME_LOST_ID = "sales-outcome:lost" as const;

/**
 * Build a sortable lane id for @dnd-kit from a stage row id.
 *
 * @param stageId - Database stage id
 */
export const laneDndId = (stageId: string) => `lane:${stageId}`;

/**
 * Parse a lane dnd id back to the underlying stage id.
 *
 * @param id - @dnd-kit draggable id
 * @returns Stage id or null when not a lane id
 */
export const parseLaneDndId = (id: string | number): string | null => {
  const s = String(id);
  return s.startsWith("lane:") ? s.slice(5) : null;
};
