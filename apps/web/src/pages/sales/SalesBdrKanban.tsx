/**
 * SalesBdrKanban.
 *
 * BDR pipeline kanban board with draggable lanes, virtualized lead cards, and side detail panel.
 *
 * Responsibilities:
 * - Load stages and leads from `/v1/tenant/sales/funnel/*` BDR endpoints
 * - Drag-and-drop lane reorder and lead stage moves via @dnd-kit
 * - Open {@link SalesFunnelDetailPanel} for selected or new leads
 *
 * Depends on:
 * - {@link useSalesApi}, {@link useModulePermissions}, kanban layout and interaction helpers
 *
 * Security:
 * - Lane and card mutations gated by Sales `canWrite` / `canDelete`
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy
} from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useToast } from "../../components/ToastProvider.js";
import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import { API_BASE_URL } from "../../lib/api.js";
import {
  salesKanbanBoardRowClass,
  salesKanbanLaneScrollClass,
  salesKanbanRootClass
} from "./salesKanbanLayout.js";
import { bindKanbanCardClick } from "./salesKanbanCardInteraction.js";
import { laneDndId, parseLaneDndId } from "./salesKanbanDnd.js";
import { SalesAddLaneModal } from "./SalesAddLaneModal.js";
import { salesLeadDetailPath } from "./salesFunnelPaths.js";
import {
  SalesFunnelDetailPanel,
  type FunnelCreatePayload,
  type FunnelDetailRecord
} from "./SalesFunnelDetailPanel.js";
import { SalesKanbanToolbar } from "./SalesKanbanToolbar.js";
import { SalesLaneConfigModal, type KanbanStageConfig } from "./SalesLaneConfigModal.js";
import { SortableKanbanLane } from "./SortableKanbanLane.js";
import { useSalesApi } from "./useSalesApi.js";

type Stage = KanbanStageConfig;

type Lead = {
  id: string;
  title: string;
  description: string;
  stageKey: string;
  tags: string[];
  ownerUserId: string | null;
  crmOrganizationId: string | null;
  stageEnteredAt: string;
  updatedAt: string;
  active?: boolean;
  archivedAt?: string | null;
  contacts: { contactId: string; role: string }[];
  contactIds: string[];
  promotedDealId?: string | null;
};

const LeadCard = ({
  lead,
  isDragging,
  onSelect,
  onOpenDetail,
  detailHref
}: {
  lead: Lead;
  isDragging?: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
  detailHref: string;
}) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: lead.id,
    data: { stageKey: lead.stageKey }
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }
    : undefined;
  const clickHandlers = useMemo(
    () => bindKanbanCardClick({ onSelect, onOpenDetail, detailHref }),
    [detailHref, onSelect, onOpenDetail]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="cursor-grab rounded-lg border border-stone-200 bg-white p-3 shadow-sm ring-1 ring-slate-900/5 active:cursor-grabbing"
      {...listeners}
      {...attributes}
      {...clickHandlers}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-stone-900">{lead.title}</p>
        {lead.tags.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {lead.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600 leading-none">
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const VirtualLane = ({
  stage,
  leads,
  onSelectLead,
  onOpenLeadDetail,
  canEdit
}: {
  stage: Stage;
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onOpenLeadDetail: (lead: Lead) => void;
  canEdit: boolean;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.stageKey, disabled: !canEdit });
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 4
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 flex-1 flex-col p-2 ${isOver ? "rounded-lg ring-2 ring-indigo-300/80" : ""}`}
    >
        <div ref={parentRef} className={salesKanbanLaneScrollClass}>
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const lead = leads[vi.index]!;
              return (
                <div
                  key={lead.id}
                  className="absolute left-0 top-0 w-full pb-2"
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <LeadCard
                    lead={lead}
                    detailHref={salesLeadDetailPath(lead.id)}
                    onSelect={() => onSelectLead(lead)}
                    onOpenDetail={() => onOpenLeadDetail(lead)}
                  />
                </div>
              );
            })}
          </div>
          {leads.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-500">No leads</p>
          ) : null}
        </div>
    </div>
  );
};

const BDR_PIPELINE = "bdr" as const;

/**
 * BDR kanban board: lanes, lead cards, DnD, and inline detail panel.
 *
 * @returns Full BDR board UI for `/admin/sales/bdr`
 */
export const SalesBdrKanban = () => {
  const navigate = useNavigate();
  const { authedFetch } = useSalesApi();
  const { toast } = useToast();
  const { canWrite, canDelete } = useModulePermissions("sales");
  const canEdit = canWrite;
  const [searchParams, setSearchParams] = useSearchParams();
  const openRecordId = searchParams.get("recordId");
  const openedRecordRef = useRef<string | null>(null);

  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [promoteMessage, setPromoteMessage] = useState("");

  const [searchDraft, setSearchDraft] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [addLaneOpen, setAddLaneOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draggingLaneId, setDraggingLaneId] = useState<string | null>(null);
  const [laneConfigStage, setLaneConfigStage] = useState<Stage | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const id = window.setTimeout(() => setFilterQ(searchDraft), 320);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  const loadBoard = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterQ.trim()) qs.set("q", filterQ.trim());
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/bdr/board?${qs}`);
      if (!res?.ok) {
        setError("Could not load BDR board.");
        return;
      }
      const json = (await res.json()) as { stages: Stage[]; leads: Lead[] };
      setStages(json.stages.sort((a, b) => a.sortOrder - b.sortOrder));
      setLeads(json.leads);
    } catch {
      setError("Could not load BDR board.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, filterQ]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const newLeadDraft = useMemo((): FunnelDetailRecord => {
    return {
      id: "__new__",
      title: "",
      description: "",
      stageKey: stages[0]?.stageKey ?? "",
      ownerUserId: null,
      crmOrganizationId: null,
      contacts: []
    };
  }, [stages]);

  const leadsByStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of stages) map.set(s.stageKey, []);
    for (const l of leads) {
      if (l.archivedAt) continue;
      const list = map.get(l.stageKey) ?? [];
      list.push(l);
      map.set(l.stageKey, list);
    }
    return map;
  }, [leads, stages]);

  const openLeadDetail = useCallback(
    (lead: Lead) => {
      navigate(salesLeadDetailPath(lead.id));
    },
    [navigate]
  );

  const selectLead = async (lead: Lead) => {
    setCreating(false);
    setPromoteMessage("");
    setSelected(lead);
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/bdr/leads/${lead.id}`);
      if (res?.ok) {
        const json = (await res.json()) as { lead: Lead };
        setSelected(json.lead);
      }
    } catch {
      /* keep board snapshot */
    }
  };

  useEffect(() => {
    if (!openRecordId || loading) return;
    if (openedRecordRef.current === openRecordId) return;
    const lead = leads.find((l) => l.id === openRecordId);
    if (!lead) return;
    openedRecordRef.current = openRecordId;
    void selectLead(lead);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("recordId");
        return next;
      },
      { replace: true }
    );
  }, [openRecordId, loading, leads, setSearchParams]);

  const deleteLead = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/bdr/leads/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: true })
      });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? "Could not archive lead.");
        return;
      }
      setSelected(null);
      await loadBoard();
    } catch {
      setError("Could not archive lead.");
    } finally {
      setBusy(false);
    }
  };

  const saveLeadDetails = async (patch: {
    ownerUserId: string | null;
    crmOrganizationId: string | null;
    contacts: { contactId: string; role: string }[];
    description: string;
  }): Promise<boolean> => {
    if (!selected) return false;
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/bdr/leads/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!res?.ok) return false;
      const json = (await res.json()) as { lead: Lead };
      setSelected(json.lead);
      setLeads((prev) => prev.map((l) => (l.id === selected.id ? json.lead : l)));
      return true;
    } catch {
      return false;
    }
  };

  const promoteLead = async () => {
    if (!selected || selected.promotedDealId) return;
    setBusy(true);
    setPromoteMessage("");
    setError("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/bdr/leads/${selected.id}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      if (!res?.ok) {
        const json = (await res?.json().catch(() => null)) as { message?: string } | null;
        setError(json?.message ?? "Could not promote lead.");
        return;
      }
      const json = (await res.json()) as { deal: { id: string } };
      const archivedAt = new Date().toISOString();
      setPromoteMessage("Lead promoted to Sales pipeline.");
      toast("Lead promoted to Sales pipeline.");
      setSelected((prev) =>
        prev
          ? { ...prev, promotedDealId: json.deal.id, active: false, archivedAt }
          : prev
      );
      setLeads((prev) =>
        prev.map((l) =>
          l.id === selected.id ? { ...l, promotedDealId: json.deal.id, active: false, archivedAt } : l
        )
      );
    } catch {
      setError("Could not promote lead.");
    } finally {
      setBusy(false);
    }
  };

  const moveLead = async (leadId: string, stageKey: string) => {
    const targetStage = stages.find((s) => s.stageKey === stageKey);
    setBusy(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/bdr/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageKey })
      });
      if (!res?.ok) {
        setError("Could not move lead.");
        await loadBoard();
        return;
      }
      const json = (await res.json()) as { lead: Lead };
      if (targetStage?.readyForSales || json.lead.archivedAt) {
        toast("Lead promoted to Sales pipeline.");
        setSelected(null);
        await loadBoard();
        return;
      }
      setLeads((prev) => prev.map((l) => (l.id === leadId ? json.lead : l)));
      if (selected?.id === leadId) setSelected(json.lead);
    } catch {
      setError("Could not move lead.");
    } finally {
      setBusy(false);
    }
  };

  const persistLaneOrder = async (ordered: Stage[]) => {
    const res = await authedFetch(`${API_BASE_URL}/tenant/sales/stages/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pipeline: BDR_PIPELINE, stageIds: ordered.map((s) => s.id) })
    });
    if (!res?.ok) {
      setError("Could not reorder lanes.");
      await loadBoard();
    }
  };

  const submitAddLane = async (name: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/stages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pipeline: BDR_PIPELINE, name })
      });
      if (!res?.ok) {
        setError("Could not add lane.");
        return;
      }
      setAddLaneOpen(false);
      await loadBoard();
    } catch {
      setError("Could not add lane.");
    } finally {
      setBusy(false);
    }
  };

  const deleteLane = async (stage: Stage) => {
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/stages/${stage.id}`, {
        method: "DELETE"
      });
      if (!res?.ok) {
        const j = (await res?.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? "Could not delete lane.");
        return;
      }
      await loadBoard();
    } catch {
      setError("Could not delete lane.");
    } finally {
      setBusy(false);
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    const laneId = parseLaneDndId(event.active.id);
    if (laneId) {
      setDraggingLaneId(laneId);
      return;
    }
    const lead = leads.find((l) => l.id === event.active.id);
    if (lead) setActiveLead(lead);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const laneId = parseLaneDndId(event.active.id);
    setDraggingLaneId(null);
    setActiveLead(null);
    if (!canEdit) return;

    if (laneId) {
      const overLaneId = event.over ? parseLaneDndId(event.over.id) : null;
      if (!overLaneId || laneId === overLaneId) return;
      const oldIndex = stages.findIndex((s) => s.id === laneId);
      const newIndex = stages.findIndex((s) => s.id === overLaneId);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(stages, oldIndex, newIndex);
      setStages(next);
      void persistLaneOrder(next);
      return;
    }

    const leadId = String(event.active.id);
    const overId = event.over?.id;
    if (!overId || typeof overId !== "string") return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageKey === overId) return;
    if (!stages.some((s) => s.stageKey === overId)) return;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stageKey: overId } : l)));
    void moveLead(leadId, overId);
  };

  const createLeadFromPanel = async (payload: FunnelCreatePayload): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/bdr/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          description: payload.description,
          stageKey: payload.stageKey,
          ownerUserId: payload.ownerUserId,
          crmOrganizationId: payload.crmOrganizationId,
          contacts: payload.contacts
        })
      });
      if (!res?.ok) {
        setError("Could not create lead.");
        return false;
      }
      const json = (await res.json()) as { lead: Lead };
      setCreating(false);
      setSelected(json.lead);
      await loadBoard();
      return true;
    } catch {
      setError("Could not create lead.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-stone-500">Loading board…</p>;
  }

  return (
    <div className={salesKanbanRootClass}>
      {error ? (
        <p
          className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200/80"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <SalesKanbanToolbar
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        canEdit={canEdit}
        readOnlyHint="View only — tenant admins can create and move leads."
        onAddLane={() => setAddLaneOpen(true)}
        onAddRecord={() => {
          setSelected(null);
          setPromoteMessage("");
          setCreating(true);
        }}
        addRecordLabel="Add lead"
        busy={busy}
      />

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <SortableContext
            items={stages.map((s) => laneDndId(s.id))}
            strategy={horizontalListSortingStrategy}
          >
            <div className={salesKanbanBoardRowClass}>
              {stages.map((stage) => (
                <SortableKanbanLane
                  key={stage.id}
                  stage={stage}
                  count={(leadsByStage.get(stage.stageKey) ?? []).length}
                  canEditLanes={canEdit && canDelete}
                  onConfigureLane={() => setLaneConfigStage(stage)}
                >
                  <VirtualLane
                    stage={stage}
                    leads={(leadsByStage.get(stage.stageKey) ?? []).filter(
                      (l) => l.id !== activeLead?.id
                    )}
                    onSelectLead={selectLead}
                    onOpenLeadDetail={openLeadDetail}
                    canEdit={canEdit}
                  />
                </SortableKanbanLane>
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {draggingLaneId ? (
              <div className="w-72 rounded-lg border border-indigo-300 bg-stone-100 px-3 py-2 text-sm font-medium shadow-lg">
                {stages.find((s) => s.id === draggingLaneId)?.name ?? "Lane"}
              </div>
            ) : activeLead ? (
              <div className="w-72 rounded-lg border border-indigo-300 bg-white p-3 shadow-lg">
                <p className="text-sm font-medium">{activeLead.title}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <SalesAddLaneModal
        open={addLaneOpen}
        busy={busy}
        onClose={() => setAddLaneOpen(false)}
        onSubmit={(name) => submitAddLane(name)}
      />

      <SalesLaneConfigModal
        stage={laneConfigStage}
        pipeline={BDR_PIPELINE}
        open={laneConfigStage != null}
        busy={busy}
        canDelete={canDelete}
        laneIsEmpty={
          laneConfigStage == null
            ? true
            : (leadsByStage.get(laneConfigStage.stageKey) ?? []).length === 0
        }
        authedFetch={authedFetch}
        onClose={() => setLaneConfigStage(null)}
        onSaved={(updated) => {
          setStages((prev) =>
            prev.map((s) => {
              if (s.id === updated.id) return updated;
              if (updated.readyForSales) return { ...s, readyForSales: false };
              return s;
            })
          );
        }}
        onDelete={(stage) => {
          setLaneConfigStage(null);
          void deleteLane(stage);
        }}
      />

      {creating || selected ? (
        <SalesFunnelDetailPanel
          kind="lead"
          record={
            creating
              ? newLeadDraft
              : {
                  ...selected!,
                  contacts:
                    selected!.contacts ??
                    selected!.contactIds.map((id) => ({ contactId: id, role: "" }))
                }
          }
          stages={stages}
          canEdit={canEdit}
          canDelete={!creating && canDelete}
          busy={busy}
          creating={creating}
          createRecord={creating ? createLeadFromPanel : undefined}
          promoteMessage={creating ? undefined : promoteMessage}
          onClose={() => {
            setCreating(false);
            setSelected(null);
          }}
          onSave={saveLeadDetails}
          onDelete={() => void deleteLead()}
          onPromote={creating ? undefined : () => void promoteLead()}
          detailHref={creating || !selected ? null : salesLeadDetailPath(selected.id)}
        />
      ) : null}
    </div>
  );
};
