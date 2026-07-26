/**
 * Mailbox Compose page.
 *
 * Tenant mailbox screen mounted under AppShell at /admin/mailbox.
 *
 * Responsibilities:
 * - Load and render primary mailbox data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/mailbox
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { MailboxAddress } from "@starter/shared";
import { File, FileImage, FileSpreadsheet, FileText, FileType, Paperclip, Trash2 } from "lucide-react";

import { useMailboxLayout } from "./MailboxLayout.js";
import { MailboxCrmRecipientField } from "./MailboxCrmRecipientField.js";
import { MailboxRichTextEditor } from "./MailboxRichTextEditor.js";
import {
  formatMailboxAttachmentSize,
  formatMailboxAttachmentTypeLabel,
  htmlFromDraft,
  mailboxComposeInputClass,
  plainTextFromHtml
} from "./mailboxComposeUtils.js";
import { MAILBOX_VIEWPORT_COLUMN, MailboxAccountToolbar } from "./mailboxShell.js";
import { useMailboxApi } from "./useMailboxApi.js";

import type { MailboxAttachment } from "./mailboxTypes.js";

type DraftMessage = {
  id: string;
  threadId: string;
  accountId: string;
  to: { email: string; name?: string | null }[];
  cc: { email: string; name?: string | null }[];
  bcc: { email: string; name?: string | null }[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
};

type SendableAccount = {
  id: string;
  displayName: string;
  emailAddress: string;
  provider: string;
};

/** Route page component for tenant mailbox under AppShell. */
export const MailboxComposePage = () => {
  const navigate = useNavigate();
  const { draftId } = useParams<{ draftId?: string }>();
  const { accountId: layoutAccountId, connections } = useMailboxLayout();
  const { apiFetch } = useMailboxApi();

  const [draftMessageId, setDraftMessageId] = useState<string | null>(draftId ?? null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toRecipients, setToRecipients] = useState<MailboxAddress[]>([]);
  const [ccRecipients, setCcRecipients] = useState<MailboxAddress[]>([]);
  const [bccRecipients, setBccRecipients] = useState<MailboxAddress[]>([]);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(Boolean(draftId));
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<MailboxAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
  const creatingDraftRef = useRef(false);

  const sendableAccounts = useMemo(
    () =>
      connections
        .filter((connection) => !connection.isSystemNotifications)
        .map((connection) => ({
          id: connection.id,
          displayName: connection.displayName,
          emailAddress: connection.emailAddress,
          provider: connection.provider
        })),
    [connections]
  );

  const canSend = sendableAccounts.some((a) => a.id === fromAccountId);

  const buildDraftPayload = useCallback(() => {
    const plainBody = plainTextFromHtml(bodyHtml);
    return {
      accountId: fromAccountId || sendableAccounts[0]?.id || undefined,
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      bodyText: plainBody,
      bodyHtml
    };
  }, [bccRecipients, bodyHtml, ccRecipients, fromAccountId, layoutAccountId, subject, toRecipients]);

  const applyDraft = useCallback((message: DraftMessage) => {
    const sendable = connections.filter((connection) => !connection.isSystemNotifications);
    const draftAccountIsSendable = sendable.some((connection) => connection.id === message.accountId);

    setDraftMessageId(message.id);
    setThreadId(message.threadId);
    setFromAccountId(draftAccountIsSendable ? message.accountId : (sendable[0]?.id ?? ""));
    setToRecipients(message.to);
    setCcRecipients(message.cc);
    setBccRecipients(message.bcc);
    setSubject(message.subject === "(no subject)" ? "" : message.subject);
    setBodyHtml(htmlFromDraft(message.bodyText, message.bodyHtml));
  }, [connections]);

  const saveDraft = useCallback(async () => {
    if (!draftMessageId) return false;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const res = await apiFetch(`/tenant/mailbox/compose/drafts/${draftMessageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildDraftPayload())
      });
      if (!res.ok) throw new Error("save_failed");
      const json = (await res.json()) as { message: DraftMessage };
      applyDraft(json.message);
      setStatus("Draft saved.");
      return true;
    } catch {
      setError("Could not save draft.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [apiFetch, applyDraft, buildDraftPayload, draftMessageId]);

  const createDraft = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const defaultConnectionId = sendableAccounts[0]?.id;
      if (!defaultConnectionId) {
        setError("Connect Gmail, Microsoft 365, or IMAP before composing.");
        return;
      }
      const res = await apiFetch("/tenant/mailbox/compose/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: defaultConnectionId
        })
      });
      if (!res.ok) throw new Error("create_failed");
      const json = (await res.json()) as { message: DraftMessage };
      applyDraft(json.message);
      navigate(`/admin/mailbox/compose/${json.message.id}`, { replace: true });
    } catch {
      setError("Could not create draft.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, applyDraft, navigate, sendableAccounts]);

  const loadDraft = useCallback(
    async (messageId: string) => {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch(`/tenant/mailbox/compose/drafts/${messageId}`);
        if (!res.ok) throw new Error("load_failed");
        const json = (await res.json()) as { message: DraftMessage };
        applyDraft(json.message);
        const attachmentsRes = await apiFetch(`/tenant/mailbox/messages/${messageId}/attachments`);
        if (attachmentsRes.ok) {
          const attachmentsJson = (await attachmentsRes.json()) as { attachments: MailboxAttachment[] };
          setAttachments(attachmentsJson.attachments);
        } else {
          setAttachments([]);
        }
      } catch {
        setError("Could not load draft.");
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, applyDraft]
  );

  const uploadAttachment = async (file: File) => {
    if (!draftMessageId) return;
    setUploadingAttachment(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch(`/tenant/mailbox/compose/drafts/${draftMessageId}/attachments`, {
        method: "POST",
        body: form
      });
      if (!res.ok) throw new Error("upload_failed");
      const json = (await res.json()) as { attachment: MailboxAttachment };
      setAttachments((prev) => [...prev, json.attachment]);
    } catch {
      setError("Could not upload attachment.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!draftMessageId) return;
    setRemovingAttachmentId(attachmentId);
    setError("");
    try {
      const res = await apiFetch(
        `/tenant/mailbox/compose/drafts/${draftMessageId}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("delete_failed");
      setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
    } catch {
      setError("Could not remove attachment.");
    } finally {
      setRemovingAttachmentId(null);
    }
  };

  useEffect(() => {
    if (draftId) {
      void loadDraft(draftId);
      return;
    }
    if (creatingDraftRef.current) return;
    creatingDraftRef.current = true;
    void createDraft();
  }, [createDraft, draftId, loadDraft]);

  const discardDraft = async () => {
    if (threadId) {
      await apiFetch(`/tenant/mailbox/threads/${threadId}`, { method: "DELETE" });
    }
    navigate("/admin/mailbox");
  };

  const send = async () => {
    setError("");
    setStatus("");
    const plainBody = plainTextFromHtml(bodyHtml);
    if (!fromAccountId || !sendableAccounts.some((a) => a.id === fromAccountId)) {
      setError("Connect an external mailbox account before sending.");
      return;
    }
    if (toRecipients.length === 0) {
      setError("Add at least one CRM recipient.");
      return;
    }
    if (!subject.trim()) {
      setError("Add a subject before sending.");
      return;
    }
    if (!plainBody.trim()) {
      setError("Add a message before sending.");
      return;
    }

    setSending(true);
    try {
      await saveDraft();
      const res = await apiFetch("/tenant/mailbox/compose/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: fromAccountId,
          to: toRecipients,
          cc: ccRecipients,
          bcc: bccRecipients,
          subject: subject.trim(),
          bodyHtml,
          bodyText: plainBody,
          draftMessageId: draftMessageId ?? undefined
        })
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? "Send failed.");
        return;
      }
      navigate("/admin/mailbox");
    } catch {
      setError("Send failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={MAILBOX_VIEWPORT_COLUMN}>
      <MailboxAccountToolbar />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New message</h2>
            <p className="text-xs text-slate-500">
              {loading ? "Preparing draft…" : "Drafts are saved even when no external account is connected."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
              disabled={loading || saving || !draftMessageId}
              onClick={() => void saveDraft()}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
              disabled={loading || sending || !canSend}
              title={canSend ? "Send message" : "Connect an external account to send"}
              onClick={() => void send()}
            >
              {sending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
              disabled={loading || !draftMessageId}
              onClick={() => void discardDraft()}
            >
              Discard
            </button>
          </div>
        </header>

        {error ? <p className="shrink-0 px-4 py-2 text-sm text-red-700">{error}</p> : null}
        {status ? <p className="shrink-0 px-4 py-2 text-sm text-emerald-700">{status}</p> : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <form
            className="mx-auto flex w-[80%] min-w-0 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="block min-w-0 text-sm text-slate-700">
                <span className="mb-1 block font-medium">From</span>
                {sendableAccounts.length > 0 ? (
                  <select
                    className={mailboxComposeInputClass}
                    value={fromAccountId}
                    onChange={(event) => setFromAccountId(event.target.value)}
                    disabled={loading}
                  >
                    {sendableAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.displayName} &lt;{account.emailAddress}&gt;
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
                    No send account connected. You can still draft messages.{" "}
                    <Link to="/admin/mailbox/accounts" className="font-medium text-indigo-700 hover:underline">
                      Connect Gmail, Microsoft, or IMAP
                    </Link>
                  </div>
                )}
              </label>

              <MailboxCrmRecipientField
                label="To"
                inputId="mailbox-compose-to"
                recipients={toRecipients}
                onChange={setToRecipients}
                disabled={loading}
                collapsibleRecipients
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <MailboxCrmRecipientField
                label="Cc"
                inputId="mailbox-compose-cc"
                recipients={ccRecipients}
                onChange={setCcRecipients}
                disabled={loading}
                collapsibleRecipients
                emptyHint="Search CRM for Cc…"
              />
              <MailboxCrmRecipientField
                label="Bcc"
                inputId="mailbox-compose-bcc"
                recipients={bccRecipients}
                onChange={setBccRecipients}
                disabled={loading}
                collapsibleRecipients
                emptyHint="Search CRM for Bcc…"
              />
            </div>

            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">Subject</span>
              <input
                className={mailboxComposeInputClass}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
                disabled={loading}
              />
            </label>

            <div className="space-y-1">
              <span className="block text-sm font-medium text-slate-700">Message</span>
              <MailboxRichTextEditor
                value={bodyHtml}
                onChange={setBodyHtml}
                disabled={loading}
                placeholder="Write your message…"
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                  <Paperclip className="h-4 w-4 shrink-0 text-slate-500" aria-hidden strokeWidth={2} />
                  <span>{uploadingAttachment ? "Uploading…" : "Attach files"}</span>
                  <input
                    type="file"
                    className="hidden"
                    disabled={loading || uploadingAttachment || !draftMessageId}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadAttachment(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {attachments.length > 0 ? (
                <ul className="space-y-2">
                  {attachments.map((attachment) => (
                    <MailboxComposeAttachmentRow
                      key={attachment.id}
                      attachment={attachment}
                      disabled={loading || uploadingAttachment || removingAttachmentId != null}
                      removing={removingAttachmentId === attachment.id}
                      onRemove={() => void removeAttachment(attachment.id)}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

type AttachmentFileKind = "pdf" | "word" | "excel" | "image" | "text" | "other";

const attachmentFileKind = (mimeType: string, filename: string): AttachmentFileKind => {
  const label = formatMailboxAttachmentTypeLabel(mimeType, filename);
  if (label === "PDF") return "pdf";
  if (label === "Word document") return "word";
  if (label === "Spreadsheet") return "excel";
  if (label === "Image") return "image";
  if (label === "Text file") return "text";
  return "other";
};

const ATTACHMENT_FILE_ICON: Record<
  AttachmentFileKind,
  { Icon: typeof FileText; className: string }
> = {
  pdf: { Icon: FileText, className: "text-rose-600" },
  word: { Icon: FileType, className: "text-blue-600" },
  excel: { Icon: FileSpreadsheet, className: "text-emerald-600" },
  image: { Icon: FileImage, className: "text-violet-600" },
  text: { Icon: FileText, className: "text-slate-600" },
  other: { Icon: File, className: "text-slate-500" }
};

const MailboxComposeAttachmentRow = ({
  attachment,
  disabled,
  removing,
  onRemove
}: {
  attachment: MailboxAttachment;
  disabled: boolean;
  removing: boolean;
  onRemove: () => void;
}) => {
  const typeLabel = formatMailboxAttachmentTypeLabel(attachment.mimeType, attachment.filename);
  const kind = attachmentFileKind(attachment.mimeType, attachment.filename);
  const { Icon, className } = ATTACHMENT_FILE_ICON[kind];

  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white ${className}`}
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800" title={attachment.filename}>
          {attachment.filename}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {typeLabel} · {formatMailboxAttachmentSize(attachment.sizeBytes)}
        </p>
      </div>
      <button
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        aria-label={`Remove ${attachment.filename}`}
        title="Remove attachment"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" aria-hidden strokeWidth={2} />
      </button>
      {removing ? <span className="sr-only">Removing…</span> : null}
    </li>
  );
};
