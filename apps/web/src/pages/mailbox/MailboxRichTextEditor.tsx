/**
 * Mailbox Rich Text Editor.
 *
 * Reusable mailbox UI building block: Mailbox Rich Text Editor.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/mailbox
 */
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

const toolbarBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

/** React component for mailbox UI. */
export const MailboxRichTextEditor = ({
  value,
  onChange,
  disabled = false,
  placeholder = "Write your message…",
  className = ""
}: Props) => {
  const editorRef = useRef<HTMLDivElement>(null);

  const syncChange = useCallback(() => {
    onChange(editorRef.current?.innerHTML ?? "");
  }, [onChange]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const exec = (command: string, valueArg?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, valueArg);
    syncChange();
  };

  const addLink = () => {
    if (disabled) return;
    const url = window.prompt("Link URL");
    if (!url?.trim()) return;
    exec("createLink", url.trim());
  };

  return (
    <div
      className={[
        "flex min-h-[18rem] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
        disabled ? "opacity-60" : "",
        className
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5">
        <button type="button" className={toolbarBtn} title="Bold" disabled={disabled} onClick={() => exec("bold")}>
          <Bold className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={toolbarBtn} title="Italic" disabled={disabled} onClick={() => exec("italic")}>
          <Italic className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn}
          title="Underline"
          disabled={disabled}
          onClick={() => exec("underline")}
        >
          <Underline className="h-4 w-4" aria-hidden />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        <button
          type="button"
          className={toolbarBtn}
          title="Bullet list"
          disabled={disabled}
          onClick={() => exec("insertUnorderedList")}
        >
          <List className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn}
          title="Numbered list"
          disabled={disabled}
          onClick={() => exec("insertOrderedList")}
        >
          <ListOrdered className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={toolbarBtn} title="Insert link" disabled={disabled} onClick={addLink}>
          <Link2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label="Message body"
        data-placeholder={placeholder}
        className="mailbox-rich-editor min-h-[16rem] flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-800 focus:outline-none"
        onInput={syncChange}
        onBlur={syncChange}
        suppressContentEditableWarning
      />
    </div>
  );
};
