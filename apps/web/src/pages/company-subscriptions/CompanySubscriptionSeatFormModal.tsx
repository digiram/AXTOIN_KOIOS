/**
 * Company Subscription Seat Form modal.
 *
 * Modal dialog for a focused company subscriptions create, edit, or confirmation flow.
 *
 * Responsibilities:
 * - Collect and validate user input for a single action
 * - Submit changes to tenant APIs and surface errors inline
 *
 * Related:
 * - Route: /admin/company-subscriptions
 *
 * Security:
 * - Submissions use authenticated tenant API helpers
 */
import { workforceEmployeeDisplayName, type CompanySubscriptionSeatStatus } from "@starter/shared";
import { useEffect, useState } from "react";

import { API_BASE_URL } from "../../lib/api.js";
import { CRM_SECTION_HEADING_RAIL } from "../../components/crm/crmSectionHeadingRail.js";
import { Switch } from "../../components/Switch.js";
import { useHrmModuleAvailability } from "../workforce/useHrmModuleAvailability.js";
import {
  COMPANY_SUBSCRIPTIONS_API,
  type CompanySubscriptionSeatRow,
  useCompanySubscriptionsApi
} from "./useCompanySubscriptionsApi.js";
import {
  csFieldClass,
  csLabelClass,
  readApiErrorMessage,
  seatActiveFromStatus,
  seatStatusLabel,
  seatStatusToActive
} from "./companySubscriptionsUi.js";

type EmployeeOption = { id: string; label: string; email: string | null };

type Props = {
  providerId: string;
  planId: string;
  mode: "create" | "edit";
  seat?: CompanySubscriptionSeatRow;
  onClose: () => void;
  onSaved: (seat: CompanySubscriptionSeatRow) => void;
};

/** Modal UI for a focused company subscriptions workflow. */
export const CompanySubscriptionSeatFormModal = ({ providerId, planId, mode, seat, onClose, onSaved }: Props) => {
  const { authedFetch } = useCompanySubscriptionsApi();
  const { hrmEnabled } = useHrmModuleAvailability();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  const [assignMode, setAssignMode] = useState<"employee" | "manual">("manual");
  const [employeeId, setEmployeeId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [seatType, setSeatType] = useState("");
  const [status, setStatus] = useState<CompanySubscriptionSeatStatus>("active");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (mode !== "edit" || !seat) return;
    if (seat.employeeId) {
      setAssignMode("employee");
      setEmployeeId(seat.employeeId);
    } else {
      setAssignMode("manual");
    }
    setDisplayName(seat.displayName ?? "");
    setEmail(seat.email ?? "");
    setSeatType(seat.seatType ?? "");
    setStatus(seat.status);
    setStartDate(seat.startDate ?? "");
    setEndDate(seat.endDate ?? "");
    setNotes(seat.notes ?? "");
  }, [mode, seat]);

  useEffect(() => {
    if (!hrmEnabled) return;
    let cancelled = false;
    const load = async () => {
      setEmployeesLoading(true);
      try {
        const qs = new URLSearchParams({ page: "1", pageSize: "100", sort: "last_name" }).toString();
        const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/employees?${qs}`);
        if (!res?.ok) return;
        const json = (await res.json()) as {
          employees: {
            id: string;
            firstName: string;
            lastName: string;
            workEmail: string | null;
            personalEmail: string | null;
          }[];
        };
        if (cancelled) return;
        setEmployees(
          (json.employees ?? []).map((e) => ({
            id: e.id,
            label: workforceEmployeeDisplayName(e.firstName, e.lastName),
            email: e.workEmail?.trim() || e.personalEmail?.trim() || null
          }))
        );
      } finally {
        if (!cancelled) setEmployeesLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, hrmEnabled]);

  const seatActive = seatActiveFromStatus(status);
  const seatStatusHint =
    status !== "active" && status !== "disabled" ? seatStatusLabel(status) : null;

  const save = async () => {
    setError("");
    const body: Record<string, unknown> = {
      seatType: seatType.trim() || null,
      status,
      startDate: startDate.trim() || null,
      endDate: endDate.trim() || null,
      notes: notes.trim() || null
    };

    if (assignMode === "employee" && employeeId) {
      body.employeeId = employeeId;
      body.displayName = null;
      body.email = null;
    } else {
      const dn = displayName.trim();
      const em = email.trim();
      if (!dn && !em) {
        setError("Enter a display name or email, or pick an employee.");
        return;
      }
      body.employeeId = null;
      body.displayName = dn || null;
      body.email = em || null;
    }

    setSaving(true);
    try {
      const url =
        mode === "create"
          ? `${COMPANY_SUBSCRIPTIONS_API}/providers/${encodeURIComponent(providerId)}/plans/${encodeURIComponent(planId)}/seats`
          : `${COMPANY_SUBSCRIPTIONS_API}/providers/${encodeURIComponent(providerId)}/plans/${encodeURIComponent(planId)}/seats/${encodeURIComponent(seat!.id)}`;
      const res = await authedFetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res?.ok) {
        setError(res ? await readApiErrorMessage(res) : "Could not save seat.");
        return;
      }
      const json = (await res.json()) as { seat: CompanySubscriptionSeatRow };
      onClose();
      onSaved(json.seat);
    } catch {
      setError("Could not save seat.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="text-xs text-stone-500">
        Assign a seat to a workforce employee or record a manual holder (name or email).
      </p>
      {error ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Assignment</h3>
        </div>
        <fieldset className="mt-3 space-y-2">
          <legend className="sr-only">Seat holder</legend>
          {hrmEnabled ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/50">
              <input
                type="radio"
                name="cs-seat-assign"
                className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600"
                checked={assignMode === "employee"}
                onChange={() => setAssignMode("employee")}
              />
              <span className="text-sm text-slate-800">Workforce employee</span>
            </label>
          ) : null}
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/50">
            <input
              type="radio"
              name="cs-seat-assign"
              className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600"
              checked={assignMode === "manual"}
              onChange={() => setAssignMode("manual")}
            />
            <span className="text-sm text-slate-800">Manual name or email</span>
          </label>
        </fieldset>

        {assignMode === "employee" && hrmEnabled ? (
          <div className="mt-3">
            <label htmlFor="cs-seat-employee" className={csLabelClass}>
              Employee
            </label>
            <select
              id="cs-seat-employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={csFieldClass}
              disabled={employeesLoading}
            >
              <option value="">{employeesLoading ? "Loading…" : "Select employee…"}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                  {e.email ? ` (${e.email})` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cs-seat-name" className={csLabelClass}>
                Display name
              </label>
              <input id="cs-seat-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={csFieldClass} />
            </div>
            <div>
              <label htmlFor="cs-seat-email" className={csLabelClass}>
                Email
              </label>
              <input
                id="cs-seat-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={csFieldClass}
              />
              <p className="mt-1 text-xs text-slate-500">Stored encrypted at rest when field encryption is enabled.</p>
            </div>
          </div>
        )}
      </section>

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Details</h3>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="cs-seat-type" className={csLabelClass}>
                Seat type
              </label>
              <input
                id="cs-seat-type"
                value={seatType}
                onChange={(e) => setSeatType(e.target.value)}
                className={csFieldClass}
                placeholder="e.g. Admin, Standard"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2.5 pb-0.5 sm:pb-2.5">
              <div className="text-right">
                <p className="text-xs font-medium text-stone-600">Active</p>
                {seatStatusHint ? <p className="text-[11px] text-amber-800">{seatStatusHint}</p> : null}
              </div>
              <Switch
                id="cs-seat-active"
                checked={seatActive}
                aria-label={seatActive ? "Seat active" : "Seat inactive"}
                onCheckedChange={(next) => setStatus(seatStatusToActive(next))}
              />
            </div>
          </div>
          <div>
            <label htmlFor="cs-seat-start" className={csLabelClass}>
              Start date
            </label>
            <input id="cs-seat-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={csFieldClass} />
          </div>
          <div>
            <label htmlFor="cs-seat-end" className={csLabelClass}>
              End date
            </label>
            <input id="cs-seat-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={csFieldClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cs-seat-notes" className={csLabelClass}>
              Notes
            </label>
            <textarea id="cs-seat-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={csFieldClass} />
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-stone-100 pt-4">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "create" ? "Add seat" : "Save seat"}
        </button>
      </div>
    </>
  );
};
