/**
 * AutosaveTextField
 *
 * Single-line text input that persists on blur with inline save feedback.
 *
 * Responsibilities:
 * - Track draft vs last saved value; skip PATCH when unchanged
 * - Show pencil while focused, spinner while saving, checkmark on success
 * - Revert draft and announce errors when `onSave` fails
 *
 * Related:
 * - `autosave-status-ui`; account settings and profile fields
 *
 * Security:
 * - Parent `onSave` performs authenticated API calls — do not use for secrets without review.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import {
  AUTOSAVE_UI_RESET_MS,
  AutosaveStatusIcons,
  AutosaveStatusLiveRegion,
  type AutosaveUiStatus
} from "./autosave-status-ui.js";
import { authFieldClass, authFieldDescriptionClass, authLabelClass } from "./auth/fieldStyles.js";

type SaveStatus = AutosaveUiStatus;

/** Props for {@link AutosaveTextField}. */
export type AutosaveTextFieldProps = {
  id: string;
  label: ReactNode;
  /** Last value from the server (or initial load). */
  savedValue: string;
  /** Persist trimmed value; update parent state from the response when returning `true`. */
  onSave: (trimmedValue: string) => Promise<boolean>;
  /** Fires on every keystroke so dependent UI (e.g. previews) can track the draft. */
  onDraftChange?: (draft: string) => void;
  maxLength?: number;
  autoComplete?: string;
  /** Extra classes on the text input (after shared field styles). */
  inputClassName?: string;
  /** Optional override for the label element class. */
  labelClassName?: string;
  /** Detail text rendered below the input (field purpose, previews, constraints). */
  description?: ReactNode;
  /** Override for the description paragraph (defaults to shared under-field style). */
  descriptionClassName?: string;
};

/**
 * Text field that **autosaves on blur** (Tab away or click outside). While focused, shows a **pencil**;
 * after a successful save, briefly shows a **checkmark**. Use for non-sensitive single-line fields.
 */
export const AutosaveTextField = ({
  id,
  label,
  savedValue,
  onSave,
  onDraftChange,
  maxLength,
  autoComplete,
  inputClassName = "",
  labelClassName = authLabelClass,
  description,
  descriptionClassName = authFieldDescriptionClass
}: AutosaveTextFieldProps) => {
  const [draft, setDraft] = useState(savedValue);
  const [isFocused, setIsFocused] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isFocused) {
      setDraft(savedValue);
      onDraftChange?.(savedValue);
    }
  }, [savedValue, isFocused, onDraftChange]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const clearSavedTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const scheduleSavedReset = useCallback(() => {
    clearSavedTimer();
    saveTimerRef.current = setTimeout(() => {
      setStatus("idle");
      saveTimerRef.current = null;
    }, AUTOSAVE_UI_RESET_MS);
  }, [clearSavedTimer]);

  const handleBlur = useCallback(async () => {
    setIsFocused(false);
    const trimmed = draft.trim();
    const prev = savedValue.trim();
    if (trimmed === prev) {
      setStatus("idle");
      return;
    }

    setStatus("saving");
    try {
      const ok = await onSave(trimmed);
      if (ok) {
        setStatus("saved");
        scheduleSavedReset();
      } else {
        setStatus("error");
        setDraft(savedValue);
        onDraftChange?.(savedValue);
        clearSavedTimer();
        saveTimerRef.current = setTimeout(() => setStatus("idle"), AUTOSAVE_UI_RESET_MS);
      }
    } catch {
      setStatus("error");
      setDraft(savedValue);
      onDraftChange?.(savedValue);
      clearSavedTimer();
      saveTimerRef.current = setTimeout(() => setStatus("idle"), AUTOSAVE_UI_RESET_MS);
    }
  }, [draft, savedValue, onSave, onDraftChange, scheduleSavedReset, clearSavedTimer]);

  const statusId = `${id}-autosave-status`;
  const descriptionId = `${id}-description`;
  const ariaDescribedBy = description ? `${descriptionId} ${statusId}` : statusId;

  return (
    <div className="relative">
      <label className={labelClassName} htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          className={[authFieldClass, "pr-10", inputClassName].filter(Boolean).join(" ")}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            onDraftChange?.(v);
          }}
          onFocus={() => {
            setIsFocused(true);
            setStatus("idle");
          }}
          onBlur={() => void handleBlur()}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-busy={status === "saving"}
          aria-describedby={ariaDescribedBy}
        />
        <AutosaveStatusIcons status={status} isActive={isFocused} />
      </div>
      {description ? (
        <p id={descriptionId} className={descriptionClassName} aria-live="polite">
          {description}
        </p>
      ) : null}
      <AutosaveStatusLiveRegion statusId={statusId} status={status} errorAnnounceRevert />
    </div>
  );
};
