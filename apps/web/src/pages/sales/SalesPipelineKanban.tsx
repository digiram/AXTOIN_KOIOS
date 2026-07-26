/**
 * SalesPipelineKanban.
 *
 * Sales pipeline kanban with deal cards, won/lost outcome columns, and side detail panel.
 *
 * Responsibilities:
 * - Load stages and deals from `/v1/tenant/sales/funnel/*` pipeline endpoints
 * - Drag-and-drop lane reorder, deal stage moves, and outcome bucket drops
 * - Format deal values with tenant display preferences
 *
 * Depends on:
 * - {@link useSalesApi}, {@link useModulePermissions}, kanban layout and dnd helpers
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
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import type { CurrencyFormatId } from "../../lib/country-presets.js";
import { API_BASE_URL } from "../../lib/api.js";
import {
  salesKanbanBoardRowClass,
  salesKanbanLaneScrollClass,
  salesKanbanLaneShellClass,
  salesKanbanRootClass
} from "./salesKanbanLayout.js";
import { bindKanbanCardClick } from "./salesKanbanCardInteraction.js";
import { laneDndId, parseLaneDndId, SALES_PIPELINE_OUTCOME_LOST_ID, SALES_PIPELINE_OUTCOME_WON_ID } from "./salesKanbanDnd.js";
import { SalesAddLaneModal } from "./SalesAddLaneModal.js";
import { salesDealDetailPath } from "./salesFunnelPaths.js";
import {
  SalesFunnelDetailPanel,
  type FunnelCreatePayload,
  type FunnelDetailRecord
} from "./SalesFunnelDetailPanel.js";
import { SalesKanbanToolbar } from "./SalesKanbanToolbar.js";
import { SalesLaneConfigModal, type KanbanStageConfig } from "./SalesLaneConfigModal.js";
import { SortableKanbanLane } from "./SortableKanbanLane.js";
import { useSalesApi } from "./useSalesApi.js";
import { formatFinanceAmount } from "../../lib/currencyFormat.js";

type Stage = KanbanStageConfig;

type Deal = {
  id: string;
  title: string;
  description: string;
  stageKey: string;
  tags: string[];
  ownerUserId: string | null;
  crmOrganizationId: string | null;
  promotedFromLeadId: string | null;
  stageEnteredAt: string;
  updatedAt: string;
  active?: boolean;
  archivedAt?: string | null;
  outcomeBucket?: string | null;
  expectedValueMinor?: number | null;
  expectedValueCurrency?: string | null;
  contacts: { contactId: string; role: string }[];
  contactIds: string[];
};

const DealCard = ({
  deal,
  locale,
  currencyFormat,
  isDragging,
  onSelect,
  onOpenDetail,
  detailHref
}: {
  deal: Deal;
  locale: string;
  currencyFormat: CurrencyFormatId | null;
  isDragging?: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
  detailHref: string;
}) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal.id,
    data: { stageKey: deal.stageKey }
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
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-stone-900">{deal.title}</p>
        {deal.outcomeBucket || deal.tags.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {deal.outcomeBucket === "won" ? (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-800 ring-1 ring-emerald-200/80">
                Won
              </span>
            ) : deal.outcomeBucket === "lost" ? (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-rose-800 ring-1 ring-rose-200/80">
                Lost
              </span>
            ) : null}
            {deal.tags.slice(0, 2).map((t) => (
              <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] leading-none text-stone-600">
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {deal.expectedValueMinor != null && deal.expectedValueCurrency ? (
        <p className="mt-1.5 text-xs tabular-nums text-stone-600">
          {formatFinanceAmount(deal.expectedValueMinor, deal.expectedValueCurrency, locale, currencyFormat)}
        </p>
      ) : null}
    </div>
  );
};

const VirtualLane = ({
  stage,
  deals,
  onSelectDeal,
  onOpenDealDetail,
  canEdit,
  locale,
  currencyFormat
}: {
  stage: Stage;
  deals: Deal[];
  onSelectDeal: (deal: Deal) => void;
  onOpenDealDetail: (deal: Deal) => void;
  canEdit: boolean;
  locale: string;
  currencyFormat: CurrencyFormatId | null;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.stageKey, disabled: !canEdit });
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: deals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 4
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 flex-1 flex-col p-2 ${isOver ? "rounded-lg ring-2 ring-indigo-300/80" : ""}`}
    >
        <div ref={parentRef} className={salesKanbanLaneScrollClass}>
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const deal = deals[vi.index]!;
              return (
                <div
                  key={deal.id}
                  className="absolute left-0 top-0 w-full pb-2"
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <DealCard
                    deal={deal}
                    locale={locale}
                    currencyFormat={currencyFormat}
                    detailHref={salesDealDetailPath(deal.id)}
                    onSelect={() => onSelectDeal(deal)}
                    onOpenDetail={() => onOpenDealDetail(deal)}
                  />
                </div>
              );
            })}
          </div>
          {deals.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-500">No deals</p>
          ) : null}
        </div>
    </div>
  );
};

const OutcomeDropHalf = ({
  label,
  toneHeader,
  droppableId,
  deals,
  onSelectDeal,
  onOpenDealDetail,
  canEdit,
  activeDragId,
  locale,
  currencyFormat
}: {
  label: string;
  toneHeader: string;
  droppableId: string;
  deals: Deal[];
  onSelectDeal: (d: Deal) => void;
  onOpenDealDetail: (d: Deal) => void;
  canEdit: boolean;
  activeDragId: string | null;
  locale: string;
  currencyFormat: CurrencyFormatId | null;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, disabled: !canEdit });
  const list = deals.filter((d) => d.id !== activeDragId);
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 flex-1 basis-0 flex-col border-stone-200/80 ${
        droppableId === SALES_PIPELINE_OUTCOME_WON_ID ? "border-b" : ""
      } ${isOver && canEdit ? "bg-indigo-50/60 ring-2 ring-inset ring-indigo-300/70" : ""}`}
    >
      <div
        className={`shrink-0 border-b border-stone-100 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide ${toneHeader}`}
      >
        {label}
      </div>
      <div className={`${salesKanbanLaneScrollClass} min-h-0 flex-1 px-2 pt-2`}>
        {list.length === 0 ? (
          <p className="py-6 text-center text-[10px] text-stone-400">Drop here</p>
        ) : (
          list.map((deal) => (
            <div key={deal.id} className="pb-2">
              <DealCard
                deal={deal}
                locale={locale}
                currencyFormat={currencyFormat}
                detailHref={salesDealDetailPath(deal.id)}
                onSelect={() => onSelectDeal(deal)}
                onOpenDetail={() => onOpenDealDetail(deal)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const SALES_PIPELINE = "sales" as const;

/**
 * Pipeline kanban board: lanes, deal cards, won/lost columns, and inline detail panel.
 *
 * @returns Full pipeline board UI for `/admin/sales/pipeline`
 */
export const SalesPipelineKanban = () => {
  const navigate = useNavigate();
  const { authedFetch } = useSalesApi();
  const { toast } = useToast();
  const { canWrite, canDelete } = useModulePermissions("sales");
  const { preferences: displayPreferences } = useTenantDisplayPreferences();
  const dealLocale = displayPreferences?.locale ?? "en-US";
  const dealCurrencyFormat = displayPreferences?.currencyFormat ?? null;
  const canEdit = canWrite;
  const [searchParams, setSearchParams] = useSearchParams();
  const openRecordId = searchParams.get("recordId");
  const openedRecordRef = useRef<string | null>(null);

  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [selected, setSelected] = useState<Deal | null>(null);

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
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/deals/board?${qs}`);
      if (!res?.ok) {
        setError("Could not load Sales pipeline.");
        return;
      }
      const json = (await res.json()) as { stages: Stage[]; deals: Deal[] };
      setStages(json.stages.sort((a, b) => a.sortOrder - b.sortOrder));
      setDeals(json.deals);
    } catch {
      setError("Could not load Sales pipeline.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, filterQ]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const newDealDraft = useMemo((): FunnelDetailRecord => {
    const openLanes = stages
      .filter((s) => s.outcome !== "won" && s.outcome !== "lost")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      id: "__new__",
      title: "",
      description: "",
      stageKey: openLanes[0]?.stageKey ?? "",
      ownerUserId: null,
      crmOrganizationId: null,
      contacts: [],
      expectedValueMinor: null,
      expectedValueCurrency: null
    };
  }, [stages]);

  const visiblePipelineStages = useMemo(
    () =>
      stages
        .filter((s) => s.outcome !== "won" && s.outcome !== "lost")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [stages]
  );

  const terminalStagesTail = useMemo(
    () =>
      stages
        .filter((s) => s.outcome === "won" || s.outcome === "lost")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [stages]
  );

  const terminalStageKeySets = useMemo(() => {
    const won = new Set<string>();
    const lost = new Set<string>();
    for (const s of stages) {
      if (s.outcome === "won") won.add(s.stageKey);
      if (s.outcome === "lost") lost.add(s.stageKey);
    }
    return { won, lost };
  }, [stages]);

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const s of visiblePipelineStages) map.set(s.stageKey, []);
    for (const d of deals) {
      if (d.archivedAt) continue;
      if (d.outcomeBucket === "won" || d.outcomeBucket === "lost") continue;
      if (terminalStageKeySets.won.has(d.stageKey) || terminalStageKeySets.lost.has(d.stageKey)) continue;
      const list = map.get(d.stageKey) ?? [];
      list.push(d);
      map.set(d.stageKey, list);
    }
    return map;
  }, [deals, visiblePipelineStages, terminalStageKeySets]);

  const wonDeals = useMemo(
    () =>
      deals.filter(
        (d) =>
          !d.archivedAt &&
          (d.outcomeBucket === "won" ||
            ((d.outcomeBucket == null || d.outcomeBucket === "") &&
              terminalStageKeySets.won.has(d.stageKey)))
      ),
    [deals, terminalStageKeySets]
  );
  const lostDeals = useMemo(
    () =>
      deals.filter(
        (d) =>
          !d.archivedAt &&
          (d.outcomeBucket === "lost" ||
            ((d.outcomeBucket == null || d.outcomeBucket === "") &&
              terminalStageKeySets.lost.has(d.stageKey)))
      ),
    [deals, terminalStageKeySets]
  );

  const openDealDetail = useCallback(
    (deal: Deal) => {
      navigate(salesDealDetailPath(deal.id));
    },
    [navigate]
  );

  const selectDeal = (deal: Deal) => {
    setCreating(false);
    setSelected(deal);
  };

  useEffect(() => {
    if (!openRecordId || loading) return;
    if (openedRecordRef.current === openRecordId) return;
    const deal = deals.find((d) => d.id === openRecordId);
    if (!deal) return;
    openedRecordRef.current = openRecordId;
    selectDeal(deal);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("recordId");
        return next;
      },
      { replace: true }
    );
  }, [openRecordId, loading, deals, setSearchParams]);

  const deleteDeal = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/deals/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: true })
      });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? "Could not archive deal.");
        return;
      }
      setSelected(null);
      await loadBoard();
    } catch {
      setError("Could not archive deal.");
    } finally {
      setBusy(false);
    }
  };

  const saveDealDetails = async (patch: {
    ownerUserId: string | null;
    crmOrganizationId: string | null;
    contacts: { contactId: string; role: string }[];
    description: string;
    expectedValueMinor?: number | null;
    expectedValueCurrency?: string | null;
  }): Promise<boolean> => {
    if (!selected) return false;
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/deals/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!res?.ok) return false;
      const json = (await res.json()) as { deal: Deal };
      setSelected((prev) =>
        prev?.id === selected.id ? { ...prev, ...json.deal } : prev
      );
      setDeals((prev) =>
        prev.map((d) => (d.id === selected.id ? { ...d, ...json.deal } : d))
      );
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  const moveDeal = async (dealId: string, stageKey: string) => {
    setBusy(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/deals/${dealId}/stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageKey })
      });
      if (!res?.ok) {
        setError("Could not move deal.");
        await loadBoard();
        return;
      }
      const json = (await res.json()) as { deal: Deal };
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, ...json.deal } : d))
      );
      if (selected?.id === dealId) {
        setSelected((prev) => (prev ? { ...prev, ...json.deal } : prev));
      }
    } catch {
      setError("Could not move deal.");
    } finally {
      setBusy(false);
    }
  };

  const patchDealOutcome = async (dealId: string, outcomeBucket: "won" | "lost") => {
    setBusy(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/deals/${dealId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcomeBucket })
      });
      if (!res?.ok) {
        setError("Could not update deal outcome.");
        await loadBoard();
        return;
      }
      const json = (await res.json()) as { deal: Deal };
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, ...json.deal } : d))
      );
      if (selected?.id === dealId) {
        setSelected((prev) => (prev ? { ...prev, ...json.deal } : prev));
      }
      toast(outcomeBucket === "won" ? "Deal moved to Won." : "Deal moved to Lost.");
    } catch {
      setError("Could not update deal outcome.");
    } finally {
      setBusy(false);
    }
  };

  const persistLaneOrder = async (ordered: Stage[]) => {
    const res = await authedFetch(`${API_BASE_URL}/tenant/sales/stages/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pipeline: SALES_PIPELINE, stageIds: ordered.map((s) => s.id) })
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
        body: JSON.stringify({ pipeline: SALES_PIPELINE, name })
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
    const deal = deals.find((d) => d.id === event.active.id);
    if (deal) setActiveDeal(deal);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const laneId = parseLaneDndId(event.active.id);
    setDraggingLaneId(null);
    setActiveDeal(null);
    if (!canEdit) return;

    if (laneId) {
      const overLaneId = event.over ? parseLaneDndId(event.over.id) : null;
      if (!overLaneId || laneId === overLaneId) return;
      const oldIndex = visiblePipelineStages.findIndex((s) => s.id === laneId);
      const newIndex = visiblePipelineStages.findIndex((s) => s.id === overLaneId);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextVisible = arrayMove(visiblePipelineStages, oldIndex, newIndex);
      const merged = [...nextVisible, ...terminalStagesTail];
      setStages(merged);
      void persistLaneOrder(merged);
      return;
    }

    const dealId = String(event.active.id);
    const overRaw = event.over?.id;
    const overId = overRaw != null ? String(overRaw) : "";
    if (!overId || !canEdit) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    if (overId === SALES_PIPELINE_OUTCOME_WON_ID || overId === SALES_PIPELINE_OUTCOME_LOST_ID) {
      const bucket = overId === SALES_PIPELINE_OUTCOME_WON_ID ? "won" : "lost";
      if (deal.outcomeBucket === bucket) return;
      setDeals((prev) =>
        prev.map((d) =>
          d.id === dealId
            ? { ...d, active: false, outcomeBucket: bucket, archivedAt: new Date().toISOString() }
            : d
        )
      );
      void patchDealOutcome(dealId, bucket);
      return;
    }

    if (!visiblePipelineStages.some((s) => s.stageKey === overId)) return;
    if (!deal.outcomeBucket && deal.stageKey === overId) return;

    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stageKey: overId } : d)));
    void moveDeal(dealId, overId);
  };

  const createDealFromPanel = async (payload: FunnelCreatePayload): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/deals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          description: payload.description,
          stageKey: payload.stageKey,
          ownerUserId: payload.ownerUserId,
          crmOrganizationId: payload.crmOrganizationId,
          contacts: payload.contacts,
          expectedValueMinor: payload.expectedValueMinor ?? null,
          expectedValueCurrency: payload.expectedValueCurrency ?? null
        })
      });
      if (!res?.ok) {
        setError("Could not create deal.");
        return false;
      }
      const json = (await res.json()) as { deal: Deal };
      setCreating(false);
      setSelected(json.deal);
      await loadBoard();
      return true;
    } catch {
      setError("Could not create deal.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-stone-500">Loading pipeline…</p>;
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
        readOnlyHint="View only — tenant admins can create and move deals."
        onAddLane={() => setAddLaneOpen(true)}
        onAddRecord={() => {
          setSelected(null);
          setCreating(true);
        }}
        addRecordLabel="Add deal"
        busy={busy}
      />

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className={salesKanbanBoardRowClass}>
            <SortableContext
              items={visiblePipelineStages.map((s) => laneDndId(s.id))}
              strategy={horizontalListSortingStrategy}
            >
              {visiblePipelineStages.map((stage) => (
                <SortableKanbanLane
                  key={stage.id}
                  stage={stage}
                  count={(dealsByStage.get(stage.stageKey) ?? []).length}
                  canEditLanes={canEdit && canDelete}
                  onConfigureLane={() => setLaneConfigStage(stage)}
                >
                  <VirtualLane
                    stage={stage}
                    deals={(dealsByStage.get(stage.stageKey) ?? []).filter(
                      (d) => d.id !== activeDeal?.id
                    )}
                    onSelectDeal={selectDeal}
                    onOpenDealDetail={openDealDetail}
                    canEdit={canEdit}
                    locale={dealLocale}
                    currencyFormat={dealCurrencyFormat}
                  />
                </SortableKanbanLane>
              ))}
            </SortableContext>

            <div
              className={`${salesKanbanLaneShellClass} border-indigo-200/40 ring-indigo-100`}
              aria-label="Closed outcomes"
            >
              <div className="flex shrink-0 items-center justify-center gap-2 rounded-t-xl border-b border-stone-200 bg-gradient-to-r from-emerald-50/90 to-rose-50/90 px-2 py-2">
                <h3 className="text-sm font-semibold text-stone-900">Won / Lost</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
                  {wonDeals.length + lostDeals.length}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <OutcomeDropHalf
                  label="Won"
                  toneHeader="text-emerald-800"
                  droppableId={SALES_PIPELINE_OUTCOME_WON_ID}
                  deals={wonDeals}
                  onSelectDeal={selectDeal}
                  onOpenDealDetail={openDealDetail}
                  canEdit={canEdit}
                  activeDragId={activeDeal?.id ?? null}
                  locale={dealLocale}
                  currencyFormat={dealCurrencyFormat}
                />
                <OutcomeDropHalf
                  label="Lost"
                  toneHeader="text-rose-800"
                  droppableId={SALES_PIPELINE_OUTCOME_LOST_ID}
                  deals={lostDeals}
                  onSelectDeal={selectDeal}
                  onOpenDealDetail={openDealDetail}
                  canEdit={canEdit}
                  activeDragId={activeDeal?.id ?? null}
                  locale={dealLocale}
                  currencyFormat={dealCurrencyFormat}
                />
              </div>
            </div>
          </div>
          <DragOverlay>
            {draggingLaneId ? (
              <div className="w-72 rounded-lg border border-indigo-300 bg-stone-100 px-3 py-2 text-sm font-medium shadow-lg">
                {stages.find((s) => s.id === draggingLaneId)?.name ?? "Lane"}
              </div>
            ) : activeDeal ? (
              <div className="w-72 rounded-lg border border-indigo-300 bg-white p-3 shadow-lg">
                <p className="text-sm font-medium">{activeDeal.title}</p>
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
        pipeline={SALES_PIPELINE}
        open={laneConfigStage != null}
        busy={busy}
        canDelete={canDelete}
        laneIsEmpty={
          laneConfigStage == null
            ? true
            : (dealsByStage.get(laneConfigStage.stageKey) ?? []).length === 0
        }
        authedFetch={authedFetch}
        onClose={() => setLaneConfigStage(null)}
        onSaved={(updated) => {
          setStages((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        }}
        onDelete={(stage) => {
          setLaneConfigStage(null);
          void deleteLane(stage);
        }}
      />

      {creating || selected ? (
        <SalesFunnelDetailPanel
          kind="deal"
          record={
            creating
              ? newDealDraft
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
          createRecord={creating ? createDealFromPanel : undefined}
          onClose={() => {
            setCreating(false);
            setSelected(null);
          }}
          onSave={saveDealDetails}
          onDelete={() => void deleteDeal()}
          detailHref={creating || !selected ? null : salesDealDetailPath(selected.id)}
        />
      ) : null}
    </div>
  );
};
