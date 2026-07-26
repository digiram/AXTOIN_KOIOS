/**
 * SalesFunnelRecordDetailPage.
 *
 * Full-page lead or deal detail with profile card, editable fields, and activity section.
 *
 * Responsibilities:
 * - Load funnel record by route `:id` for `kind` lead or deal
 * - Set shell header and breadcrumb back to board or records list
 * - Delegate inline edits to {@link SalesFunnelRecordDetailsEditor}
 *
 * Depends on:
 * - {@link useSalesApi}, {@link useModulePermissions}, {@link useCrmBasePath}
 *
 * Security:
 * - Edit, promote, archive, and delete respect Sales module permissions
 */

import { ChevronLeft, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { FunnelDetailRecord } from "./SalesFunnelDetailPanel.js";
import type { FunnelDetailsPatch } from "./SalesFunnelRecordDetailsEditor.js";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useToast } from "../../components/ToastProvider.js";
import { useShellHeader } from "../../components/ShellHeaderContext.js";
import { SalesFunnelActivitySection } from "../../components/sales/SalesFunnelActivitySection.js";
import {
  SalesFunnelRecordProfileCard,
  type SalesFunnelContactRow
} from "../../components/sales/SalesFunnelRecordProfileCard.js";
import { API_BASE_URL } from "../../lib/api.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import { useCrmBasePath } from "../crm/crmPaths.js";
import {
  salesBdrBoardPath,
  salesFunnelRecordsPath,
  salesPipelineBoardPath
} from "./salesFunnelPaths.js";
import { useSalesApi } from "./useSalesApi.js";

type StageRow = { stageKey: string; name: string; sortOrder: number; outcome?: string };

type FunnelRecord = {
  id: string;
  title: string;
  description: string;
  stageKey: string;
  tags: string[];
  ownerUserId: string | null;
  crmOrganizationId: string | null;
  contacts: { contactId: string; role: string }[];
  promotedDealId?: string | null;
  promotedFromLeadId?: string | null;
  active?: boolean;
  outcomeBucket?: string | null;
  inactiveStageLabel?: string | null;
  expectedValueMinor?: number | null;
  expectedValueCurrency?: string | null;
  updatedAt: string;
  archivedAt?: string | null;
};

type Assignee = { id: string; displayName: string | null; email: string };

type Props = {
  kind: "lead" | "deal";
};

/**
 * Full-page funnel record detail for a BDR lead or pipeline deal.
 *
 * @param props.kind - `"lead"` or `"deal"` determines API surface and board links
 */
export const SalesFunnelRecordDetailPage = ({ kind }: Props) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const crmBase = useCrmBasePath();
  const { authedFetch } = useSalesApi();
  const { toast } = useToast();
  const { canWrite, canDelete } = useModulePermissions("sales");
  const { formatDateTime } = useUserDisplayDatetime();
  const { preferences: tenantPrefs } = useTenantDisplayPreferences();

  const [record, setRecord] = useState<FunnelRecord | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [contacts, setContacts] = useState<SalesFunnelContactRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [permanentDeleteBusy, setPermanentDeleteBusy] = useState(false);
  const [reactivateBusy, setReactivateBusy] = useState(false);

  const displayLocale = tenantPrefs?.locale ?? "en-US";
  const currencyFormat = tenantPrefs?.currencyFormat ?? null;

  const loadRecord = useCallback(async () => {
    if (!id) return;
    setError("");
    setLoading(true);
    try {
      const url =
        kind === "lead"
          ? `${API_BASE_URL}/tenant/sales/bdr/leads/${encodeURIComponent(id)}`
          : `${API_BASE_URL}/tenant/sales/deals/${encodeURIComponent(id)}`;
      const res = await authedFetch(url);
      if (res?.status === 404) {
        setError(kind === "lead" ? "Lead not found." : "Deal not found.");
        return;
      }
      if (!res?.ok) {
        setError("Could not load record.");
        return;
      }
      const json = (await res.json()) as { lead?: FunnelRecord; deal?: FunnelRecord };
      const row = kind === "lead" ? json.lead : json.deal;
      if (!row) {
        setError("Could not load record.");
        return;
      }
      setRecord(row);
      setContacts(
        (row.contacts ?? []).map((c) => ({
          contactId: c.contactId,
          role: c.role ?? ""
        }))
      );
    } catch {
      setError("Could not load record.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, id, kind]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  useEffect(() => {
    void (async () => {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/pipeline-config`);
      if (!res?.ok) return;
      const json = (await res.json()) as { bdrStages: StageRow[]; salesStages: StageRow[] };
      setStages(kind === "lead" ? json.bdrStages ?? [] : json.salesStages ?? []);
    })();
  }, [authedFetch, kind]);

  useEffect(() => {
    void (async () => {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/assignees`);
      if (!res?.ok) return;
      const json = (await res.json()) as { users: Assignee[] };
      setAssignees(json.users ?? []);
    })();
  }, [authedFetch]);

  useEffect(() => {
    const orgId = record?.crmOrganizationId?.trim();
    if (!orgId) {
      setOrgName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await authedFetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(orgId)}`);
      if (!res?.ok || cancelled) return;
      const o = (await res.json()) as { name?: string };
      if (!cancelled) setOrgName(o.name?.trim() ? o.name : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, record?.crmOrganizationId]);

  const contactLabelFetchKey = useMemo(
    () =>
      contacts
        .filter((c) => !c.displayName?.trim())
        .map((c) => c.contactId)
        .sort()
        .join(","),
    [contacts]
  );

  useEffect(() => {
    if (!contactLabelFetchKey) return;
    const ids = contactLabelFetchKey.split(",").filter(Boolean);
    let cancelled = false;
    void (async () => {
      const updates = new Map<string, string>();
      for (const contactId of ids) {
        const res = await authedFetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}`);
        if (!res?.ok) continue;
        const j = (await res.json()) as {
          firstName?: string | null;
          lastName?: string | null;
          email?: string | null;
        };
        const fromParts = [j.firstName?.trim(), j.lastName?.trim()].filter(Boolean).join(" ");
        updates.set(contactId, fromParts || j.email?.trim() || contactId);
      }
      if (cancelled || updates.size === 0) return;
      setContacts((prev) =>
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
  }, [authedFetch, contactLabelFetchKey]);

  const stageLabel = useMemo(() => {
    if (!record) return "";
    if (record.active === false && record.inactiveStageLabel) return record.inactiveStageLabel;
    return stages.find((s) => s.stageKey === record.stageKey)?.name ?? record.stageKey;
  }, [record, stages]);

  const ownerLabel = useMemo(() => {
    if (!record?.ownerUserId) return null;
    const u = assignees.find((a) => a.id === record.ownerUserId);
    return u?.displayName?.trim() || u?.email || record.ownerUserId;
  }, [assignees, record?.ownerUserId]);

  const outcomeLabel = useMemo(() => {
    if (kind !== "deal" || !record?.outcomeBucket) return null;
    return record.outcomeBucket === "won" ? "Won" : "Lost";
  }, [kind, record?.outcomeBucket]);

  const inactiveLabel = useMemo(() => {
    if (!record || record.active !== false) return null;
    const board = kind === "lead" ? "BDR" : "Sales";
    return `Inactive — hidden from the ${board} pipeline board.`;
  }, [kind, record]);

  const firstLaneName = useMemo(() => {
    const pipelineStages =
      kind === "lead"
        ? stages
        : stages.filter((s) => s.outcome !== "won" && s.outcome !== "lost");
    const sorted = [...pipelineStages].sort((a, b) => a.sortOrder - b.sortOrder);
    return sorted[0]?.name?.trim() || null;
  }, [kind, stages]);

  const canReactivate = useMemo(() => {
    if (!canWrite || !record || record.active !== false) return false;
    if (kind === "lead" && record.promotedDealId) return false;
    return true;
  }, [canWrite, kind, record]);

  const editRecord = useMemo((): FunnelDetailRecord | null => {
    if (!record) return null;
    return {
      id: record.id,
      title: record.title,
      description: record.description ?? "",
      stageKey: record.stageKey,
      ownerUserId: record.ownerUserId,
      crmOrganizationId: record.crmOrganizationId,
      contacts: contacts.map((c) => ({
        contactId: c.contactId,
        role: c.role ?? "",
        displayName: c.displayName
      })),
      promotedDealId: record.promotedDealId,
      promotedFromLeadId: record.promotedFromLeadId,
      active: record.active,
      outcomeBucket: record.outcomeBucket,
      inactiveStageLabel: record.inactiveStageLabel,
      expectedValueMinor: record.expectedValueMinor,
      expectedValueCurrency: record.expectedValueCurrency
    };
  }, [record, contacts]);

  const saveRecordDetails = useCallback(
    async (patch: FunnelDetailsPatch): Promise<boolean> => {
      if (!record?.id) return false;
      try {
        const url =
          kind === "lead"
            ? `${API_BASE_URL}/tenant/sales/bdr/leads/${encodeURIComponent(record.id)}`
            : `${API_BASE_URL}/tenant/sales/deals/${encodeURIComponent(record.id)}`;
        const res = await authedFetch(url, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch)
        });
        if (!res?.ok) return false;
        const json = (await res.json()) as { lead?: FunnelRecord; deal?: FunnelRecord };
        const updated = kind === "lead" ? json.lead : json.deal;
        if (!updated) return false;
        setRecord(updated);
        setContacts(
          (updated.contacts ?? []).map((c) => ({
            contactId: c.contactId,
            role: c.role ?? "",
            displayName: undefined
          }))
        );
        if (patch.crmOrganizationId !== undefined) {
          const orgId = patch.crmOrganizationId?.trim();
          if (!orgId) setOrgName(null);
        }
        return true;
      } catch {
        return false;
      }
    },
    [authedFetch, kind, record?.id]
  );

  const reactivateRecord = useCallback(async () => {
    if (!record?.id || record.active !== false) return;
    if (kind === "lead" && record.promotedDealId) return;
    setReactivateBusy(true);
    setError("");
    try {
      const url =
        kind === "lead"
          ? `${API_BASE_URL}/tenant/sales/bdr/leads/${encodeURIComponent(record.id)}/reactivate`
          : `${API_BASE_URL}/tenant/sales/deals/${encodeURIComponent(record.id)}/reactivate`;
      const res = await authedFetch(url, { method: "POST" });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? "Could not reactivate record.");
        return;
      }
      const json = (await res.json()) as { lead?: FunnelRecord; deal?: FunnelRecord };
      const updated = kind === "lead" ? json.lead : json.deal;
      if (!updated) {
        setError("Could not reactivate record.");
        return;
      }
      setRecord(updated);
      setContacts(
        (updated.contacts ?? []).map((c) => ({
          contactId: c.contactId,
          role: c.role ?? "",
          displayName: undefined
        }))
      );
      toast(
        kind === "lead"
          ? `Lead reactivated in ${firstLaneName ?? "the first lane"}.`
          : `Deal reactivated in ${firstLaneName ?? "the first lane"}.`
      );
    } catch {
      setError("Could not reactivate record.");
    } finally {
      setReactivateBusy(false);
    }
  }, [authedFetch, firstLaneName, kind, record?.active, record?.id, record?.promotedDealId, toast]);

  const archiveRecord = useCallback(async () => {
    if (!record?.id || record.archivedAt) return;
    setArchiveBusy(true);
    setError("");
    try {
      const url =
        kind === "lead"
          ? `${API_BASE_URL}/tenant/sales/bdr/leads/${encodeURIComponent(record.id)}`
          : `${API_BASE_URL}/tenant/sales/deals/${encodeURIComponent(record.id)}`;
      const res = await authedFetch(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: true })
      });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? "Could not archive record.");
        return;
      }
      const json = (await res.json()) as { lead?: FunnelRecord; deal?: FunnelRecord };
      const updated = kind === "lead" ? json.lead : json.deal;
      if (!updated) {
        setError("Could not archive record.");
        return;
      }
      setRecord(updated);
      setContacts(
        (updated.contacts ?? []).map((c) => ({
          contactId: c.contactId,
          role: c.role ?? "",
          displayName: undefined
        }))
      );
      toast(kind === "lead" ? "Lead archived." : "Deal archived.");
    } catch {
      setError("Could not archive record.");
    } finally {
      setArchiveBusy(false);
    }
  }, [authedFetch, kind, record?.archivedAt, record?.id, toast]);

  const permanentlyDeleteRecord = useCallback(async () => {
    if (!record?.id || !record.archivedAt) return;
    setPermanentDeleteBusy(true);
    setError("");
    try {
      const url =
        kind === "lead"
          ? `${API_BASE_URL}/tenant/sales/bdr/leads/${encodeURIComponent(record.id)}`
          : `${API_BASE_URL}/tenant/sales/deals/${encodeURIComponent(record.id)}`;
      const res = await authedFetch(url, { method: "DELETE" });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? "Could not delete record.");
        return;
      }
      navigate(salesFunnelRecordsPath);
    } catch {
      setError("Could not delete record.");
    } finally {
      setPermanentDeleteBusy(false);
    }
  }, [authedFetch, kind, navigate, record?.archivedAt, record?.id]);

  const listHref = kind === "lead" ? salesBdrBoardPath : salesPipelineBoardPath;
  const listLabel = kind === "lead" ? "BDR board" : "Sales pipeline";

  const shellPatch = useMemo(() => {
    if (!id) return { title: kind === "lead" ? "Lead" : "Deal", subtitle: "" };
    if (error) return { title: kind === "lead" ? "Lead" : "Deal", subtitle: error };
    if (record) {
      return {
        title: record.title,
        subtitle: kind === "lead" ? "Lead profile and activity." : "Deal profile and activity."
      };
    }
    return { title: kind === "lead" ? "Lead" : "Deal", subtitle: "Loading record…" };
  }, [error, id, kind, record]);

  useShellHeader(shellPatch);

  if (!id) return null;

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <Link
            to={listHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden strokeWidth={2} />
            {listLabel}
          </Link>
        </nav>
      </div>

      {error ? (
        <p className="mt-6 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      {record ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <div className="space-y-6 lg:col-span-1">
            <SalesFunnelRecordProfileCard
              kind={kind}
              title={record.title}
              stageLabel={stageLabel}
              description={record.description ?? ""}
              ownerLabel={ownerLabel}
              organizationName={orgName}
              organizationId={record.crmOrganizationId}
              contacts={contacts}
              tags={record.tags ?? []}
              expectedValueMinor={record.expectedValueMinor}
              expectedValueCurrency={record.expectedValueCurrency}
              locale={displayLocale}
              currencyFormat={currencyFormat}
              outcomeLabel={outcomeLabel}
              promotedDealId={record.promotedDealId}
              promotedFromLeadId={record.promotedFromLeadId}
              inactiveLabel={inactiveLabel}
              recordUpdatedAt={formatDateTime(record.updatedAt)}
              crmBase={crmBase}
              archivedAt={record.archivedAt ?? null}
              canEdit={canWrite && !record.archivedAt}
              editRecord={editRecord ?? undefined}
              onSaveDetails={saveRecordDetails}
              canArchive={canDelete && !record.archivedAt}
              archiveBusy={archiveBusy}
              onArchive={() => void archiveRecord()}
              canPermanentlyDelete={canDelete}
              permanentDeleteBusy={permanentDeleteBusy}
              onPermanentDelete={() => void permanentlyDeleteRecord()}
              canReactivate={canReactivate}
              reactivateBusy={reactivateBusy}
              onReactivate={() => void reactivateRecord()}
              firstLaneName={firstLaneName}
            />
          </div>

          <div className="lg:col-span-3">
            <SalesFunnelActivitySection
              kind={kind}
              recordId={record.id}
              canEdit={canWrite && !record.archivedAt}
              contacts={contacts}
            />
          </div>
        </div>
      ) : loading ? (
        <div className="mt-10 flex justify-center text-sm text-stone-500">
          <User className="mr-2 h-5 w-5 animate-pulse text-emerald-500" aria-hidden />
          Loading…
        </div>
      ) : null}
    </div>
  );
};
