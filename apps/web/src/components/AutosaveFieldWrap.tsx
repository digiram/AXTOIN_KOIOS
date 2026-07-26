/**
 * AutosaveFieldWrap
 *
 * Wrapper that adds autosave status affordances to non-text controls (selects, comboboxes).
 *
 * Responsibilities:
 * - Track focus within the wrapper so open listboxes count as “active”
 * - Render shared pencil / spinner / check / error icons from `autosave-status-ui`
 * - Optionally announce status to screen readers via a live region
 *
 * Related:
 * - `AutosaveTextField`; settings and CRM forms with blur-save PATCH fields
 */
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  AutosaveStatusIcons,
  AutosaveStatusLiveRegion,
  type AutosaveUiStatus
} from "./autosave-status-ui.js";

type Props = {
  /** Stable id for the sr-only live region (unique per field). */
  statusId: string;
  status: AutosaveUiStatus;
  children: ReactNode;
  /**
   * When false, only the inline icons render (no duplicate `statusId` live region). Use when several wraps share one
   * announcement (e.g. multiple inputs for a single PATCH).
   */
  announceStatus?: boolean;
  /** Extra classes on the outer wrapper (e.g. `w-full min-w-0`). */
  className?: string;
};

/**
 * Wraps dropdown / combobox controls so they share the same pencil · spinner · check affordance as
 * {@link AutosaveTextField}. Uses focus-in/out on the wrapper so opening a listbox still counts as “active”.
 */
export function AutosaveFieldWrap({ statusId, status, children, announceStatus = true, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onIn = () => setActive(true);
    const onOut = (e: FocusEvent) => {
      const rt = e.relatedTarget as Node | null;
      if (rt && el.contains(rt)) return;
      setActive(false);
    };
    el.addEventListener("focusin", onIn);
    el.addEventListener("focusout", onOut);
    return () => {
      el.removeEventListener("focusin", onIn);
      el.removeEventListener("focusout", onOut);
    };
  }, []);

  return (
    <div ref={wrapRef} className={["relative min-w-0", className].filter(Boolean).join(" ")}>
      <div className="min-w-0 w-full overflow-visible [&_input]:pr-10 [&_select]:pr-10">{children}</div>
      <AutosaveStatusIcons status={status} isActive={active} />
      {announceStatus ? <AutosaveStatusLiveRegion statusId={statusId} status={status} /> : null}
    </div>
  );
}
