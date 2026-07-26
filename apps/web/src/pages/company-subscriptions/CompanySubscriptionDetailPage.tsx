/**
 * Company Subscription Detail page.
 *
 * Tenant company subscriptions screen mounted under AppShell at /admin/company-subscriptions.
 *
 * Responsibilities:
 * - Load and render primary company subscriptions data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/company-subscriptions
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import {
  COMPANY_SUBSCRIPTION_CADENCE_UNITS,
  type CompanySubscriptionStatus
} from "@starter/shared";
import { Check, ChevronDown, ChevronLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { type ShellHeaderOverride, useShellHeader } from "../../components/ShellHeaderContext.js";
import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { formatFinanceAmount } from "../../lib/currencyFormat.js";
import { CompanySubscriptionPlanFormModal } from "./CompanySubscriptionPlanFormModal.js";
import { CompanySubscriptionProviderDocumentsCard } from "./CompanySubscriptionProviderDocumentsCard.js";
import { CompanySubscriptionProviderFormFields } from "./CompanySubscriptionProviderFormFields.js";
import { CompanySubscriptionPlanSeatsTable } from "./CompanySubscriptionPlanSeatsTable.js";
import { CompanySubscriptionSeatFormModal } from "./CompanySubscriptionSeatFormModal.js";
import {
  amountMinorToFormMajorString,
  buildProviderSaveBody,
  cadenceLabel,
  csActionBtnAddClass,
  csActionBtnCancelClass,
  csActionBtnConfirmClass,
  csActionBtnDeleteClass,
  csActionBtnEditClass,
  csActionConfirmMaskInnerClass,
  csActionConfirmMessageWrapClass,
  csActionRailForCount,
  csActionsTdClass,
  csSectionClass,
  defaultSingularProviderBillingFields,
  isSeatedCompanySubscription,
  isSingularCompanySubscription,
  readApiErrorMessage
} from "./companySubscriptionsUi.js";
import {
  COMPANY_SUBSCRIPTIONS_API,
  type CompanySubscriptionPlanRow,
  type CompanySubscriptionProviderRow,
  type CompanySubscriptionSeatRow,
  type ProviderDetailResponse,
  useCompanySubscriptionsApi
} from "./useCompanySubscriptionsApi.js";

type PlanModalState =
  | { kind: "create" }
  | { kind: "edit"; plan: CompanySubscriptionPlanRow };

type SeatModalState =
  | { kind: "create"; planId: string }
  | { kind: "edit"; planId: string; seat: CompanySubscriptionSeatRow };

/** Route page component for tenant company subscriptions under AppShell. */
export const CompanySubscriptionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { authedFetch } = useCompanySubscriptionsApi();
  const { canWrite, canDelete } = useModulePermissions("company_subscriptions");
  const { preferences: tenantPrefs } = useTenantDisplayPreferences();
  const { formatDate, formatDateTime } = useUserDisplayDatetime();
  const listLocale = tenantPrefs?.locale ?? "en-US";
  const currencyFormat = tenantPrefs?.currencyFormat ?? null;

  const [provider, setProvider] = useState<CompanySubscriptionProviderRow | null>(null);
  const [plans, setPlans] = useState<{ plan: CompanySubscriptionPlanRow; seats: CompanySubscriptionSeatRow[] }[]>([]);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [planModal, setPlanModal] = useState<PlanModalState | null>(null);
  const [seatModal, setSeatModal] = useState<SeatModalState | null>(null);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [confirmDeleteSeatId, setConfirmDeleteSeatId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [deletingSeatId, setDeletingSeatId] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    name: "",
    subscriptionKind: "singular" as CompanySubscriptionProviderRow["subscriptionKind"],
    vendorName: "",
    category: "",
    description: "",
    status: "active" as CompanySubscriptionStatus,
    contractStartDate: "",
    renewalDate: "",
    contractEndDate: "",
    cadenceKind: "monthly" as CompanySubscriptionProviderRow["cadenceKind"],
    cadenceIntervalCount: "1",
    cadenceIntervalUnit: "month" as (typeof COMPANY_SUBSCRIPTION_CADENCE_UNITS)[number],
    amountMajor: "",
    currencyCode: "",
    notes: ""
  });

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    setLoading(true);
    try {
      const res = await authedFetch(`${COMPANY_SUBSCRIPTIONS_API}/providers/${encodeURIComponent(id)}`);
      if (!res?.ok) {
        if (res?.status === 404) setError("Provider not found.");
        else setError("Could not load provider.");
        return;
      }
      const json = (await res.json()) as ProviderDetailResponse;
      setProvider(json.provider);
      setPlans(json.plans ?? []);
      setExpandedPlans((prev) => {
        const next = new Set(prev);
        for (const p of json.plans ?? []) next.add(p.plan.id);
        return next.size > 0 ? next : prev;
      });
      const kind = json.provider.subscriptionKind ?? "singular";
      const cadenceKind = json.provider.cadenceKind;
      const cadenceIntervalCount =
        json.provider.cadenceIntervalCount != null ? String(json.provider.cadenceIntervalCount) : "1";
      const cadenceIntervalUnit =
        (json.provider.cadenceIntervalUnit as (typeof COMPANY_SUBSCRIPTION_CADENCE_UNITS)[number] | null) ?? "month";
      const billingDefaults =
        isSingularCompanySubscription(kind) && !json.provider.contractStartDate?.trim()
          ? defaultSingularProviderBillingFields({
              cadenceKind,
              cadenceIntervalCount,
              cadenceIntervalUnit
            })
          : null;
      setDraft({
        name: json.provider.name ?? "",
        subscriptionKind: kind,
        vendorName: json.provider.vendorName ?? "",
        category: json.provider.category ?? "",
        description: json.provider.description ?? "",
        status: json.provider.status,
        contractStartDate: billingDefaults?.contractStartDate ?? json.provider.contractStartDate ?? "",
        renewalDate: billingDefaults?.renewalDate ?? json.provider.renewalDate ?? "",
        contractEndDate: billingDefaults?.contractEndDate ?? json.provider.contractEndDate ?? "",
        cadenceKind,
        cadenceIntervalCount,
        cadenceIntervalUnit,
        amountMajor: amountMinorToFormMajorString(
          json.provider.amountMinor,
          tenantPrefs?.locale ?? "en-US",
          tenantPrefs?.currencyFormat ?? null
        ),
        currencyCode: json.provider.currencyCode ?? tenantPrefs?.preferredCurrency ?? "USD",
        notes: json.provider.notes ?? ""
      });
    } catch {
      setError("Could not load provider.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, id, tenantPrefs?.preferredCurrency, tenantPrefs?.locale, tenantPrefs?.currencyFormat]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isSeatedCompanySubscription(draft.subscriptionKind)) {
      setPlanModal(null);
      setSeatModal(null);
    }
  }, [draft.subscriptionKind]);

  const shellHeader = useMemo<ShellHeaderOverride | null>(
    () =>
      provider
        ? {
            title: provider.name,
            subtitle: provider.vendorName?.trim() || "Company subscription provider"
          }
        : null,
    [provider]
  );
  useShellHeader(shellHeader);

  const formatMoney = (minor: number | null | undefined, currency: string | null | undefined) => {
    if (minor == null) return "—";
    return formatFinanceAmount(
      minor,
      currency?.trim() || tenantPrefs?.preferredCurrency || "USD",
      listLocale,
      currencyFormat
    );
  };

  const saveProvider = useCallback(async () => {
    if (!id || !canWrite) return;
    setSaveError("");
    setSaving(true);
    try {
      const built = buildProviderSaveBody(draft, currencyFormat);
      if ("error" in built) {
        setSaveError(built.error);
        return;
      }
      const res = await authedFetch(`${COMPANY_SUBSCRIPTIONS_API}/providers/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(built.body)
      });
      if (!res?.ok) {
        setSaveError(res ? await readApiErrorMessage(res) : "Could not save provider.");
        return;
      }
      const json = (await res.json()) as { provider: CompanySubscriptionProviderRow };
      setProvider(json.provider);
    } catch {
      setSaveError("Could not save provider.");
    } finally {
      setSaving(false);
    }
  }, [authedFetch, canWrite, currencyFormat, draft, id]);

  const deletePlan = useCallback(
    async (planId: string) => {
      if (!id || !canDelete) return false;
      setDeletingPlanId(planId);
      try {
        const res = await authedFetch(
          `${COMPANY_SUBSCRIPTIONS_API}/providers/${encodeURIComponent(id)}/plans/${encodeURIComponent(planId)}`,
          { method: "DELETE" }
        );
        if (!res?.ok) return false;
        await load();
        return true;
      } catch {
        return false;
      } finally {
        setDeletingPlanId(null);
      }
    },
    [authedFetch, canDelete, id, load]
  );

  const deleteSeat = useCallback(
    async (planId: string, seatId: string) => {
      if (!id || !canDelete) return false;
      setDeletingSeatId(seatId);
      try {
        const res = await authedFetch(
          `${COMPANY_SUBSCRIPTIONS_API}/providers/${encodeURIComponent(id)}/plans/${encodeURIComponent(planId)}/seats/${encodeURIComponent(seatId)}`,
          { method: "DELETE" }
        );
        if (!res?.ok) return false;
        await load();
        return true;
      } catch {
        return false;
      } finally {
        setDeletingSeatId(null);
      }
    },
    [authedFetch, canDelete, id, load]
  );

  const onPlanSaved = useCallback(async () => {
    await load();
  }, [load]);

  const onSeatSaved = useCallback(async () => {
    await load();
  }, [load]);

  const togglePlan = (planId: string) => {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  if (loading) {
    return <p className="text-sm text-stone-500">Loading provider…</p>;
  }

  if (error || !provider || !id) {
    return (
      <div className="space-y-4">
        <Link
          to="/admin/company-subscriptions"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back to overview
        </Link>
        <p className="text-sm text-rose-600" role="alert">
          {error || "Provider not found."}
        </p>
      </div>
    );
  }

  const providerCurrency = (
    draft.currencyCode.trim() ||
    provider.currencyCode ||
    tenantPrefs?.preferredCurrency ||
    "USD"
  ).toUpperCase();
  const showPlansAndSeats = isSeatedCompanySubscription(draft.subscriptionKind);

  return (
    <div className="w-full min-w-0 space-y-6">
      <Link
        to="/admin/company-subscriptions"
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to overview
      </Link>

      <section className={csSectionClass} aria-labelledby="cs-provider-core-heading">
        <div className="mb-4">
          <h2 id="cs-provider-core-heading" className="text-sm font-semibold text-slate-900">
            Provider details
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {showPlansAndSeats
              ? "Vendor identity and currency; billing is configured per plan."
              : "Vendor identity, contract dates, and recurring billing."}
          </p>
        </div>
        <CompanySubscriptionProviderFormFields
          idPrefix="cs"
          values={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          disabled={!canWrite}
        />
        {provider.ownerEmployeeName ? (
          <p className="mt-4 text-sm text-slate-600">
            Owner: <span className="font-medium text-slate-900">{provider.ownerEmployeeName}</span>
          </p>
        ) : null}
        {canWrite ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveProvider()}
              className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saveError ? (
              <p className="text-sm text-rose-600" role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        ) : null}
        <p className="mt-4 text-xs text-slate-500">
          Updated {formatDateTime(provider.updatedAt)}
          {isSingularCompanySubscription(provider.subscriptionKind) ? (
            <>
              {" "}
              · Cadence {cadenceLabel(provider)} · {formatMoney(provider.amountMinor, provider.currencyCode)}
            </>
          ) : (
            <> · Seated subscription — billing configured per plan</>
          )}
        </p>
      </section>

      {showPlansAndSeats ? (
      <section className={csSectionClass} aria-labelledby="cs-plans-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="cs-plans-heading" className="text-sm font-semibold text-slate-900">
              Plans &amp; seats
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Subscription plans under this provider and optional seat assignments.
            </p>
          </div>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setPlanModal({ kind: "create" })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
            >
              <Plus className="h-4 w-4" aria-hidden strokeWidth={2} />
              Add plan
            </button>
          ) : null}
        </div>
        {plans.length === 0 ? (
          <p className="mt-4 text-sm italic text-slate-500">
            No plans yet.{canWrite ? " Add a plan to track pricing and seat assignments." : ""}
          </p>
        ) : (
          <ul className="mt-4 list-none space-y-2 p-0">
            {plans.map(({ plan, seats }) => {
              const open = expandedPlans.has(plan.id);
              const confirmingPlanDelete = confirmDeletePlanId === plan.id;
              const planDeleting = deletingPlanId === plan.id;
              const planActionCount = (canWrite ? 2 : 0) + (canDelete ? 1 : 0);
              return (
                <li key={plan.id} className="relative overflow-hidden rounded-xl border border-slate-200/90">
                  <div
                    className={[
                      "flex items-stretch bg-slate-50",
                      confirmingPlanDelete ? "relative z-[1]" : ""
                    ].join(" ")}
                  >
                    {confirmingPlanDelete && canDelete ? (
                      <>
                        <div className="relative min-w-0 flex-1 border-2 border-amber-400 border-r-0">
                          <div className={csActionConfirmMaskInnerClass} aria-hidden />
                          <div className={csActionConfirmMessageWrapClass}>
                            <p className="text-sm font-medium text-slate-800">
                              Delete plan &quot;{plan.name}&quot; and all its seats?
                            </p>
                          </div>
                        </div>
                        <div className={`${csActionsTdClass} flex shrink-0 self-stretch border-2 border-l-0 border-amber-400`}>
                          <div className={`${csActionRailForCount(2)} h-full min-h-full`}>
                            <button
                              type="button"
                              title="Cancel"
                              aria-label="Cancel delete plan"
                              disabled={planDeleting}
                              onClick={() => setConfirmDeletePlanId(null)}
                              className={csActionBtnCancelClass}
                            >
                              <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              title="Confirm delete plan"
                              aria-label={`Confirm delete plan ${plan.name}`}
                              disabled={planDeleting}
                              onClick={() => void deletePlan(plan.id).then((ok) => ok && setConfirmDeletePlanId(null))}
                              className={csActionBtnConfirmClass}
                            >
                              <Check className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => togglePlan(plan.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-slate-100/80"
                          aria-expanded={open}
                        >
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-900">{plan.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {isSeatedCompanySubscription(provider.subscriptionKind) ? (
                                <>
                                  {cadenceLabel(plan)} · {formatMoney(plan.amountMinor, plan.currencyCode)}/seat
                                  {plan.renewalDate ? ` · Renews ${formatDate(plan.renewalDate)}` : ""}
                                  {" · "}
                                </>
                              ) : null}
                              {seats.length} seat{seats.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </button>
                        {planActionCount > 0 ? (
                          <div className={`${csActionsTdClass} flex shrink-0 self-stretch border-slate-200/90`}>
                            <div className={`${csActionRailForCount(planActionCount)} h-full min-h-full`}>
                              {canWrite ? (
                                <>
                                  <button
                                    type="button"
                                    title="Edit plan"
                                    aria-label={`Edit ${plan.name}`}
                                    disabled={planDeleting}
                                    onClick={() => setPlanModal({ kind: "edit", plan })}
                                    className={csActionBtnEditClass}
                                  >
                                    <Pencil className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Add seat"
                                    aria-label={`Add seat to ${plan.name}`}
                                    disabled={planDeleting}
                                    onClick={() => setSeatModal({ kind: "create", planId: plan.id })}
                                    className={csActionBtnAddClass}
                                  >
                                    <Plus className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                                  </button>
                                </>
                              ) : null}
                              {canDelete ? (
                                <button
                                  type="button"
                                  title="Delete plan"
                                  aria-label={`Delete ${plan.name}`}
                                  disabled={planDeleting || (confirmDeletePlanId != null && confirmDeletePlanId !== plan.id)}
                                  onClick={() => setConfirmDeletePlanId(plan.id)}
                                  className={csActionBtnDeleteClass}
                                >
                                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                  {open ? (
                    <div className="border-t border-slate-200/90 bg-white px-4 py-3">
                      {plan.sku ? (
                        <p className="mb-2 text-xs text-slate-500">
                          SKU: <span className="font-medium text-slate-700">{plan.sku}</span>
                          {plan.seatCount != null ? (
                            <>
                              {" "}
                              · Licensed seats: <span className="font-medium text-slate-700">{plan.seatCount}</span>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                      <CompanySubscriptionPlanSeatsTable
                        planId={plan.id}
                        planName={plan.name}
                        seats={seats}
                        canWrite={canWrite}
                        canDelete={canDelete}
                        formatDate={formatDate}
                        confirmDeleteSeatId={confirmDeleteSeatId}
                        deletingSeatId={deletingSeatId}
                        onConfirmDeleteSeatId={setConfirmDeleteSeatId}
                        onDeleteSeat={deleteSeat}
                        onEditSeat={(seat) => setSeatModal({ kind: "edit", planId: plan.id, seat })}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      ) : null}

      <CompanySubscriptionProviderDocumentsCard providerId={provider.id} />

      {showPlansAndSeats ? (
      <>
      <CrmModal
        title={planModal?.kind === "edit" ? "Edit plan" : "Add plan"}
        open={planModal != null}
        onClose={() => setPlanModal(null)}
        wide
      >
        {planModal ? (
          <CompanySubscriptionPlanFormModal
            providerId={id}
            providerCurrency={providerCurrency}
            billingOnPlan={isSeatedCompanySubscription(draft.subscriptionKind)}
            defaultCadenceKind={
              isSeatedCompanySubscription(draft.subscriptionKind)
                ? provider.cadenceKind
                : draft.cadenceKind
            }
            mode={planModal.kind}
            plan={planModal.kind === "edit" ? planModal.plan : undefined}
            onClose={() => setPlanModal(null)}
            onSaved={() => void onPlanSaved()}
          />
        ) : null}
      </CrmModal>

      <CrmModal
        title={seatModal?.kind === "edit" ? "Edit seat" : "Add seat"}
        open={seatModal != null}
        onClose={() => setSeatModal(null)}
      >
        {seatModal ? (
          <CompanySubscriptionSeatFormModal
            providerId={id}
            planId={seatModal.planId}
            mode={seatModal.kind}
            seat={seatModal.kind === "edit" ? seatModal.seat : undefined}
            onClose={() => setSeatModal(null)}
            onSaved={() => void onSeatSaved()}
          />
        ) : null}
      </CrmModal>
      </>
      ) : null}
    </div>
  );
};
