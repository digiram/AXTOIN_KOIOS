/**
 * SalesFunnelRecordDetailsEditor.
 *
 * Inline editor for funnel record owner, CRM organization, contacts, description, and deal value.
 *
 * Responsibilities:
 * - Debounced auto-save of {@link FunnelDetailsPatch} when fields change
 * - Search CRM contacts and tenant users for owner/contact pickers
 * - Format expected deal value with tenant locale and currency preferences
 *
 * Depends on:
 * - {@link FunnelDetailRecord} from {@link SalesFunnelDetailPanel}
 *
 * Security:
 * - Disabled when `canEdit` is false; API re-validates tenant scope on save
 */

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import { ContactEmployerOrganizationField } from "../../components/crm/ContactEmployerOrganizationField.js";
import {
  authSearchableInputClass,
  authSearchableLeadingClass,
  authSearchableShellClass
} from "../../components/auth/fieldStyles.js";
import {
  FunnelCrmContactSearchField,
  type FunnelCrmContactRow
} from "../../components/sales/FunnelCrmContactSearchField.js";
import { FunnelOwnerSearchField } from "../../components/sales/FunnelOwnerSearchField.js";
import { API_BASE_URL } from "../../lib/api.js";
import {
  formatAmountMajorForInput,
  formatFinanceAmount,
  getCurrencyNarrowSymbol,
  parseLocalizedMajorToMinor
} from "../../lib/currencyFormat.js";
import type { FunnelContactLink, FunnelDetailRecord } from "./SalesFunnelDetailPanel.js";

/** Mutable funnel detail fields persisted by the details editor. */
export type FunnelDetailsPatch = {
  ownerUserId: string | null;
  crmOrganizationId: string | null;
  contacts: { contactId: string; role: string }[];
  description: string;
  expectedValueMinor?: number | null;
  expectedValueCurrency?: string | null;
};

const inputClass =
  "rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";

const mergeContactDisplayNames = (
  incoming: FunnelContactLink[],
  previous: FunnelContactLink[]
): FunnelContactLink[] => {
  const names = new Map(previous.map((c) => [c.contactId, c.displayName]));
  return incoming.map((c) => ({
    ...c,
    displayName: c.displayName ?? names.get(c.contactId)
  }));
};

type Assignee = { id: string; displayName: string | null; email: string };
type ContactRoleOption = { id: string; label: string };

type Props = {
  kind: "lead" | "deal";
  record: FunnelDetailRecord;
  canEdit: boolean;
  busy?: boolean;
  onSave: (patch: FunnelDetailsPatch) => Promise<boolean>;
  /** Extra top margin when embedded in the profile card. */
  className?: string;
};

/**
 * Auto-saving editor for funnel record metadata embedded in panel or full-page detail.
 *
 * @param props.kind - `"lead"` or `"deal"` — deal shows expected value fields
 * @param props.onSave - Persists patch; returns false to keep editor open on failure
 */
export const SalesFunnelRecordDetailsEditor = ({
  kind,
  record,
  canEdit,
  busy = false,
  onSave,
  className = ""
}: Props) => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const [ownerUserId, setOwnerUserId] = useState(record.ownerUserId ?? "");
  const [crmOrgId, setCrmOrgId] = useState(record.crmOrganizationId ?? "");
  const [crmOrgName, setCrmOrgName] = useState<string | null>(null);
  const [contactLinks, setContactLinks] = useState<FunnelContactLink[]>(record.contacts);
  const [detailDescription, setDetailDescription] = useState(record.description ?? "");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [contactRoleOptions, setContactRoleOptions] = useState<ContactRoleOption[]>([]);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const contactLinksRef = useRef(contactLinks);
  contactLinksRef.current = contactLinks;
  const ownerRef = useRef(ownerUserId);
  ownerRef.current = ownerUserId;
  const crmOrgRef = useRef(crmOrgId);
  crmOrgRef.current = crmOrgId;
  const descRef = useRef(detailDescription);
  descRef.current = detailDescription;

  const { preferences: tenantPrefs } = useTenantDisplayPreferences();
  const displayLocale = tenantPrefs?.locale ?? "en-US";
  const currencyFmt = tenantPrefs?.currencyFormat ?? null;
  const preferredCurrency = (tenantPrefs?.preferredCurrency ?? "USD").trim().toUpperCase();

  const [expectedMajorStr, setExpectedMajorStr] = useState("");

  useEffect(() => {
    setOwnerUserId(record.ownerUserId ?? "");
    setCrmOrgId(record.crmOrganizationId ?? "");
    setContactLinks((prev) => mergeContactDisplayNames(record.contacts, prev));
    setDetailDescription(record.description ?? "");
    if (kind === "deal") {
      const m = record.expectedValueMinor;
      const c = record.expectedValueCurrency;
      if (m != null && c) {
        setExpectedMajorStr(formatAmountMajorForInput(m / 100, displayLocale, currencyFmt));
      } else {
        setExpectedMajorStr("");
      }
    }
    setSaveErr("");
  }, [record, kind, preferredCurrency, displayLocale, currencyFmt]);

  useEffect(() => {
    const orgId = record.crmOrganizationId?.trim() || crmOrgId.trim();
    if (!orgId) {
      setCrmOrgName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        let res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(orgId)}`, {
          headers: authHeaders()
        });
        if (res.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(orgId)}`, {
            headers: authHeaders()
          });
        }
        if (!res.ok) return;
        const o = (await res.json()) as { name?: string };
        if (!cancelled) setCrmOrgName(o.name?.trim() ? o.name : null);
      } catch {
        /* keep typed/search state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, logout, record.crmOrganizationId, crmOrgId, refreshSession]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${API_BASE_URL}/tenant/sales/assignees`, { headers: authHeaders() });
      if (!res.ok) return;
      const j = (await res.json()) as { users: Assignee[] };
      setAssignees(j.users ?? []);
    })();
  }, [authHeaders]);

  useEffect(() => {
    void (async () => {
      let res = await fetch(`${API_BASE_URL}/tenant/sales/contact-roles`, { headers: authHeaders() });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/sales/contact-roles`, { headers: authHeaders() });
      }
      if (!res.ok) return;
      const j = (await res.json()) as { roles: ContactRoleOption[] };
      setContactRoleOptions(j.roles ?? []);
    })();
  }, [authHeaders, logout, refreshSession]);

  const contactLabelFetchKey = useMemo(
    () =>
      record.id
        ? contactLinks
            .filter((c) => !c.displayName?.trim())
            .map((c) => c.contactId)
            .sort()
            .join(",")
        : "",
    [contactLinks, record.id]
  );

  useEffect(() => {
    if (!contactLabelFetchKey) return;
    const ids = contactLabelFetchKey.split(",").filter(Boolean);
    if (ids.length === 0) return;

    let cancelled = false;
    void (async () => {
      const updates = new Map<string, string>();
      for (const id of ids) {
        try {
          let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(id)}`, {
            headers: authHeaders()
          });
          if (res.status === 401) {
            if (!(await refreshSession())) {
              logout();
              return;
            }
            res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(id)}`, {
              headers: authHeaders()
            });
          }
          if (!res.ok) continue;
          const j = (await res.json()) as {
            firstName?: string | null;
            lastName?: string | null;
            email?: string | null;
          };
          const fromParts = [j.firstName?.trim(), j.lastName?.trim()].filter(Boolean).join(" ");
          updates.set(id, fromParts || j.email?.trim() || id);
        } catch {
          /* skip */
        }
      }
      if (cancelled || updates.size === 0) return;
      setContactLinks((prev) =>
        prev.map((c) => {
          const label = updates.get(c.contactId);
          if (!label || c.displayName?.trim()) return c;
          return { ...c, displayName: label };
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, contactLabelFetchKey, logout, refreshSession]);

  const contactsPayload = useCallback(
    (links: FunnelContactLink[]) => links.map((c) => ({ contactId: c.contactId, role: c.role.trim() })),
    []
  );

  const persistDetails = useCallback(
    async (patch: Partial<FunnelDetailsPatch>) => {
      if (!canEdit) return false;
      setSaveErr("");
      setDetailsSaving(true);
      try {
        const body: FunnelDetailsPatch = {
          ownerUserId:
            patch.ownerUserId !== undefined ? patch.ownerUserId : ownerRef.current || null,
          crmOrganizationId:
            patch.crmOrganizationId !== undefined ? patch.crmOrganizationId : crmOrgRef.current || null,
          contacts:
            patch.contacts !== undefined ? patch.contacts : contactsPayload(contactLinksRef.current),
          description: patch.description !== undefined ? patch.description : descRef.current
        };
        if (patch.expectedValueMinor !== undefined) {
          body.expectedValueMinor = patch.expectedValueMinor;
          body.expectedValueCurrency = patch.expectedValueCurrency ?? null;
        }
        const ok = await onSave(body);
        if (!ok) setSaveErr("Could not save.");
        return ok;
      } catch {
        setSaveErr("Could not save.");
        return false;
      } finally {
        setDetailsSaving(false);
      }
    },
    [canEdit, contactsPayload, onSave]
  );

  const amountCurrencySymbol = useMemo(
    () => getCurrencyNarrowSymbol(displayLocale, preferredCurrency),
    [displayLocale, preferredCurrency]
  );

  const flushExpectedDealValue = useCallback(() => {
    void (async () => {
      if (!canEdit || kind !== "deal") return;
      const mTrim = expectedMajorStr.trim();
      const curTrim = preferredCurrency;
      const prevMinor = record.expectedValueMinor ?? null;
      const prevCur = record.expectedValueCurrency?.trim().toUpperCase() ?? null;

      if (!mTrim) {
        if (prevMinor == null && (prevCur == null || prevCur === "")) return;
        const ok = await persistDetails({ expectedValueMinor: null, expectedValueCurrency: null });
        if (ok) setExpectedMajorStr("");
        return;
      }
      const minor = parseLocalizedMajorToMinor(mTrim, currencyFmt);
      if (minor == null) {
        setSaveErr("Enter a valid amount.");
        return;
      }
      if (minor === prevMinor && curTrim === (prevCur ?? "")) {
        setExpectedMajorStr(formatAmountMajorForInput(minor / 100, displayLocale, currencyFmt));
        return;
      }
      const ok = await persistDetails({ expectedValueMinor: minor, expectedValueCurrency: curTrim });
      if (ok) setExpectedMajorStr(formatAmountMajorForInput(minor / 100, displayLocale, currencyFmt));
      else setSaveErr("Could not save.");
    })();
  }, [
    canEdit,
    kind,
    expectedMajorStr,
    preferredCurrency,
    record.expectedValueMinor,
    record.expectedValueCurrency,
    persistDetails,
    displayLocale,
    currencyFmt
  ]);

  const contactDisplayName = (row: FunnelCrmContactRow) => {
    const fromParts = [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean).join(" ");
    return row.displayName?.trim() || fromParts || row.email?.trim() || row.id;
  };

  const addContact = (row: FunnelCrmContactRow) => {
    if (contactLinks.some((c) => c.contactId === row.id)) return;
    const next: FunnelContactLink[] = [
      ...contactLinks,
      { contactId: row.id, role: "", displayName: contactDisplayName(row) }
    ];
    setContactLinks(next);
    void persistDetails({ contacts: contactsPayload(next) });
  };

  const setContactRole = (contactId: string, role: string) => {
    const next = contactLinks.map((c) => (c.contactId === contactId ? { ...c, role } : c));
    setContactLinks(next);
    void persistDetails({ contacts: contactsPayload(next) });
  };

  const removeContact = (contactId: string) => {
    const next = contactLinks.filter((c) => c.contactId !== contactId);
    setContactLinks(next);
    void persistDetails({ contacts: contactsPayload(next) });
  };

  const fieldsDisabled = !canEdit || busy || detailsSaving;

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-stone-600">
        Description
        <textarea
          className={`${inputClass} mt-1 min-h-[4rem] w-full`}
          value={detailDescription}
          disabled={fieldsDisabled}
          onChange={(e) => setDetailDescription(e.target.value)}
          onBlur={() => {
            if (!canEdit) return;
            const next = detailDescription.trim();
            const prev = (record.description ?? "").trim();
            if (next === prev) return;
            setDetailDescription(next);
            void persistDetails({ description: next });
          }}
          placeholder="Add a description…"
        />
        <p className="mt-1 text-[11px] text-stone-500">Description is encrypted at rest when field encryption is enabled.</p>
      </label>

      {kind === "deal" && record.outcomeBucket ? (
        <p className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
          Outcome: <span className="font-semibold">{record.outcomeBucket === "won" ? "Won" : "Lost"}</span>. Drag
          the deal onto an open lane on the board to reactivate it.
        </p>
      ) : null}

      {detailsSaving ? (
        <p className="mt-2 text-xs text-stone-500" aria-live="polite">
          Saving…
        </p>
      ) : null}
      {saveErr ? (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {saveErr}
        </p>
      ) : null}

      {kind === "deal" ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-stone-600">Expected deal size</p>
          {!canEdit ? (
            record.expectedValueMinor != null && record.expectedValueCurrency ? (
              <p className="text-sm text-stone-800">
                {formatFinanceAmount(
                  record.expectedValueMinor,
                  record.expectedValueCurrency,
                  displayLocale,
                  currencyFmt
                )}
              </p>
            ) : (
              <p className="text-sm text-stone-500">Not set</p>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="block min-w-0 flex-1">
                  <span className="text-[11px] text-stone-500">Amount ({preferredCurrency})</span>
                  <div className={`relative mt-0.5 w-full min-w-0 ${fieldsDisabled ? "opacity-60" : ""}`}>
                    <div className={authSearchableShellClass}>
                      <div className={`${authSearchableLeadingClass} min-w-12 w-12 px-0.5`} aria-hidden>
                        {amountCurrencySymbol ? (
                          <span
                            className="max-w-full truncate text-center text-lg font-semibold leading-none text-slate-700"
                            title={preferredCurrency}
                          >
                            {amountCurrencySymbol}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-600">{preferredCurrency}</span>
                        )}
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={authSearchableInputClass}
                        disabled={fieldsDisabled}
                        value={expectedMajorStr}
                        onChange={(e) => setExpectedMajorStr(e.target.value)}
                        onBlur={() => void flushExpectedDealValue()}
                        placeholder={
                          currencyFmt === "dot_comma"
                            ? "50.000,00"
                            : currencyFmt === "space_comma"
                              ? "50 000,00"
                              : "50,000.00"
                        }
                        aria-label={`Expected deal amount in ${preferredCurrency}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-stone-500">
                Optional. Currency follows Settings → Localization. Leave blank to clear.
              </p>
            </>
          )}
        </div>
      ) : null}

      <div className="mt-5 space-y-4 border-t border-stone-100 pt-4">
        <ContactEmployerOrganizationField
          inputId={`funnel-crm-org-${record.id}`}
          authHeaders={authHeaders}
          refreshSession={refreshSession}
          logout={logout}
          organizationId={crmOrgId}
          organizationName={crmOrgName}
          onChange={(id, name) => {
            setCrmOrgId(id);
            setCrmOrgName(name);
            void persistDetails({ crmOrganizationId: id || null });
          }}
          label={kind === "deal" ? "Deal organization" : "Lead organization"}
        />

        <div>
          <p className="text-xs font-medium text-stone-600">Contacts on this {kind}</p>
          {contactRoleOptions.length === 0 && canEdit ? (
            <p className="mt-1 text-xs text-stone-500">
              Add contact roles under{" "}
              <Link to="/admin/sales/settings" className="font-medium text-indigo-600 underline hover:text-indigo-500">
                Sales → Settings
              </Link>{" "}
              before assigning roles.
            </p>
          ) : null}
          <ul className="mt-2 space-y-2">
            {contactLinks.map((link) => (
              <li
                key={link.contactId}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-2 py-1.5 ring-1 ring-stone-200/80"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                  {link.displayName ?? link.contactId}
                </span>
                <select
                  className={`${inputClass} max-w-[10rem] flex-1`}
                  disabled={fieldsDisabled || contactRoleOptions.length === 0}
                  value={link.role}
                  onChange={(e) => setContactRole(link.contactId, e.target.value)}
                >
                  <option value="">Role…</option>
                  {contactRoleOptions.map((r) => (
                    <option key={r.id} value={r.label}>
                      {r.label}
                    </option>
                  ))}
                  {link.role && !contactRoleOptions.some((r) => r.label === link.role) ? (
                    <option value={link.role}>{link.role}</option>
                  ) : null}
                </select>
                {canEdit ? (
                  <button
                    type="button"
                    className="rounded p-1 text-stone-500 hover:bg-stone-200 disabled:opacity-50"
                    aria-label="Remove contact"
                    disabled={fieldsDisabled}
                    onClick={() => removeContact(link.contactId)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {canEdit ? (
            <div className="mt-3">
              <FunnelCrmContactSearchField
                inputId={`funnel-add-contact-${record.id}`}
                authHeaders={authHeaders}
                refreshSession={refreshSession}
                logout={logout}
                disabled={fieldsDisabled}
                excludeContactIds={contactLinks.map((c) => c.contactId)}
                onSelect={addContact}
              />
            </div>
          ) : null}
        </div>

        <FunnelOwnerSearchField
          inputId={`funnel-owner-${record.id}`}
          label={kind === "deal" ? "Deal owner" : "Lead owner"}
          assignees={assignees}
          ownerUserId={ownerUserId}
          disabled={fieldsDisabled}
          onChange={(v) => {
            setOwnerUserId(v);
            void persistDetails({ ownerUserId: v || null });
          }}
        />
      </div>
    </div>
  );
};
