/**
 * Platform super-admin integration and module settings schemas.
 *
 * PUT bodies for geolocation (Nominatim), optional module toggles, and related
 * platform-wide configuration exposed on `/platform/*` routes.
 *
 * Responsibilities:
 * - Validate geolocation and module enablement PATCH payloads
 *
 * Related:
 * - `platform-subscriptions.ts`, `platform-mail.ts`
 *
 * Security:
 * - Super-admin only on API; URLs validated to http(s).
 */
import { z } from "zod";

const nominatimUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Must be a valid http(s) URL");

export const platformGeolocationPutBodySchema = z
  .object({
    nominatimBaseUrl: nominatimUrlSchema,
    nominatimContactEmail: z.string().trim().email().max(320).optional().nullable(),
    nominatimEnabled: z.boolean()
  })
  .strict();

export type PlatformGeolocationPutBodyInput = z.infer<typeof platformGeolocationPutBodySchema>;

export const platformModuleSettingsPutBodySchema = z
  .object({
    crmEnabled: z.boolean().optional(),
    hrmEnabled: z.boolean().optional(),
    salesFunnelEnabled: z.boolean().optional(),
    companySubscriptionsEnabled: z.boolean().optional(),
    invoicingEnabled: z.boolean().optional(),
    mailboxEnabled: z.boolean().optional(),
    selfRegisterEnabled: z.boolean().optional(),
    mfaTotpEnabled: z.boolean().optional()
  })
  .strict()
  .refine(
    (b) =>
      b.crmEnabled !== undefined ||
      b.hrmEnabled !== undefined ||
      b.salesFunnelEnabled !== undefined ||
      b.companySubscriptionsEnabled !== undefined ||
      b.invoicingEnabled !== undefined ||
      b.mailboxEnabled !== undefined ||
      b.selfRegisterEnabled !== undefined ||
      b.mfaTotpEnabled !== undefined,
    {
      message:
        "Provide at least one of crmEnabled, hrmEnabled, salesFunnelEnabled, companySubscriptionsEnabled, invoicingEnabled, mailboxEnabled, selfRegisterEnabled, or mfaTotpEnabled"
    }
  );

export type PlatformModuleSettingsPutBodyInput = z.infer<typeof platformModuleSettingsPutBodySchema>;

export const platformPaymentProviderSchema = z.enum(["stripe", "adyen"]);

export const platformPaymentAdyenEnvironmentSchema = z.enum(["test", "live"]);

/** Stable ids for platform-configured checkout / capture methods (Stripe & Adyen capable). */
export const PLATFORM_PAYMENT_METHOD_IDS = ["card", "paypal", "wallet_apple_google_pay", "ideal"] as const;

export const platformPaymentMethodIdSchema = z.enum(PLATFORM_PAYMENT_METHOD_IDS);

export type PlatformPaymentMethodId = z.infer<typeof platformPaymentMethodIdSchema>;

export const DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS: PlatformPaymentMethodId[] = [
  "card",
  "paypal",
  "wallet_apple_google_pay",
  "ideal"
];

const methodOrder = (a: PlatformPaymentMethodId, b: PlatformPaymentMethodId) =>
  PLATFORM_PAYMENT_METHOD_IDS.indexOf(a) - PLATFORM_PAYMENT_METHOD_IDS.indexOf(b);

/** Parse stored JSON; invalid or empty falls back to all methods enabled. */
export const parseAcceptedPaymentMethodsJson = (raw: string | null | undefined): PlatformPaymentMethodId[] => {
  if (raw == null || !String(raw).trim()) return [...DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS];
  try {
    const v = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(v)) return [...DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS];
    const allowed = new Set<string>(PLATFORM_PAYMENT_METHOD_IDS);
    const out = v.filter(
      (x): x is PlatformPaymentMethodId =>
        typeof x === "string" && allowed.has(x as PlatformPaymentMethodId)
    );
    const unique = [...new Set(out)];
    return unique.length > 0 ? unique.sort(methodOrder) : [...DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS];
  } catch {
    return [...DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS];
  }
};

export const serializeAcceptedPaymentMethods = (methods: PlatformPaymentMethodId[]): string => {
  const parsed = z.array(platformPaymentMethodIdSchema).min(1).safeParse(methods);
  if (!parsed.success) {
    return JSON.stringify(DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS);
  }
  return JSON.stringify([...new Set(parsed.data)].sort(methodOrder));
};

/**
 * Super-admin payment integration PUT. Exactly one of Stripe or Adyen is the active `provider`;
 * the app uses that processor only for capturing charges — billing logic stays in the application.
 *
 * Secret fields: omit to leave unchanged; send empty string to clear stored secret.
 */
export const platformPaymentPutBodySchema = z
  .object({
    paymentsEnabled: z.boolean(),
    provider: platformPaymentProviderSchema,
    stripePublishableKey: z.string().max(512),
    stripeSecretKey: z.string().optional(),
    stripeWebhookSecret: z.string().optional(),
    adyenMerchantAccount: z.string().max(255),
    adyenClientKey: z.string().max(512),
    adyenEnvironment: platformPaymentAdyenEnvironmentSchema,
    adyenApiKey: z.string().optional(),
    /** Omit to leave accepted methods unchanged. At least one method when provided. */
    acceptedPaymentMethods: z.array(platformPaymentMethodIdSchema).min(1).optional()
  })
  .strict();

export type PlatformPaymentPutBodyInput = z.infer<typeof platformPaymentPutBodySchema>;
