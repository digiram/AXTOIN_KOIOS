/**
 * SalesFunnelDetailPanel.
 *
 * Slide-over panel for viewing and editing a single funnel lead or deal on kanban boards.
 *
 * Responsibilities:
 * - Auto-save or create funnel records with owner, CRM org, contacts, and deal value fields
 * - Stage moves, promote-to-deal, archive/delete actions
 * - Embed activity preview and link to full-page detail
 *
 * Depends on:
 * - {@link SalesFunnelRecordDetailsEditor}, CRM contact search, {@link KanbanStageConfig}
 *
 * Security:
 * - Mutations respect `canEdit` / `canDelete` props from Sales module permissions
 */

import { Archive, ExternalLink, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatAmountMajorForInput, getCurrencyNarrowSymbol, parseLocalizedMajorToMinor } from "../../lib/currencyFormat.js";
import type { KanbanStageConfig } from "./SalesLaneConfigModal.js";
import { SalesFunnelDetailPanelActivityPreview } from "../../components/sales/SalesFunnelDetailPanelActivityPreview.js";
import {
  SalesFunnelRecordDetailsEditor,
  type FunnelDetailsPatch
} from "./SalesFunnelRecordDetailsEditor.js";

/** Partial funnel record fields saved from the details editor. */
export type { FunnelDetailsPatch };

/** Linked CRM contact on a funnel record with optional cached display name. */
export type FunnelContactLink = {
  contactId: string;
  role: string;
  displayName?: string;
};

/** Funnel lead or deal shape used by kanban boards and detail views. */
export type FunnelDetailRecord = {
  id: string;
  title: string;
  description: string;
  stageKey: string;
  ownerUserId: string | null;
  crmOrganizationId: string | null;
  contacts: FunnelContactLink[];
  promotedDealId?: string | null;
  promotedFromLeadId?: string | null;
  /** When false, the record is hidden from the pipeline kanban (e.g. promoted lead). */
  active?: boolean;
  /** Sales deal terminal outcome (Won/Lost column). */
  outcomeBucket?: string | null;
  /** Lane name frozen when the record became inactive (promotion, archive, won/lost). */
  inactiveStageLabel?: string | null;
  /** Sales deal: expected size in minor units with ISO 4217 currency, or unset. */
  expectedValueMinor?: number | null;
  expectedValueCurrency?: string | null;
};

type Assignee = { id: string; displayName: string | null; email: string };

type ContactRoleOption = { id: string; label: string };

/** Payload for creating a new lead or deal from the kanban panel. */
export type FunnelCreatePayload = {
  title: string;
  description: string;
  stageKey: string;
  ownerUserId: string | null;
  crmOrganizationId: string | null;
  contacts: { contactId: string; role: string }[];
  expectedValueMinor?: number | null;
  expectedValueCurrency?: string | null;
};

const inputClass =
  "rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";

type Props = {
  kind: "lead" | "deal";
  record: FunnelDetailRecord;
  stages: KanbanStageConfig[];
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  /** When true, panel collects fields and calls `createRecord` instead of auto-saving details. */
  creating?: boolean;
  createRecord?: (payload: FunnelCreatePayload) => Promise<boolean>;
  promoteMessage?: string;
  onClose: () => void;
  onSave: (patch: FunnelDetailsPatch) => Promise<boolean>;
  onDelete: () => void;
  onPromote?: () => void;
  /** Full-page detail URL; shows a footer link when set and not creating. */
  detailHref?: string | null;
  children?: ReactNode;
};

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

/**
 * Kanban side panel for funnel record view, edit, create, promote, and delete.
 *
 * @param props.kind - `"lead"` or `"deal"` board context
 * @param props.creating - When true, collects fields and calls `createRecord` on submit
 */
export const SalesFunnelDetailPanel = ({
  kind,
  record,
  stages,
  canEdit,
  canDelete,
  busy,
  creating = false,
  createRecord,
  promoteMessage,
  onClose,
  onSave,
  onDelete,
  onPromote,
  detailHref,
  children
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
  const [saveErr, setSaveErr] = useState("");
  const [archiveAwaitingConfirm, setArchiveAwaitingConfirm] = useState(false);

  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const prevCreating = useRef(false);

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
    if (!archiveAwaitingConfirm) return;
    const id = window.setTimeout(() => setArchiveAwaitingConfirm(false), 5000);
    return () => window.clearTimeout(id);
  }, [archiveAwaitingConfirm]);

  useEffect(() => {
    if (creating) return;
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
    setArchiveAwaitingConfirm(false);
  }, [record, creating, kind, preferredCurrency, displayLocale, currencyFmt]);

  useEffect(() => {
    if (creating && !prevCreating.current) {
      setCreateTitle(record.title);
      setCreateDescription(record.description);
      setOwnerUserId(record.ownerUserId ?? "");
      setCrmOrgId(record.crmOrganizationId ?? "");
      setContactLinks(mergeContactDisplayNames(record.contacts, []));
      if (kind === "deal") {
        setExpectedMajorStr("");
      }
      setSaveErr("");
    }
    prevCreating.current = creating;
  }, [creating, record, kind, preferredCurrency]);

  useEffect(() => {
    const orgId = (creating ? crmOrgId : record.crmOrganizationId)?.trim();
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
  }, [authHeaders, logout, record.crmOrganizationId, crmOrgId, creating, refreshSession]);

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
      !creating && record.id
        ? contactLinks
            .filter((c) => !c.displayName?.trim())
            .map((c) => c.contactId)
            .sort()
            .join(",")
        : "",
    [contactLinks, creating, record.id]
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
          const label = fromParts || j.email?.trim() || id;
          updates.set(id, label);
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

  const stage = stages.find((s) => s.stageKey === record.stageKey);
  const isPipelineInactive = record.active === false;
  const stageLine =
    isPipelineInactive && record.inactiveStageLabel
      ? record.inactiveStageLabel
      : (stage?.name ?? record.stageKey);
  const showPromote =
    !creating &&
    kind === "lead" &&
    canEdit &&
    onPromote &&
    !record.promotedDealId &&
    !isPipelineInactive &&
    Boolean(stage?.readyForSales);

  const contactsPayload = useCallback(
    (links: FunnelContactLink[]) =>
      links.map((c) => ({ contactId: c.contactId, role: c.role.trim() })),
    []
  );

  const amountCurrencySymbol = useMemo(
    () => getCurrencyNarrowSymbol(displayLocale, preferredCurrency),
    [displayLocale, preferredCurrency]
  );

  const contactDisplayName = (row: FunnelCrmContactRow) => {
    const fromParts = [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean).join(" ");
    return row.displayName?.trim() || fromParts || row.email?.trim() || row.id;
  };

  const addContact = (row: FunnelCrmContactRow) => {
    if (contactLinks.some((c) => c.contactId === row.id)) return;
    const next: FunnelContactLink[] = [
      ...contactLinks,
      {
        contactId: row.id,
        role: "",
        displayName: contactDisplayName(row)
      }
    ];
    setContactLinks(next);
  };

  const setContactRole = (contactId: string, role: string) => {
    const next = contactLinks.map((c) => (c.contactId === contactId ? { ...c, role } : c));
    setContactLinks(next);
  };

  const removeContact = (contactId: string) => {
    const next = contactLinks.filter((c) => c.contactId !== contactId);
    setContactLinks(next);
  };

  const submitCreate = async () => {
    if (!createRecord) return;
    const title = createTitle.trim();
    if (!title) {
      setSaveErr("Title is required.");
      return;
    }
    const stageKey = record.stageKey.trim();
    if (!stageKey) {
      setSaveErr("Add a lane on the board before creating.");
      return;
    }
    setSaveErr("");
    const uuidOrNull = (v: string) => {
      const t = v.trim();
      return t.length > 0 ? t : null;
    };
    let expectedValueMinor: number | null | undefined;
    let expectedValueCurrency: string | null | undefined;
    if (kind === "deal") {
      const majorTrim = expectedMajorStr.trim();
      if (majorTrim) {
        const minor = parseLocalizedMajorToMinor(majorTrim, currencyFmt);
        const cur = preferredCurrency;
        if (minor == null) {
          setSaveErr("Enter a valid expected deal size.");
          return;
        }
        expectedValueMinor = minor;
        expectedValueCurrency = cur;
      } else {
        expectedValueMinor = null;
        expectedValueCurrency = null;
      }
    }
    const ok = await createRecord({
      title,
      description: createDescription.trim(),
      stageKey,
      ownerUserId: uuidOrNull(ownerUserId),
      crmOrganizationId: uuidOrNull(crmOrgId),
      contacts: contactsPayload(contactLinks),
      ...(kind === "deal"
        ? { expectedValueMinor: expectedValueMinor ?? null, expectedValueCurrency: expectedValueCurrency ?? null }
        : {})
    });
    if (!ok) setSaveErr("Could not create.");
  };

  const fieldsDisabled = !canEdit || busy;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-stone-200 bg-white shadow-xl">
      <div className="border-b border-stone-200 px-4 py-3">
        {creating ? (
          <div className="min-w-0">
            <p className="text-xs font-medium text-stone-500">{kind === "deal" ? "New deal" : "New lead"}</p>
            <input
              className={`${inputClass} mt-1 w-full`}
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Title"
              aria-label={kind === "deal" ? "Deal title" : "Lead title"}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-stone-900">{record.title}</h3>
            <span
              className="max-w-[45%] shrink-0 truncate rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-medium leading-none text-stone-700"
              title={stageLine}
            >
              {stageLine}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!creating && isPipelineInactive ? (
          <p
            className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            role="status"
          >
            Inactive — hidden from the {kind === "lead" ? "BDR" : "Sales"} pipeline board.
            {kind === "lead" && record.promotedDealId ? (
              <>
                {" "}
                <Link
                  to={`/admin/sales/pipeline?recordId=${record.promotedDealId}`}
                  className="font-medium text-indigo-700 underline hover:text-indigo-600"
                >
                  Open the sales deal
                </Link>
                .
              </>
            ) : null}
          </p>
        ) : null}
        {!creating ? (
          <SalesFunnelRecordDetailsEditor
            kind={kind}
            record={record}
            canEdit={canEdit}
            busy={busy}
            onSave={onSave}
            className="mt-1"
          />
        ) : null}

        {!creating && record.id !== "__new__" ? (
          <SalesFunnelDetailPanelActivityPreview
            kind={kind}
            recordId={record.id}
            detailHref={detailHref}
          />
        ) : null}

        {creating ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-stone-500">Starts in the first (left) lane.</p>
            <label className="block text-xs font-medium text-stone-600">
              Description
              <textarea
                className={`${inputClass} mt-1 min-h-[4rem] w-full`}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
        ) : null}

        {creating && kind === "deal" ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-stone-600">Expected deal size</p>
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="block min-w-0 flex-1">
                    <span className="text-[11px] text-stone-500">Amount ({preferredCurrency})</span>
                    <div
                      className={`relative mt-0.5 w-full min-w-0 ${creating && busy ? "opacity-60" : ""} ${
                        fieldsDisabled ? "opacity-60" : ""
                      }`}
                    >
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
                          disabled={creating ? busy : fieldsDisabled}
                          value={expectedMajorStr}
                          onChange={(e) => setExpectedMajorStr(e.target.value)}
                          onBlur={() => undefined}
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
                  Optional. Amount uses your localization number grouping; currency is{" "}
                  <strong className="font-medium text-stone-700">{preferredCurrency}</strong> from Settings →
                  Localization (tenant default if you have not set a personal currency). Stored in minor units. Leave
                  blank to clear.
                </p>
              </>
          </div>
        ) : null}

        {creating ? (
        <div className="mt-5 space-y-4 border-t border-stone-100 pt-4">
          <ContactEmployerOrganizationField
            inputId="funnel-crm-org"
            authHeaders={authHeaders}
            refreshSession={refreshSession}
            logout={logout}
            organizationId={crmOrgId}
            organizationName={crmOrgName}
            onChange={(id, name) => {
              setCrmOrgId(id);
              setCrmOrgName(name);
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
                  inputId="funnel-add-contact"
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
            inputId="funnel-owner"
            label={kind === "deal" ? "Deal owner" : "Lead owner"}
            assignees={assignees}
            ownerUserId={ownerUserId}
            disabled={fieldsDisabled}
            onChange={(v) => setOwnerUserId(v)}
          />
        </div>
        ) : null}

        {!creating && kind === "lead" && record.promotedDealId ? (
          <p className="mt-4 text-sm text-violet-800">
            Promoted to Sales.{" "}
            <Link to="/admin/sales/pipeline" className="font-medium text-indigo-600 underline hover:text-indigo-500">
              View pipeline
            </Link>
          </p>
        ) : null}

        {showPromote ? (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              onClick={onPromote}
            >
              Promote to Sales
            </button>
            {promoteMessage ? <p className="text-xs text-emerald-700">{promoteMessage}</p> : null}
          </div>
        ) : null}

        {!creating && record.promotedFromLeadId ? (
          <p className="mt-2 text-xs text-violet-700">Promoted from BDR lead</p>
        ) : null}

        {creating ? null : children}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-stone-200 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {!creating && detailHref ? (
            <Link
              to={detailHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
              Full details
            </Link>
          ) : null}
          {creating && canEdit && createRecord ? (
            <button
              type="button"
              disabled={busy || !record.stageKey.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              onClick={() => void submitCreate()}
            >
              {busy
                ? "Creating…"
                : kind === "deal"
                  ? "Create deal"
                  : "Create lead"}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              disabled={busy}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
                archiveAwaitingConfirm
                  ? "border border-amber-800 bg-amber-700 text-white hover:bg-amber-800"
                  : "border border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100"
              ].join(" ")}
              onClick={() => {
                if (!archiveAwaitingConfirm) {
                  setArchiveAwaitingConfirm(true);
                  return;
                }
                setArchiveAwaitingConfirm(false);
                onDelete();
              }}
            >
              <Archive className="h-4 w-4" aria-hidden />
              {archiveAwaitingConfirm
                ? "Click again to archive"
                : kind === "deal"
                  ? "Archive deal"
                  : "Archive lead"}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </aside>
  );
};
