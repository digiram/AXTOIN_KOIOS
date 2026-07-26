/**
 * Playwright E2E API helpers and seed utilities.
 *
 * Seeds tenants, toggles platform modules, and performs authenticated `/v1` calls
 * against the API started by `playwright.config.ts` webServer block.
 *
 * Responsibilities:
 * - Shared credentials and `/v1` base URL for fetch-based setup
 * - Super-admin login and platform module patch helpers
 * - Tenant registration flow with verification code exposure in dev/test
 * - CRM/invoicing/mailbox seed helpers for module happy-path specs
 *
 * Security:
 * - Uses bootstrap super-admin and disposable tenant domains only
 * - Access tokens passed explicitly; never logged
 *
 * Related:
 * - [`docs/guidelines/testing.md`](../docs/guidelines/testing.md)
 */

const apiOrigin = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:3500";
/** API `/v1` prefix for E2E fetch helpers. */
export const API_V1 = `${apiOrigin.replace(/\/$/, "")}/v1`;

/** Password used for disposable E2E tenant admin accounts. */
export const E2E_TENANT_PASSWORD = "E2eTestPassword123!";
/** Super-admin email fixture (overridable via env). */
export const E2E_SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? "e2e-superadmin";
/** Super-admin password fixture (overridable via env). */
export const E2E_SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? "E2eSuperAdmin123!";

/** Partial platform module flags accepted by `/platform/features/modules`. */
export type PlatformModulesPatch = {
  crmEnabled?: boolean;
  hrmEnabled?: boolean;
  salesFunnelEnabled?: boolean;
  companySubscriptionsEnabled?: boolean;
  invoicingEnabled?: boolean;
  mailboxEnabled?: boolean;
  selfRegisterEnabled?: boolean;
};

/** Logs in bootstrap super-admin and returns bearer access token. */
export const loginSuperAdminViaApi = async (): Promise<string> => {
  const login = await fetch(`${API_V1}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: E2E_SUPER_ADMIN_EMAIL, password: E2E_SUPER_ADMIN_PASSWORD })
  });
  if (!login.ok) {
    throw new Error(`E2E super-admin login failed (${login.status}): ${await login.text()}`);
  }
  const { accessToken } = (await login.json()) as { accessToken?: string };
  if (!accessToken) {
    throw new Error("E2E super-admin login missing accessToken");
  }
  return accessToken;
};

/**
 * Patches platform-wide optional module flags (super-admin only).
 *
 * @param accessToken - Super-admin bearer token.
 * @param patch - Module enable/disable fields to merge.
 */
export const setPlatformModulesViaApi = async (
  accessToken: string,
  patch: PlatformModulesPatch
): Promise<void> => {
  const res = await fetch(`${API_V1}/platform/features/modules`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    throw new Error(`E2E platform module patch failed (${res.status}): ${await res.text()}`);
  }
};

/** Enables CRM, invoicing, mailbox, and self-registration for typical E2E tenants. */
export const enableE2eTenantModules = async (): Promise<void> => {
  const token = await loginSuperAdminViaApi();
  await setPlatformModulesViaApi(token, {
    crmEnabled: true,
    invoicingEnabled: true,
    mailboxEnabled: true,
    selfRegisterEnabled: true
  });
};

const enableSelfRegistration = async (): Promise<void> => {
  try {
    await enableE2eTenantModules();
  } catch {
    const token = await loginSuperAdminViaApi().catch(() => null);
    if (token) {
      await setPlatformModulesViaApi(token, { selfRegisterEnabled: true });
    }
  }
};

/** Logs in a tenant user via API and returns bearer access token. */
export const loginTenantViaApi = async (email: string, password: string): Promise<string> => {
  const res = await fetch(`${API_V1}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    throw new Error(`E2E tenant login failed (${res.status}): ${await res.text()}`);
  }
  const { accessToken } = (await res.json()) as { accessToken?: string };
  if (!accessToken) {
    throw new Error("E2E tenant login missing accessToken");
  }
  return accessToken;
};

/**
 * Authenticated fetch against `/v1` with JSON defaults.
 *
 * @param accessToken - Tenant or super-admin bearer token.
 * @param path - Path under `/v1` (leading slash optional).
 */
export const tenantAuthedFetch = async (
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> => {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${API_V1}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers
  });
};

/**
 * Registers a disposable tenant via start/verify flow and returns credentials.
 *
 * Requires `DEV_ONLY_REGISTRATION_EXPOSE_VERIFICATION_CODE=true` on the API process.
 *
 * @param domain - Email domain for admin user (`admin@{domain}`).
 */
export const registerTenantViaApi = async (
  domain: string
): Promise<{ email: string; password: string; tenantId: string }> => {
  await enableSelfRegistration();
  const email = `admin@${domain}`;
  const start = await fetch(`${API_V1}/auth/register/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "E2E Admin",
      email,
      password: E2E_TENANT_PASSWORD
    })
  });
  if (!start.ok) {
    throw new Error(`E2E register/start failed (${start.status}): ${await start.text()}`);
  }
  const started = (await start.json()) as {
    registrationTicket: string;
    verificationCode?: string;
  };
  if (!started.verificationCode) {
    throw new Error("E2E register/start missing verificationCode — set DEV_ONLY_REGISTRATION_EXPOSE_VERIFICATION_CODE=true on API");
  }
  const verify = await fetch(`${API_V1}/auth/register/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      registrationTicket: started.registrationTicket,
      code: started.verificationCode
    })
  });
  if (!verify.ok) {
    throw new Error(`E2E register/verify failed (${verify.status}): ${await verify.text()}`);
  }
  const body = (await verify.json()) as { tenantId: string };
  if (!body.tenantId) {
    throw new Error("E2E register response missing tenantId");
  }
  return { email, password: E2E_TENANT_PASSWORD, tenantId: body.tenantId };
};

const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

/**
 * Creates CRM org, quote, and promoted offer for invoicing module E2E.
 *
 * @returns Offer id, display number, and seeded customer name for UI assertions.
 */
export const seedInvoicingOfferViaApi = async (
  accessToken: string
): Promise<{ offerId: string; displayDocumentNumber: string; customerName: string }> => {
  const customerName = `E2E Customer ${Date.now()}`;
  const orgRes = await tenantAuthedFetch(accessToken, "/tenant/crm/organizations", {
    method: "POST",
    body: JSON.stringify({ name: customerName })
  });
  if (!orgRes.ok) {
    throw new Error(`E2E CRM org create failed (${orgRes.status}): ${await orgRes.text()}`);
  }
  const orgId = ((await orgRes.json()) as { id: string }).id;

  const quoteRes = await tenantAuthedFetch(accessToken, "/tenant/invoicing/quotes", {
    method: "POST",
    body: JSON.stringify({
      crmOrganizationId: orgId,
      currencyCode: "USD",
      documentDate: todayIsoDate(),
      lineItems: [
        {
          description: "E2E consulting day",
          quantity: 1,
          unitLabel: "day",
          unitPriceMinor: 50_000,
          taxRateBps: 0
        }
      ]
    })
  });
  if (!quoteRes.ok) {
    throw new Error(`E2E quote create failed (${quoteRes.status}): ${await quoteRes.text()}`);
  }
  const quoteId = ((await quoteRes.json()) as { quote: { id: string } }).quote.id;

  const promoteRes = await tenantAuthedFetch(
    accessToken,
    `/tenant/invoicing/quotes/${quoteId}/promote-to-offer`,
    { method: "POST", body: JSON.stringify({}) }
  );
  if (!promoteRes.ok) {
    throw new Error(`E2E promote-to-offer failed (${promoteRes.status}): ${await promoteRes.text()}`);
  }
  const promoted = (await promoteRes.json()) as { offerId: string; displayDocumentNumber: string };
  return { ...promoted, customerName };
};

/**
 * Creates a shared mailbox account for the tenant via API.
 *
 * @param domain - Used to build a unique `@domain` address for the mailbox.
 */
export const seedSharedMailboxViaApi = async (
  accessToken: string,
  domain: string,
  label: string
): Promise<{ emailAddress: string; displayName: string }> => {
  const displayName = label;
  const emailAddress = `${label.replace(/\s+/g, ".").toLowerCase()}@${domain}`;
  const res = await tenantAuthedFetch(accessToken, "/tenant/mailbox/accounts/shared", {
    method: "POST",
    body: JSON.stringify({ displayName, emailAddress })
  });
  if (!res.ok) {
    throw new Error(`E2E shared mailbox create failed (${res.status}): ${await res.text()}`);
  }
  return { emailAddress, displayName };
};

/** Drives browser login form and waits for tenant admin shell URL. */
export const tenantLoginAndGo = async (
  page: import("@playwright/test").Page,
  email: string,
  password: string
): Promise<void> => {
  await page.goto("/login");
  await page.getByLabel(/email or username/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/admin/, { timeout: 30_000 });
};
