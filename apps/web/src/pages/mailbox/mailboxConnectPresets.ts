/**
 * Mailbox Connect Presets.
 *
 * Shared mailbox types, presets, or security helpers consumed by mailbox pages.
 *
 * Responsibilities:
 * - Centralize constants and pure functions for the mailbox module
 * - Document invariants for HTML sanitization or provider presets where applicable
 *
 * Related:
 * - Route: /admin/mailbox
 */
export type MailboxConnectProvider = "google" | "microsoft" | "imap";

/** React component for mailbox UI. */
export type ImapServerPreset = {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
};

const GMAIL_PRESET: ImapServerPreset = {
  imapHost: "imap.gmail.com",
  imapPort: 993,
  smtpHost: "smtp.gmail.com",
  smtpPort: 587
};

const MICROSOFT_PRESET: ImapServerPreset = {
  imapHost: "outlook.office365.com",
  imapPort: 993,
  smtpHost: "smtp.office365.com",
  smtpPort: 587
};

const DOMAIN_PRESETS: Record<string, ImapServerPreset> = {
  "gmail.com": GMAIL_PRESET,
  "googlemail.com": GMAIL_PRESET,
  "outlook.com": MICROSOFT_PRESET,
  "hotmail.com": MICROSOFT_PRESET,
  "live.com": MICROSOFT_PRESET,
  "msn.com": MICROSOFT_PRESET,
  "office365.com": MICROSOFT_PRESET,
  "yahoo.com": {
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587
  },
  "icloud.com": {
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587
  }
};

/** Shared constant or class token for mailbox presentation. */
export const resolveImapPresetForEmail = (email: string): ImapServerPreset | null => {
  const domain = email.trim().split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return DOMAIN_PRESETS[domain] ?? null;
};

/** Shared constant or class token for mailbox presentation. */
export const providerOptionMeta: Record<
  MailboxConnectProvider,
  { label: string; description: string; accentClass: string; badge?: string }
> = {
  google: {
    label: "Gmail",
    description: "Sign in with Google — syncs mail and your Google Calendar.",
    accentClass: "border-rose-200 bg-rose-50/60 ring-rose-100",
    badge: "Google"
  },
  microsoft: {
    label: "Microsoft 365",
    description: "Sign in with Microsoft — syncs mail and your Outlook calendar.",
    accentClass: "border-sky-200 bg-sky-50/60 ring-sky-100",
    badge: "Microsoft"
  },
  imap: {
    label: "Other email (IMAP)",
    description: "Connect any provider using IMAP and SMTP server settings.",
    accentClass: "border-slate-200 bg-slate-50/80 ring-slate-100",
    badge: "IMAP"
  }
};

/** React component for mailbox UI. */
export type ImapConnectFormState = {
  emailAddress: string;
  imapHost: string;
  imapPort: string;
  smtpHost: string;
  smtpPort: string;
  username: string;
  password: string;
};

/** Shared constant or class token for mailbox presentation. */
export const emptyImapConnectForm = (): ImapConnectFormState => ({
  emailAddress: "",
  imapHost: "",
  imapPort: "993",
  smtpHost: "",
  smtpPort: "587",
  username: "",
  password: ""
});
