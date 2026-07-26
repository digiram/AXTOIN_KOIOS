/**
 * WorkforceEmployeeDetailPage.
 *
 * Single-employee workforce detail with profile, socials, work hours (persons only), documents, agent mailbox, and edit modal.
 *
 * Responsibilities:
 * - Fetch employee by route `:id` from `/v1/tenant/workforce/employees/:id`
 * - Autosave work-schedule grid with debounce for person employees (hidden for agents)
 * - Set shell header title and open edit modal from location state
 * - Show Socials card under the profile when any social is registered
 * - Show Mailbox card for `employeeKind === "agent"` when mailbox module is available
 *
 * Depends on:
 * - {@link useWorkforceApi}, {@link WorkforceEmployeeProfileCard}, {@link WorkforceEmployeeDocumentsCard},
 *   {@link WorkforceEmployeeMailboxCard}, {@link WorkforceEmployeeSocialsCard}
 *
 * Security:
 * - Tenant-scoped employee PII; mutations require workforce module write access server-side
 */

import { ChevronLeft, Pencil, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  type WorkforceWorkScheduleDayCode,
  workforceEmployeeDisplayName,
  workforceWorkScheduleDayShortLabel,
  workforceWorkScheduleSchema
} from "@starter/shared";
import { crmModalOutlineInputClass } from "../../components/crm/crmModalOutlineInputClass.js";
import { type ShellHeaderOverride, useShellHeader } from "../../components/ShellHeaderContext.js";
import { API_BASE_URL } from "../../lib/api.js";
import type { WorkforceEmployeeModalLocationState } from "./WorkforceEmployeeModalRouteRedirects.js";
import { EmployeeKindIcon } from "./EmployeeKindIcon.js";
import { WorkforceEmployeeDocumentsCard } from "./WorkforceEmployeeDocumentsCard.js";
import { WorkforceEmployeeMailboxCard } from "./WorkforceEmployeeMailboxCard.js";
import { WorkforceEmployeeProfileCard } from "./WorkforceEmployeeProfileCard.js";
import { WorkforceEmployeeSocialsCard } from "./WorkforceEmployeeSocialsCard.js";
import { WorkforceQuickAddEmployeeModal } from "./WorkforceQuickAddModals.js";
import { useWorkforceApi } from "./useWorkforceApi.js";
import type { EntityProfilePhotoHandlers } from "../../components/crm/ProfileEntityPhoto.js";
import {
  WORK_WEEK_DAYS,
  emptyDayScheduleGrid,
  scheduleGridFromApi,
  workSchedulePayloadFromGrid,
  type DayScheduleRow
} from "./workforceWorkingHoursGrid.js";

/** Same debounce as account home address autosave (`AccountSettingsPage`). */
const WORK_HOURS_AUTOSAVE_DEBOUNCE_MS = 600;

type Detail = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfEmployment: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  workPhone: string | null;
  workEmail: string | null;
  personalAddress: string | null;
  workLocation: string | null;
  employmentOrgUnitId: string | null;
  employmentOrgUnitName: string | null;
  jobTitle: string | null;
  employeeKind: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  hasPhoto?: boolean;
  workTimeKind: "full" | "part" | null;
  workSchedule: { day: WorkforceWorkScheduleDayCode; start: string; end: string }[] | null;
  socials?: Array<{ id: string; provider: string; profileUrl: string }>;
};

/**
 * Employee detail page: profile, work hours (persons), documents, and edit entry.
 *
 * @returns Employee detail UI or loading/error states
 */
export const WorkforceEmployeeDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { authedFetch } = useWorkforceApi();
  const [row, setRow] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [whWorkTimeKind, setWhWorkTimeKind] = useState<"full" | "part">("full");
  const [whDaySchedule, setWhDaySchedule] = useState<Record<WorkforceWorkScheduleDayCode, DayScheduleRow>>(() =>
    emptyDayScheduleGrid()
  );
  const [whError, setWhError] = useState("");
  const whSaveAbortRef = useRef<AbortController | null>(null);

  const applyEmployeeDetail = useCallback((j: Detail) => {
    setRow(j);
    setWhWorkTimeKind(j.workTimeKind === "part" ? "part" : "full");
    setWhDaySchedule(scheduleGridFromApi(j.workSchedule));
    setWhError("");
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    setLoading(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/employees/${encodeURIComponent(id)}`);
      if (!res?.ok) {
        if (res?.status === 404) setError("Employee not found.");
        else setError("Could not load employee.");
        return;
      }
      const j = (await res.json()) as Detail;
      applyEmployeeDetail(j);
    } catch {
      setError("Could not load employee.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, id, applyEmployeeDetail]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const mod = (location.state as WorkforceEmployeeModalLocationState | null)?.workforceEmployeeModal;
    if (mod === "edit" && id) {
      setEditModalOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, id]);

  const shellHeader = useMemo<ShellHeaderOverride | null>(
    () =>
      row
        ? {
            title: workforceEmployeeDisplayName(row.firstName, row.lastName),
            subtitle: "Workforce employee (HRM)",
            titleLeading: <EmployeeKindIcon kind={row.employeeKind} className="h-5 w-5 shrink-0 text-slate-600" />
          }
        : null,
    [row]
  );
  useShellHeader(shellHeader);

  const whDirty = useMemo(() => {
    if (!row) return false;
    const serverKind = row.workTimeKind === "part" ? "part" : "full";
    const kindMatch = whWorkTimeKind === serverKind;
    const localPayload = workSchedulePayloadFromGrid(whDaySchedule);
    const serverPayload = workSchedulePayloadFromGrid(scheduleGridFromApi(row.workSchedule));
    const schedMatch = JSON.stringify(localPayload) === JSON.stringify(serverPayload);
    return !kindMatch || !schedMatch;
  }, [row, whWorkTimeKind, whDaySchedule]);

  const isAgent = row?.employeeKind === "agent";

  useEffect(() => {
    if (!id || !row || isAgent || !whDirty) return;

    const t = window.setTimeout(() => {
      void (async () => {
        const payload = workSchedulePayloadFromGrid(whDaySchedule);
        const parsed = workforceWorkScheduleSchema.safeParse(payload);
        if (!parsed.success) {
          setWhError(parsed.error.errors[0]?.message ?? "Invalid schedule.");
          return;
        }

        whSaveAbortRef.current?.abort();
        const ac = new AbortController();
        whSaveAbortRef.current = ac;

        setWhError("");
        try {
          const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/employees/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              workTimeKind: whWorkTimeKind,
              workSchedule: payload
            }),
            signal: ac.signal
          });
          if (ac.signal.aborted) return;
          if (!res?.ok) {
            setWhError("Could not save working hours.");
            await load();
            return;
          }
          const data = (await res.json()) as { employee: Detail };
          if (ac.signal.aborted) return;
          applyEmployeeDetail(data.employee);
        } catch (e) {
          if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
          setWhError("Could not save working hours.");
          await load();
        }
      })();
    }, WORK_HOURS_AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(t);
  }, [
    id,
    row,
    isAgent,
    whDirty,
    whWorkTimeKind,
    whDaySchedule,
    authedFetch,
    applyEmployeeDetail,
    load
  ]);

  useEffect(
    () => () => {
      whSaveAbortRef.current?.abort();
    },
    []
  );

  const employeePhotoHandlers = useMemo((): EntityProfilePhotoHandlers | undefined => {
    if (!id || !row) return undefined;
    const base = `${API_BASE_URL}/tenant/workforce/employees/${encodeURIComponent(id)}/photo`;
    return {
      hasPhoto: Boolean(row.hasPhoto),
      cacheKey: row.updatedAt,
      photoGetUrl: base,
      photoPostUrl: base,
      photoDeleteUrl: base,
      authedFetch,
      onChanged: () => void load()
    };
  }, [id, row, authedFetch, load]);

  if (loading) {
    return (
      <div className="mt-10 flex justify-center text-sm text-stone-500">
        <User className="mr-2 h-5 w-5 animate-pulse text-emerald-500" aria-hidden />
        Loading…
      </div>
    );
  }
  if (error || !row) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-600">{error || "Not found."}</p>
        <Link to="/admin/workforce/employees" className="text-sm font-medium text-indigo-700 hover:underline">
          Back to employees
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <Link
            to="/admin/workforce/employees"
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden strokeWidth={2} />
            Employees
          </Link>
        </nav>
        <button
          type="button"
          onClick={() => setEditModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
        >
          <Pencil className="h-4 w-4" aria-hidden strokeWidth={2} />
          Edit employee
        </button>
      </div>

      <WorkforceQuickAddEmployeeModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        employeeId={editModalOpen && id ? id : null}
        onSaved={() => void load()}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-4 lg:items-start">
        <div className="space-y-6 lg:col-span-1">
          <WorkforceEmployeeProfileCard
            profilePhoto={employeePhotoHandlers}
            employee={{
              firstName: row.firstName,
              lastName: row.lastName,
              jobTitle: row.jobTitle,
              employeeKind: row.employeeKind,
              dateOfEmployment: row.dateOfEmployment,
              personalPhone: row.personalPhone,
              personalEmail: row.personalEmail,
              workPhone: row.workPhone,
              workEmail: row.workEmail,
              personalAddress: row.personalAddress,
              workLocation: row.workLocation,
              employmentOrgUnitName: row.employmentOrgUnitName,
              notes: row.notes,
              updatedAt: row.updatedAt
            }}
          />
          {(row.socials?.length ?? 0) > 0 ? <WorkforceEmployeeSocialsCard socials={row.socials ?? []} /> : null}
        </div>

        <div className="space-y-6 lg:col-span-3">
          {!isAgent ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/5 sm:p-6">
              <h3 className="text-sm font-semibold text-slate-900">Working hours</h3>
              {whError ? (
                <p className="mt-2 text-sm text-rose-600" role="alert">
                  {whError}
                </p>
              ) : null}
              <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[11.5rem_minmax(0,1fr)]">
                <div className="flex min-h-0 flex-col sm:h-full sm:min-h-0">
                  <span id="wf-detail-wh-kind" className="sr-only">
                    Full-time or part-time
                  </span>
                  <div
                    role="radiogroup"
                    aria-labelledby="wf-detail-wh-kind"
                    className="flex min-h-[6.5rem] flex-1 flex-col overflow-hidden rounded-lg border border-slate-200/90 bg-slate-50/90 shadow-sm sm:min-h-0"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={whWorkTimeKind === "full"}
                      onClick={() => setWhWorkTimeKind("full")}
                      className={[
                        "flex flex-1 items-center justify-center border-b border-slate-200/90 px-2 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
                        whWorkTimeKind === "full"
                          ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-900/20"
                          : "text-slate-700 hover:bg-white"
                      ].join(" ")}
                    >
                      Full-time
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={whWorkTimeKind === "part"}
                      onClick={() => setWhWorkTimeKind("part")}
                      className={[
                        "flex flex-1 items-center justify-center px-2 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
                        whWorkTimeKind === "part"
                          ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-900/20"
                          : "text-slate-700 hover:bg-white"
                      ].join(" ")}
                    >
                      Part-time
                    </button>
                  </div>
                </div>
                <div className="min-h-0 min-w-0 overflow-x-auto rounded-lg border border-slate-200/90 bg-slate-50/40 p-3 sm:p-4">
                  <div className="min-w-[32rem] space-y-3 sm:min-w-0">
                    <div className="flex min-w-0 gap-2">
                      <div className="w-10 shrink-0" aria-hidden />
                      <div
                        className="grid min-w-0 flex-1 grid-cols-7 gap-1.5 sm:gap-2"
                        role="group"
                        aria-label="Working days"
                      >
                        {WORK_WEEK_DAYS.map(({ code }) => {
                          const on = whDaySchedule[code].enabled;
                          return (
                            <button
                              key={code}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                setWhDaySchedule((prev) => ({
                                  ...prev,
                                  [code]: { ...prev[code], enabled: !prev[code].enabled }
                                }))
                              }
                              className={[
                                "rounded-lg px-1 py-2 text-center text-xs font-semibold shadow-sm transition-colors sm:px-2 sm:text-sm",
                                on
                                  ? "bg-indigo-600 text-white ring-1 ring-indigo-900/25 hover:bg-indigo-500"
                                  : "border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50"
                              ].join(" ")}
                            >
                              {workforceWorkScheduleDayShortLabel[code]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex min-w-0 gap-2">
                      <span className="flex w-10 shrink-0 items-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                        From
                      </span>
                      <div className="grid min-w-0 flex-1 grid-cols-7 gap-1.5 sm:gap-2">
                        {WORK_WEEK_DAYS.map(({ code }) => (
                          <input
                            key={`from-${code}`}
                            type="time"
                            step={60}
                            disabled={!whDaySchedule[code].enabled}
                            value={whDaySchedule[code].start}
                            onChange={(e) =>
                              setWhDaySchedule((prev) => ({
                                ...prev,
                                [code]: { ...prev[code], start: e.target.value }
                              }))
                            }
                            className={[
                              crmModalOutlineInputClass(false),
                              "min-w-0 px-1 py-1.5 text-xs sm:px-2 sm:text-sm",
                              !whDaySchedule[code].enabled ? "cursor-not-allowed opacity-45" : ""
                            ].join(" ")}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex min-w-0 gap-2">
                      <span className="flex w-10 shrink-0 items-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                        To
                      </span>
                      <div className="grid min-w-0 flex-1 grid-cols-7 gap-1.5 sm:gap-2">
                        {WORK_WEEK_DAYS.map(({ code }) => (
                          <input
                            key={`to-${code}`}
                            type="time"
                            step={60}
                            disabled={!whDaySchedule[code].enabled}
                            value={whDaySchedule[code].end}
                            onChange={(e) =>
                              setWhDaySchedule((prev) => ({
                                ...prev,
                                [code]: { ...prev[code], end: e.target.value }
                              }))
                            }
                            className={[
                              crmModalOutlineInputClass(false),
                              "min-w-0 px-1 py-1.5 text-xs sm:px-2 sm:text-sm",
                              !whDaySchedule[code].enabled ? "cursor-not-allowed opacity-45" : ""
                            ].join(" ")}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {id && isAgent ? <WorkforceEmployeeMailboxCard employeeId={id} /> : null}
          {id ? <WorkforceEmployeeDocumentsCard employeeId={id} /> : null}
        </div>
      </div>
    </div>
  );
};
