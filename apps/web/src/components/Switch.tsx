/**
 * Switch
 *
 * Accessible pill toggle built on a visually hidden native checkbox.
 *
 * Responsibilities:
 * - Animated thumb with check / X icons reflecting on/off state
 * - Focus ring and `role="switch"` semantics for assistive tech
 *
 * Related:
 * - Settings toggles and module feature switches across tenant admin
 */
import { Check, X } from "lucide-react";

/** Props for the pill {@link Switch} control. */
export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
  "aria-busy"?: boolean;
  id?: string;
};

/**
 * Pill on/off control: native checkbox (sr-only) + track; thumb uses `data-state` + translate
 * so transform + transition live on the same node (smooth slide); icons follow `checked`.
 */
export const Switch = ({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
  "aria-busy": ariaBusy,
  id
}: SwitchProps) => {
  return (
    <label
      className={[
        "inline-flex items-center select-none",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      ].join(" ")}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-busy={ariaBusy}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={[
          "relative h-6 w-11 shrink-0 rounded-full border-2 border-transparent bg-stone-300",
          "transition-colors duration-200 ease-in-out",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-600 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-stone-100",
          "peer-checked:bg-indigo-600"
        ].join(" ")}
      >
        <span
          className={[
            "switch-thumb pointer-events-none absolute left-[2px] top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-sm",
            "transform transition-transform duration-200 ease-in-out",
            "translate-x-0 data-[state=checked]:translate-x-[calc(2.75rem-4px-1.25rem-4px)]"
          ].join(" ")}
          data-state={checked ? "checked" : "unchecked"}
        >
          {checked ? (
            <Check className="h-3 w-3 shrink-0 text-indigo-600" strokeWidth={2.5} aria-hidden />
          ) : (
            <X className="h-3 w-3 shrink-0 text-stone-500" strokeWidth={2.5} aria-hidden />
          )}
        </span>
      </span>
    </label>
  );
};
