/**
 * Company Subscription Plan Seats Table.
 *
 * Reusable company subscriptions UI building block: Company Subscription Plan Seats Table.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/company-subscriptions
 */
import { Check, Pencil, Trash2, X } from "lucide-react";

import {
  bindTableRowPrimaryAction,
  stopTableRowClickPropagation,
  tableRowClickableClass,
  tableShowsActionColumn,
  type TableRowActionDescriptor
} from "../../lib/tableRowAction.js";
import type { CompanySubscriptionSeatRow } from "./useCompanySubscriptionsApi.js";
import {
  csActionBtnCancelClass,
  csActionBtnConfirmClass,
  csActionBtnDeleteClass,
  csActionBtnEditClass,
  csActionConfirmMaskCellClass,
  csActionConfirmMaskInnerClass,
  csActionConfirmMessageWrapClass,
  csActionConfirmRailCellClass,
  csActionRailClass,
  csActionsTdClass,
  csActionsThClass,
  csCompactTdClass,
  csCompactThClass,
  csDataTableClass,
  csDataTableShellClass,
  seatDisplayName,
  seatHolderOverviewLabel,
  seatStatusBadgeClass,
  seatStatusLabel
} from "./companySubscriptionsUi.js";

type Props = {
  planId: string;
  planName: string;
  seats: CompanySubscriptionSeatRow[];
  canWrite: boolean;
  canDelete: boolean;
  formatDate: (iso: string) => string;
  confirmDeleteSeatId: string | null;
  deletingSeatId: string | null;
  onConfirmDeleteSeatId: (seatId: string | null) => void;
  onDeleteSeat: (planId: string, seatId: string) => Promise<boolean>;
  onEditSeat: (seat: CompanySubscriptionSeatRow) => void;
};

/** React component for company subscriptions UI. */
export const CompanySubscriptionPlanSeatsTable = ({
  planId,
  planName,
  seats,
  canWrite,
  canDelete,
  formatDate,
  confirmDeleteSeatId,
  deletingSeatId,
  onConfirmDeleteSeatId,
  onDeleteSeat,
  onEditSeat
}: Props) => {
  const rowActionDescriptors: TableRowActionDescriptor[] = [
    ...(canWrite ? [{}] : []),
    ...(canDelete ? [{ destructive: true }] : [])
  ];
  const showActionColumn = tableShowsActionColumn(rowActionDescriptors);
  const rowOpensEdit = canWrite && !showActionColumn;
  const colSpan = showActionColumn ? 5 : 4;

  if (seats.length === 0) {
    return (
      <p className="text-sm italic text-slate-500">
        No seats assigned.{canWrite ? " Use + on the plan to add a seat holder." : ""}
      </p>
    );
  }

  return (
    <div className={csDataTableShellClass}>
      <table className={csDataTableClass} aria-label={`Seats for ${planName}`}>
        <caption className="sr-only">Seat assignments for plan {planName}</caption>
        <thead className="bg-slate-50">
          <tr>
            <th
              scope="col"
              className="min-w-[10rem] px-3 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500"
            >
              Holder
            </th>
            <th scope="col" className={`${csCompactThClass} text-left`}>
              Type
            </th>
            <th scope="col" className={`${csCompactThClass} text-left`}>
              Status
            </th>
            <th scope="col" className={`${csCompactThClass} text-left`}>
              Period
            </th>
            {showActionColumn ? (
              <th scope="col" className={csActionsThClass}>
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
          {seats.map((seat, idx) => {
            const confirming = confirmDeleteSeatId === seat.id;
            const deleting = deletingSeatId === seat.id;
            const holder = seatHolderOverviewLabel(seat);
            const holderShort = seatDisplayName(seat);

            if (confirming && canDelete) {
              return (
                <tr key={seat.id} className={[idx % 2 === 0 ? "bg-white" : "bg-slate-50/40", "relative z-[1]"].join(" ")}>
                  <td colSpan={colSpan - 1} className={csActionConfirmMaskCellClass}>
                    <div className={csActionConfirmMaskInnerClass} aria-hidden />
                    <div className={csActionConfirmMessageWrapClass}>
                      <p className="text-sm font-medium text-slate-800">Remove seat for {holderShort}?</p>
                    </div>
                  </td>
                  <td className={csActionConfirmRailCellClass}>
                    <div className={csActionRailClass}>
                      <button
                        type="button"
                        title="Cancel"
                        aria-label="Cancel remove seat"
                        disabled={deleting}
                        onClick={() => onConfirmDeleteSeatId(null)}
                        className={csActionBtnCancelClass}
                      >
                        <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        title="Confirm remove seat"
                        aria-label={`Confirm remove seat for ${holderShort}`}
                        disabled={deleting}
                        onClick={() =>
                          void onDeleteSeat(planId, seat.id).then((ok) => ok && onConfirmDeleteSeatId(null))
                        }
                        className={csActionBtnConfirmClass}
                      >
                        <Check className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }

            return (
              <tr
                key={seat.id}
                className={[
                  idx % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                  "transition-colors hover:bg-slate-100/80",
                  rowOpensEdit ? tableRowClickableClass : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                {...(rowOpensEdit
                  ? bindTableRowPrimaryAction({
                      onAction: () => onEditSeat(seat),
                      ariaLabel: `Edit seat for ${holderShort}`,
                      role: "button"
                    })
                  : {})}
              >
                <td className="max-w-0 whitespace-nowrap px-3 py-2 align-middle">
                  <span className="block truncate font-medium text-slate-900" title={holder}>
                    {holder}
                  </span>
                </td>
                <td className={`${csCompactTdClass} text-slate-700`}>{seat.seatType?.trim() || "—"}</td>
                <td className={csCompactTdClass}>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-none shadow-sm ${seatStatusBadgeClass(seat.status)}`}
                  >
                    {seatStatusLabel(seat.status)}
                  </span>
                </td>
                <td className={`${csCompactTdClass} tabular-nums text-slate-700`}>
                  {seat.startDate || seat.endDate ? (
                    <>
                      {seat.startDate ? formatDate(seat.startDate) : "—"} –{" "}
                      {seat.endDate ? formatDate(seat.endDate) : "—"}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                {showActionColumn ? (
                  <td className={csActionsTdClass} onClick={stopTableRowClickPropagation}>
                    <div className={csActionRailClass}>
                      {canWrite ? (
                        <button
                          type="button"
                          title="Edit seat"
                          aria-label={`Edit seat for ${holderShort}`}
                          disabled={deleting}
                          onClick={() => onEditSeat(seat)}
                          className={csActionBtnEditClass}
                        >
                          <Pencil className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          title="Remove seat"
                          aria-label={`Remove seat for ${holderShort}`}
                          disabled={deleting}
                          onClick={() => onConfirmDeleteSeatId(seat.id)}
                          className={csActionBtnDeleteClass}
                        >
                          <Trash2 className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
