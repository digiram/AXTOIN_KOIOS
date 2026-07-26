/**
 * AdminWorkforceOrgChartPage.
 *
 * Interactive org-chart editor: place org units, assign managers, and manage palette employees.
 *
 * Responsibilities:
 * - Drag org units and employees onto a React Flow canvas
 * - Persist parent links and manager assignments via workforce APIs
 * - Quick-add employees and org units from modals
 *
 * Depends on:
 * - {@link useWorkforceApi}, {@link layoutOrgChartToFlow}, {@link WorkforceQuickAddModals}
 *
 * Security:
 * - Chart mutations require workforce module write access server-side
 */

import {
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, Plus, Trash2, Unlink, UserPlus, X } from "lucide-react";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL } from "../../lib/api.js";
import { EmployeeKindIcon } from "./EmployeeKindIcon.js";
import { layoutOrgChartToFlow, type OrgChartUnitInput } from "./workforceGraphLayout.js";
import { WorkforceQuickAddEmployeeModal, WorkforceQuickAddOrgUnitModal } from "./WorkforceQuickAddModals.js";
import { useWorkforceApi } from "./useWorkforceApi.js";

const EMPLOYEE_DRAG_MIME = "application/x-workforce-employee-id";
const ORG_UNIT_DRAG_MIME = "application/x-workforce-org-unit-id";

const ORG_UNIT_HAS_CHILDREN_MESSAGE =
  "Remove or reassign child org units before deleting this one.";

const paletteDeleteBtnClass =
  "flex flex-1 items-center justify-center transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40";

function typeListIncludes(e: React.DragEvent, type: string) {
  return [...e.dataTransfer.types].includes(type);
}

function hasEmployeeDragData(e: React.DragEvent) {
  if (typeListIncludes(e, ORG_UNIT_DRAG_MIME)) return false;
  return typeListIncludes(e, EMPLOYEE_DRAG_MIME) || typeListIncludes(e, "text/plain");
}

function hasOrgUnitDragData(e: React.DragEvent) {
  return typeListIncludes(e, ORG_UNIT_DRAG_MIME);
}

function hasAnyPaletteDragData(e: React.DragEvent) {
  return hasEmployeeDragData(e) || hasOrgUnitDragData(e);
}

/** Resolve org unit id under pointer: custom chart card marker first, then React Flow node wrapper. */
function findOrgChartNodeIdAt(clientX: number, clientY: number): string | null {
  if (typeof document === "undefined" || !document.elementsFromPoint) return null;
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!(el instanceof Element)) continue;
    const host = el.closest("[data-org-unit-node-id]");
    if (host) {
      const id = host.getAttribute("data-org-unit-node-id");
      if (id) return id;
    }
    const wrap = el.closest(".react-flow__node");
    if (wrap) {
      const id = wrap.getAttribute("data-id") ?? (wrap as HTMLElement).dataset?.id;
      if (id) return id;
    }
  }
  return null;
}

function isReactFlowChromeOnly(el: Element) {
  return Boolean(
    el.closest(".react-flow__controls") || el.closest(".react-flow__minimap") || el.closest(".react-flow__panel")
  );
}

type ApiAssignee = {
  id: string;
  displayName: string;
  employeeKind: string;
} | null;

type ApiOrgUnit = {
  id: string;
  name: string;
  parentOrgUnitId: string | null;
  assignedEmployeeId: string | null;
  assignee: ApiAssignee;
  employmentMemberCount: number;
  onOrgChart: boolean;
};

const paletteUnitStaffLabel = (count: number) => {
  if (count === 0) return "No staff linked";
  if (count === 1) return "1 staff member";
  return `${count} staff members`;
};

const paletteUnitCardShellClass =
  "relative flex min-h-[4.25rem] overflow-hidden rounded-lg bg-stone-50/80 text-left shadow-sm transition";

type ApiEmployee = {
  id: string;
  displayName: string;
  employeeKind: string;
  jobTitle: string | null;
  workEmail: string | null;
  personalEmail: string | null;
};

type OrgDropHandler = (employeeId: string, targetOrgUnitId: string) => void;

const OrgDropContext = createContext<OrgDropHandler>(() => {});

type OrgRemoveHandler = (orgUnitId: string) => void;

const OrgRemoveContext = createContext<OrgRemoveHandler>(() => {});

type OrgUnitPaletteDropHandler = (unitId: string, targetOrgUnitId: string | null) => void;

const OrgUnitPaletteDropContext = createContext<OrgUnitPaletteDropHandler>(() => {});

/** Staff row being dragged from the sidebar (for drop fallback + chart hover preview). */
type DraggingStaffSnapshot = { id: string; displayName: string; jobTitle: string | null };

const DraggingStaffContext = createContext<DraggingStaffSnapshot | null>(null);

/** Selected org unit on the chart (yellow border + remove control); cleared on pane click or another card. */
type ChartOrgUnitSelection = {
  selectedOrgUnitId: string | null;
  setSelectedOrgUnitId: (id: string | null) => void;
};

const ChartOrgUnitSelectionContext = createContext<ChartOrgUnitSelection>({
  selectedOrgUnitId: null,
  setSelectedOrgUnitId: () => {}
});

type OrgUnlinkAssigneeHandler = (orgUnitId: string) => void;

const OrgUnlinkAssigneeContext = createContext<OrgUnlinkAssigneeHandler>(() => {});

const ChartBusyContext = createContext(false);

/** True while dragging a staff card or palette unit toward the chart (for clearing node drag-over UI). */
const ChartPaletteDragActiveContext = createContext(false);

const OrgUnitChartNode = memo(function OrgUnitChartNode(props: NodeProps) {
  const { id, data } = props;
  const onRemoveOrgUnit = useContext(OrgRemoveContext);
  const onEmployeeDrop = useContext(OrgDropContext);
  const onUnitPaletteDrop = useContext(OrgUnitPaletteDropContext);
  const onUnlinkAssignee = useContext(OrgUnlinkAssigneeContext);
  const chartBusy = useContext(ChartBusyContext);
  const draggingStaff = useContext(DraggingStaffContext);
  const paletteDragActive = useContext(ChartPaletteDragActiveContext);
  const { selectedOrgUnitId, setSelectedOrgUnitId } = useContext(ChartOrgUnitSelectionContext);
  const [overStaff, setOverStaff] = useState(false);
  const [overOrg, setOverOrg] = useState(false);
  const unitName =
    typeof data === "object" &&
    data !== null &&
    "unitName" in data &&
    typeof (data as { unitName?: unknown }).unitName === "string"
      ? String((data as { unitName: string }).unitName).trim()
      : "";
  const assigneeDisplayName =
    typeof data === "object" &&
    data !== null &&
    "assigneeDisplayName" in data &&
    (data as { assigneeDisplayName?: unknown }).assigneeDisplayName != null &&
    typeof (data as { assigneeDisplayName?: unknown }).assigneeDisplayName === "string"
      ? String((data as { assigneeDisplayName: string }).assigneeDisplayName).trim()
      : null;
  const hasChildren =
    typeof data === "object" &&
    data !== null &&
    "hasChildren" in data &&
    Boolean((data as { hasChildren?: boolean }).hasChildren);
  const hasAssignee =
    typeof data === "object" &&
    data !== null &&
    "hasAssignee" in data &&
    Boolean((data as { hasAssignee?: boolean }).hasAssignee);
  const assigneeEmployeeKind =
    typeof data === "object" &&
    data !== null &&
    "assigneeEmployeeKind" in data &&
    typeof (data as { assigneeEmployeeKind?: unknown }).assigneeEmployeeKind === "string"
      ? String((data as { assigneeEmployeeKind: string }).assigneeEmployeeKind)
      : null;
  const assigneeKindResolved = hasAssignee ? assigneeEmployeeKind ?? "person" : null;
  const isSelected = selectedOrgUnitId === id;
  const primaryLine = assigneeDisplayName?.length ? assigneeDisplayName : null;
  const chartCardAriaLabel = primaryLine
    ? `Org unit ${unitName || "untitled"}, assigned to ${primaryLine}`
    : `Org unit ${unitName || "untitled"}`;

  const clearOver = useCallback(() => {
    setOverStaff(false);
    setOverOrg(false);
  }, []);

  useEffect(() => {
    if (!paletteDragActive && (overStaff || overOrg)) clearOver();
  }, [paletteDragActive, overStaff, overOrg, clearOver]);

  const onPaletteDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!hasAnyPaletteDragData(e)) return;
      e.preventDefault();
      if (hasEmployeeDragData(e)) {
        e.dataTransfer.dropEffect = "copy";
        setOverStaff(true);
        setOverOrg(false);
        return;
      }
      if (hasOrgUnitDragData(e)) {
        e.dataTransfer.dropEffect = "move";
        setOverOrg(true);
        setOverStaff(false);
      }
    },
    []
  );

  const onPaletteDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const unitId = e.dataTransfer.getData(ORG_UNIT_DRAG_MIME).trim();
      if (unitId) {
        onUnitPaletteDrop(unitId, id);
        return;
      }

      if (!hasEmployeeDragData(e)) return;

      const employeeId = (
        e.dataTransfer.getData(EMPLOYEE_DRAG_MIME) ||
        e.dataTransfer.getData("text/plain") ||
        draggingStaff?.id ||
        ""
      ).trim();
      if (employeeId) onEmployeeDrop(employeeId, id);
    },
    [draggingStaff?.id, id, onEmployeeDrop, onUnitPaletteDrop]
  );

  return (
    <div
      className="relative h-full w-full min-h-[4.75rem] min-w-[160px] max-w-[230px] overflow-visible"
      data-org-unit-node-id={id}
      onDragLeave={(e) => {
        const next = e.relatedTarget;
        if (next instanceof Element && e.currentTarget.contains(next)) return;
        if (!(next instanceof Element)) return;
        clearOver();
      }}
      onDragOver={onPaletteDragOver}
      onDrop={onPaletteDrop}
    >
      <div className="nodrag nopan absolute right-full top-1/2 z-10 mr-1 flex -translate-y-1/2 flex-col items-center gap-1">
        <button
          type="button"
          disabled={isSelected && hasChildren}
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-300/90 bg-white text-stone-500 shadow-sm transition-all duration-150",
            isSelected ? "opacity-100 pointer-events-auto" : "pointer-events-none opacity-0",
            isSelected && hasChildren ? "cursor-not-allowed opacity-50" : "",
            "enabled:hover:border-rose-300 enabled:hover:bg-rose-50 enabled:hover:text-rose-700",
            "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          ].join(" ")}
          aria-label="Remove unit from chart"
          title={
            hasChildren
              ? "Remove or reassign sub-units on the chart before returning this unit to the palette."
              : "Return unit to palette"
          }
          onClick={(e) => {
            e.stopPropagation();
            onRemoveOrgUnit(id);
          }}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
        {isSelected && hasAssignee ? (
          <button
            type="button"
            disabled={chartBusy}
            className={[
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-300/90 bg-white text-stone-500 shadow-sm transition-all duration-150",
              "hover:border-amber-300 hover:bg-amber-50/80 hover:text-amber-900",
              "focus:outline-none focus:ring-2 focus:ring-amber-400/40",
              chartBusy ? "cursor-not-allowed opacity-50" : ""
            ].join(" ")}
            aria-label="Unlink assigned person from this unit"
            title="Remove the assigned person from this unit (they stay in Staff)"
            onClick={(e) => {
              e.stopPropagation();
              onUnlinkAssignee(id);
            }}
          >
            <Unlink className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
      </div>
      <div
        role="group"
        aria-selected={isSelected}
        aria-label={`${chartCardAriaLabel}. Drop staff to assign, or a unit to place under this box.`}
        className={[
          "relative flex min-h-[4.75rem] min-w-[160px] max-w-[230px] flex-col justify-center overflow-hidden rounded-xl border bg-white text-center shadow-sm transition-[box-shadow,transform,background-color,border-color,ring-width,ring-color] duration-150",
          overStaff
            ? "z-[1] scale-[1.02] border-emerald-400 bg-emerald-50/90 ring-2 ring-emerald-400/50 ring-offset-2 ring-offset-stone-50"
            : overOrg
              ? "scale-[1.02] border-amber-400 bg-white ring-2 ring-amber-400/40 ring-offset-2 ring-offset-stone-50"
              : isSelected
                ? "z-[1] border-yellow-400 ring-2 ring-yellow-400/50 shadow-md shadow-yellow-200/40"
                : "border-stone-200 ring-0 hover:border-amber-300/90 hover:ring-1 hover:ring-amber-200/50 hover:shadow-sm",
          "nodrag nopan cursor-pointer"
        ].join(" ")}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedOrgUnitId(id);
        }}
      >
        {overStaff ? (
          <div
            className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center rounded-[inherit] bg-emerald-500/10"
            aria-hidden
          >
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-emerald-900 shadow-md">
              <UserPlus className="h-3.5 w-3.5 shrink-0 text-emerald-700" strokeWidth={2.25} aria-hidden />
              Release to assign
            </div>
          </div>
        ) : null}
        {assigneeKindResolved ? (
          <div
            className="nodrag nopan absolute inset-y-0 left-0 z-[1] flex w-9 flex-col items-center justify-center border-r border-stone-200/80 bg-stone-100/90"
            title={assigneeKindResolved === "agent" ? "Agent" : "Person"}
          >
            <span className="sr-only">{assigneeKindResolved === "agent" ? "Agent" : "Person"}</span>
            <EmployeeKindIcon kind={assigneeKindResolved} />
          </div>
        ) : null}
        <Handle
          type="target"
          position={Position.Top}
          className="!pointer-events-none !h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent opacity-0"
        />
        <div
          className={[
            "relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col justify-center px-3 py-2.5 text-center",
            assigneeKindResolved ? "pl-12" : ""
          ].join(" ")}
        >
          <div className="flex w-full flex-col items-center justify-center gap-1">
            {primaryLine ? (
              <>
                <span className="line-clamp-2 w-full text-[13px] font-semibold leading-tight text-stone-900">
                  {primaryLine}
                </span>
                {unitName ? (
                  <span className="line-clamp-2 w-full text-[10px] font-semibold uppercase tracking-wide text-stone-500 leading-tight">
                    {unitName}
                  </span>
                ) : null}
              </>
            ) : unitName ? (
              <span className="line-clamp-3 w-full text-xs font-semibold uppercase tracking-wide leading-snug text-stone-900">
                {unitName}
              </span>
            ) : (
              <span className="text-xs font-medium text-stone-400">Untitled unit</span>
            )}
          </div>
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!pointer-events-none !h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent opacity-0"
        />
      </div>
    </div>
  );
});

const orgChartNodeTypes = { orgUnit: OrgUnitChartNode } satisfies NodeTypes;

const flowPaneClass =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stone-200 bg-stone-50 shadow-inner";

const inputClass =
  "w-full max-w-md rounded-lg border border-stone-200/90 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

/**
 * React Flow’s `NodeWrapper` sets `pointer-events: none` on `.react-flow__node` when the node is not
 * selectable, not draggable, and has no `onNode*` mouse handlers — which blocks hover and other
 * interaction on custom nodes. Handlers can be no-ops; their presence enables pointer events.
 */
const rfNodePointerEventsNoop = () => {};

const FlowPanel = ({
  flowKey,
  initialNodes,
  initialEdges,
  paletteDragActive,
  onInvalidStaffCanvasDrop,
  statusMessage,
  onDismissStatusMessage
}: {
  flowKey: string;
  initialNodes: Node[];
  initialEdges: Edge[];
  paletteDragActive: boolean;
  onInvalidStaffCanvasDrop: () => void;
  statusMessage: string;
  onDismissStatusMessage: () => void;
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const onUnitPaletteDrop = useContext(OrgUnitPaletteDropContext);
  const onEmployeeDrop = useContext(OrgDropContext);
  const draggingStaff = useContext(DraggingStaffContext);
  const { setSelectedOrgUnitId } = useContext(ChartOrgUnitSelectionContext);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [flowKey, initialNodes, initialEdges, setNodes, setEdges]);

  useEffect(() => {
    if (!statusMessage.trim()) return;
    const t = window.setTimeout(() => onDismissStatusMessage(), 5000);
    return () => window.clearTimeout(t);
  }, [statusMessage, onDismissStatusMessage]);

  const handleReactFlowDragOverCapture = useCallback(
    (e: React.DragEvent) => {
      if (!hasAnyPaletteDragData(e)) return;
      e.preventDefault();
      if (hasEmployeeDragData(e)) e.dataTransfer.dropEffect = "copy";
      else if (hasOrgUnitDragData(e)) e.dataTransfer.dropEffect = "move";
    },
    []
  );

  const handleReactFlowDrop = useCallback(
    (e: React.DragEvent) => {
      const t = e.target as Element;
      if (isReactFlowChromeOnly(t)) return;

      e.preventDefault();
      e.stopPropagation();

      const nodeUnder = findOrgChartNodeIdAt(e.clientX, e.clientY);

      const unitId = e.dataTransfer.getData(ORG_UNIT_DRAG_MIME).trim();
      if (unitId) {
        onUnitPaletteDrop(unitId, nodeUnder);
        return;
      }

      if (hasEmployeeDragData(e)) {
        const employeeId = (
          e.dataTransfer.getData(EMPLOYEE_DRAG_MIME) ||
          e.dataTransfer.getData("text/plain") ||
          draggingStaff?.id ||
          ""
        ).trim();
        if (employeeId && nodeUnder) {
          onEmployeeDrop(employeeId, nodeUnder);
          return;
        }
        onInvalidStaffCanvasDrop();
      }
    },
    [draggingStaff?.id, onEmployeeDrop, onInvalidStaffCanvasDrop, onUnitPaletteDrop]
  );

  return (
    <div className={`${flowPaneClass} relative`}>
      {paletteDragActive ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-xl outline outline-2 outline-dashed outline-amber-400/50 outline-offset-0"
          aria-hidden
        />
      ) : null}
      <div className="relative z-0 flex min-h-0 flex-1 flex-col">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-stretch gap-2 px-3 pt-3 sm:items-center sm:px-4"
          aria-live="polite"
        >
          {statusMessage ? (
            <div
              className="pointer-events-auto flex w-full max-w-xl items-start gap-2 rounded-lg border border-emerald-200/90 bg-emerald-50/98 px-2.5 py-2 text-xs leading-snug text-emerald-950 shadow-lg backdrop-blur-[2px]"
              role="status"
            >
              <span className="min-w-0 flex-1">{statusMessage}</span>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-emerald-800 hover:bg-emerald-100/80"
                aria-label="Dismiss message"
                title="Dismiss"
                onClick={onDismissStatusMessage}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={orgChartNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onNodeMouseEnter={rfNodePointerEventsNoop}
          onNodeMouseLeave={rfNodePointerEventsNoop}
          onPaneClick={() => setSelectedOrgUnitId(null)}
          onDragOverCapture={handleReactFlowDragOverCapture}
          onDrop={handleReactFlowDrop}
          proOptions={{ hideAttribution: true }}
          className="h-full min-h-[180px] rounded-xl [&_.react-flow__node]:overflow-visible [&_.react-flow__viewport-portal]:pointer-events-none"
        >
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
};

function staffMatchesQuery(emp: ApiEmployee, q: string) {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  return (
    emp.displayName.toLowerCase().includes(n) ||
    emp.employeeKind.toLowerCase().includes(n) ||
    (emp.jobTitle?.toLowerCase().includes(n) ?? false) ||
    (emp.workEmail?.toLowerCase().includes(n) ?? false) ||
    (emp.personalEmail?.toLowerCase().includes(n) ?? false)
  );
}

function unitMatchesQuery(unit: ApiOrgUnit, q: string) {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  return (
    unit.name.toLowerCase().includes(n) || (unit.assignee?.displayName.toLowerCase().includes(n) ?? false)
  );
}

/**
 * Interactive org chart: org units with optional employee/agent assignee per node.
 *
 * @returns Editable org chart at `/admin/workforce/chart`
 */
export const AdminWorkforceOrgChartPage = () => {
  const { authedFetch } = useWorkforceApi();
  const [orgUnits, setOrgUnits] = useState<ApiOrgUnit[]>([]);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [loadError, setLoadError] = useState("");
  const [dropHint, setDropHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [staffQuery, setStaffQuery] = useState("");
  const [unitQuery, setUnitQuery] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"staff" | "units">("staff");
  const [draggingStaff, setDraggingStaff] = useState<DraggingStaffSnapshot | null>(null);
  const [draggingOrgUnitId, setDraggingOrgUnitId] = useState<string | null>(null);
  const [selectedChartOrgUnitId, setSelectedChartOrgUnitId] = useState<string | null>(null);
  const [quickEmployeeOpen, setQuickEmployeeOpen] = useState(false);
  const [quickOrgOpen, setQuickOrgOpen] = useState(false);
  const [pendingPaletteDeleteId, setPendingPaletteDeleteId] = useState<string | null>(null);
  const [pendingPaletteDeleteError, setPendingPaletteDeleteError] = useState("");
  const [paletteDeleteBusy, setPaletteDeleteBusy] = useState(false);

  const chartOrgUnitSelection = useMemo(
    () => ({ selectedOrgUnitId: selectedChartOrgUnitId, setSelectedOrgUnitId: setSelectedChartOrgUnitId }),
    [selectedChartOrgUnitId]
  );

  const clearDrag = useCallback(() => {
    setDraggingStaff(null);
    setDraggingOrgUnitId(null);
  }, []);

  useEffect(() => {
    window.addEventListener("dragend", clearDrag);
    window.addEventListener("drop", clearDrag);
    return () => {
      window.removeEventListener("dragend", clearDrag);
      window.removeEventListener("drop", clearDrag);
    };
  }, [clearDrag]);

  const reload = useCallback(async () => {
    setLoadError("");
    setBusy(true);
    try {
      const orgRes = await authedFetch(`${API_BASE_URL}/tenant/workforce/org-units`);
      if (!orgRes?.ok) {
        setLoadError("Could not load org structure.");
        return;
      }
      const orgJson = (await orgRes.json()) as {
        orgUnits: Array<ApiOrgUnit & { onOrgChart?: boolean; employmentMemberCount?: number }>;
      };
      setOrgUnits(
        orgJson.orgUnits.map((r) => ({
          ...r,
          onOrgChart: r.onOrgChart ?? true,
          employmentMemberCount: r.employmentMemberCount ?? 0
        }))
      );

      const collected: ApiEmployee[] = [];
      let page = 1;
      let total = Infinity;
      while (collected.length < total && page < 40) {
        const qs = new URLSearchParams({ page: String(page), pageSize: "100" });
        const eRes = await authedFetch(`${API_BASE_URL}/tenant/workforce/employees?${qs}`);
        if (!eRes?.ok) break;
        const ej = (await eRes.json()) as {
          employees: Array<{
            id: string;
            displayName: string;
            employeeKind: string;
            jobTitle?: string | null;
            workEmail?: string | null;
            personalEmail?: string | null;
          }>;
          total: number;
        };
        for (const row of ej.employees) {
          collected.push({
            id: row.id,
            displayName: row.displayName,
            employeeKind: row.employeeKind,
            jobTitle: row.jobTitle ?? null,
            workEmail: row.workEmail ?? null,
            personalEmail: row.personalEmail ?? null
          });
        }
        total = ej.total;
        page += 1;
      }
      setEmployees(collected);
    } catch {
      setLoadError("Could not load org structure.");
    } finally {
      setBusy(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const chartOrgUnits = useMemo(() => orgUnits.filter((o) => o.onOrgChart), [orgUnits]);

  const chartIds = useMemo(() => new Set(chartOrgUnits.map((o) => o.id)), [chartOrgUnits]);

  const chartRows: OrgChartUnitInput[] = useMemo(
    () =>
      chartOrgUnits.map((o) => {
        const unitName = o.name.trim();
        const assigneeName = o.assignee?.displayName?.trim();
        const assigneeDisplayName = o.assignedEmployeeId ? assigneeName || "Staff member" : null;
        return {
          id: o.id,
          name: o.name,
          parentOrgUnitId: o.parentOrgUnitId && chartIds.has(o.parentOrgUnitId) ? o.parentOrgUnitId : null,
          unitName,
          assigneeDisplayName,
          hasChildren: chartOrgUnits.some((c) => c.parentOrgUnitId === o.id),
          hasAssignee: Boolean(o.assignedEmployeeId),
          assigneeEmployeeKind: o.assignedEmployeeId
            ? o.assignee?.employeeKind === "agent"
              ? "agent"
              : "person"
            : null
        };
      }),
    [chartOrgUnits, chartIds]
  );

  const flow = useMemo(() => layoutOrgChartToFlow(chartRows), [chartRows]);

  const parseApiError = useCallback(async (res: Response | null) => {
    if (!res) return "Request failed.";
    const j = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
    return j?.message ?? j?.error ?? "Request failed.";
  }, []);

  const cancelPendingPaletteDelete = useCallback(() => {
    setPendingPaletteDeleteId(null);
    setPendingPaletteDeleteError("");
  }, []);

  const confirmDeletePaletteUnit = useCallback(
    async (unit: ApiOrgUnit) => {
      setPaletteDeleteBusy(true);
      setPendingPaletteDeleteError("");
      try {
        const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/org-units/${unit.id}`, {
          method: "DELETE"
        });
        if (!res?.ok) {
          const j = res ? ((await res.json().catch(() => null)) as { message?: string } | null) : null;
          const apiMessage = j?.message?.trim();
          if (apiMessage && apiMessage !== ORG_UNIT_HAS_CHILDREN_MESSAGE) {
            setPendingPaletteDeleteError(apiMessage);
          }
          return;
        }
        setLoadError("");
        setPendingPaletteDeleteId(null);
        setDropHint(`Deleted “${unit.name.trim()}”.`);
        await reload();
      } finally {
        setPaletteDeleteBusy(false);
      }
    },
    [authedFetch, reload]
  );

  const removeOrgUnitFromChart = useCallback(
    async (orgUnitId: string) => {
      if (busy) return;
      const hasChartChildren = orgUnits.some((o) => o.onOrgChart && o.parentOrgUnitId === orgUnitId);
      if (hasChartChildren) {
        setLoadError("This unit has sub-units on the chart. Remove or move them before returning this unit to the palette.");
        return;
      }
      setBusy(true);
      setLoadError("");
      setDropHint("");
      try {
        const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/org-units/${orgUnitId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ onOrgChart: false, parentOrgUnitId: null })
        });
        if (!res?.ok) {
          setLoadError(await parseApiError(res));
          return;
        }
        setDropHint("Returned unit to the palette (Unit tab).");
        setSelectedChartOrgUnitId((prev) => (prev === orgUnitId ? null : prev));
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, busy, orgUnits, parseApiError, reload]
  );

  const placeUnitOnChart = useCallback(
    async (unitId: string, targetOrgUnitId: string | null) => {
      if (busy) return;
      const unit = orgUnits.find((u) => u.id === unitId);
      if (!unit) {
        setLoadError("Could not find that organizational unit.");
        return;
      }
      if (unit.onOrgChart) {
        setDropHint("That unit is already on the chart.");
        return;
      }
      if (targetOrgUnitId) {
        const target = orgUnits.find((u) => u.id === targetOrgUnitId);
        if (!target?.onOrgChart) {
          setLoadError("Drop units onto a box that is already on the chart.");
          return;
        }
      }

      setBusy(true);
      setDropHint("");
      setLoadError("");
      try {
        const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/org-units/${unitId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            onOrgChart: true,
            parentOrgUnitId: targetOrgUnitId
          })
        });
        if (!res?.ok) {
          setLoadError(await parseApiError(res));
          return;
        }
        setDropHint(
          targetOrgUnitId === null
            ? `Placed “${unit.name}” on the chart at the top level.`
            : `Placed “${unit.name}” under the selected unit.`
        );
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, busy, orgUnits, parseApiError, reload]
  );

  const placeEmployeeOnChart = useCallback(
    async (employeeId: string, targetOrgUnitId: string) => {
      if (busy) {
        setDropHint("Another change is still saving — try again in a moment.");
        return;
      }
      const target = orgUnits.find((u) => u.id === targetOrgUnitId);
      if (!target?.onOrgChart) {
        setLoadError("Choose a unit that is already on the chart.");
        return;
      }

      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) {
        setLoadError("Could not find that employee.");
        return;
      }

      const currentAssigneeUnit = orgUnits.find((o) => o.assignedEmployeeId === employeeId);
      if (currentAssigneeUnit?.id === targetOrgUnitId) {
        setDropHint(`${emp.displayName} is already assigned to this unit.`);
        return;
      }

      setBusy(true);
      setDropHint("");
      setLoadError("");
      try {
        const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/org-units/${targetOrgUnitId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assignedEmployeeId: employeeId })
        });
        if (!res?.ok) {
          setLoadError(await parseApiError(res));
          return;
        }
        setDropHint(`Assigned ${emp.displayName} to “${target.name.trim()}”.`);
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, busy, employees, orgUnits, parseApiError, reload]
  );

  const unlinkAssigneeFromOrgUnit = useCallback(
    async (orgUnitId: string) => {
      if (busy) return;
      const unit = orgUnits.find((u) => u.id === orgUnitId);
      if (!unit?.assignedEmployeeId) return;
      const emp = employees.find((e) => e.id === unit.assignedEmployeeId);
      setBusy(true);
      setDropHint("");
      setLoadError("");
      try {
        const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/org-units/${orgUnitId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assignedEmployeeId: null })
        });
        if (!res?.ok) {
          setLoadError(await parseApiError(res));
          return;
        }
        setDropHint(
          emp
            ? `Unlinked ${emp.displayName} from “${unit.name.trim()}”.`
            : `Removed assignee from “${unit.name.trim()}”.`
        );
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, busy, employees, orgUnits, parseApiError, reload]
  );

  /** True after a native `drop` path calls the staff assign API (avoids duplicate assign on `dragend`). */
  const staffDropCommittedRef = useRef(false);

  const submitStaffDropToOrgUnit = useCallback(
    (employeeId: string, targetOrgUnitId: string) => {
      staffDropCommittedRef.current = true;
      void placeEmployeeOnChart(employeeId, targetOrgUnitId);
    },
    [placeEmployeeOnChart]
  );

  const handleStaffDragEnd = useCallback(
    (e: React.DragEvent) => {
      if (staffDropCommittedRef.current) {
        staffDropCommittedRef.current = false;
        return;
      }
      const employeeId = (
        e.dataTransfer.getData(EMPLOYEE_DRAG_MIME) ||
        e.dataTransfer.getData("text/plain") ||
        draggingStaff?.id ||
        ""
      ).trim();
      const targetId = findOrgChartNodeIdAt(e.clientX, e.clientY);
      if (employeeId && targetId) {
        void placeEmployeeOnChart(employeeId, targetId);
      }
    },
    [draggingStaff?.id, placeEmployeeOnChart]
  );

  const unassignedEmployees = useMemo(
    () => employees.filter((e) => !orgUnits.some((o) => o.assignedEmployeeId === e.id)),
    [employees, orgUnits]
  );

  const filteredStaff = useMemo(
    () =>
      unassignedEmployees
        .filter((e) => staffMatchesQuery(e, staffQuery))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [unassignedEmployees, staffQuery]
  );

  const filteredUnits = useMemo(() => {
    return orgUnits
      .filter((o) => !o.onOrgChart)
      .filter((o) => unitMatchesQuery(o, unitQuery))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [orgUnits, unitQuery]);

  const paletteDragActive = Boolean(draggingStaff || draggingOrgUnitId);

  const onInvalidStaffCanvasDrop = useCallback(() => {
    setDropHint("Use a chart box to assign this person — not the empty canvas.");
  }, []);

  const dismissDropHint = useCallback(() => setDropHint(""), []);

  const flowKey = chartOrgUnits.map((o) => `${o.id}:${o.assignedEmployeeId ?? ""}:${o.parentOrgUnitId ?? ""}`).join("|");

  useEffect(() => {
    if (!paletteDragActive) return;
    const onDocDragOver = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      const types = [...dt.types];
      if (types.includes(ORG_UNIT_DRAG_MIME)) {
        e.preventDefault();
        dt.dropEffect = "move";
        return;
      }
      if (types.includes(EMPLOYEE_DRAG_MIME) || types.includes("text/plain")) {
        e.preventDefault();
        dt.dropEffect = "copy";
      }
    };
    document.addEventListener("dragover", onDocDragOver, { passive: false });
    return () => document.removeEventListener("dragover", onDocDragOver);
  }, [paletteDragActive]);

  return (
    <OrgDropContext.Provider value={submitStaffDropToOrgUnit}>
      <OrgRemoveContext.Provider value={removeOrgUnitFromChart}>
        <OrgUnitPaletteDropContext.Provider value={placeUnitOnChart}>
          <OrgUnlinkAssigneeContext.Provider value={unlinkAssigneeFromOrgUnit}>
            <ChartBusyContext.Provider value={busy}>
              <DraggingStaffContext.Provider value={draggingStaff}>
                <ChartPaletteDragActiveContext.Provider value={paletteDragActive}>
              <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-hidden">
              <div className="shrink-0 space-y-2">
                <p className="text-xs leading-relaxed text-stone-600 sm:text-sm">
                  Units live in the <span className="font-semibold text-stone-800">Unit</span> tab until you place them
                  on the canvas or under a box. People from <span className="font-semibold text-stone-800">Staff</span>{" "}
                  assign only by dropping onto a chart box. Create and edit units in the{" "}
                  <span className="font-medium text-stone-800">Unit</span> palette tab.
                </p>
                {loadError ? (
                  <p className="text-sm text-rose-600" role="alert">
                    {loadError}
                  </p>
                ) : null}
              </div>

              <div
                className={[
                  "flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4",
                  paletteDragActive ? "cursor-grabbing" : ""
                ].join(" ")}
              >
                <aside className="order-2 flex min-h-0 w-full max-h-[42%] shrink-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ring-1 ring-slate-900/5 sm:max-h-[40%] lg:order-1 lg:max-h-none lg:h-full lg:w-[20%] lg:min-w-[13rem] lg:max-w-[20rem]">
                  <div className="shrink-0 border-b border-stone-100 p-3">
                    <div
                      className="mb-3 flex gap-0.5 rounded-lg bg-stone-100/90 p-0.5 ring-1 ring-stone-200/70"
                      role="tablist"
                      aria-label="Chart sidebar"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sidebarTab === "staff"}
                        className={[
                          "min-h-[2rem] flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium transition-colors",
                          sidebarTab === "staff"
                            ? "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-stone-200/80"
                            : "text-stone-600 hover:bg-white/50 hover:text-stone-900"
                        ].join(" ")}
                        onClick={() => setSidebarTab("staff")}
                      >
                        Staff
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sidebarTab === "units"}
                        className={[
                          "min-h-[2rem] flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium transition-colors",
                          sidebarTab === "units"
                            ? "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-stone-200/80"
                            : "text-stone-600 hover:bg-white/50 hover:text-stone-900"
                        ].join(" ")}
                        onClick={() => setSidebarTab("units")}
                      >
                        Unit
                      </button>
                    </div>
                    {sidebarTab === "staff" ? (
                      <div>
                        <label htmlFor="workforce-chart-staff-search" className="block text-xs font-medium text-stone-600">
                          Search staff
                        </label>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            id="workforce-chart-staff-search"
                            type="search"
                            className={`${inputClass} min-w-0 flex-1 !max-w-none`}
                            placeholder="Name, email, title, kind…"
                            value={staffQuery}
                            onChange={(e) => setStaffQuery(e.target.value)}
                            disabled={busy}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-900 disabled:opacity-50"
                            title="Add employee"
                            aria-label="Add employee"
                            disabled={busy}
                            onClick={() => setQuickEmployeeOpen(true)}
                          >
                            <Plus className="h-4 w-4" aria-hidden strokeWidth={2.25} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="workforce-chart-unit-search" className="block text-xs font-medium text-stone-600">
                          Search palette units
                        </label>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            id="workforce-chart-unit-search"
                            type="search"
                            className={`${inputClass} min-w-0 flex-1 !max-w-none`}
                            placeholder="Unit name or assignee…"
                            value={unitQuery}
                            onChange={(e) => setUnitQuery(e.target.value)}
                            disabled={busy}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-900 disabled:opacity-50"
                            title="Add org unit"
                            aria-label="Add organizational unit"
                            disabled={busy}
                            onClick={() => setQuickOrgOpen(true)}
                          >
                            <Plus className="h-4 w-4" aria-hidden strokeWidth={2.25} />
                          </button>
                        </div>
                      </div>
                    )}
                    {sidebarTab === "units" ? (
                      <p className="mt-2 text-[11px] leading-snug text-stone-500">
                        Not on the chart yet — drag to the canvas or a box. Use <span className="font-medium">+</span> for
                        a new palette unit.
                      </p>
                    ) : null}
                  </div>
                  {sidebarTab === "staff" ? (
                    <ul
                      className="min-h-0 flex-1 list-none space-y-2 overflow-y-auto overscroll-contain p-3"
                      aria-label="Workforce staff, drag onto org chart boxes"
                    >
                      {filteredStaff.map((emp) => {
                        const kindLabel = emp.employeeKind === "agent" ? "Agent" : "Person";
                        return (
                          <li key={emp.id}>
                            <article
                              draggable={!busy}
                              onDragStart={(e) => {
                                staffDropCommittedRef.current = false;
                                setDraggingStaff({
                                  id: emp.id,
                                  displayName: emp.displayName,
                                  jobTitle: emp.jobTitle
                                });
                                e.dataTransfer.setData(EMPLOYEE_DRAG_MIME, emp.id);
                                e.dataTransfer.setData("text/plain", emp.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={(e) => {
                                handleStaffDragEnd(e);
                                clearDrag();
                              }}
                              className={[
                                "flex cursor-grab overflow-hidden rounded-lg border border-stone-200 bg-stone-50/80 text-left shadow-sm transition hover:border-amber-300 hover:bg-amber-50/30 active:cursor-grabbing",
                                draggingStaff?.id === emp.id ? "opacity-70 ring-2 ring-amber-400/50" : ""
                              ].join(" ")}
                            >
                              <div
                                className="flex shrink-0 flex-col items-center justify-center self-stretch border-r border-stone-200/80 bg-stone-100/90 px-2.5 py-2"
                                title={kindLabel}
                              >
                                <span className="sr-only">{kindLabel}</span>
                                <EmployeeKindIcon kind={emp.employeeKind} />
                              </div>
                              <div className="min-w-0 flex-1 px-3 py-2.5">
                                <div className="text-sm font-medium text-stone-900">{emp.displayName}</div>
                                {emp.jobTitle ? (
                                  <div className="mt-0.5 text-xs text-stone-600">{emp.jobTitle}</div>
                                ) : null}
                              </div>
                            </article>
                          </li>
                        );
                      })}
                      {filteredStaff.length === 0 ? (
                        <li className="py-6 text-center text-sm text-stone-500">
                          {unassignedEmployees.length === 0
                            ? employees.length === 0
                              ? "No staff."
                              : "All staff are assigned to org units."
                            : "No matches."}
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <ul
                      className="min-h-0 flex-1 list-none space-y-2 overflow-y-auto overscroll-contain p-3"
                      aria-label="Organizational units in palette, drag onto chart"
                    >
                      {filteredUnits.map((o) => {
                        const hasChildUnits = orgUnits.some((u) => u.parentOrgUnitId === o.id);
                        const pendingDelete = pendingPaletteDeleteId === o.id;
                        const staffLabel = paletteUnitStaffLabel(o.employmentMemberCount ?? 0);

                        return (
                          <li key={o.id} className={pendingDelete ? "relative z-[1]" : undefined}>
                            <article
                              draggable={!busy && !paletteDeleteBusy && !pendingDelete}
                              onDragStart={(e) => {
                                setDraggingOrgUnitId(o.id);
                                e.dataTransfer.setData(ORG_UNIT_DRAG_MIME, o.id);
                                e.dataTransfer.setData("text/plain", o.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={clearDrag}
                              className={[
                                paletteUnitCardShellClass,
                                pendingDelete
                                  ? "border-2 border-amber-400 bg-white"
                                  : [
                                      "cursor-grab border border-stone-200 hover:border-amber-300 hover:bg-amber-50/30 active:cursor-grabbing",
                                      draggingOrgUnitId === o.id ? "opacity-70 ring-2 ring-amber-400/50" : ""
                                    ].join(" ")
                              ].join(" ")}
                            >
                              <div
                                className={[
                                  "flex min-h-[4.25rem] min-w-0 flex-1 items-stretch",
                                  pendingDelete ? "invisible" : ""
                                ].join(" ")}
                                aria-hidden={pendingDelete}
                              >
                                {o.assignee ? (
                                  <div
                                    className="flex w-10 shrink-0 flex-col items-center justify-center self-stretch border-r border-stone-200/80 bg-stone-100/90"
                                    title={o.assignee.employeeKind === "agent" ? "Agent" : "Person"}
                                  >
                                    <span className="sr-only">
                                      {o.assignee.employeeKind === "agent" ? "Agent" : "Person"}
                                    </span>
                                    <EmployeeKindIcon
                                      kind={o.assignee.employeeKind === "agent" ? "agent" : "person"}
                                    />
                                  </div>
                                ) : null}
                                <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5">
                                  <div className="truncate text-sm font-medium text-stone-900">{o.name}</div>
                                  {o.assignee ? (
                                    <div
                                      className="mt-1 truncate text-[11px] text-stone-600"
                                      title={o.assignee.displayName}
                                    >
                                      {o.assignee.displayName}
                                    </div>
                                  ) : (
                                    <div className="mt-1 text-[11px] text-stone-500">{staffLabel}</div>
                                  )}
                                </div>
                                <div className="flex w-9 shrink-0 items-stretch border-l border-stone-200/80">
                                  <button
                                    type="button"
                                    title="Delete unit"
                                    aria-label={`Delete ${o.name}`}
                                    disabled={busy || paletteDeleteBusy || pendingPaletteDeleteId !== null}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPendingPaletteDeleteError("");
                                      setPendingPaletteDeleteId(o.id);
                                    }}
                                    className="flex w-full items-center justify-center text-stone-500 transition hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-400/80 disabled:cursor-not-allowed disabled:opacity-40"
                                    tabIndex={pendingDelete ? -1 : undefined}
                                  >
                                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                                  </button>
                                </div>
                              </div>

                              {pendingDelete ? (
                                <div className="absolute inset-0 flex min-h-[4.25rem] items-stretch bg-white">
                                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden px-2.5 py-2">
                                    {hasChildUnits && !paletteDeleteBusy && !pendingPaletteDeleteError ? (
                                      <p className="line-clamp-2 text-left text-[10px] font-medium leading-snug text-amber-800">
                                        {ORG_UNIT_HAS_CHILDREN_MESSAGE}
                                      </p>
                                    ) : null}
                                    <p className="truncate text-left text-xs font-medium text-stone-800">
                                      Remove &ldquo;{o.name}&rdquo;?
                                    </p>
                                    {pendingPaletteDeleteError ? (
                                      <p className="line-clamp-2 text-left text-[10px] text-rose-600" role="alert">
                                        {pendingPaletteDeleteError}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex w-[4.5rem] shrink-0 border-l border-amber-400/60">
                                    <button
                                      type="button"
                                      title="Cancel"
                                      aria-label={`Cancel remove ${o.name}`}
                                      disabled={paletteDeleteBusy}
                                      onClick={cancelPendingPaletteDelete}
                                      className={`${paletteDeleteBtnClass} bg-rose-100 text-rose-900 hover:bg-rose-200 focus-visible:ring-rose-400/80`}
                                    >
                                      <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Confirm remove"
                                      aria-label={`Confirm remove ${o.name}`}
                                      disabled={paletteDeleteBusy}
                                      onClick={() => void confirmDeletePaletteUnit(o)}
                                      className={`${paletteDeleteBtnClass} bg-emerald-100 text-emerald-900 hover:bg-emerald-200 focus-visible:ring-emerald-500/80`}
                                    >
                                      <Check className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </article>
                          </li>
                        );
                      })}
                      {filteredUnits.length === 0 ? (
                        <li className="py-6 text-center text-sm text-stone-500">
                          {orgUnits.every((u) => u.onOrgChart) ? "All units are on the chart." : "No matches."}
                        </li>
                      ) : null}
                    </ul>
                  )}
                </aside>

                <ChartOrgUnitSelectionContext.Provider value={chartOrgUnitSelection}>
                  <div className="relative order-1 flex min-h-0 flex-[1.35] flex-col sm:flex-[1.5] lg:order-2 lg:w-[80%] lg:flex-1">
                    {paletteDragActive ? (
                      <div
                        className="pointer-events-none absolute inset-0 z-[1] rounded-xl ring-2 ring-amber-200/60 ring-offset-2 ring-offset-white"
                        aria-hidden
                      />
                    ) : null}
                    <div
                      className={[
                        "relative z-0 flex min-h-0 flex-1 flex-col",
                        busy ? "pointer-events-none opacity-60" : ""
                      ].join(" ")}
                    >
                      <FlowPanel
                        flowKey={flowKey}
                        initialNodes={flow.nodes}
                        initialEdges={flow.edges}
                        paletteDragActive={paletteDragActive}
                        onInvalidStaffCanvasDrop={onInvalidStaffCanvasDrop}
                        statusMessage={dropHint}
                        onDismissStatusMessage={dismissDropHint}
                      />
                    </div>
                  </div>
                </ChartOrgUnitSelectionContext.Provider>
              </div>
            </div>

            <WorkforceQuickAddEmployeeModal
              open={quickEmployeeOpen}
              onClose={() => setQuickEmployeeOpen(false)}
              onCreated={() => void reload()}
            />
            <WorkforceQuickAddOrgUnitModal
              open={quickOrgOpen}
              onClose={() => setQuickOrgOpen(false)}
              onCreated={() => void reload()}
            />
          </ChartPaletteDragActiveContext.Provider>
        </DraggingStaffContext.Provider>
            </ChartBusyContext.Provider>
          </OrgUnlinkAssigneeContext.Provider>
        </OrgUnitPaletteDropContext.Provider>
      </OrgRemoveContext.Provider>
    </OrgDropContext.Provider>
  );
};
