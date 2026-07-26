/**
 * CrmAssociatedCard
 *
 * CRM detail sidebar card for viewing and adding entity relationships.
 *
 * Responsibilities:
 * - List outbound relationships with links to linked contacts/organizations
 * - Modal flow to pick relationship type and target entity
 * - Unlink custom (non-system) relationships
 *
 * Related:
 * - CRM contact/organization detail pages; `RelationshipPanel` (legacy layout)
 *
 * Security:
 * - Tenant CRM relationship API; delete restricted to custom types in UI.
 */
import type { CrmEntityKind } from "@starter/shared";
import { Link2, Plus, Unlink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { API_BASE_URL } from "../../lib/api.js";
import { useCrmBasePath } from "../../pages/crm/crmPaths.js";
import { ContactEmployerOrganizationField } from "./ContactEmployerOrganizationField.js";
import { CrmContactSearchField } from "./CrmContactSearchField.js";
import { CrmModal } from "./CrmModal.js";

type RelType = {
  id: string;
  name: string;
  reverseName: string;
  sourceEntityKind: string;
  targetEntityKind: string;
  isSystem: boolean;
};

type RelRow = {
  id: string;
  relationshipTypeId: string;
  relationshipTypeName: string;
  relationshipTypeReverseName: string;
  sourceId: string;
  sourceEntityKind: string;
  targetId: string;
  targetEntityKind: string;
  createdAt: string;
  linkedEntityDisplayName?: string | null;
};

const outboundTypeLabel = (t: RelType, anchorKind: CrmEntityKind) =>
  t.sourceEntityKind === anchorKind
    ? `${t.name} → ${t.targetEntityKind === "ORGANIZATION" ? "Organization" : "Contact"}`
    : `${t.reverseName} → ${t.sourceEntityKind === "ORGANIZATION" ? "Organization" : "Contact"}`;

const outboundTargetKind = (t: RelType, anchorKind: CrmEntityKind): CrmEntityKind =>
  (t.sourceEntityKind === anchorKind ? t.targetEntityKind : t.sourceEntityKind) as CrmEntityKind;

type Props = {
  entityKind: CrmEntityKind;
  entityId: string;
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
};

const selectClass =
  "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

/** Associated entities card on CRM detail screens. */
export const CrmAssociatedCard = ({
  entityKind,
  entityId,
  authHeaders,
  refreshSession,
  logout
}: Props) => {
  const crmBase = useCrmBasePath();
  const [types, setTypes] = useState<RelType[]>([]);
  const [relationships, setRelationships] = useState<RelRow[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [modalSession, setModalSession] = useState(0);
  const [modalTypeId, setModalTypeId] = useState("");
  const [pickOrgId, setPickOrgId] = useState("");
  const [pickOrgName, setPickOrgName] = useState<string | null>(null);
  const [pickOrgPrimary, setPickOrgPrimary] = useState<string | null>(null);
  const [pickContactId, setPickContactId] = useState("");
  const [pickContactName, setPickContactName] = useState<string | null>(null);
  const [addErr, setAddErr] = useState("");

  const customTypeIds = useMemo(
    () => new Set(types.filter((t) => !t.isSystem).map((t) => t.id)),
    [types]
  );

  const outboundTypes = useMemo(
    () => types.filter((t) => t.sourceEntityKind === entityKind || t.targetEntityKind === entityKind),
    [types, entityKind]
  );

  const outboundCustomTypes = useMemo(
    () => outboundTypes.filter((t) => !t.isSystem),
    [outboundTypes]
  );

  const customRelationships = useMemo(
    () => relationships.filter((r) => customTypeIds.has(r.relationshipTypeId)),
    [relationships, customTypeIds]
  );

  const selectedModalType = useMemo(
    () => outboundCustomTypes.find((t) => t.id === modalTypeId),
    [outboundCustomTypes, modalTypeId]
  );

  const otherKind: CrmEntityKind | null = selectedModalType
    ? outboundTargetKind(selectedModalType, entityKind)
    : null;

  const load = useCallback(async () => {
    setLoadErr("");
    try {
      let rt = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types`, { headers: authHeaders() });
      if (rt.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        rt = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types`, { headers: authHeaders() });
      }
      let rl = await fetch(
        `${API_BASE_URL}/tenant/crm/relationships?entityKind=${encodeURIComponent(entityKind)}&entityId=${encodeURIComponent(entityId)}`,
        { headers: authHeaders() }
      );
      if (rl.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        rl = await fetch(
          `${API_BASE_URL}/tenant/crm/relationships?entityKind=${encodeURIComponent(entityKind)}&entityId=${encodeURIComponent(entityId)}`,
          { headers: authHeaders() }
        );
      }
      if (!rt.ok || !rl.ok) {
        setLoadErr("Could not load associations.");
        return;
      }
      const tj = (await rt.json()) as { relationshipTypes: RelType[] };
      const lj = (await rl.json()) as { relationships: RelRow[] };
      setTypes(
        tj.relationshipTypes.map((t) => ({
          ...t,
          reverseName: t.reverseName ?? t.name,
          isSystem: Boolean(t.isSystem)
        }))
      );
      setRelationships(
        lj.relationships.map((r) => ({
          ...r,
          relationshipTypeReverseName: r.relationshipTypeReverseName ?? r.relationshipTypeName,
          linkedEntityDisplayName: r.linkedEntityDisplayName ?? undefined
        }))
      );
    } catch {
      setLoadErr("Could not load associations.");
    }
  }, [authHeaders, entityId, entityKind, logout, refreshSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAddModal = () => {
    setModalSession((s) => s + 1);
    setModalTypeId("");
    setPickOrgId("");
    setPickOrgName(null);
    setPickOrgPrimary(null);
    setPickContactId("");
    setPickContactName(null);
    setAddErr("");
    setAddOpen(true);
  };

  const closeAddModal = () => {
    setAddOpen(false);
    setAddErr("");
  };

  const submitAdd = async () => {
    setAddErr("");
    if (!selectedModalType) {
      setAddErr("Choose a relationship type.");
      return;
    }
    const targetEntityKind = outboundTargetKind(selectedModalType, entityKind);
    const targetId =
      targetEntityKind === "ORGANIZATION" ? pickOrgId.trim() : pickContactId.trim();
    if (!targetId) {
      setAddErr(targetEntityKind === "ORGANIZATION" ? "Search and select an organization." : "Search and select a contact.");
      return;
    }
    setBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/relationships`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          relationshipTypeId: selectedModalType.id,
          sourceId: entityId,
          sourceEntityKind: entityKind,
          targetId,
          targetEntityKind
        })
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/relationships`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({
            relationshipTypeId: selectedModalType.id,
            sourceId: entityId,
            sourceEntityKind: entityKind,
            targetId,
            targetEntityKind
          })
        });
      }
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setAddErr(body?.message ?? "Could not add association.");
        return;
      }
      closeAddModal();
      await load();
    } catch {
      setAddErr("Could not add association.");
    } finally {
      setBusy(false);
    }
  };

  const removeRel = async (relId: string) => {
    setBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/relationships/${encodeURIComponent(relId)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/relationships/${encodeURIComponent(relId)}`, {
          method: "DELETE",
          headers: authHeaders()
        });
      }
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  };

  const labelOtherEnd = (r: RelRow): { ref: string; kind: CrmEntityKind } => {
    if (r.sourceId === entityId && r.sourceEntityKind === entityKind) {
      return { ref: r.targetId, kind: r.targetEntityKind as CrmEntityKind };
    }
    return { ref: r.sourceId, kind: r.sourceEntityKind as CrmEntityKind };
  };

  const relationshipLabelAtAnchor = (r: RelRow) =>
    r.sourceId === entityId && r.sourceEntityKind === entityKind
      ? r.relationshipTypeName
      : r.relationshipTypeReverseName;

  const excludeSelfOrg = entityKind === "ORGANIZATION" ? entityId : undefined;
  const excludeSelfContact = entityKind === "CONTACT" ? entityId : undefined;

  return (
    <>
      <section
        className="relative isolate overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5"
        aria-labelledby="crm-associated-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 text-slate-800">
            <Link2 className="h-5 w-5 shrink-0 text-amber-800/90" aria-hidden strokeWidth={2} />
            <h2 id="crm-associated-heading" className="text-sm font-semibold tracking-tight text-slate-900">
              Associated
            </h2>
          </div>
          <button
            type="button"
            disabled={Boolean(loadErr) || outboundCustomTypes.length === 0 || busy}
            onClick={openAddModal}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            <Plus className="h-4 w-4" aria-hidden strokeWidth={2} />
            Add association
          </button>
        </div>

        <div className="px-4 py-4 sm:px-5 sm:py-5">
          {loadErr ? (
            <p className="text-sm text-rose-600" role="alert">
              {loadErr}
            </p>
          ) : null}

          {!loadErr && outboundCustomTypes.length === 0 ? (
            <p className="text-sm text-slate-600">No association types are configured for your organization.</p>
          ) : null}

          {!loadErr && outboundCustomTypes.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {customRelationships.length === 0 ? (
                <li className="px-4 py-5 text-sm text-slate-500">No associations yet.</li>
              ) : (
                customRelationships.map((r) => {
                  const o = labelOtherEnd(r);
                  const href =
                    o.kind === "ORGANIZATION" ? `${crmBase}/organizations/${o.ref}` : `${crmBase}/contacts/${o.ref}`;
                  const linkedName = (r.linkedEntityDisplayName ?? "").trim() || o.ref;
                  const relLabel = relationshipLabelAtAnchor(r);
                  return (
                    <li key={r.id} className="flex items-stretch">
                      <Link
                        to={href}
                        className="flex min-w-0 flex-1 items-center gap-x-2 gap-y-1 px-4 py-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/40"
                      >
                        <span className="min-w-0 truncate font-semibold text-slate-900">{linkedName}</span>
                        <span className="shrink-0 text-slate-500">{relLabel}</span>
                      </Link>
                      <div className="flex shrink-0 items-center border-l border-slate-100 pr-2 pl-1">
                        <button
                          type="button"
                          title="Unlink — remove this association only"
                          disabled={busy}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void removeRel(r.id);
                          }}
                          className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100 hover:text-amber-900 disabled:opacity-50"
                        >
                          <Unlink className="h-4 w-4" aria-hidden strokeWidth={2} />
                          <span className="sr-only">Unlink association</span>
                        </button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}
        </div>
      </section>

      <CrmModal title="Add association" open={addOpen} onClose={closeAddModal}>
        <div key={modalSession} className="space-y-5">
          <div>
            <label htmlFor="crm-assoc-rel-type" className="mb-1.5 block text-xs font-medium text-stone-600">
              Relationship
            </label>
            <select
              id="crm-assoc-rel-type"
              value={modalTypeId}
              onChange={(e) => {
                setModalTypeId(e.target.value);
                setPickOrgId("");
                setPickOrgName(null);
                setPickOrgPrimary(null);
                setPickContactId("");
                setPickContactName(null);
                setAddErr("");
              }}
              className={selectClass}
            >
              <option value="">Select type…</option>
              {outboundCustomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {outboundTypeLabel(t, entityKind)}
                </option>
              ))}
            </select>
          </div>

          {selectedModalType && otherKind === "ORGANIZATION" ? (
            <ContactEmployerOrganizationField
              inputId="crm-assoc-org-search"
              authHeaders={authHeaders}
              refreshSession={refreshSession}
              logout={logout}
              organizationId={pickOrgId}
              organizationName={pickOrgName}
              organizationPrimaryAddress={pickOrgPrimary}
              onChange={(id, name, primary) => {
                setPickOrgId(id);
                setPickOrgName(name);
                setPickOrgPrimary(primary);
                setAddErr("");
              }}
              label="Organization"
              excludeOrganizationId={excludeSelfOrg}
            />
          ) : null}

          {selectedModalType && otherKind === "CONTACT" ? (
            <CrmContactSearchField
              inputId="crm-assoc-contact-search"
              authHeaders={authHeaders}
              refreshSession={refreshSession}
              logout={logout}
              contactId={pickContactId}
              contactName={pickContactName}
              onChange={(id, name) => {
                setPickContactId(id);
                setPickContactName(name);
                setAddErr("");
              }}
              label="Contact"
              excludeContactId={excludeSelfContact}
            />
          ) : null}

          {addErr ? <p className="text-sm text-rose-600">{addErr}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-4">
            <button
              type="button"
              onClick={closeAddModal}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !modalTypeId ||
                (otherKind === "ORGANIZATION" && !pickOrgId.trim()) ||
                (otherKind === "CONTACT" && !pickContactId.trim())
              }
              onClick={() => void submitAdd()}
              className="rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </CrmModal>
    </>
  );
};
