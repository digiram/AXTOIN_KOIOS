/**
 * Mailbox UI helpers.
 *
 * Shared Tailwind class names, labels, and table chrome for mailbox list and form screens.
 *
 * Responsibilities:
 * - Export consistent data-table and field styling tokens
 * - Host small presentation helpers reused across mailbox pages
 *
 * Related:
 * - Sibling page and modal components in mailbox
 */
import { useMemo, useState, type ReactNode } from "react";
import { ImageOff, ShieldAlert } from "lucide-react";

import { prepareMailboxEmailForIframe } from "./mailboxEmailHtml.js";
import {
  addTrustedMailboxSender,
  isTrustedMailboxSender,
  readTrustedMailboxSenders
} from "./mailboxEmailSecurity.js";
import type { MailboxMessage } from "./mailboxTypes.js";

/** Small badge for UI that mirrors the mockup but is not wired yet. */
export const MailboxComingSoon = ({ label = "Soon" }: { label?: string }) => (
  <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
    {label}
  </span>
);

/** React component for mailbox UI. */
export const MailboxAvatar = ({
  email,
  size = "md"
}: {
  name?: string | null;
  email: string;
  size?: "sm" | "md" | "lg";
}) => {
  const initials = (email.trim().slice(0, 2) || "?").toUpperCase();
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 font-semibold text-indigo-700 ring-1 ring-indigo-200/60 ${sizeClass}`}
      aria-hidden
    >
      {initials}
    </span>
  );
};

/** React component for mailbox UI. */
export const MailboxTag = ({ children, tone = "indigo" }: { children: ReactNode; tone?: "indigo" | "amber" | "emerald" | "sky" | "rose" }) => {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    amber: "bg-amber-50 text-amber-800 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-100",
    sky: "bg-sky-50 text-sky-800 ring-sky-100",
    rose: "bg-rose-50 text-rose-800 ring-rose-100"
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tones[tone]}`}>{children}</span>
  );
};

/** Helper for mailbox client logic. */
export function internalSourceTag(source: string | null, subject: string): { label: string; tone: "indigo" | "amber" | "emerald" | "sky" | "rose" } | null {
  if (!source) return null;
  if (source === "invoicing") {
    const lower = subject.toLowerCase();
    if (lower.includes("invoice")) return { label: "Invoice", tone: "emerald" };
    if (lower.includes("quote") || lower.includes("offer")) return { label: "Quote", tone: "indigo" };
    return { label: "Invoicing", tone: "indigo" };
  }
  if (source === "crm") return { label: "CRM", tone: "sky" };
  if (source === "system") return { label: "System", tone: "amber" };
  return { label: source, tone: "indigo" };
}

/** Prefer embedded sent-email HTML (quote/invoice copies) over the short internal notification body. */
export const mailboxMessageBodyHtml = (message: Pick<MailboxMessage, "bodyHtml" | "embeddedSentEmail">): string | null => {
  const embedded = message.embeddedSentEmail?.bodyHtml.trim();
  if (embedded) return embedded;
  const body = message.bodyHtml?.trim();
  return body || null;
};

const MailboxRemoteContentBanner = ({
  senderEmail,
  onLoadOnce,
  onTrustSender
}: {
  senderEmail: string;
  onLoadOnce: () => void;
  onTrustSender: () => void;
}) => (
  <div
    role="status"
    className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
  >
    <div className="flex min-w-0 items-start gap-2">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <p className="min-w-0">
        External images and linked content are hidden to protect your privacy and prevent invisible tracking.
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
      <button
        type="button"
        onClick={onLoadOnce}
        className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-sm font-medium text-amber-950 ring-1 ring-amber-200 transition hover:bg-amber-100"
      >
        <ImageOff className="h-3.5 w-3.5" aria-hidden />
        Show once
      </button>
      <button
        type="button"
        onClick={onTrustSender}
        className="rounded-md px-2.5 py-1 text-sm font-medium text-amber-900 underline decoration-amber-400 underline-offset-2 transition hover:text-amber-950"
      >
        Always allow {senderEmail}
      </button>
    </div>
  </div>
);

/** Sandboxed iframe preview — email markup/CSS cannot leak into the app shell. */
export const MailboxIsolatedEmailHtml = ({
  html,
  title,
  senderEmail,
  trustRemoteResources = false,
  className = "w-full rounded-lg border-0 bg-white",
  heightClass = "h-[min(24rem,60vh)]",
  fill = false
}: {
  html: string;
  title: string;
  senderEmail: string;
  /** App-generated copies (invoicing, system) may load remote assets without prompting. */
  trustRemoteResources?: boolean;
  className?: string;
  heightClass?: string;
  /** When true, iframe expands to fill remaining flex height in the detail pane. */
  fill?: boolean;
}) => {
  const [trustedSenders, setTrustedSenders] = useState(() => readTrustedMailboxSenders());
  const [sessionAllowRemote, setSessionAllowRemote] = useState(false);

  const senderTrusted = isTrustedMailboxSender(senderEmail, trustedSenders);
  const allowRemoteResources = trustRemoteResources || senderTrusted || sessionAllowRemote;

  const prepared = useMemo(
    () => prepareMailboxEmailForIframe(html, { fillViewport: fill, allowRemoteResources }),
    [html, fill, allowRemoteResources]
  );

  const showRemoteContentBanner =
    !allowRemoteResources && prepared.hasBlockedRemoteResources && !trustRemoteResources;

  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2"}>
      {showRemoteContentBanner ? (
        <MailboxRemoteContentBanner
          senderEmail={senderEmail}
          onLoadOnce={() => setSessionAllowRemote(true)}
          onTrustSender={() => {
            setTrustedSenders(addTrustedMailboxSender(senderEmail));
            setSessionAllowRemote(true);
          }}
        />
      ) : null}
      <iframe
        title={title}
        srcDoc={prepared.srcDoc}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className={fill ? `min-h-0 flex-1 border-0 bg-white ${className}` : `${heightClass} ${className}`}
      />
    </div>
  );
};
