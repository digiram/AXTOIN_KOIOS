/**
 * WorkforceOrganizationsChartNodes.
 *
 * Custom React Flow node components for the read-only organizations chart.
 *
 * Responsibilities:
 * - Render org-unit cards with optional manager link to employee detail
 * - Render employment member cards beneath org units
 * - Export `organizationsChartNodeTypes` registry for React Flow
 */

import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { memo } from "react";
import { Link } from "react-router-dom";

import { EmployeeKindIcon } from "./EmployeeKindIcon.js";

const OrganizationsOrgUnitNode = memo(function OrganizationsOrgUnitNode(props: NodeProps) {
  const { data } = props;
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
  const assigneeEmployeeId =
    typeof data === "object" &&
    data !== null &&
    "assigneeEmployeeId" in data &&
    typeof (data as { assigneeEmployeeId?: unknown }).assigneeEmployeeId === "string"
      ? String((data as { assigneeEmployeeId: string }).assigneeEmployeeId)
      : "";
  const assigneeKindResolved = hasAssignee ? assigneeEmployeeKind ?? "person" : null;
  const primaryLine = assigneeDisplayName?.length ? assigneeDisplayName : null;

  const unitCardShellClass =
    "relative flex min-h-[4.75rem] min-w-[160px] max-w-[230px] flex-col justify-center overflow-hidden rounded-xl border border-stone-200 bg-white text-center shadow-sm";
  const unitCardLinkClass = `${unitCardShellClass} transition hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50`;

  const cardBody = (
    <>
      {assigneeKindResolved ? (
        <div
          className="absolute inset-y-0 left-0 z-[1] flex w-9 flex-col items-center justify-center border-r border-stone-200/80 bg-stone-100/90"
          title={assigneeKindResolved === "agent" ? "Agent" : "Person"}
        >
          <span className="sr-only">{assigneeKindResolved === "agent" ? "Agent" : "Person"}</span>
          <EmployeeKindIcon kind={assigneeKindResolved} />
        </div>
      ) : null}
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
    </>
  );

  return (
    <div className="relative h-full w-full min-h-[4.75rem] min-w-[160px] max-w-[230px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!pointer-events-none !h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent opacity-0"
      />
      {assigneeEmployeeId ? (
        <Link to={`/admin/workforce/employees/${assigneeEmployeeId}`} className={unitCardLinkClass}>
          {cardBody}
        </Link>
      ) : (
        <div className={unitCardShellClass}>{cardBody}</div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!pointer-events-none !h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent opacity-0"
      />
    </div>
  );
});

const EmploymentMemberChartNode = memo(function EmploymentMemberChartNode(props: NodeProps) {
  const { data } = props;
  const displayName =
    typeof data === "object" &&
    data !== null &&
    "displayName" in data &&
    typeof (data as { displayName?: unknown }).displayName === "string"
      ? String((data as { displayName: string }).displayName).trim()
      : "Staff member";
  const jobTitle =
    typeof data === "object" &&
    data !== null &&
    "jobTitle" in data &&
    typeof (data as { jobTitle?: unknown }).jobTitle === "string"
      ? String((data as { jobTitle: string }).jobTitle).trim()
      : null;
  const employeeKind =
    typeof data === "object" &&
    data !== null &&
    "employeeKind" in data &&
    (data as { employeeKind?: unknown }).employeeKind === "agent"
      ? "agent"
      : "person";
  const employeeId =
    typeof data === "object" &&
    data !== null &&
    "employeeId" in data &&
    typeof (data as { employeeId?: unknown }).employeeId === "string"
      ? String((data as { employeeId: string }).employeeId)
      : "";

  const cardBody = (
    <>
      <div
        className="flex w-8 shrink-0 flex-col items-center justify-center border-r border-slate-200/80 bg-slate-100/90"
        title={employeeKind === "agent" ? "Agent" : "Person"}
      >
        <EmployeeKindIcon kind={employeeKind} />
      </div>
      <div className="min-w-0 flex-1 px-2 py-1.5">
        <div className="line-clamp-2 text-xs font-medium leading-snug text-slate-900">{displayName}</div>
        {jobTitle ? <div className="mt-0.5 line-clamp-1 text-[10px] text-slate-600">{jobTitle}</div> : null}
      </div>
    </>
  );

  return (
    <div className="relative min-w-[120px] max-w-[160px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!pointer-events-none !h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent opacity-0"
      />
      {employeeId ? (
        <Link
          to={`/admin/workforce/employees/${employeeId}`}
          className="flex min-h-[3rem] overflow-hidden rounded-lg border border-slate-200 bg-slate-50/95 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50"
        >
          {cardBody}
        </Link>
      ) : (
        <div className="flex min-h-[3rem] overflow-hidden rounded-lg border border-slate-200 bg-slate-50/95 text-left shadow-sm">
          {cardBody}
        </div>
      )}
    </div>
  );
});

/** React Flow node type map for the organizations chart view. */
export const organizationsChartNodeTypes = {
  orgUnit: OrganizationsOrgUnitNode,
  employmentMember: EmploymentMemberChartNode
} satisfies NodeTypes;
