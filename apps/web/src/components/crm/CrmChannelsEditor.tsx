/**
 * CrmChannelsEditor
 *
 * Paired email and phone multi-row editors for CRM modals.
 *
 * Responsibilities:
 * - Kind select, primary flag, add/remove rows for emails and phones
 * - Row-level validation error display from shared Zod mappers
 * - Helpers to seed rows from API data and build PATCH payloads
 *
 * Related:
 * - Contact/organization modals; `@starter/shared` channel validation
 */
import type { CrmChannelEntry } from "@starter/shared";
import { ChevronDown, X } from "lucide-react";

import { CRM_SECTION_HEADING_RAIL } from "./crmSectionHeadingRail.js";

/** One email or phone row in CRM modal channel editors. */
export type ChannelFormRow = {
  kind: string;
  value: string;
  isPrimary: boolean;
};

const EMAIL_KINDS = ["Home", "Work", "Other"] as const;
const PHONE_KINDS = ["Mobile", "Home", "Work", "Other"] as const;

type Props = {
  emails: ChannelFormRow[];
  phones: ChannelFormRow[];
  onEmailsChange: (next: ChannelFormRow[]) => void;
  onPhonesChange: (next: ChannelFormRow[]) => void;
  /** Editor row index → message (email value rows only). */
  emailRowErrors?: Readonly<Record<number, string>>;
  /** Editor row index → message (phone value rows only). */
  phoneRowErrors?: Readonly<Record<number, string>>;
};

const setPrimaryAt = (rows: ChannelFormRow[], index: number): ChannelFormRow[] =>
  rows.map((r, i) => ({ ...r, isPrimary: i === index }));

/** Drops one row; if the primary row was removed, the first remaining row becomes primary. */
const removeChannelRowAt = (rows: ChannelFormRow[], removeIndex: number): ChannelFormRow[] => {
  if (rows.length <= 1) return rows;
  const removedPrimary = Boolean(rows[removeIndex]?.isPrimary);
  const filtered = rows.filter((_, i) => i !== removeIndex);
  if (removedPrimary) {
    return filtered.map((r, i) => ({ ...r, isPrimary: i === 0 }));
  }
  return filtered;
};

const channelRowShellOk =
  "flex items-stretch overflow-hidden rounded-lg border border-stone-200/90 bg-white shadow-sm transition-[border-color,box-shadow] focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-inset focus-within:ring-amber-400/25";

const channelRowShellError =
  "flex items-stretch overflow-hidden rounded-lg border border-rose-500 bg-rose-50/40 shadow-sm transition-[border-color,box-shadow] ring-2 ring-inset ring-rose-200 focus-within:border-rose-600 focus-within:ring-rose-300";

/** Email and phone editors with primary-row semantics. */
export const CrmChannelsEditor = ({
  emails,
  phones,
  onEmailsChange,
  onPhonesChange,
  emailRowErrors,
  phoneRowErrors
}: Props) => {
  /** Native arrow removed; chevron sits `right-[10px]` so there is 10px padding past the icon. */
  const typeSelectWrapClass =
    "relative flex shrink-0 max-w-[7.5rem] self-stretch bg-stone-100";
  const typeSelectClass =
    "h-full min-h-0 w-full flex-1 appearance-none border-0 bg-transparent py-2 pl-2.5 pr-9 text-sm text-stone-800 outline-none focus:outline-none";
  const typeSelectChevronClass =
    "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 right-[10px]";
  const inputClass =
    "min-w-0 flex-1 border-0 bg-white px-3 py-2 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:outline-none";
  const segmentBtn =
    "flex shrink-0 items-center justify-center self-stretch border-l border-stone-200 py-2 transition-colors";
  const removeBtn = `${segmentBtn} px-2 bg-stone-50 text-stone-400 hover:bg-rose-600 hover:text-white focus-visible:outline-none`;
  const primaryBtn = `${segmentBtn} px-3 text-xs font-semibold tracking-wide focus-visible:outline-none`;
  const primaryActive = `${primaryBtn} bg-indigo-600 text-white shadow-sm hover:bg-indigo-700`;
  const primaryIdle = `${primaryBtn} bg-stone-50 text-stone-500 hover:bg-stone-100 hover:text-indigo-800`;

  return (
    <section className="mt-6 border-t border-stone-100 pt-5">
      <div className={`min-w-0 ${CRM_SECTION_HEADING_RAIL}`}>
        <h3 className="text-sm font-semibold text-slate-800">Email & phone</h3>
        <p className="mt-1 text-xs text-stone-500">
          Add multiple entries; use #1 for the email, phone, and address shown on your contact list.
        </p>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Emails</span>
            <button
              type="button"
              onClick={() => {
                const row = { kind: "Home", value: "", isPrimary: false };
                if (emails.length === 0) onEmailsChange([{ ...row, isPrimary: true }]);
                else onEmailsChange([...emails.map((e) => ({ ...e })), row]);
              }}
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50"
            >
              + Add email
            </button>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {emails.map((row, index) => {
              const emailErr = emailRowErrors?.[index];
              const rowShell = emailErr ? channelRowShellError : channelRowShellOk;
              const errId = `crm-email-row-${index}-err`;
              return (
              <li key={`email-${index}`} className="flex flex-col gap-1">
                <div className={rowShell}>
                <div className={typeSelectWrapClass}>
                  <select
                    aria-label={`Email type ${index + 1}`}
                    value={row.kind}
                    onChange={(e) => {
                      const next = [...emails];
                      next[index] = { ...next[index]!, kind: e.target.value };
                      onEmailsChange(next);
                    }}
                    className={typeSelectClass}
                  >
                    {EMAIL_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                    {(EMAIL_KINDS as readonly string[]).includes(row.kind) ? null : (
                      <option value={row.kind}>{row.kind}</option>
                    )}
                  </select>
                  <ChevronDown className={typeSelectChevronClass} aria-hidden strokeWidth={2} />
                </div>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...emails];
                    next[index] = { ...next[index]!, value: e.target.value };
                    onEmailsChange(next);
                  }}
                  className={inputClass}
                  aria-invalid={Boolean(emailErr)}
                  aria-describedby={emailErr ? errId : undefined}
                />
                {emails.length > 1 ? (
                  <button
                    type="button"
                    title="Remove email"
                    aria-label={`Remove email row ${index + 1}`}
                    onClick={() => onEmailsChange(removeChannelRowAt(emails, index))}
                    className={removeBtn}
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                  </button>
                ) : null}
                <button
                  type="button"
                  title="Primary email for lists"
                  className={row.isPrimary ? primaryActive : primaryIdle}
                  onClick={() => onEmailsChange(setPrimaryAt(emails, index))}
                >
                  #1
                </button>
                </div>
                {emailErr ? (
                  <p id={errId} className="text-xs text-rose-600 pl-0.5" role="alert">
                    {emailErr}
                  </p>
                ) : null}
              </li>
              );
            })}
          </ul>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Phone numbers</span>
            <button
              type="button"
              onClick={() => {
                const row = { kind: "Mobile", value: "", isPrimary: false };
                if (phones.length === 0) onPhonesChange([{ ...row, isPrimary: true }]);
                else onPhonesChange([...phones.map((p) => ({ ...p })), row]);
              }}
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50"
            >
              + Add number
            </button>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {phones.map((row, index) => {
              const phoneErr = phoneRowErrors?.[index];
              const rowShell = phoneErr ? channelRowShellError : channelRowShellOk;
              const errId = `crm-phone-row-${index}-err`;
              return (
              <li key={`phone-${index}`} className="flex flex-col gap-1">
                <div className={rowShell}>
                <div className={typeSelectWrapClass}>
                  <select
                    aria-label={`Phone type ${index + 1}`}
                    value={row.kind}
                    onChange={(e) => {
                      const next = [...phones];
                      next[index] = { ...next[index]!, kind: e.target.value };
                      onPhonesChange(next);
                    }}
                    className={typeSelectClass}
                  >
                    {PHONE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                    {(PHONE_KINDS as readonly string[]).includes(row.kind) ? null : (
                      <option value={row.kind}>{row.kind}</option>
                    )}
                  </select>
                  <ChevronDown className={typeSelectChevronClass} aria-hidden strokeWidth={2} />
                </div>
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="+1 …"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...phones];
                    next[index] = { ...next[index]!, value: e.target.value };
                    onPhonesChange(next);
                  }}
                  className={inputClass}
                  aria-invalid={Boolean(phoneErr)}
                  aria-describedby={phoneErr ? errId : undefined}
                />
                {phones.length > 1 ? (
                  <button
                    type="button"
                    title="Remove phone"
                    aria-label={`Remove phone row ${index + 1}`}
                    onClick={() => onPhonesChange(removeChannelRowAt(phones, index))}
                    className={removeBtn}
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                  </button>
                ) : null}
                <button
                  type="button"
                  title="Primary phone for lists"
                  className={row.isPrimary ? primaryActive : primaryIdle}
                  onClick={() => onPhonesChange(setPrimaryAt(phones, index))}
                >
                  #1
                </button>
                </div>
                {phoneErr ? (
                  <p id={errId} className="text-xs text-rose-600 pl-0.5" role="alert">
                    {phoneErr}
                  </p>
                ) : null}
              </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
};

/** Default empty primary email row for new CRM entities. */
export const defaultEmailRows = (): ChannelFormRow[] => [{ kind: "Home", value: "", isPrimary: true }];
/** Default empty primary mobile row for new CRM entities. */
export const defaultPhoneRows = (): ChannelFormRow[] => [{ kind: "Mobile", value: "", isPrimary: true }];

/** Maps API channel arrays (or legacy single email/phone) into editor rows. */
export function channelRowsFromApi(
  entries: CrmChannelEntry[] | undefined,
  legacySingle: string | null,
  legacyKindWhenSingle: string,
  emptyFallback: () => ChannelFormRow[]
): ChannelFormRow[] {
  const raw = entries ?? [];
  const withValues = raw.filter((e) => (e.value ?? "").trim().length > 0);
  if (withValues.length > 0) {
    const rows = withValues.map((e) => ({
      kind: (e.kind || legacyKindWhenSingle).trim().slice(0, 64) || legacyKindWhenSingle,
      value: e.value.trim(),
      isPrimary: Boolean(e.isPrimary)
    }));
    let pi = rows.findIndex((r) => r.isPrimary);
    if (pi < 0) pi = 0;
    return rows.map((r, i) => ({ ...r, isPrimary: i === pi }));
  }
  const leg = legacySingle?.trim();
  if (leg) return [{ kind: legacyKindWhenSingle, value: leg, isPrimary: true }];
  return emptyFallback();
}

/** Non-empty rows only; ensures exactly one `isPrimary` when multiple entries exist (matches server normalization). */
export const toCrmChannelPayload = (
  rows: ChannelFormRow[],
  defaultKind: string
): { kind: string; value: string; isPrimary: boolean }[] => {
  const filled = rows
    .map((r) => ({
      kind: (r.kind || defaultKind).trim().slice(0, 64) || defaultKind,
      value: r.value.trim(),
      isPrimary: r.isPrimary
    }))
    .filter((r) => r.value.length > 0);
  if (filled.length === 0) return [];
  let pi = filled.findIndex((r) => r.isPrimary);
  if (pi < 0) pi = 0;
  return filled.map((r, i) => ({ ...r, isPrimary: i === pi }));
};
