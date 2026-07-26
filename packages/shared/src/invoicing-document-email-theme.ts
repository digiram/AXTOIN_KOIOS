/**
 * Invoicing document email theme hex palette.
 *
 * Maps printable document theme colors to hex values for HTML email templates
 * so emailed PDFs match on-screen branding.
 *
 * Responsibilities:
 * - Resolve primary, accent, and highlight colors per theme key
 *
 * Related:
 * - `invoicing.ts` theme enum; web `invoicingUi.ts` and API email renderer
 */
import type { InvoicingDocumentThemeColor } from "./invoicing.js";

export type InvoicingDocumentEmailThemeHex = {
  primary: string;
  primaryDark: string;
  accentText: string;
  totalHighlight: string;
};

/** Hex palette aligned with printable document themes in `invoicingUi.ts`. */
export const invoicingDocumentEmailThemeHex = (
  themeColor: InvoicingDocumentThemeColor = "purple"
): InvoicingDocumentEmailThemeHex => {
  switch (themeColor) {
    case "red":
      return { primary: "#dc2626", primaryDark: "#450a0a", accentText: "#b91c1c", totalHighlight: "#991b1b" };
    case "green":
      return { primary: "#059669", primaryDark: "#022c22", accentText: "#047857", totalHighlight: "#065f46" };
    case "blue":
      return { primary: "#2563eb", primaryDark: "#172554", accentText: "#1d4ed8", totalHighlight: "#1e40af" };
    case "gray":
      return { primary: "#475569", primaryDark: "#1e293b", accentText: "#334155", totalHighlight: "#334155" };
    case "black_yellow":
      return { primary: "#000000", primaryDark: "#000000", accentText: "#ca8a04", totalHighlight: "#a16207" };
    case "purple":
    default:
      return { primary: "#4f46e5", primaryDark: "#1e1b4b", accentText: "#4338ca", totalHighlight: "#3730a3" };
  }
};
