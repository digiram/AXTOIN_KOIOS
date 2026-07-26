/**
 * WorkforceGraphLayout.
 *
 * Pure layout functions converting org-unit trees into React Flow nodes and edges.
 *
 * Responsibilities:
 * - Layer org units parent-to-child for org chart and organizations chart views
 * - Position member nodes beneath their assigned org units
 */

import type { Edge, Node } from "@xyflow/react";

/** One org-chart node: unit title + optional assignee name for the chart card body. */
export type OrgChartUnitInput = {
  id: string;
  name: string;
  parentOrgUnitId: string | null;
  /** Org unit label (trimmed); shown ALL CAPS on the card (primary if no assignee, else subtext). */
  unitName: string;
  /** When set, shown as the primary line on the card; unit name moves to subtext. */
  assigneeDisplayName: string | null;
  /** True when another on-chart unit lists this unit as its parent (cannot remove parent from chart until resolved). */
  hasChildren?: boolean;
  /** True when this unit has an assigned person/agent on the chart (unlink control). */
  hasAssignee?: boolean;
  /** When `hasAssignee`, `"person"` or `"agent"` for the assignee row icon. */
  assigneeEmployeeKind?: string | null;
  /** Manager employee id (Organizations chart links unit card to profile). */
  assigneeEmployeeId?: string | null;
};

const LEVEL_Y = 120;
const NODE_GAP_X = 200;

/** Layout tuning for org-chart React Flow positioning. */
export type OrgChartLayoutOptions = {
  levelY?: number;
  nodeGapX?: number;
};

/** Employee/agent member shown under an org unit on the organizations chart. */
export type OrgChartMemberInput = {
  id: string;
  displayName: string;
  employeeKind: string;
  jobTitle?: string | null;
};

const MEMBER_OFFSET_Y = 108;
const MEMBER_CARD_W = 136;
const MEMBER_GAP_X = 20;

/** Layered layout for org units (parent → children), left-to-right within a level. */
export const layoutOrgChartToFlow = (
  rows: OrgChartUnitInput[],
  options?: OrgChartLayoutOptions
): { nodes: Node[]; edges: Edge[] } => {
  const levelY = options?.levelY ?? LEVEL_Y;
  const nodeGapX = options?.nodeGapX ?? NODE_GAP_X;
  if (rows.length === 0) return { nodes: [], edges: [] };
  const byParent = new Map<string | null, OrgChartUnitInput[]>();
  for (const r of rows) {
    const p = r.parentOrgUnitId ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(r);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }

  const positions = new Map<string, { x: number; y: number }>();
  let frontier = (byParent.get(null) ?? []).map((r) => r.id);
  let depth = 0;
  const seen = new Set<string>();

  while (frontier.length > 0) {
    const rowWidth = frontier.length * nodeGapX;
    let startX = -rowWidth / 2 + nodeGapX / 2;
    const next: string[] = [];
    for (const id of frontier) {
      seen.add(id);
      positions.set(id, { x: startX, y: depth * levelY });
      startX += nodeGapX;
      for (const ch of byParent.get(id) ?? []) next.push(ch.id);
    }
    frontier = next;
    depth += 1;
  }

  for (const r of rows) {
    if (!seen.has(r.id)) {
      positions.set(r.id, { x: 0, y: depth * levelY + 40 });
      depth += 1;
    }
  }

  const nodes: Node[] = rows.map((r) => ({
    id: r.id,
    type: "orgUnit",
    position: positions.get(r.id) ?? { x: 0, y: 0 },
    data: {
      unitName: r.unitName,
      assigneeDisplayName: r.assigneeDisplayName,
      hasChildren: Boolean(r.hasChildren),
      hasAssignee: Boolean(r.hasAssignee),
      ...(r.assigneeEmployeeKind != null && r.assigneeEmployeeKind !== ""
        ? { assigneeEmployeeKind: r.assigneeEmployeeKind }
        : {}),
      ...(r.assigneeEmployeeId ? { assigneeEmployeeId: r.assigneeEmployeeId } : {})
    }
  }));

  const edges: Edge[] = rows
    .filter((r) => r.parentOrgUnitId)
    .map((r) => ({
      id: `e-org-${r.parentOrgUnitId}-${r.id}`,
      source: r.parentOrgUnitId!,
      target: r.id
    }));

  return { nodes, edges };
};

/** Org units on chart plus employment members (excluding unit manager) attached under each unit. */
export const layoutOrganizationsChartToFlow = (
  rows: OrgChartUnitInput[],
  membersByUnitId: Map<string, OrgChartMemberInput[]>
): { nodes: Node[]; edges: Edge[] } => {
  const { nodes: unitNodes, edges: unitEdges } = layoutOrgChartToFlow(rows, {
    levelY: 200,
    nodeGapX: 220
  });

  const memberNodes: Node[] = [];
  const memberEdges: Edge[] = [];

  for (const unitNode of unitNodes) {
    const members = membersByUnitId.get(unitNode.id) ?? [];
    if (members.length === 0) continue;

    const sorted = [...members].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
    );
    const count = sorted.length;
    const totalW = count * MEMBER_CARD_W + (count - 1) * MEMBER_GAP_X;
    let x = unitNode.position.x - totalW / 2 + MEMBER_CARD_W / 2;
    const y = unitNode.position.y + MEMBER_OFFSET_Y;

    for (const m of sorted) {
      const nodeId = `member:${m.id}`;
      memberNodes.push({
        id: nodeId,
        type: "employmentMember",
        position: { x, y },
        data: {
          displayName: m.displayName.trim() || "Staff member",
          employeeKind: m.employeeKind === "agent" ? "agent" : "person",
          jobTitle: m.jobTitle?.trim() || null,
          employeeId: m.id
        },
        draggable: false,
        selectable: false
      });
      memberEdges.push({
        id: `e-member-${unitNode.id}-${m.id}`,
        source: unitNode.id,
        target: nodeId,
        style: { stroke: "#cbd5e1", strokeWidth: 1.5, strokeDasharray: "5 4" },
        type: "smoothstep"
      });
      x += MEMBER_CARD_W + MEMBER_GAP_X;
    }
  }

  return { nodes: [...unitNodes, ...memberNodes], edges: [...unitEdges, ...memberEdges] };
};
