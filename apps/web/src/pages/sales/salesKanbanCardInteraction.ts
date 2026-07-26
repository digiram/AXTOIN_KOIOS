/**
 * SalesKanbanCardInteraction.
 *
 * Click vs double-click handlers for kanban cards that coexist with @dnd-kit drag listeners.
 *
 * Responsibilities:
 * - Delay single-click selection so double-click can open full detail
 * - Support Ctrl/Cmd/middle-click to open detail in a new tab
 */

import type { MouseEvent } from "react";

/** Delay before treating a single click as "select" (allows double-click to open full detail). */
const SELECT_CLICK_DELAY_MS = 250;

/**
 * Kanban card click handling compatible with @dnd-kit drag listeners.
 * Double-click (or second click of a double-click) opens full-page detail; single click selects.
 */
const openDetailInNewTab = (href: string) => {
  window.open(href, "_blank", "noopener,noreferrer");
};

const wantsNewTab = (event: MouseEvent) =>
  event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey;

/**
 * Bind click handlers for kanban card select vs open-detail behavior.
 *
 * @param handlers - `onSelect`, `onOpenDetail`, and optional `detailHref` for new-tab open
 * @returns `onClick`, `onDoubleClick`, and `onAuxClick` props for the card element
 */
export const bindKanbanCardClick = (handlers: {
  onSelect: () => void;
  onOpenDetail: () => void;
  /** When set, Ctrl/Cmd/middle-click opens full detail in a new browser tab. */
  detailHref?: string;
}): {
  onClick: (event: MouseEvent) => void;
  onDoubleClick: (event: MouseEvent) => void;
  onAuxClick: (event: MouseEvent) => void;
} => {
  let selectTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelPendingSelect = () => {
    if (selectTimer !== undefined) {
      clearTimeout(selectTimer);
      selectTimer = undefined;
    }
  };

  const openDetail = (event: MouseEvent) => {
    event.stopPropagation();
    cancelPendingSelect();
    if (handlers.detailHref && wantsNewTab(event)) {
      openDetailInNewTab(handlers.detailHref);
      return;
    }
    handlers.onOpenDetail();
  };

  return {
    onClick: (event) => {
      event.stopPropagation();
      if (event.detail >= 2) {
        openDetail(event);
        return;
      }
      cancelPendingSelect();
      selectTimer = setTimeout(() => {
        selectTimer = undefined;
        handlers.onSelect();
      }, SELECT_CLICK_DELAY_MS);
    },
    onDoubleClick: openDetail,
    onAuxClick: (event) => {
      if (event.button !== 1 || !handlers.detailHref) return;
      event.preventDefault();
      event.stopPropagation();
      cancelPendingSelect();
      openDetailInNewTab(handlers.detailHref);
    }
  };
};
