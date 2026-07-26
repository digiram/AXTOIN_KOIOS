/**
 * TenantModuleAvailabilityContext.
 *
 * Shared React context that loads all optional-module availability endpoints once per tenant layout mount,
 * avoiding duplicate fetches from nav builders and module gates.
 *
 * Responsibilities:
 * - Parallel fetch of CRM, sales, workforce, company subscriptions, invoicing, and mailbox availability
 * - Authenticated fetch with 401 refresh retry
 * - Expose per-module enable flags and resolved module roles
 *
 * Security:
 * - Bearer token from `AuthContext`; tenant scope is server-derived from JWT
 */
import type { ModuleRole } from "@starter/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import { useAuth } from "../auth/AuthContext.js";
import { API_BASE_URL } from "../lib/api.js";

type CrmAvailability = { crmEnabled: boolean | null; crmRole: ModuleRole | null };
type SalesAvailability = {
  salesFunnelEnabled: boolean | null;
  crmEnabled: boolean | null;
  salesRole: ModuleRole | null;
};
type WorkforceAvailability = { hrmEnabled: boolean | null; workforceRole: ModuleRole | null };
type CompanySubscriptionsAvailability = {
  companySubscriptionsEnabled: boolean | null;
  companySubscriptionsRole: ModuleRole | null;
};
type InvoicingAvailability = { invoicingEnabled: boolean | null; invoicingRole: ModuleRole | null };
type MailboxAvailability = { mailboxEnabled: boolean | null; mailboxRole: ModuleRole | null };

type TenantModuleAvailabilityContextValue = {
  crm: CrmAvailability;
  sales: SalesAvailability;
  workforce: WorkforceAvailability;
  companySubscriptions: CompanySubscriptionsAvailability;
  invoicing: InvoicingAvailability;
  mailbox: MailboxAvailability;
  loading: boolean;
  loadError: string;
  reload: () => Promise<void>;
};

const emptyAvailability: Omit<TenantModuleAvailabilityContextValue, "loading" | "loadError" | "reload"> = {
  crm: { crmEnabled: null, crmRole: null },
  sales: { salesFunnelEnabled: null, crmEnabled: null, salesRole: null },
  workforce: { hrmEnabled: null, workforceRole: null },
  companySubscriptions: { companySubscriptionsEnabled: null, companySubscriptionsRole: null },
  invoicing: { invoicingEnabled: null, invoicingRole: null },
  mailbox: { mailboxEnabled: null, mailboxRole: null }
};

const TenantModuleAvailabilityContext = createContext<TenantModuleAvailabilityContextValue | null>(null);

const useTenantModuleAvailabilityContext = (): TenantModuleAvailabilityContextValue => {
  const ctx = useContext(TenantModuleAvailabilityContext);
  if (!ctx) {
    throw new Error("Tenant module availability hooks require TenantModuleAvailabilityProvider");
  }
  return ctx;
};

/** Loads all tenant module availability endpoints once per layout mount (shared by nav + gates). */
export const TenantModuleAvailabilityProvider = ({ children }: { children: ReactNode }) => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const [availability, setAvailability] = useState(emptyAvailability);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const authHeaders = (): Record<string, string> => {
        const token = getAccessToken();
        const h: Record<string, string> = {};
        if (token) h.authorization = `Bearer ${token}`;
        return h;
      };

      const fetchWithAuth = async (path: string): Promise<Response> => {
        let res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            throw new Error("session_expired");
          }
          res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
        }
        return res;
      };

      const [crmRes, salesRes, workforceRes, companySubscriptionsRes, invoicingRes, mailboxRes] =
        await Promise.all([
          fetchWithAuth("/tenant/crm/availability"),
          fetchWithAuth("/tenant/sales/availability"),
          fetchWithAuth("/tenant/workforce/availability"),
          fetchWithAuth("/tenant/company-subscriptions/availability"),
          fetchWithAuth("/tenant/invoicing/availability"),
          fetchWithAuth("/tenant/mailbox/availability")
        ]);

      const responses = [
        crmRes,
        salesRes,
        workforceRes,
        companySubscriptionsRes,
        invoicingRes,
        mailboxRes
      ];
      if (responses.some((res) => !res.ok)) {
        setAvailability(emptyAvailability);
        setLoaded(false);
        setLoadError("Could not load module availability.");
        return;
      }

      const [crmJson, salesJson, workforceJson, companySubscriptionsJson, invoicingJson, mailboxJson] =
        await Promise.all(responses.map((res) => res.json()));

      setAvailability({
        crm: {
          crmEnabled: Boolean(crmJson.crmEnabled),
          crmRole: crmJson.crmEnabled && crmJson.crmRole ? crmJson.crmRole : null
        },
        sales: {
          salesFunnelEnabled: Boolean(salesJson.salesFunnelEnabled),
          crmEnabled: Boolean(salesJson.crmEnabled),
          salesRole: salesJson.salesFunnelEnabled && salesJson.salesRole ? salesJson.salesRole : null
        },
        workforce: {
          hrmEnabled: Boolean(workforceJson.hrmEnabled),
          workforceRole:
            workforceJson.hrmEnabled && workforceJson.workforceRole ? workforceJson.workforceRole : null
        },
        companySubscriptions: {
          companySubscriptionsEnabled: Boolean(companySubscriptionsJson.companySubscriptionsEnabled),
          companySubscriptionsRole:
            companySubscriptionsJson.companySubscriptionsEnabled &&
            companySubscriptionsJson.companySubscriptionsRole
              ? companySubscriptionsJson.companySubscriptionsRole
              : null
        },
        invoicing: {
          invoicingEnabled: Boolean(invoicingJson.invoicingEnabled),
          invoicingRole:
            invoicingJson.invoicingEnabled && invoicingJson.invoicingRole ? invoicingJson.invoicingRole : null
        },
        mailbox: {
          mailboxEnabled: Boolean(mailboxJson.mailboxEnabled),
          mailboxRole:
            mailboxJson.mailboxEnabled && mailboxJson.mailboxRole ? mailboxJson.mailboxRole : null
        }
      });
      setLoaded(true);
    } catch (err) {
      if (err instanceof Error && err.message === "session_expired") return;
      setAvailability(emptyAvailability);
      setLoaded(false);
      setLoadError("Could not load module availability.");
    }
  }, [getAccessToken, logout, refreshSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo(
    () => ({
      ...availability,
      loading: !loaded && !loadError,
      loadError,
      reload: load
    }),
    [availability, load, loadError, loaded]
  );

  return (
    <TenantModuleAvailabilityContext.Provider value={value}>{children}</TenantModuleAvailabilityContext.Provider>
  );
};

/** Context accessor alias for module-specific availability hooks. */
export const useTenantModuleAvailability = useTenantModuleAvailabilityContext;
