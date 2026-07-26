/**
 * Invoicing Configuration page.
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
  INVOICING_DOCUMENT_THEME_COLORS,
  invoicingDocumentThemeColorLabel,
  type InvoicingDocumentThemeColor,
  type InvoicingEmailMomentApiRow,
  type InvoicingEmailMomentKey,
  type InvoicingIssuerSnapshot,
  type InvoicingTaxRateOption
} from "@starter/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext.js";
import { Switch } from "../../components/Switch.js";
import { InvoicingTaxRateOptionsEditor } from "./InvoicingTaxRateOptionsEditor.js";
import { invDataTableClass, invDocumentPrintTheme, invFieldClass, invLabelClass, invTableHeadClass, readInvoicingApiError } from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingCompanyLogoUrl } from "./useInvoicingCompanyLogo.js";

type Config = {
  allowDirectQuoteToInvoice: boolean;
  quoteNumberPrefix: string;
  offerNumberPrefix: string;
  invoiceNumberPrefix: string;
  taxRateOptions: InvoicingTaxRateOption[];
  issuerSnapshot: InvoicingIssuerSnapshot;
  defaultQuoteTermsText: string;
  defaultOfferTermsText: string;
  defaultInvoiceTermsText: string;
  paymentReminderFirstOffsetDays?: number;
  paymentReminderSecondOffsetDays?: number;
  paymentRemindersEnabled?: boolean;
  emailMoments?: InvoicingEmailMomentApiRow[];
  autoExpireOffersEnabled?: boolean;
  quoteExpiryWarningsEnabled?: boolean;
  devPurgeInvoicingDocumentsEnabled?: boolean;
  documentThemeColor: InvoicingDocumentThemeColor;
  hasCompanyLogo: boolean;
  updatedAt: string;
};

type PrefixField = "quoteNumberPrefix" | "offerNumberPrefix" | "invoiceNumberPrefix";

type IssuerField = keyof InvoicingIssuerSnapshot;

type DefaultTermsField = "defaultQuoteTermsText" | "defaultOfferTermsText" | "defaultInvoiceTermsText";

const PREFIX_FIELDS: { key: PrefixField; label: string; inputId: string }[] = [
  { key: "quoteNumberPrefix", label: "Quote prefix", inputId: "invoicing-config-quote-prefix" },
  { key: "offerNumberPrefix", label: "Offer prefix", inputId: "invoicing-config-offer-prefix" },
  { key: "invoiceNumberPrefix", label: "Invoice prefix", inputId: "invoicing-config-invoice-prefix" }
];

const ISSUER_FIELDS: {
  key: IssuerField;
  label: string;
  inputId: string;
  maxLength: number;
  inputType?: "email" | "tel";
  multiline?: boolean;
}[] = [
  { key: "companyName", label: "Company name", inputId: "invoicing-config-company-name", maxLength: 512 },
  { key: "companyEmail", label: "Email", inputId: "invoicing-config-company-email", maxLength: 320, inputType: "email" },
  { key: "companyPhone", label: "Phone", inputId: "invoicing-config-company-phone", maxLength: 64, inputType: "tel" },
  {
    key: "companyAddress",
    label: "Company address",
    inputId: "invoicing-config-company-address",
    maxLength: 2000,
    multiline: true
  },
  {
    key: "vatIdentificationNumber",
    label: "VAT identification number",
    inputId: "invoicing-config-vat-id",
    maxLength: 64
  },
  {
    key: "chamberOfCommerceNumber",
    label: "Chamber of Commerce number",
    inputId: "invoicing-config-coc-number",
    maxLength: 64
  },
  {
    key: "bankAccountNumber",
    label: "Bank account number",
    inputId: "invoicing-config-bank-account",
    maxLength: 64
  }
];

const DEFAULT_TERMS_FIELDS: { key: DefaultTermsField; label: string; inputId: string }[] = [
  {
    key: "defaultQuoteTermsText",
    label: "Quote default payment terms & conditions",
    inputId: "invoicing-config-quote-terms"
  },
  {
    key: "defaultOfferTermsText",
    label: "Offer default payment terms & conditions",
    inputId: "invoicing-config-offer-terms"
  },
  {
    key: "defaultInvoiceTermsText",
    label: "Invoice default payment terms & conditions",
    inputId: "invoicing-config-invoice-terms"
  }
];

/** Route page component for tenant invoicing & quoting under AppShell. */
export const InvoicingConfigurationPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { authedFetch } = useInvoicingApi();
  const [config, setConfig] = useState<Config | null>(null);
  const [prefixDraft, setPrefixDraft] = useState<Record<PrefixField, string>>({
    quoteNumberPrefix: "",
    offerNumberPrefix: "",
    invoiceNumberPrefix: ""
  });
  const [issuerDraft, setIssuerDraft] = useState<Record<IssuerField, string>>({
    companyName: "",
    companyEmail: "",
    companyPhone: "",
    companyAddress: "",
    vatIdentificationNumber: "",
    chamberOfCommerceNumber: "",
    bankAccountNumber: ""
  });
  const [defaultTermsDraft, setDefaultTermsDraft] = useState<Record<DefaultTermsField, string>>({
    defaultQuoteTermsText: "",
    defaultOfferTermsText: "",
    defaultInvoiceTermsText: ""
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggleBusy, setToggleBusy] = useState(false);
  const [prefixBusy, setPrefixBusy] = useState<PrefixField | null>(null);
  const [issuerBusy, setIssuerBusy] = useState<IssuerField | null>(null);
  const [defaultTermsBusy, setDefaultTermsBusy] = useState<DefaultTermsField | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [emailMomentBusy, setEmailMomentBusy] = useState<InvoicingEmailMomentKey | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const companyLogoUrl = useInvoicingCompanyLogoUrl(Boolean(config?.hasCompanyLogo), config?.updatedAt ?? "none");
  const isAdmin = user?.role === "tenant_admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/tenant/invoicing/configuration");
      if (!res.ok) {
        setError("Could not load configuration.");
        return;
      }
      const json = (await res.json()) as Config;
      const next = {
        ...json,
        issuerSnapshot: json.issuerSnapshot ?? {},
        taxRateOptions: json.taxRateOptions?.length ? json.taxRateOptions : DEFAULT_INVOICING_TAX_RATE_OPTIONS,
        documentThemeColor: json.documentThemeColor ?? "purple",
        hasCompanyLogo: Boolean(json.hasCompanyLogo)
      };
      setConfig(next);
      setPrefixDraft({
        quoteNumberPrefix: next.quoteNumberPrefix,
        offerNumberPrefix: next.offerNumberPrefix,
        invoiceNumberPrefix: next.invoiceNumberPrefix
      });
      setIssuerDraft({
        companyName: next.issuerSnapshot?.companyName ?? "",
        companyEmail: next.issuerSnapshot?.companyEmail ?? "",
        companyPhone: next.issuerSnapshot?.companyPhone ?? "",
        companyAddress: next.issuerSnapshot?.companyAddress ?? "",
        vatIdentificationNumber: next.issuerSnapshot?.vatIdentificationNumber ?? "",
        chamberOfCommerceNumber: next.issuerSnapshot?.chamberOfCommerceNumber ?? "",
        bankAccountNumber: next.issuerSnapshot?.bankAccountNumber ?? ""
      });
      setDefaultTermsDraft({
        defaultQuoteTermsText: next.defaultQuoteTermsText ?? "",
        defaultOfferTermsText: next.defaultOfferTermsText ?? "",
        defaultInvoiceTermsText: next.defaultInvoiceTermsText ?? ""
      });
    } catch {
      setError("Could not load configuration.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!purgeConfirm) return;
    const id = window.setTimeout(() => setPurgeConfirm(false), 5000);
    return () => window.clearTimeout(id);
  }, [purgeConfirm]);

  const saveConfig = async (
    patch: Omit<Partial<Config>, "emailMoments"> & {
      issuerSnapshot?: Partial<InvoicingIssuerSnapshot>;
      emailMoments?: Partial<Record<InvoicingEmailMomentKey, boolean>>;
    }
  ) => {
    if (!isAdmin) return false;
    const res = await authedFetch("/tenant/invoicing/configuration", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      setError(await readInvoicingApiError(res, "Could not save."));
      return false;
    }
    setError("");
    const json = (await res.json()) as Config;
    setConfig((c) =>
      c
        ? {
            ...c,
            ...json,
            issuerSnapshot: json.issuerSnapshot ?? c.issuerSnapshot,
            taxRateOptions: json.taxRateOptions?.length ? json.taxRateOptions : c.taxRateOptions,
            documentThemeColor: json.documentThemeColor ?? c.documentThemeColor,
            hasCompanyLogo: json.hasCompanyLogo ?? c.hasCompanyLogo,
            emailMoments: json.emailMoments ?? c.emailMoments,
            paymentRemindersEnabled: json.paymentRemindersEnabled ?? c.paymentRemindersEnabled
          }
        : c
    );
    return true;
  };

  const uploadLogo = async (file: File) => {
    if (!isAdmin) return;
    setLogoBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await authedFetch("/tenant/invoicing/configuration/logo", { method: "POST", body: fd });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not upload logo."));
        return;
      }
      const json = (await res.json()) as Config;
      setConfig((c) => (c ? { ...c, ...json, hasCompanyLogo: Boolean(json.hasCompanyLogo) } : c));
    } catch {
      setError("Could not upload logo.");
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    if (!isAdmin) return;
    setLogoBusy(true);
    setError("");
    try {
      const res = await authedFetch("/tenant/invoicing/configuration/logo", { method: "DELETE" });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not remove logo."));
        return;
      }
      const json = (await res.json()) as Config;
      setConfig((c) => (c ? { ...c, ...json, hasCompanyLogo: false } : c));
    } catch {
      setError("Could not remove logo.");
    } finally {
      setLogoBusy(false);
    }
  };

  const saveThemeColor = async (next: InvoicingDocumentThemeColor) => {
    if (!config || !isAdmin || next === config.documentThemeColor) return;
    setThemeBusy(true);
    try {
      await saveConfig({ documentThemeColor: next });
    } finally {
      setThemeBusy(false);
    }
  };

  const saveDirect = async (next: boolean) => {
    setToggleBusy(true);
    try {
      await saveConfig({ allowDirectQuoteToInvoice: next });
    } finally {
      setToggleBusy(false);
    }
  };

  const savePrefix = async (field: PrefixField) => {
    if (!config || !isAdmin) return;
    const trimmed = prefixDraft[field].trim();
    if (!trimmed) {
      setPrefixDraft((d) => ({ ...d, [field]: config[field] }));
      setError("Prefix cannot be empty.");
      return;
    }
    if (trimmed.length > 16) {
      setPrefixDraft((d) => ({ ...d, [field]: config[field] }));
      setError("Prefix must be 16 characters or fewer.");
      return;
    }
    if (trimmed === config[field]) return;

    setPrefixBusy(field);
    try {
      const ok = await saveConfig({ [field]: trimmed });
      if (ok) {
        setPrefixDraft((d) => ({ ...d, [field]: trimmed }));
      } else {
        setPrefixDraft((d) => ({ ...d, [field]: config[field] }));
      }
    } finally {
      setPrefixBusy(null);
    }
  };

  const saveIssuerField = async (field: IssuerField) => {
    if (!config || !isAdmin) return;
    const trimmed = issuerDraft[field].trim();
    const current = config.issuerSnapshot?.[field] ?? "";
    if (trimmed === current) return;

    setIssuerBusy(field);
    try {
      const ok = await saveConfig({ issuerSnapshot: { [field]: trimmed } });
      if (ok) {
        setIssuerDraft((d) => ({ ...d, [field]: trimmed }));
      } else {
        setIssuerDraft((d) => ({ ...d, [field]: current }));
      }
    } finally {
      setIssuerBusy(null);
    }
  };

  const saveDefaultTermsField = async (field: DefaultTermsField) => {
    if (!config || !isAdmin) return;
    const trimmed = defaultTermsDraft[field];
    const current = config[field] ?? "";
    if (trimmed === current) return;

    setDefaultTermsBusy(field);
    try {
      const ok = await saveConfig({ [field]: trimmed });
      if (ok) {
        setDefaultTermsDraft((d) => ({ ...d, [field]: trimmed }));
      } else {
        setDefaultTermsDraft((d) => ({ ...d, [field]: current }));
      }
    } finally {
      setDefaultTermsBusy(null);
    }
  };

  const purgeDocuments = async () => {
    if (!isAdmin || !config?.devPurgeInvoicingDocumentsEnabled) return;
    setPurgeBusy(true);
    setError("");
    try {
      const res = await authedFetch("/tenant/invoicing/testing/purge-documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not purge invoicing documents."));
        return;
      }
      setPurgeConfirm(false);
      navigate("/admin/invoicing");
    } catch {
      setError("Could not purge invoicing documents.");
    } finally {
      setPurgeBusy(false);
    }
  };

  const saveEmailMoment = async (key: InvoicingEmailMomentKey, enabled: boolean) => {
    if (!config || !isAdmin) return;
    setEmailMomentBusy(key);
    try {
      const ok = await saveConfig({ emailMoments: { [key]: enabled } });
      if (ok) {
        setConfig((c) =>
          c
            ? {
                ...c,
                emailMoments: c.emailMoments?.map((moment) =>
                  moment.key === key ? { ...moment, enabled } : moment
                ),
                ...(key === "payment_reminder" ? { paymentRemindersEnabled: enabled } : {})
              }
            : c
        );
      }
    } finally {
      setEmailMomentBusy(null);
    }
  };

  const quotingEmailMoments = config?.emailMoments?.filter((moment) => moment.category === "quoting") ?? [];
  const invoicingEmailMoments = config?.emailMoments?.filter((moment) => moment.category === "invoicing") ?? [];

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;

  return (
    <div className="w-full min-w-0 space-y-6">
      {config ? (
        <>
          <div className="w-full space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
            <h3 className="text-sm font-semibold text-slate-900">Document numbering</h3>
            <p className="text-xs text-stone-500">
              Quotes are numbered as{" "}
              <span className="font-mono text-stone-600">{"{prefix}-{year}-{random id}"}</span> when created and keep
              that number when promoted. Offers and invoices use sequential numbering with the configured prefixes.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PREFIX_FIELDS.map(({ key, label, inputId }) => (
                <div key={key}>
                  <label htmlFor={inputId} className={invLabelClass}>
                    {label}
                  </label>
                  <input
                    id={inputId}
                    className={invFieldClass}
                    value={prefixDraft[key]}
                    disabled={!isAdmin || prefixBusy === key}
                    maxLength={16}
                    onChange={(e) => {
                      setPrefixDraft((d) => ({ ...d, [key]: e.target.value }));
                      if (error) setError("");
                    }}
                    onBlur={() => void savePrefix(key)}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Allow direct quote → invoice</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  When enabled, quotes can be converted to invoices without creating an offer first.
                </p>
              </div>
              <Switch
                id="invoicing-config-direct-quote-invoice"
                checked={config.allowDirectQuoteToInvoice}
                disabled={!isAdmin || toggleBusy}
                aria-busy={toggleBusy}
                aria-label={
                  config.allowDirectQuoteToInvoice
                    ? "Allow direct quote to invoice, on"
                    : "Allow direct quote to invoice, off"
                }
                onCheckedChange={(next) => void saveDirect(next)}
              />
            </div>

            {!isAdmin ? (
              <p className="text-sm text-stone-500">Only tenant administrators can change configuration.</p>
            ) : null}
          </div>

          <div className="w-full space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Company details</h3>
              <p className="mt-1 text-xs text-stone-500">
                Shown on quotes, offers, and invoices. New documents snapshot these values when created or promoted.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ISSUER_FIELDS.map(({ key, label, inputId, maxLength, inputType, multiline }) => (
                <div
                  key={key}
                  className={
                    key === "companyAddress"
                      ? "sm:col-span-2 lg:col-span-3"
                      : key === "companyName"
                        ? "sm:col-span-2 lg:col-span-1"
                        : undefined
                  }
                >
                  <label htmlFor={inputId} className={invLabelClass}>
                    {label}
                  </label>
                  {multiline ? (
                    <textarea
                      id={inputId}
                      rows={3}
                      className={`${invFieldClass} min-h-[5.5rem] resize-y`}
                      value={issuerDraft[key]}
                      disabled={!isAdmin || issuerBusy === key}
                      maxLength={maxLength}
                      onChange={(e) => {
                        setIssuerDraft((d) => ({ ...d, [key]: e.target.value }));
                        if (error) setError("");
                      }}
                      onBlur={() => void saveIssuerField(key)}
                    />
                  ) : (
                    <input
                      id={inputId}
                      type={inputType ?? "text"}
                      className={invFieldClass}
                      value={issuerDraft[key]}
                      disabled={!isAdmin || issuerBusy === key}
                      maxLength={maxLength}
                      onChange={(e) => {
                        setIssuerDraft((d) => ({ ...d, [key]: e.target.value }));
                        if (error) setError("");
                      }}
                      onBlur={() => void saveIssuerField(key)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="w-full space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Document styling</h3>
              <p className="mt-1 text-xs text-stone-500">
                Optional company logo and base accent color for printable quotes, offers, and invoices.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <p className={invLabelClass}>Company logo</p>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <div
                    className={`flex h-20 w-32 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 ${invDocumentPrintTheme(config.documentThemeColor).logoBlock}`}
                  >
                    {companyLogoUrl ? (
                      <img src={companyLogoUrl} alt="Company logo preview" className="max-h-16 max-w-[7rem] object-contain" />
                    ) : (
                      <span className="text-xs text-white/80">No logo</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="sr-only"
                      disabled={!isAdmin || logoBusy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void uploadLogo(file);
                      }}
                    />
                    <button
                      type="button"
                      disabled={!isAdmin || logoBusy}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-60"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {logoBusy ? "Uploading…" : config.hasCompanyLogo ? "Replace logo" : "Upload logo"}
                    </button>
                    {config.hasCompanyLogo ? (
                      <button
                        type="button"
                        disabled={!isAdmin || logoBusy}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        onClick={() => void removeLogo()}
                      >
                        Remove logo
                      </button>
                    ) : null}
                    <p className="max-w-sm text-xs text-stone-500">
                      JPEG, PNG, WebP, or GIF up to 5 MB. Without a logo, documents keep the company initials block when a company name is set.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className={invLabelClass}>Base color</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {INVOICING_DOCUMENT_THEME_COLORS.map((color) => {
                    const active = config.documentThemeColor === color;
                    const theme = invDocumentPrintTheme(color);
                    return (
                      <button
                        key={color}
                        type="button"
                        disabled={!isAdmin || themeBusy}
                        aria-pressed={active}
                        className={[
                          "flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          active
                            ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200"
                            : "border-stone-200 bg-white hover:bg-stone-50"
                        ].join(" ")}
                        onClick={() => void saveThemeColor(color)}
                      >
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${theme.tableHeader}`}
                          aria-hidden
                        >
                          <span className={`h-3 w-3 rounded-sm ${theme.logoBlock}`} />
                        </span>
                        <span className="font-medium text-slate-900">{invoicingDocumentThemeColorLabel(color)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="w-full space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Default payment terms &amp; conditions</h3>
              <p className="mt-1 text-xs text-stone-500">
                Shown on customer-facing quotes, offers, and invoices. Edit these under Invoicing configuration only —
                they cannot be changed on individual documents.
              </p>
            </div>

            <div className="grid gap-4">
              {DEFAULT_TERMS_FIELDS.map(({ key, label, inputId }) => (
                <div key={key}>
                  <label htmlFor={inputId} className={invLabelClass}>
                    {label}
                  </label>
                  <textarea
                    id={inputId}
                    rows={4}
                    className={`${invFieldClass} mt-1 min-h-[6rem] resize-y`}
                    value={defaultTermsDraft[key]}
                    disabled={!isAdmin || defaultTermsBusy === key}
                    maxLength={16000}
                    onChange={(e) => {
                      setDefaultTermsDraft((d) => ({ ...d, [key]: e.target.value }));
                      if (error) setError("");
                    }}
                    onBlur={() => void saveDefaultTermsField(key)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="w-full space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Lifecycle automation</h3>
              <p className="mt-1 text-xs text-stone-500">
                Controls automatic offer expiry and quote validity warnings. Payment reminder timing is configured here;
                enable or disable the reminder email itself under Customer emails.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="invoicing-config-reminder-first-offset" className={invLabelClass}>
                  First reminder (days from due date)
                </label>
                <input
                  id="invoicing-config-reminder-first-offset"
                  type="number"
                  className={invFieldClass}
                  disabled={!isAdmin}
                  value={config.paymentReminderFirstOffsetDays ?? 0}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (!Number.isFinite(n)) return;
                    setConfig((c) => (c ? { ...c, paymentReminderFirstOffsetDays: n } : c));
                  }}
                  onBlur={() => void saveConfig({ paymentReminderFirstOffsetDays: config.paymentReminderFirstOffsetDays ?? 0 })}
                />
              </div>
              <div>
                <label htmlFor="invoicing-config-reminder-second-offset" className={invLabelClass}>
                  Second reminder (days after due date)
                </label>
                <input
                  id="invoicing-config-reminder-second-offset"
                  type="number"
                  min={0}
                  className={invFieldClass}
                  disabled={!isAdmin}
                  value={config.paymentReminderSecondOffsetDays ?? 7}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (!Number.isFinite(n) || n < 0) return;
                    setConfig((c) => (c ? { ...c, paymentReminderSecondOffsetDays: n } : c));
                  }}
                  onBlur={() =>
                    void saveConfig({ paymentReminderSecondOffsetDays: config.paymentReminderSecondOffsetDays ?? 7 })
                  }
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
                <span>Auto-expire offers past validity</span>
                <Switch
                  id="invoicing-config-auto-expire-offers"
                  checked={config.autoExpireOffersEnabled ?? true}
                  disabled={!isAdmin}
                  aria-label={
                    (config.autoExpireOffersEnabled ?? true)
                      ? "Auto-expire offers past validity, on"
                      : "Auto-expire offers past validity, off"
                  }
                  onCheckedChange={(checked) => void saveConfig({ autoExpireOffersEnabled: checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
                <span>Show expired quote warnings</span>
                <Switch
                  id="invoicing-config-quote-expiry-warnings"
                  checked={config.quoteExpiryWarningsEnabled ?? true}
                  disabled={!isAdmin}
                  aria-label={
                    (config.quoteExpiryWarningsEnabled ?? true)
                      ? "Show expired quote warnings, on"
                      : "Show expired quote warnings, off"
                  }
                  onCheckedChange={(checked) => void saveConfig({ quoteExpiryWarningsEnabled: checked })}
                />
              </label>
            </div>
          </div>

          <div className="w-full space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Customer emails</h3>
              <p className="mt-1 text-xs text-stone-500">
                Choose which automated and staff-triggered emails are sent for quoting and invoicing. Disabled moments are
                skipped; document actions such as sending an invoice still complete unless the action itself requires
                email delivery.
              </p>
            </div>

            {[{ title: "Quoting", moments: quotingEmailMoments }, { title: "Invoicing", moments: invoicingEmailMoments }].map(
              ({ title, moments }) =>
                moments.length > 0 ? (
                  <div key={title} className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h4>
                    <div className="overflow-x-auto rounded-lg border border-stone-200">
                      <table className={invDataTableClass} aria-label={`${title} email moments`}>
                        <thead className={invTableHeadClass}>
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                              Email moment
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                              When it sends
                            </th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-stone-500">
                              Enabled
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 bg-white">
                          {moments.map((moment) => (
                            <tr key={moment.key}>
                              <td className="px-4 py-3 align-top text-sm font-medium text-slate-900">{moment.label}</td>
                              <td className="px-4 py-3 align-top text-sm text-stone-600">{moment.description}</td>
                              <td className="px-4 py-3 align-top text-right">
                                <Switch
                                  id={`invoicing-config-email-moment-${moment.key}`}
                                  checked={moment.enabled}
                                  disabled={!isAdmin || emailMomentBusy === moment.key}
                                  aria-busy={emailMomentBusy === moment.key}
                                  aria-label={
                                    moment.enabled
                                      ? `${moment.label}, enabled`
                                      : `${moment.label}, disabled`
                                  }
                                  onCheckedChange={(checked) => void saveEmailMoment(moment.key, checked)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null
            )}
          </div>

          <div className="w-full space-y-3 rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
            <h3 className="text-sm font-semibold text-slate-900">Tax options</h3>
            <InvoicingTaxRateOptionsEditor
              options={config.taxRateOptions}
              canEdit={isAdmin}
              onSaved={(taxRateOptions) => setConfig((c) => (c ? { ...c, taxRateOptions } : c))}
            />
          </div>

          {isAdmin && config.devPurgeInvoicingDocumentsEnabled ? (
            <div className="w-full rounded-xl border border-red-200 bg-red-50/50 p-6 shadow-sm ring-1 ring-red-100">
              <h3 className="text-sm font-semibold text-red-900">Application testing</h3>
              <p className="mt-2 text-sm text-red-800">
                Permanently deletes all quotes, offers, and invoices for this tenant. Catalog items, tax options, and
                numbering prefixes are kept. Offer and invoice sequences are reset; new quotes continue to use random ids.
              </p>
              <button
                type="button"
                disabled={purgeBusy}
                className={[
                  "mt-4 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60",
                  purgeConfirm
                    ? "bg-red-700 text-white hover:bg-red-800"
                    : "border border-red-300 bg-white text-red-800 hover:bg-red-100"
                ].join(" ")}
                onClick={() => {
                  if (!purgeConfirm) {
                    setPurgeConfirm(true);
                    return;
                  }
                  void purgeDocuments();
                }}
              >
                {purgeBusy
                  ? "Deleting…"
                  : purgeConfirm
                    ? "Click again to delete all quotes, offers, and invoices"
                    : "Delete all quotes, offers, and invoices"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
};
