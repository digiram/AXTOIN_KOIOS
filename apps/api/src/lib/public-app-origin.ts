/**
 * Public web app origin for customer-facing deep links in outbound email.
 * Prefer `APP_PUBLIC_ORIGIN`; fall back to the first `CORS_ORIGINS` entry in dev.
 */
export const resolvePublicAppOrigin = (): string | null => {
  const explicit = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const corsFirst = process.env.CORS_ORIGINS?.split(",")
    .map((entry) => entry.trim())
    .find(Boolean);
  if (corsFirst) return corsFirst.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:5173";
  return null;
};

export const buildInvoicingPublicOfferResponseUrl = (
  origin: string,
  token: string,
  decision: "accept" | "reject"
): string =>
  `${origin.replace(/\/$/, "")}/offer/respond/${encodeURIComponent(token)}?decision=${decision}`;
