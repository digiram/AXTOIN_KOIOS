/**
 * Mailbox Connect Account Wizard modal.
 *
 * Modal dialog for a focused mailbox create, edit, or confirmation flow.
 *
 * Responsibilities:
 * - Collect and validate user input for a single action
 * - Submit changes to tenant APIs and surface errors inline
 *
 * Related:
 * - Route: /admin/mailbox
 *
 * Security:
 * - Submissions use authenticated tenant API helpers
 */
import { ArrowLeft, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { crmModalOutlineInputClass } from "../../components/crm/crmModalOutlineInputClass.js";

import {
  emptyImapConnectForm,
  providerOptionMeta,
  resolveImapPresetForEmail,
  type ImapConnectFormState,
  type MailboxConnectProvider
} from "./mailboxConnectPresets.js";

type OAuthProvider = "google" | "microsoft";

type WizardStep =
  | "choose-provider"
  | "oauth-sign-in"
  | "imap-email"
  | "imap-servers"
  | "imap-credentials";

/** React component for mailbox UI. */
export type MailboxImapConnectInput = {
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  imapSecure: boolean;
  smtpSecure: boolean;
};

type Props = {
  open: boolean;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConnectOAuth: (provider: OAuthProvider) => void | Promise<void>;
  onConnectImap: (input: MailboxImapConnectInput) => void | Promise<void>;
};

const mailboxLabelClass = "mb-1.5 block text-sm font-medium text-slate-700";
const mailboxHelpClass = "mt-1 text-xs text-slate-500";

const oauthProviderFromChoice = (provider: MailboxConnectProvider): OAuthProvider | null => {
  if (provider === "google") return "google";
  if (provider === "microsoft") return "microsoft";
  return null;
};

const stepSequence = (provider: MailboxConnectProvider | null): WizardStep[] => {
  if (provider === "google" || provider === "microsoft") {
    return ["choose-provider", "oauth-sign-in"];
  }
  if (provider === "imap") {
    return ["choose-provider", "imap-email", "imap-servers", "imap-credentials"];
  }
  return ["choose-provider"];
};

const stepTitle = (step: WizardStep, provider: MailboxConnectProvider | null): string => {
  switch (step) {
    case "choose-provider":
      return "Add email account";
    case "oauth-sign-in":
      return provider === "google" ? "Connect Gmail" : "Connect Microsoft 365";
    case "imap-email":
      return "Your email address";
    case "imap-servers":
      return "Mail server settings";
    case "imap-credentials":
      return "Sign in";
    default:
      return "Add email account";
  }
};

/** Modal UI for a focused mailbox workflow. */
export const MailboxConnectAccountWizardModal = ({
  open,
  busy = false,
  error = "",
  onClose,
  onConnectOAuth,
  onConnectImap
}: Props) => {
  const [step, setStep] = useState<WizardStep>("choose-provider");
  const [provider, setProvider] = useState<MailboxConnectProvider | null>(null);
  const [imapForm, setImapForm] = useState<ImapConnectFormState>(emptyImapConnectForm);
  const [showAdvancedServers, setShowAdvancedServers] = useState(false);
  const [detectedPresetLabel, setDetectedPresetLabel] = useState<string | null>(null);

  const steps = useMemo(() => stepSequence(provider), [provider]);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const stepCount = steps.length;

  const resetWizard = () => {
    setStep("choose-provider");
    setProvider(null);
    setImapForm(emptyImapConnectForm());
    setShowAdvancedServers(false);
    setDetectedPresetLabel(null);
  };

  useEffect(() => {
    if (!open) resetWizard();
  }, [open]);

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const goBack = () => {
    if (busy) return;
    const prev = steps[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const selectProvider = (next: MailboxConnectProvider) => {
    if (busy) return;
    setProvider(next);
    if (next === "imap") {
      setStep("imap-email");
      return;
    }
    setStep("oauth-sign-in");
  };

  const applyPresetForEmail = (email: string) => {
    const preset = resolveImapPresetForEmail(email);
    if (!preset) {
      setDetectedPresetLabel(null);
      setShowAdvancedServers(true);
      return;
    }
    const domain = email.trim().split("@")[1]?.toLowerCase() ?? "";
    setDetectedPresetLabel(domain);
    setImapForm((current) => ({
      ...current,
      emailAddress: email,
      imapHost: preset.imapHost,
      imapPort: String(preset.imapPort),
      smtpHost: preset.smtpHost,
      smtpPort: String(preset.smtpPort),
      username: current.username.trim() ? current.username : email.trim()
    }));
    setShowAdvancedServers(false);
  };

  const continueFromImapEmail = () => {
    const email = imapForm.emailAddress.trim();
    if (!email || !email.includes("@")) return;
    applyPresetForEmail(email);
    setStep("imap-servers");
  };

  const continueFromImapServers = () => {
    if (!imapForm.imapHost.trim() || !imapForm.smtpHost.trim()) return;
    const email = imapForm.emailAddress.trim();
    setImapForm((current) => ({
      ...current,
      username: current.username.trim() || email
    }));
    setStep("imap-credentials");
  };

  const submitImap = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const emailAddress = imapForm.emailAddress.trim();
    const imapPort = Number.parseInt(imapForm.imapPort, 10);
    const smtpPort = Number.parseInt(imapForm.smtpPort, 10);
    if (!emailAddress || !imapForm.imapHost.trim() || !imapForm.smtpHost.trim()) return;
    if (!Number.isFinite(imapPort) || !Number.isFinite(smtpPort)) return;
    if (!imapForm.username.trim() || !imapForm.password) return;

    await onConnectImap({
      emailAddress,
      imapHost: imapForm.imapHost.trim(),
      imapPort,
      smtpHost: imapForm.smtpHost.trim(),
      smtpPort,
      username: imapForm.username.trim(),
      password: imapForm.password,
      imapSecure: true,
      smtpSecure: smtpPort === 465
    });
  };

  const oauthTarget = provider ? oauthProviderFromChoice(provider) : null;

  const primaryLabel = (() => {
    if (step === "oauth-sign-in") {
      return oauthTarget === "google" ? "Continue with Google" : "Continue with Microsoft";
    }
    if (step === "imap-credentials") return busy ? "Connecting…" : "Connect account";
    return "Continue";
  })();

  const handlePrimary = () => {
    if (step === "oauth-sign-in" && oauthTarget) {
      void onConnectOAuth(oauthTarget);
      return;
    }
    if (step === "imap-email") {
      continueFromImapEmail();
      return;
    }
    if (step === "imap-servers") {
      continueFromImapServers();
    }
  };

  const primaryDisabled = (() => {
    if (busy) return true;
    if (step === "imap-email") return !imapForm.emailAddress.trim().includes("@");
    if (step === "imap-servers") {
      return !imapForm.imapHost.trim() || !imapForm.smtpHost.trim() || !imapForm.imapPort.trim() || !imapForm.smtpPort.trim();
    }
    return false;
  })();

  const showBack = stepIndex > 0;
  const isLastImapStep = step === "imap-credentials";

  return (
    <CrmModal title={stepTitle(step, provider)} open={open} onClose={handleClose}>
      <div className="space-y-5">
        {stepCount > 1 ? (
          <div className="flex items-center gap-3">
            <div className="flex flex-1 gap-1.5" aria-hidden>
              {steps.map((wizardStep, index) => (
                <span
                  key={wizardStep}
                  className={[
                    "h-1.5 flex-1 rounded-full transition-colors",
                    index <= stepIndex ? "bg-indigo-500" : "bg-slate-200"
                  ].join(" ")}
                />
              ))}
            </div>
            <p className="shrink-0 text-xs font-medium text-slate-500">
              Step {stepIndex + 1} of {stepCount}
            </p>
          </div>
        ) : null}

        {step === "choose-provider" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Choose how you want to connect. Mail from every connection appears in your mailbox inbox.
            </p>
            <ul className="grid gap-3">
              {(["google", "microsoft", "imap"] as const).map((key) => {
                const meta = providerOptionMeta[key];
                const selected = provider === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={selected}
                      className={[
                        "flex w-full items-start gap-4 rounded-xl border p-4 text-left shadow-sm transition-colors",
                        selected ? `${meta.accentClass} ring-2` : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                      ].join(" ")}
                      onClick={() => selectProvider(key)}
                    >
                      <span
                        className={[
                          "mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                          key === "google"
                            ? "bg-white text-rose-600 ring-1 ring-rose-200"
                            : key === "microsoft"
                              ? "bg-white text-sky-700 ring-1 ring-sky-200"
                              : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                        ].join(" ")}
                        aria-hidden
                      >
                        {meta.badge?.slice(0, 1) ?? "?"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{meta.label}</span>
                        <span className="mt-1 block text-sm text-slate-600">{meta.description}</span>
                      </span>
                      {selected ? <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-indigo-600" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {step === "oauth-sign-in" && provider && oauthTarget ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">Secure sign-in</p>
                  <p className="mt-1 text-sm text-slate-600">
                    You will be redirected to {oauthTarget === "google" ? "Google" : "Microsoft"} to approve access.
                    We only request permissions needed to read, send, and organize mail in your mailbox.
                  </p>
                </div>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span>Sync incoming messages into your unified inbox.</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span>Send replies and new messages from this account.</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span>Sync your {oauthTarget === "google" ? "Google" : "Outlook"} calendar so meetings appear in Mailbox.</span>
              </li>
            </ul>
            <p className="text-xs text-slate-500">
              You can disconnect this account at any time from Connected accounts settings.
            </p>
          </div>
        ) : null}

        {step === "imap-email" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Enter the email address you want to add to this mailbox.</p>
            <div>
              <label htmlFor="mailbox-connect-email" className={mailboxLabelClass}>
                Email address
              </label>
              <input
                id="mailbox-connect-email"
                type="email"
                autoComplete="email"
                autoFocus
                disabled={busy}
                className={crmModalOutlineInputClass(false)}
                placeholder="you@company.com"
                value={imapForm.emailAddress}
                onChange={(event) => setImapForm((current) => ({ ...current, emailAddress: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    continueFromImapEmail();
                  }
                }}
              />
              <p className={mailboxHelpClass}>We will suggest server settings for common providers on the next step.</p>
            </div>
          </div>
        ) : null}

        {step === "imap-servers" ? (
          <div className="space-y-4">
            {detectedPresetLabel ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900">
                Detected settings for <span className="font-medium">{detectedPresetLabel}</span>. You can adjust them
                below if needed.
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Enter the IMAP and SMTP settings from your email provider. Contact your IT team if you are unsure.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming mail (IMAP)</p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="mailbox-connect-imap-host" className={mailboxLabelClass}>
                  IMAP server
                </label>
                <input
                  id="mailbox-connect-imap-host"
                  disabled={busy}
                  className={crmModalOutlineInputClass(false)}
                  value={imapForm.imapHost}
                  onChange={(event) => setImapForm((current) => ({ ...current, imapHost: event.target.value }))}
                  placeholder="imap.example.com"
                />
              </div>
              <div>
                <label htmlFor="mailbox-connect-imap-port" className={mailboxLabelClass}>
                  IMAP port
                </label>
                <input
                  id="mailbox-connect-imap-port"
                  inputMode="numeric"
                  disabled={busy}
                  className={crmModalOutlineInputClass(false)}
                  value={imapForm.imapPort}
                  onChange={(event) => setImapForm((current) => ({ ...current, imapPort: event.target.value }))}
                />
                <p className={mailboxHelpClass}>Usually 993 with SSL.</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outgoing mail (SMTP)</p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="mailbox-connect-smtp-host" className={mailboxLabelClass}>
                  SMTP server
                </label>
                <input
                  id="mailbox-connect-smtp-host"
                  disabled={busy}
                  className={crmModalOutlineInputClass(false)}
                  value={imapForm.smtpHost}
                  onChange={(event) => setImapForm((current) => ({ ...current, smtpHost: event.target.value }))}
                  placeholder="smtp.example.com"
                />
              </div>
              <div>
                <label htmlFor="mailbox-connect-smtp-port" className={mailboxLabelClass}>
                  SMTP port
                </label>
                <input
                  id="mailbox-connect-smtp-port"
                  inputMode="numeric"
                  disabled={busy}
                  className={crmModalOutlineInputClass(false)}
                  value={imapForm.smtpPort}
                  onChange={(event) => setImapForm((current) => ({ ...current, smtpPort: event.target.value }))}
                />
                <p className={mailboxHelpClass}>Usually 587 (STARTTLS) or 465 (SSL).</p>
              </div>
            </div>

            <button
              type="button"
              className="text-sm font-medium text-indigo-700 hover:underline"
              onClick={() => setShowAdvancedServers((current) => !current)}
            >
              {showAdvancedServers ? "Hide advanced note" : "Using a custom provider?"}
            </button>
            {showAdvancedServers ? (
              <p className="text-xs text-slate-500">
                Use the host names from your provider&apos;s documentation. Many providers require an app-specific
                password instead of your regular login password.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "imap-credentials" ? (
          <form id="mailbox-connect-imap-form" className="space-y-4" onSubmit={(event) => void submitImap(event)}>
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">{imapForm.emailAddress}</span>
              <span className="text-slate-400"> · </span>
              <span>{imapForm.imapHost}:{imapForm.imapPort}</span>
            </div>
            <div>
              <label htmlFor="mailbox-connect-username" className={mailboxLabelClass}>
                Username
              </label>
              <input
                id="mailbox-connect-username"
                autoComplete="username"
                disabled={busy}
                className={crmModalOutlineInputClass(false)}
                value={imapForm.username}
                onChange={(event) => setImapForm((current) => ({ ...current, username: event.target.value }))}
              />
              <p className={mailboxHelpClass}>Usually your full email address.</p>
            </div>
            <div>
              <label htmlFor="mailbox-connect-password" className={mailboxLabelClass}>
                Password or app password
              </label>
              <input
                id="mailbox-connect-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                disabled={busy}
                className={crmModalOutlineInputClass(false)}
                value={imapForm.password}
                onChange={(event) => setImapForm((current) => ({ ...current, password: event.target.value }))}
              />
              <p className={mailboxHelpClass}>
                Gmail, Yahoo, and many providers require an app password when using IMAP.
              </p>
            </div>
          </form>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            {showBack ? (
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                onClick={goBack}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back
              </button>
            ) : (
              <span />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              onClick={handleClose}
            >
              Cancel
            </button>
            {step !== "choose-provider" ? (
              isLastImapStep ? (
                <button
                  type="submit"
                  form="mailbox-connect-imap-form"
                  disabled={busy || !imapForm.password || !imapForm.username.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {primaryLabel}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={primaryDisabled}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handlePrimary}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {primaryLabel}
                </button>
              )
            ) : null}
          </div>
        </div>
      </div>
    </CrmModal>
  );
};
