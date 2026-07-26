/**
 * Invoicing Quote Form page.
 *
 * Tenant invoicing and quoting screen mounted under AppShell at /admin/invoicing.
 *
 * Responsibilities:
 * - Load and render primary invoicing and quoting data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/invoicing
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import {
  DEFAULT_INVOICING_TAX_RATE_OPTIONS,
  defaultInvoicingTaxRateBps,
  defaultQuoteExpiryDate,
  isEditableQuoteStatus,
  type InvoicingTaxRateOption
} from "@starter/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import { useCrmModuleAvailability } from "../crm/useCrmModuleAvailability.js";
import { InvoicingDocumentFormFields } from "./InvoicingDocumentFormFields.js";
import { InvoicingLineItemsEditor } from "./InvoicingLineItemsEditor.js";
import {
  emptyLineDraft,
  lineDraftFromApi,
  lineDraftToInput,
  readInvoicingApiError,
  invBackLinkClass,
  type InvoicingLineDraft
} from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

const today = () => new Date().toISOString().slice(0, 10);

/** Route page component for tenant invoicing & quoting under AppShell. */
export const InvoicingQuoteFormPage = () => {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const isNew = !quoteId;
  const { authedFetch } = useInvoicingApi();
  const { canWrite } = useModulePermissions("invoicing");
  const { crmEnabled } = useCrmModuleAvailability();
  const { preferences: tenantPrefs } = useTenantDisplayPreferences();
  const { amountFormatters } = useInvoicingDisplayFormatters();
  const preferredCurrency = tenantPrefs?.preferredCurrency ?? "USD";
  const appliedPreferredCurrency = useRef(false);

  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [currencyCode, setCurrencyCode] = useState(preferredCurrency);
  const [documentDate, setDocumentDate] = useState(today());
  const [quoteExpiryDate, setQuoteExpiryDate] = useState(() => defaultQuoteExpiryDate(today()));
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [crmOrganizationId, setCrmOrganizationId] = useState("");
  const [crmOrganizationName, setCrmOrganizationName] = useState<string | null>(null);
  const [crmContactId, setCrmContactId] = useState("");
  const [crmContactName, setCrmContactName] = useState<string | null>(null);
  const [taxRateOptions, setTaxRateOptions] = useState<InvoicingTaxRateOption[]>(
    DEFAULT_INVOICING_TAX_RATE_OPTIONS
  );
  const [lines, setLines] = useState<InvoicingLineDraft[]>(() => [
    emptyLineDraft(defaultInvoicingTaxRateBps(DEFAULT_INVOICING_TAX_RATE_OPTIONS))
  ]);

  useEffect(() => {
    let cancelled = false;
    const loadConfig = async () => {
      const res = await authedFetch("/tenant/invoicing/configuration");
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as {
        taxRateOptions?: InvoicingTaxRateOption[];
      };
      if (cancelled) return;
      const opts = json.taxRateOptions?.length ? json.taxRateOptions : DEFAULT_INVOICING_TAX_RATE_OPTIONS;
      setTaxRateOptions(opts);
    };
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  const loadQuote = useCallback(async () => {
    if (isNew || !quoteId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/quotes/${quoteId}`);
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Quote not found."));
        return;
      }
      const json = (await res.json()) as {
        quote: {
          status: string;
          currencyCode: string;
          documentDate: string;
          quoteExpiryDate: string | null;
          notes: string;
          internalNotes: string;
          crmOrganizationId: string | null;
          crmContactId: string | null;
          customerSnapshot: { organizationName?: string; contactName?: string | null };
          lineItems: {
            description: string;
            quantity: number;
            unitLabel: string;
            unitPriceMinor: number;
            discountMinor: number;
            taxRateBps: number | null;
            catalogItemId: string | null;
          }[];
        };
      };
      const q = json.quote;
      if (!isEditableQuoteStatus(q.status as "quote_draft")) {
        setError("This quote can no longer be edited.");
        return;
      }
      setCurrencyCode(q.currencyCode);
      setDocumentDate(q.documentDate);
      setQuoteExpiryDate(
        q.quoteExpiryDate?.trim() ? q.quoteExpiryDate : defaultQuoteExpiryDate(q.documentDate)
      );
      setNotes(q.notes ?? "");
      setInternalNotes(q.internalNotes ?? "");
      setCrmOrganizationId(q.crmOrganizationId ?? "");
      setCrmOrganizationName(q.customerSnapshot?.organizationName ?? null);
      setCrmContactId(q.crmContactId ?? "");
      setCrmContactName(q.customerSnapshot?.contactName ?? null);
      setLines(
        q.lineItems.length > 0
          ? q.lineItems.map((li) =>
              lineDraftFromApi({
                description: li.description,
                quantity: li.quantity,
                unitLabel: li.unitLabel,
                unitPriceMinor: li.unitPriceMinor,
                discountMinor: li.discountMinor,
                taxRateBps: li.taxRateBps,
                catalogItemId: li.catalogItemId
              }, amountFormatters)
            )
          : [emptyLineDraft(defaultInvoicingTaxRateBps(taxRateOptions))]
      );
    } catch {
      setError("Could not load quote.");
    } finally {
      setLoading(false);
    }
  }, [amountFormatters, authedFetch, taxRateOptions, isNew, quoteId]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  useEffect(() => {
    if (!isNew || !tenantPrefs || appliedPreferredCurrency.current) return;
    appliedPreferredCurrency.current = true;
    setCurrencyCode(preferredCurrency);
  }, [isNew, preferredCurrency, tenantPrefs]);

  useEffect(() => {
    if (!isNew) return;
    setQuoteExpiryDate(defaultQuoteExpiryDate(documentDate));
  }, [documentDate, isNew]);

  const save = async () => {
    if (!canWrite) return;
    setBusy(true);
    setError("");
    const lineItems = lines
      .map((line) => lineDraftToInput(line, amountFormatters))
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (lineItems.length === 0) {
      setError("Add at least one valid line item with description and unit price.");
      setBusy(false);
      return;
    }
    const body = {
      currencyCode,
      documentDate,
      quoteExpiryDate: quoteExpiryDate.trim() || defaultQuoteExpiryDate(documentDate),
      notes,
      internalNotes,
      crmOrganizationId: crmOrganizationId.trim() ? crmOrganizationId : null,
      crmContactId: crmContactId.trim() ? crmContactId : null,
      lineItems
    };
    try {
      const res = isNew
        ? await authedFetch("/tenant/invoicing/quotes", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
          })
        : await authedFetch(`/tenant/invoicing/quotes/${quoteId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
          });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, isNew ? "Could not create quote." : "Could not save quote."));
        return;
      }
      const json = (await res.json()) as { quote: { id: string } };
      navigate(`/admin/invoicing/quotes/${json.quote.id}`);
    } catch {
      setError(isNew ? "Could not create quote." : "Could not save quote.");
    } finally {
      setBusy(false);
    }
  };

  if (!canWrite) {
    return <p className="text-sm text-stone-600">You do not have permission to edit quotes.</p>;
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;

  return (
    <div className="w-full min-w-0 space-y-6">
      <Link
        to={isNew ? "/admin/invoicing" : `/admin/invoicing/quotes/${quoteId}`}
        className={invBackLinkClass}
      >
        {isNew ? "← All documents" : "← Quote"}
      </Link>

      {crmEnabled === false ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          CRM is disabled platform-wide. You can save drafts, but you need CRM enabled and a linked organization
          before promoting to an offer.
        </p>
      ) : null}

      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
        <InvoicingDocumentFormFields
          crmEnabled={crmEnabled === true}
          currencyCode={currencyCode}
          onCurrencyChange={setCurrencyCode}
          documentDate={documentDate}
          onDocumentDateChange={setDocumentDate}
          expiryDate={quoteExpiryDate}
          onExpiryDateChange={setQuoteExpiryDate}
          expiryLabel="Quote expiry"
          dualQuoteExpiry
          notes={notes}
          onNotesChange={setNotes}
          internalNotes={internalNotes}
          onInternalNotesChange={setInternalNotes}
          crmOrganizationId={crmOrganizationId}
          crmOrganizationName={crmOrganizationName}
          crmContactId={crmContactId}
          crmContactName={crmContactName}
          onOrganizationChange={(id, name) => {
            setCrmOrganizationId(id);
            setCrmOrganizationName(name);
            setCrmContactId("");
            setCrmContactName(null);
          }}
          onContactChange={(id, name) => {
            setCrmContactId(id);
            setCrmContactName(name);
          }}
          lines={lines}
        />
      </div>

      <InvoicingLineItemsEditor
        currencyCode={currencyCode}
        taxRateOptions={taxRateOptions}
        lines={lines}
        onChange={setLines}
      />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          onClick={() => void save()}
        >
          {busy ? "Saving…" : isNew ? "Create quote" : "Save changes"}
        </button>
        <Link
          to={isNew ? "/admin/invoicing" : `/admin/invoicing/quotes/${quoteId}`}
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
};
