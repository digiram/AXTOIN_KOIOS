/**
 * RelationshipPanel
 *
 * Legacy inline relationship manager on CRM detail pages (superseded by `CrmAssociatedCard` in some layouts).
 *
 * Responsibilities:
 * - List and create outbound relationships for a contact or organization
 * - Inline type/target pickers and delete for custom relationship types
 *
 * Related:
 * - CRM detail pages; tenant CRM relationship API
 *
 * Security:
 * - Tenant-scoped entity ids; system relationship types cannot be deleted in UI.
 */
import type { CrmEntityKind } from "@starter/shared";
import { Link2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "../../lib/api.js";

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
};

const outboundTypeLabel = (t: RelType, anchorKind: CrmEntityKind) =>
  t.sourceEntityKind === anchorKind
    ? `${t.name} → ${t.targetEntityKind}`
    : `${t.reverseName} → ${t.sourceEntityKind}`;

const outboundTargetKind = (t: RelType, anchorKind: CrmEntityKind) =>
  t.sourceEntityKind === anchorKind ? t.targetEntityKind : t.sourceEntityKind;

type Props = {
  entityKind: CrmEntityKind;
  entityId: string;
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
};

/** Inline relationship list and add form for one CRM entity. */
export const RelationshipPanel = ({ entityKind, entityId, authHeaders, refreshSession, logout }: Props) => {
  const [types, setTypes] = useState<RelType[]>([]);
  const [relationships, setRelationships] = useState<RelRow[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [newTypeId, setNewTypeId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [addErr, setAddErr] = useState("");

  const [typeName, setTypeName] = useState("");
  const [typeSrc, setTypeSrc] = useState<CrmEntityKind>("ORGANIZATION");
  const [typeTgt, setTypeTgt] = useState<CrmEntityKind>("CONTACT");
  const [typeErr, setTypeErr] = useState("");

  const outboundTypes = useMemo(
    () => types.filter((t) => t.sourceEntityKind === entityKind || t.targetEntityKind === entityKind),
    [types, entityKind]
  );

  const selectedType = useMemo(() => outboundTypes.find((t) => t.id === newTypeId), [outboundTypes, newTypeId]);

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
        setLoadErr("Could not load relationships.");
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
          relationshipTypeReverseName: r.relationshipTypeReverseName ?? r.relationshipTypeName
        }))
      );
    } catch {
      setLoadErr("Could not load relationships.");
    }
  }, [authHeaders, entityId, entityKind, logout, refreshSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const addRelationship = async () => {
    setAddErr("");
    if (!selectedType || !targetId.trim()) {
      setAddErr("Choose a relationship type and enter target UUID.");
      return;
    }
    setBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/relationships`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          relationshipTypeId: selectedType.id,
          sourceId: entityId,
          sourceEntityKind: entityKind,
          targetId: targetId.trim(),
          targetEntityKind: outboundTargetKind(selectedType, entityKind)
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
            relationshipTypeId: selectedType.id,
            sourceId: entityId,
            sourceEntityKind: entityKind,
            targetId: targetId.trim(),
            targetEntityKind: outboundTargetKind(selectedType, entityKind)
          })
        });
      }
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setAddErr(body?.message ?? "Could not add relationship.");
        return;
      }
      setTargetId("");
      await load();
    } catch {
      setAddErr("Could not add relationship.");
    } finally {
      setBusy(false);
    }
  };

  const createType = async () => {
    setTypeErr("");
    setBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          name: typeName.trim(),
          sourceEntityKind: typeSrc,
          targetEntityKind: typeTgt
        })
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({
            name: typeName.trim(),
            sourceEntityKind: typeSrc,
            targetEntityKind: typeTgt
          })
        });
      }
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setTypeErr(body?.message ?? "Could not create type.");
        return;
      }
      setTypeName("");
      await load();
    } catch {
      setTypeErr("Could not create type.");
    } finally {
      setBusy(false);
    }
  };

  const removeRel = async (id: string) => {
    setBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/relationships/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/relationships/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: authHeaders()
        });
      }
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  };

  const labelOtherEnd = (r: RelRow): { role: string; ref: string } => {
    if (r.sourceId === entityId && r.sourceEntityKind === entityKind) {
      return { role: `→ ${r.targetEntityKind}`, ref: r.targetId };
    }
    return { role: `← ${r.sourceEntityKind}`, ref: r.sourceId };
  };

  const relationshipLabelAtAnchor = (r: RelRow) =>
    r.sourceId === entityId && r.sourceEntityKind === entityKind
      ? r.relationshipTypeName
      : r.relationshipTypeReverseName;

  const inputClass =
    "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-2 text-stone-800">
        <Link2 className="h-5 w-5 text-amber-800/90" aria-hidden strokeWidth={2} />
        <h2 id="crm-relationships-heading" className="text-base font-semibold tracking-tight text-stone-800">
          Relationships
        </h2>
      </div>
      <section
        className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6"
        aria-labelledby="crm-relationships-heading"
      >
        <p className="mt-1 text-xs text-stone-500">
          Directed edges from this record. Add runtime relationship types, then link to another organization or contact by UUID.
        </p>
      {loadErr ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {loadErr}
        </p>
      ) : null}

      <div className="mt-5 rounded-xl border border-stone-100 bg-stone-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Custom relationship type</p>
        <p className="mt-1 text-[11px] text-stone-500">
          Built-in types (Employee, Spouse, …) are added automatically and cannot use reserved names.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            value={typeName}
            onChange={(e) => setTypeName(e.target.value)}
            placeholder="Name (unique per tenant)"
            className={inputClass}
          />
          <select value={typeSrc} onChange={(e) => setTypeSrc(e.target.value as CrmEntityKind)} className={inputClass}>
            <option value="ORGANIZATION">Source: Organization</option>
            <option value="CONTACT">Source: Contact</option>
          </select>
          <select value={typeTgt} onChange={(e) => setTypeTgt(e.target.value as CrmEntityKind)} className={inputClass}>
            <option value="ORGANIZATION">Target: Organization</option>
            <option value="CONTACT">Target: Contact</option>
          </select>
        </div>
        {typeErr ? (
          <p className="mt-2 text-sm text-rose-600">{typeErr}</p>
        ) : null}
        <button
          type="button"
          disabled={busy || typeName.trim().length === 0}
          onClick={() => void createType()}
          className="mt-3 rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-50"
        >
          Save type
        </button>
      </div>

      <div className="mt-6 border-t border-stone-100 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Add relationship</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <select value={newTypeId} onChange={(e) => setNewTypeId(e.target.value)} className={inputClass}>
            <option value="">Relationship type (from this record)</option>
            {outboundTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {outboundTypeLabel(t, entityKind)}
                {t.isSystem ? " · system" : ""}
              </option>
            ))}
          </select>
          <input
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder={`Target ${selectedType ? outboundTargetKind(selectedType, entityKind) : "entity"} UUID`}
            className={`${inputClass} font-mono text-xs`}
          />
        </div>
        {addErr ? (
          <p className="mt-2 text-sm text-rose-600">{addErr}</p>
        ) : null}
        <button
          type="button"
          disabled={busy || !newTypeId || !targetId.trim()}
          onClick={() => void addRelationship()}
          className="mt-3 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-50"
        >
          Link
        </button>
      </div>

      <ul className="mt-6 divide-y divide-stone-100 rounded-xl border border-stone-100">
        {relationships.length === 0 ? (
          <li className="px-4 py-6 text-sm text-stone-500">No relationships yet.</li>
        ) : (
          relationships.map((r) => {
            const o = labelOtherEnd(r);
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <span className="font-medium text-stone-900">{relationshipLabelAtAnchor(r)}</span>
                  <span className="text-stone-500"> · {o.role}</span>
                  <div className="font-mono text-xs text-stone-600">{o.ref}</div>
                </div>
                <button
                  type="button"
                  title="Remove relationship"
                  disabled={busy}
                  onClick={() => void removeRel(r.id)}
                  className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden strokeWidth={2} />
                </button>
              </li>
            );
          })
        )}
      </ul>
      </section>
    </div>
  );
};
