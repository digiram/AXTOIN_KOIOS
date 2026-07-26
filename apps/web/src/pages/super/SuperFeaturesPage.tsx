/**
 * Super Features page.
 *
 * Tenant super-admin screen mounted under AppShell at /super-admin.
 *
 * Responsibilities:
 * - Load and render primary super-admin data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /super-admin
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { Switch } from "../../components/Switch.js";
import { API_BASE_URL } from "../../lib/api.js";
import {
  superDataTableClass,
  superDataTableEmptyCellClass,
  superDataTableEmptyRowClass,
  superDataTableOuterClass,
  superDataTableRowClass,
  superDataTableTbodyClass,
  superDataTableThClass,
  superDataTableTheadClass
} from "./superDataTableStyles.js";

type ModulesResponse = {
  crmEnabled: boolean;
  hrmEnabled: boolean;
  salesFunnelEnabled: boolean;
  companySubscriptionsEnabled: boolean;
  invoicingEnabled: boolean;
  mailboxEnabled: boolean;
  selfRegisterEnabled: boolean;
  mfaTotpEnabled: boolean;
  updatedAt: string;
};

type FeatureKey =
  | "crm"
  | "hrm"
  | "sales"
  | "companySubscriptions"
  | "invoicing"
  | "mailbox"
  | "selfRegister"
  | "mfa";

type FeatureFlags = Record<FeatureKey, boolean>;

const API_FIELD: Record<FeatureKey, keyof ModulesResponse> = {
  crm: "crmEnabled",
  hrm: "hrmEnabled",
  sales: "salesFunnelEnabled",
  companySubscriptions: "companySubscriptionsEnabled",
  invoicing: "invoicingEnabled",
  mailbox: "mailboxEnabled",
  selfRegister: "selfRegisterEnabled",
  mfa: "mfaTotpEnabled"
};

const DEFAULT_FLAGS: FeatureFlags = {
  crm: true,
  hrm: false,
  sales: false,
  companySubscriptions: false,
  invoicing: false,
  mailbox: false,
  selfRegister: true,
  mfa: false
};

const ERROR_LABEL: Record<FeatureKey, string> = {
  crm: "CRM module",
  hrm: "Workforce module",
  sales: "Sales module",
  companySubscriptions: "Company subscriptions module",
  invoicing: "Invoicing module",
  mailbox: "Mailbox module",
  selfRegister: "Self-service registration",
  mfa: "MFA feature"
};

const ARIA_LABEL: Record<FeatureKey, { on: string; off: string }> = {
  crm: { on: "CRM module, on", off: "CRM module, off" },
  hrm: { on: "Workforce module, on", off: "Workforce module, off" },
  sales: { on: "Sales module, on", off: "Sales module, off" },
  companySubscriptions: {
    on: "Company subscriptions module, on",
    off: "Company subscriptions module, off"
  },
  invoicing: { on: "Invoicing module, on", off: "Invoicing module, off" },
  mailbox: { on: "Mailbox module, on", off: "Mailbox module, off" },
  selfRegister: { on: "Self-service registration, on", off: "Self-service registration, off" },
  mfa: { on: "MFA feature, on", off: "MFA feature, off" }
};

type FeatureRowConfig = {
  key: FeatureKey;
  title: string;
  description: ReactNode;
  switchDisabled?: boolean;
};

const emphasis = (text: string) => <strong className="font-semibold text-slate-800">{text}</strong>;

/**
 * Super-admin feature toggles (platform-wide): modules, signup, MFA.
 */
export const SuperFeaturesPage = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [busy, setBusy] = useState<Partial<Record<FeatureKey, boolean>>>({});
  const [toggleErrors, setToggleErrors] = useState<Partial<Record<FeatureKey, string>>>({});

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE_URL}/platform/features/modules`, { headers: authHeaders() });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/features/modules`, { headers: authHeaders() });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Could not load feature settings.");
        return;
      }
      const json = (await res.json()) as ModulesResponse;
      setFlags({
        crm: json.crmEnabled,
        hrm: json.hrmEnabled === true,
        sales: json.salesFunnelEnabled === true,
        companySubscriptions: json.companySubscriptionsEnabled === true,
        invoicing: json.invoicingEnabled === true,
        mailbox: json.mailboxEnabled === true,
        selfRegister: json.selfRegisterEnabled ?? false,
        mfa: json.mfaTotpEnabled === true
      });
    } catch {
      setError("Could not load feature settings.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, logout, refreshSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFeature = useCallback(
    async (key: FeatureKey, next: boolean) => {
      const field = API_FIELD[key];
      const prev = flags[key];
      setFlags((f) => ({ ...f, [key]: next }));
      setToggleErrors((e) => ({ ...e, [key]: "" }));
      setBusy((b) => ({ ...b, [key]: true }));
      try {
        let res = await fetch(`${API_BASE_URL}/platform/features/modules`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({ [field]: next })
        });
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/platform/features/modules`, {
            method: "PUT",
            headers: { ...authHeaders(), "content-type": "application/json" },
            body: JSON.stringify({ [field]: next })
          });
        }
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) {
          setFlags((f) => ({ ...f, [key]: prev }));
          setToggleErrors((e) => ({
            ...e,
            [key]: j?.message ?? `Could not update ${ERROR_LABEL[key]}.`
          }));
          return;
        }
        await load();
      } catch {
        setFlags((f) => ({ ...f, [key]: prev }));
        setToggleErrors((e) => ({ ...e, [key]: `Could not update ${ERROR_LABEL[key]}.` }));
      } finally {
        setBusy((b) => ({ ...b, [key]: false }));
      }
    },
    [authHeaders, flags, load, logout, refreshSession]
  );

  const rows: FeatureRowConfig[] = useMemo(
    () => [
      {
        key: "crm",
        title: "CRM module",
        description: (
          <>
            When enabled, every tenant can use organizations, contacts, relationships, activities, and CRM
            geocoding. When disabled, tenant users and admins cannot access any CRM screens or APIs. Changes apply
            immediately when you flip the toggle.
          </>
        )
      },
      {
        key: "hrm",
        title: "Workforce module",
        description: (
          <>
            When enabled, tenant administrators can open the workforce org chart and employee records under{" "}
            {emphasis("Admin → Workforce")}. When disabled, workforce screens and APIs stay off for every tenant.
          </>
        )
      },
      {
        key: "sales",
        title: "Sales module",
        description: (
          <>
            When enabled, tenant administrators can open {emphasis("Admin → Sales")} for BDR and Sales pipelines.
            Requires the {emphasis("CRM module")} — turning CRM off disables Sales automatically.
            {!flags.crm ? (
              <span className="mt-2 block text-amber-800">Enable CRM first to turn on Sales.</span>
            ) : null}
          </>
        ),
        switchDisabled: !flags.crm
      },
      {
        key: "companySubscriptions",
        title: "Company subscriptions module",
        description: (
          <>
            When enabled, tenant administrators can open {emphasis("Admin → Company subscriptions")} to document
            vendor SaaS subscriptions, plans, seats, and provider files. When disabled, screens and APIs stay off for
            every tenant; existing records are retained.
          </>
        )
      },
      {
        key: "invoicing",
        title: "Invoicing & quoting module",
        description: (
          <>
            When enabled, tenants can use {emphasis("Admin → Invoicing & quoting")} for customer quotes, offers, and
            invoices. This is separate from platform subscription billing (PSP).
          </>
        )
      },
      {
        key: "mailbox",
        title: "Mailbox module",
        description: (
          <>
            When enabled, tenants can use {emphasis("Admin → Mailbox")} for internal notifications, external inbox sync
            (Gmail, Microsoft 365, IMAP), compose/reply, and calendar invites.
          </>
        )
      },
      {
        key: "selfRegister",
        title: "Self-service registration",
        description: (
          <>
            When {emphasis("on")}, anyone can create a realm account from the public sign-up page (subject to your
            existing email-domain rules). When {emphasis("off")}, the sign-up API is closed; only a{" "}
            {emphasis("tenant administrator")} or {emphasis("platform super admin")} can provision users (bootstrap
            and any admin tooling you operate outside self-serve signup).
          </>
        )
      },
      {
        key: "mfa",
        title: "Multi-factor authentication (TOTP and email)",
        description: (
          <>
            When {emphasis("on")}, tenants may require MFA for members, and users can enroll authenticator apps and
            email codes at sign-in. When {emphasis("off")}, the API skips MFA flows and tenant admins cannot enforce
            realm-wide MFA.
          </>
        )
      }
    ],
    [flags.crm]
  );

  const controlsReady = !loading && !error;

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className={superDataTableOuterClass}>
        <table className={superDataTableClass("min-w-[48rem]")} aria-label="Platform feature modules">
          <caption className="sr-only">
            Platform-wide feature toggles for tenant modules, self-service registration, and MFA
          </caption>
          <thead className={superDataTableTheadClass}>
            <tr>
              <th scope="col" className={[superDataTableThClass, "w-[12rem] min-w-[10rem]"].join(" ")}>
                Feature
              </th>
              <th scope="col" className={superDataTableThClass}>
                About
              </th>
              <th
                scope="col"
                className={[superDataTableThClass, "w-[5.5rem] min-w-[5.5rem] text-center"].join(" ")}
              >
                Enabled
              </th>
            </tr>
          </thead>
          <tbody className={superDataTableTbodyClass}>
            {loading ? (
              <tr className={superDataTableEmptyRowClass}>
                <td colSpan={3} className={superDataTableEmptyCellClass}>
                  Loading feature settings…
                </td>
              </tr>
            ) : error ? (
              <tr className={superDataTableEmptyRowClass}>
                <td colSpan={3} className={superDataTableEmptyCellClass}>
                  Could not load feature settings.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const enabled = flags[row.key];
                const rowBusy = busy[row.key] === true;
                const rowError = toggleErrors[row.key];
                const switchDisabled = row.switchDisabled === true || rowBusy;
                const labels = ARIA_LABEL[row.key];

                return (
                  <tr key={row.key} className={superDataTableRowClass(idx)}>
                    <th
                      scope="row"
                      className="px-3 py-3 align-top text-sm font-semibold text-slate-900"
                      id={`super-feature-${row.key}-title`}
                    >
                      {row.title}
                    </th>
                    <td
                      className="px-3 py-3 align-top text-sm leading-relaxed text-stone-600"
                      aria-labelledby={`super-feature-${row.key}-title`}
                    >
                      {row.description}
                      {rowError ? <p className="mt-2 text-sm text-rose-600">{rowError}</p> : null}
                    </td>
                    <td className="px-3 py-3 align-top text-center">
                      {controlsReady ? (
                        <div className="inline-flex items-center justify-center rounded-md bg-stone-100 px-2 py-2">
                          <Switch
                            checked={enabled}
                            disabled={switchDisabled}
                            aria-busy={rowBusy}
                            aria-label={enabled ? labels.on : labels.off}
                            onCheckedChange={(next) => void toggleFeature(row.key, next)}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
