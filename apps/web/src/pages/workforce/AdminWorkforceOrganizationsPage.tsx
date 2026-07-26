/**
 * AdminWorkforceOrganizationsPage.
 *
 * Read-only organizations chart showing org units and employment members with React Flow.
 *
 * Responsibilities:
 * - Load org units and employees from workforce APIs
 * - Layout nodes via {@link layoutOrganizationsChartToFlow}
 * - Link org-unit manager cards to employee detail routes
 *
 * Depends on:
 * - {@link useWorkforceApi}, {@link organizationsChartNodeTypes}
 */

import {
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "../../lib/api.js";
import { organizationsChartNodeTypes } from "./WorkforceOrganizationsChartNodes.js";
import {
  layoutOrganizationsChartToFlow,
  type OrgChartMemberInput,
  type OrgChartUnitInput
} from "./workforceGraphLayout.js";
import { useWorkforceApi } from "./useWorkforceApi.js";

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
  onOrgChart: boolean;
};

type ApiEmployee = {
  id: string;
  displayName: string;
  employeeKind: string;
  jobTitle: string | null;
  employmentOrgUnitId: string | null;
};

const flowPaneClass =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stone-200 bg-stone-50 shadow-inner";

const rfNodePointerEventsNoop = () => {};

const OrganizationsFlowCanvas = ({
  flowKey,
  initialNodes,
  initialEdges,
  loading,
  emptyChart
}: {
  flowKey: string;
  initialNodes: ReturnType<typeof layoutOrganizationsChartToFlow>["nodes"];
  initialEdges: ReturnType<typeof layoutOrganizationsChartToFlow>["edges"];
  loading: boolean;
  emptyChart: boolean;
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [flowKey, initialNodes, initialEdges, setNodes, setEdges]);

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-stone-500">Loading…</div>;
  }

  if (emptyChart) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-stone-500">
        No units on the chart yet. Place units from Organizational Structure & Leadership.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={organizationsChartNodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onNodeMouseEnter={rfNodePointerEventsNoop}
      onNodeMouseLeave={rfNodePointerEventsNoop}
      proOptions={{ hideAttribution: true }}
      className="h-full min-h-[180px] rounded-xl [&_.react-flow__node]:overflow-visible [&_.react-flow__viewport-portal]:pointer-events-none"
    >
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
};

/**
 * Read-only organizations chart: units on canvas with employment members under each box.
 *
 * @returns React Flow organizations view at `/admin/workforce/organization`
 */
export const AdminWorkforceOrganizationsPage = () => {
  const { authedFetch } = useWorkforceApi();
  const [orgUnits, setOrgUnits] = useState<ApiOrgUnit[]>([]);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const load = async () => {
      setLoadError("");
      setLoading(true);
      try {
        const orgRes = await authedFetch(`${API_BASE_URL}/tenant/workforce/org-units`, {
          signal: ac.signal
        });
        if (cancelled) return;
        if (!orgRes) return;
        if (!orgRes.ok) {
          setLoadError("Could not load org structure.");
          return;
        }
        const orgJson = (await orgRes.json()) as { orgUnits: Array<ApiOrgUnit & { onOrgChart?: boolean }> };
        if (cancelled) return;
        setOrgUnits(
          orgJson.orgUnits.map((r) => ({
            ...r,
            onOrgChart: r.onOrgChart ?? true
          }))
        );

        const collected: ApiEmployee[] = [];
        let page = 1;
        let total = Infinity;
        while (collected.length < total && page < 40) {
          const qs = new URLSearchParams({ page: String(page), pageSize: "100" });
          const eRes = await authedFetch(`${API_BASE_URL}/tenant/workforce/employees?${qs}`, {
            signal: ac.signal
          });
          if (cancelled) return;
          if (!eRes) return;
          if (!eRes.ok) break;
          const ej = (await eRes.json()) as {
            employees: Array<{
              id: string;
              displayName: string;
              employeeKind: string;
              jobTitle?: string | null;
              employmentOrgUnitId?: string | null;
            }>;
            total: number;
          };
          if (cancelled) return;
          for (const row of ej.employees) {
            collected.push({
              id: row.id,
              displayName: row.displayName,
              employeeKind: row.employeeKind,
              jobTitle: row.jobTitle ?? null,
              employmentOrgUnitId: row.employmentOrgUnitId ?? null
            });
          }
          total = ej.total;
          page += 1;
        }
        if (!cancelled) setEmployees(collected);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setLoadError("Could not load org structure.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [authedFetch]);

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
          hasAssignee: Boolean(o.assignedEmployeeId),
          assigneeEmployeeKind: o.assignedEmployeeId
            ? o.assignee?.employeeKind === "agent"
              ? "agent"
              : "person"
            : null,
          assigneeEmployeeId: o.assignedEmployeeId
        };
      }),
    [chartOrgUnits, chartIds]
  );

  const membersByUnitId = useMemo(() => {
    const map = new Map<string, OrgChartMemberInput[]>();
    for (const emp of employees) {
      const unitId = emp.employmentOrgUnitId;
      if (!unitId || !chartIds.has(unitId)) continue;
      const unit = chartOrgUnits.find((u) => u.id === unitId);
      if (unit?.assignedEmployeeId === emp.id) continue;
      const list = map.get(unitId) ?? [];
      list.push({
        id: emp.id,
        displayName: emp.displayName,
        employeeKind: emp.employeeKind,
        jobTitle: emp.jobTitle
      });
      map.set(unitId, list);
    }
    return map;
  }, [chartIds, chartOrgUnits, employees]);

  const flow = useMemo(
    () => layoutOrganizationsChartToFlow(chartRows, membersByUnitId),
    [chartRows, membersByUnitId]
  );

  const flowKey = useMemo(() => {
    const unitKey = chartOrgUnits
      .map((o) => `${o.id}:${o.assignedEmployeeId ?? ""}:${o.parentOrgUnitId ?? ""}`)
      .join("|");
    const memberKey = [...membersByUnitId.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([unitId, members]) => `${unitId}:${members.map((m) => m.id).join(",")}`)
      .join("|");
    return `${unitKey}::${memberKey}`;
  }, [chartOrgUnits, membersByUnitId]);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <p className="shrink-0 text-xs leading-relaxed text-stone-600 sm:text-sm">
        Same hierarchy as{" "}
        <span className="font-semibold text-stone-800">Organizational Structure & Leadership</span>. Dashed links
        show staff linked via Employment who are not the unit manager. Edit placement on the leadership chart; edit
        employment on employee records.
      </p>
      {loadError ? (
        <p className="shrink-0 text-sm text-rose-600" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className={`${flowPaneClass} relative min-h-0 flex-1`}>
        <ReactFlowProvider>
          <OrganizationsFlowCanvas
            flowKey={flowKey}
            initialNodes={flow.nodes}
            initialEdges={flow.edges}
            loading={loading}
            emptyChart={!loading && chartOrgUnits.length === 0}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
};
