/**
 * TableRowAction.
 *
 * Shared table interaction helpers: when to show a dedicated action column vs row-click primary action,
 * and keyboard-accessible row handlers.
 *
 * Responsibilities:
 * - Decide action-column visibility from action descriptors
 * - Bind primary row click/keyboard handlers with a11y roles
 * - Stop propagation from nested controls inside action cells
 */
import type { KeyboardEvent, MouseEvent } from "react";

/** Describes one row-level control for deciding whether to show an action column. */
export type TableRowActionDescriptor = {
  /** When true, the action is destructive (delete/remove) and must stay in a dedicated column. */
  destructive?: boolean;
};

/**
 * Show an action column when there are multiple actions, or when the sole action is destructive.
 * A single non-destructive action is executed by clicking the row instead.
 */
export const tableShowsActionColumn = (actions: TableRowActionDescriptor[]): boolean => {
  if (actions.length === 0) return false;
  if (actions.length === 1 && !actions[0]?.destructive) return false;
  return true;
};

/** Shared class for rows that open a single primary action on click. */
export const tableRowClickableClass =
  "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/40";

type BindTableRowPrimaryActionOptions = {
  onAction: () => void;
  ariaLabel: string;
  /** Defaults to `link` for navigation-style row opens; use `button` for in-place actions. */
  role?: "link" | "button";
};

/** Keyboard-accessible row handler for a single primary (non-destructive) action. */
export const bindTableRowPrimaryAction = ({
  onAction,
  ariaLabel,
  role = "link"
}: BindTableRowPrimaryActionOptions) => {
  const run = () => onAction();

  return {
    tabIndex: 0 as const,
    role,
    "aria-label": ariaLabel,
    onClick: () => run(),
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        run();
      }
    }
  };
};

/** Stop row-click propagation from nested interactive controls inside an action column. */
export const stopTableRowClickPropagation = (event: MouseEvent) => {
  event.stopPropagation();
};
