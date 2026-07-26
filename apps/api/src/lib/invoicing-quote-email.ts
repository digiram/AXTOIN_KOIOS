/**
 * Server-rendered HTML email for invoicing quotes (MJML → responsive table layout).
 */

import mjml2html from "mjml";

import {
  escapeInvoicingEmailHtml,
  formatInvoicingCustomerBillingAddress,
  formatInvoicingIsoDate,
  formatInvoicingMoneyMinor,
  formatInvoicingPaymentTermDays,
  invoicingDocumentEmailThemeHex,
  invoicingDocumentKindLabel,
  invoicingTaxRateOptionLabel,
  type InvoicingCustomerSnapshot,
  type InvoicingDocumentKind,
  type InvoicingDocumentThemeColor,
  type InvoicingIssuerSnapshot,
  type InvoicingTaxRateOption
} from "@starter/shared";

import {
  INVOICING_EMAIL_DOC_MAX_WIDTH,
  INVOICING_EMAIL_FONT_STACK,
  renderInvoicingEmailIssuerFooter,
  renderOfferResponseCardHtml
} from "./invoicing-email-layout.js";

export type InvoicingDocumentEmailLineItem = {
  description: string;
  sku?: string | null;
  quantity: number;
  unitLabel: string;
  unitPriceMinor: number;
  taxRateBps: number | null;
  lineTotalMinor: number;
};

export type InvoicingDocumentEmailRenderInput = {
  kind: InvoicingDocumentKind;
  displayNumber: string;
  documentDate: string;
  quoteExpiryDate?: string | null;
  offerExpiryDate?: string | null;
  sentOnDate?: string | null;
  dueDate?: string | null;
  paymentTermDays?: number | null;
  currencyCode: string;
  issuerSnapshot: InvoicingIssuerSnapshot;
  customerSnapshot: InvoicingCustomerSnapshot;
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  notes: string;
  termsText: string;
  footerText: string;
  lineItems: InvoicingDocumentEmailLineItem[];
  taxRateOptions: InvoicingTaxRateOption[];
  documentThemeColor: InvoicingDocumentThemeColor;
  logoDataUrl?: string | null;
  responseLinks?: {
    acceptUrl: string;
    rejectUrl: string;
  } | null;
};

const FONT_STACK =
  "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
const DOC_MAX_WIDTH = "720px";
const CONTENT_PAD_X = "24px";
const CONTENT_PAD_Y = "16px";
const LINE_CELL_PAD = "10px 8px";

const nl2br = (text: string): string => escapeInvoicingEmailHtml(text).replace(/\r?\n/g, "<br/>");

const splitAddressLines = (address: string): string[] =>
  address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const leftText = (text: string, style: string): string =>
  `<div style="margin:0;padding:0;text-align:left;${style}">${escapeInvoicingEmailHtml(text)}</div>`;

const rightText = (text: string, style: string): string =>
  `<div style="margin:0;padding:0;text-align:right;${style}">${escapeInvoicingEmailHtml(text)}</div>`;

const paddedSection = (innerHtml: string, extraStyle = ""): string =>
  `<div style="padding:${CONTENT_PAD_Y} ${CONTENT_PAD_X};${extraStyle}">${innerHtml}</div>`;

const renderTotalsRows = (input: {
  theme: ReturnType<typeof invoicingDocumentEmailThemeHex>;
  currencyCode: string;
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
}): string => {
  const { theme, currencyCode } = input;
  const summaryBg = "#fafaf9";
  const summaryBorder = "border-top:1px solid #e7e5e4;";
  const labelStyle = `padding:${LINE_CELL_PAD};font-size:13px;color:#334155;text-align:left;background:${summaryBg};`;
  const amountStyle = `padding:${LINE_CELL_PAD};font-size:13px;font-weight:600;color:#0f172a;text-align:right;white-space:nowrap;background:${summaryBg};`;

  const discountRow =
    input.discountTotalMinor > 0
      ? `<tr style="background:${summaryBg};">
          <td colspan="4" style="background:${summaryBg};"></td>
          <td style="${labelStyle}">Discount</td>
          <td style="${amountStyle}">−${escapeInvoicingEmailHtml(formatInvoicingMoneyMinor(input.discountTotalMinor, currencyCode))}</td>
        </tr>`
      : "";

  return `<tr style="background:${summaryBg};">
          <td colspan="4" style="${summaryBorder}background:${summaryBg};"></td>
          <td style="${summaryBorder}${labelStyle}padding-top:16px;">Subtotal</td>
          <td style="${summaryBorder}${amountStyle}padding-top:16px;">${escapeInvoicingEmailHtml(formatInvoicingMoneyMinor(input.subtotalExcludingTaxMinor, currencyCode))}</td>
        </tr>
        ${discountRow}
        <tr style="background:${summaryBg};">
          <td colspan="4" style="background:${summaryBg};"></td>
          <td style="${labelStyle}">Tax</td>
          <td style="${amountStyle}">${input.taxTotalMinor > 0 ? escapeInvoicingEmailHtml(formatInvoicingMoneyMinor(input.taxTotalMinor, currencyCode)) : "N/A"}</td>
        </tr>
        <tr>
          <td colspan="4" style="padding-top:12px;background:#ffffff;"></td>
          <td colspan="2" style="padding:${LINE_CELL_PAD};background:#ffffff;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="background:${theme.primary};color:#ffffff;font-size:14px;font-weight:600;padding:12px 16px;text-align:left;">Total</td>
                <td style="background:${theme.totalHighlight};color:#ffffff;font-size:18px;font-weight:700;padding:12px 8px;text-align:right;white-space:nowrap;">${escapeInvoicingEmailHtml(formatInvoicingMoneyMinor(input.totalIncludingTaxMinor, currencyCode))}</td>
              </tr>
            </table>
          </td>
        </tr>`;
};

const lineItemRows = (input: InvoicingDocumentEmailRenderInput): string => {
  if (input.lineItems.length === 0) {
    return `<tr><td colspan="6" style="padding:12px 8px;color:#64748b;font-size:13px;text-align:left;">No line items.</td></tr>`;
  }
  return input.lineItems
    .map((line, index) => {
      const bg = index % 2 === 0 ? "#ffffff" : "#f8fafc";
      const sku = line.sku?.trim();
      const desc = escapeInvoicingEmailHtml(line.description);
      const skuHtml = sku
        ? `<div style="font-size:11px;color:#64748b;margin-top:2px;text-align:left;">${escapeInvoicingEmailHtml(sku)}</div>`
        : "";
      return `<tr style="background:${bg};border-bottom:1px solid #e7e5e4;">
        <td style="padding:${LINE_CELL_PAD};font-size:13px;color:#0f172a;vertical-align:top;text-align:left;"><strong>${desc}</strong>${skuHtml}</td>
        <td style="padding:${LINE_CELL_PAD};font-size:13px;color:#334155;text-align:center;vertical-align:top;">${line.quantity}</td>
        <td style="padding:${LINE_CELL_PAD};font-size:13px;color:#334155;text-align:center;vertical-align:top;">${escapeInvoicingEmailHtml(line.unitLabel)}</td>
        <td style="padding:${LINE_CELL_PAD};font-size:13px;color:#334155;text-align:right;vertical-align:top;">${escapeInvoicingEmailHtml(formatInvoicingMoneyMinor(line.unitPriceMinor, input.currencyCode))}</td>
        <td style="padding:${LINE_CELL_PAD};font-size:13px;color:#334155;text-align:right;vertical-align:top;">${escapeInvoicingEmailHtml(invoicingTaxRateOptionLabel(input.taxRateOptions, line.taxRateBps))}</td>
        <td style="padding:${LINE_CELL_PAD};font-size:13px;font-weight:600;color:#0f172a;text-align:right;vertical-align:top;">${escapeInvoicingEmailHtml(formatInvoicingMoneyMinor(line.lineTotalMinor, input.currencyCode))}</td>
      </tr>`;
    })
    .join("");
};

const renderCompanyBlock = (companyName: string, companyAddressLines: string[]): string => {
  const parts: string[] = [];
  if (companyName) {
    parts.push(
      leftText(companyName, "font-size:18px;font-weight:700;line-height:1.2;color:#0f172a;")
    );
  }
  for (const [index, line] of companyAddressLines.entries()) {
    const marginTop = index === 0 && companyName ? "margin-top:4px;" : "";
    parts.push(
      leftText(line, `font-size:13px;line-height:1.35;color:#475569;${marginTop}`)
    );
  }
  return parts.join("");
};

const renderHeaderMeta = (lines: string[]): string =>
  lines
    .map((line, index) =>
      rightText(
        line,
        `font-size:13px;line-height:1.45;color:#475569;${index > 0 ? "margin-top:2px;" : ""}`
      )
    )
    .join("");

const renderDocumentHeader = (input: {
  theme: ReturnType<typeof invoicingDocumentEmailThemeHex>;
  kindLabel: string;
  companyName: string;
  companyAddressLines: string[];
  logoDataUrl: string | null | undefined;
  headerMetaLines: string[];
}): string => {
  const { theme, kindLabel, companyName, companyAddressLines, logoDataUrl, headerMetaLines } =
    input;
  const hasCompanyBlock = Boolean(companyName || companyAddressLines.length > 0);
  const hasLogo = Boolean(logoDataUrl?.trim());

  const logoCell = hasLogo
    ? `<td width="88" valign="middle" align="center" style="background:${theme.primaryDark};padding:12px 8px;">
        <img src="${input.logoDataUrl}" alt="${escapeInvoicingEmailHtml(companyName || "Company logo")}" width="72" style="display:block;max-width:72px;max-height:64px;border:0;outline:none;" />
      </td>`
    : "";

  const companyCell = hasCompanyBlock
    ? `<td valign="top" align="left" style="padding:${CONTENT_PAD_Y} 16px ${CONTENT_PAD_Y} ${hasLogo ? "16px" : CONTENT_PAD_X};width:${hasLogo ? "38%" : "50%"};">
        ${renderCompanyBlock(companyName, companyAddressLines)}
      </td>`
    : "";

  const metaCell = `<td valign="top" align="right" style="padding:${CONTENT_PAD_Y} ${CONTENT_PAD_X} ${CONTENT_PAD_Y} ${hasCompanyBlock ? "16px" : CONTENT_PAD_X};width:${hasCompanyBlock ? (hasLogo ? "42%" : "50%") : "100%"};">
      ${rightText(kindLabel, `font-size:18px;font-weight:700;line-height:1.2;color:${theme.accentText};text-transform:uppercase;letter-spacing:0.04em;`)}
      <div style="margin-top:6px;">
        ${renderHeaderMeta(headerMetaLines)}
      </div>
    </td>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-bottom:1px solid #e7e5e4;">
    <tr>
      ${logoCell}
      ${companyCell}
      ${metaCell}
    </tr>
  </table>`;
};

const renderToSection = (input: {
  theme: ReturnType<typeof invoicingDocumentEmailThemeHex>;
  customerName: string;
  contactName: string;
  customerPhone: string;
  customerEmail: string;
  billingAddress: string | null;
}): string => {
  const { theme, customerName, contactName, customerPhone, customerEmail, billingAddress } = input;
  const billingAddressText = billingAddress?.trim() ?? "";
  const hasCustomerDetails = Boolean(customerName || contactName || customerPhone || customerEmail);
  if (!hasCustomerDetails && !billingAddressText) return "";

  const customerParts: string[] = [];
  if (customerName) {
    customerParts.push(
      leftText(customerName, "font-size:18px;font-weight:700;line-height:1.2;color:#0f172a;margin-bottom:4px;")
    );
  }
  if (contactName) {
    customerParts.push(leftText(contactName, "font-size:14px;line-height:1.35;color:#1e293b;margin-bottom:4px;"));
  }
  if (customerPhone) {
    customerParts.push(leftText(customerPhone, "font-size:14px;line-height:1.35;color:#1e293b;margin-bottom:4px;"));
  }
  if (customerEmail) {
    customerParts.push(leftText(customerEmail, "font-size:14px;line-height:1.35;color:#1e293b;margin-bottom:4px;"));
  }

  const customerCell = hasCustomerDetails
    ? `<td valign="top" align="left" width="50%" style="font-size:14px;color:#1e293b;">${customerParts.join("")}</td>`
    : "";

  const addressCell = billingAddressText
    ? `<td valign="top" align="left" width="50%" style="font-size:13px;line-height:1.45;color:#475569;white-space:pre-wrap;${hasCustomerDetails ? "border-left:1px solid #e7e5e4;padding-left:20px;" : ""}">${nl2br(billingAddressText)}</td>`
    : "";

  return paddedSection(
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
      <tr>
        <td width="56" valign="middle" align="center" style="background:${theme.primary};color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:12px 6px;">To</td>
        <td style="background:#fafaf9;padding:12px 20px;vertical-align:top;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              ${customerCell}
              ${addressCell}
            </tr>
          </table>
        </td>
      </tr>
    </table>`,
    "padding-top:12px;padding-bottom:8px;"
  );
};

const documentNumberLabel = (kind: InvoicingDocumentKind): string => {
  switch (kind) {
    case "quote":
      return "Quote number";
    case "offer":
      return "Offer number";
    case "invoice":
      return "Invoice number";
    default:
      return "Document number";
  }
};

const renderOfferResponseLinks = (input: {
  theme: ReturnType<typeof invoicingDocumentEmailThemeHex>;
  acceptUrl: string;
  rejectUrl: string;
}): string => renderOfferResponseCardHtml(input);

const buildDocumentEmailHeaderMetaLines = (input: InvoicingDocumentEmailRenderInput): string[] => {
  const lines: string[] = [];
  if (input.kind === "invoice") {
    const sentOn = input.sentOnDate?.trim() || input.documentDate;
    lines.push(`Sent on ${formatInvoicingIsoDate(sentOn)}`);
    if (input.dueDate?.trim()) {
      lines.push(`Due date ${formatInvoicingIsoDate(input.dueDate)}`);
    }
    if (input.paymentTermDays != null) {
      lines.push(`Payment term ${formatInvoicingPaymentTermDays(input.paymentTermDays)}`);
    }
  } else {
    lines.push(`Created on ${formatInvoicingIsoDate(input.documentDate)}`);
    const validUntil = input.kind === "quote" ? input.quoteExpiryDate : input.offerExpiryDate;
    if (validUntil?.trim()) {
      lines.push(`Valid until ${formatInvoicingIsoDate(validUntil)}`);
    }
  }
  lines.push(`${documentNumberLabel(input.kind)} ${input.displayNumber}`);
  return lines;
};

export const buildInvoicingDocumentEmailSubject = (input: {
  kind: InvoicingDocumentKind;
  displayNumber: string;
  companyName: string | null;
}): string => {
  const company = input.companyName?.trim();
  const kindLabel = invoicingDocumentKindLabel(input.kind);
  return company
    ? `${kindLabel} ${input.displayNumber} from ${company}`
    : `${kindLabel} ${input.displayNumber}`;
};

export const buildInvoicingQuoteEmailSubject = (input: {
  displayNumber: string;
  companyName: string | null;
}): string =>
  buildInvoicingDocumentEmailSubject({ kind: "quote", displayNumber: input.displayNumber, companyName: input.companyName });

export const renderInvoicingDocumentEmailHtml = async (
  input: InvoicingDocumentEmailRenderInput
): Promise<string> => {
  const theme = invoicingDocumentEmailThemeHex(input.documentThemeColor);
  const kindLabel = invoicingDocumentKindLabel(input.kind).toUpperCase();
  const companyName = input.issuerSnapshot.companyName?.trim() ?? "";
  const companyAddress = input.issuerSnapshot.companyAddress?.trim() ?? "";
  const companyAddressLines = companyAddress ? splitAddressLines(companyAddress) : [];
  const billingAddress = formatInvoicingCustomerBillingAddress(input.customerSnapshot);
  const customerName = input.customerSnapshot.organizationName?.trim() ?? "";
  const contactName = input.customerSnapshot.contactName?.trim() ?? "";
  const customerPhone = input.customerSnapshot.phone?.trim() ?? "";
  const customerEmail = input.customerSnapshot.email?.trim() ?? "";

  const headerMetaLines = buildDocumentEmailHeaderMetaLines(input);

  const notesSection = input.notes.trim()
    ? paddedSection(
        `${leftText("Notes", "font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;")}
         <div style="font-size:13px;line-height:1.5;color:#475569;text-align:left;">${nl2br(input.notes.trim())}</div>`,
        "padding-top:8px;padding-bottom:8px;border-bottom:1px solid #e7e5e4;"
      )
    : "";

  const termsSection = input.termsText.trim()
    ? paddedSection(
        `${leftText("Payment terms & conditions", "font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;")}
         <div style="font-size:13px;line-height:1.5;color:#475569;text-align:left;">${nl2br(input.termsText.trim())}</div>`,
        "padding-top:16px;padding-bottom:16px;border-top:1px solid #e7e5e4;"
      )
    : "";

  const issuerFooterSection = renderInvoicingEmailIssuerFooter(input.issuerSnapshot, input.footerText);

  const responseCardHtml =
    input.kind === "offer" && input.responseLinks
      ? renderOfferResponseCardHtml({
          theme,
          acceptUrl: input.responseLinks.acceptUrl,
          rejectUrl: input.responseLinks.rejectUrl
        })
      : "";

  const documentCard = `<div style="width:100%;max-width:${DOC_MAX_WIDTH};margin:0 auto;background-color:#ffffff;font-family:${FONT_STACK};color:#0f172a;">
    ${renderDocumentHeader({
      theme,
      kindLabel,
      companyName,
      companyAddressLines,
      logoDataUrl: input.logoDataUrl,
      headerMetaLines
    })}
    ${renderToSection({
      theme,
      customerName,
      contactName,
      customerPhone,
      customerEmail,
      billingAddress
    })}
    ${notesSection}
    ${paddedSection(
      `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr style="background:${theme.primary};color:#ffffff;">
          <th style="padding:${LINE_CELL_PAD};font-size:11px;text-align:left;font-weight:600;text-transform:uppercase;">Description</th>
          <th style="padding:${LINE_CELL_PAD};font-size:11px;text-align:center;font-weight:600;text-transform:uppercase;">Qty</th>
          <th style="padding:${LINE_CELL_PAD};font-size:11px;text-align:center;font-weight:600;text-transform:uppercase;">Unit</th>
          <th style="padding:${LINE_CELL_PAD};font-size:11px;text-align:right;font-weight:600;text-transform:uppercase;">Unit price</th>
          <th style="padding:${LINE_CELL_PAD};font-size:11px;text-align:right;font-weight:600;text-transform:uppercase;">Tax</th>
          <th style="padding:${LINE_CELL_PAD};font-size:11px;text-align:right;font-weight:600;text-transform:uppercase;">Total</th>
        </tr>
        ${lineItemRows(input)}
        ${renderTotalsRows({
          theme,
          currencyCode: input.currencyCode,
          subtotalExcludingTaxMinor: input.subtotalExcludingTaxMinor,
          discountTotalMinor: input.discountTotalMinor,
          taxTotalMinor: input.taxTotalMinor,
          totalIncludingTaxMinor: input.totalIncludingTaxMinor
        })}
      </table>`,
      "padding-top:12px;padding-bottom:12px;"
    )}
    ${termsSection}
    ${issuerFooterSection}
  </div>`;

  const responseCardSection = responseCardHtml
    ? `<mj-section background-color="transparent" padding="0 0 12px 0">
        <mj-column padding="0">
          <mj-raw>${responseCardHtml}</mj-raw>
        </mj-column>
      </mj-section>`
    : "";

  const mjml = `<mjml>
  <mj-head>
    <mj-title>${escapeInvoicingEmailHtml(kindLabel)} ${escapeInvoicingEmailHtml(input.displayNumber)}</mj-title>
    <mj-attributes>
      <mj-all font-family="${FONT_STACK}" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f5f5f4" width="${INVOICING_EMAIL_DOC_MAX_WIDTH}">
    <mj-wrapper background-color="#f5f5f4" padding="24px 16px">
      ${responseCardSection}
      <mj-section
        background-color="#ffffff"
        border="1px solid #e7e5e4"
        border-radius="12px"
        padding="0"
      >
        <mj-column padding="0">
          <mj-raw>${documentCard}</mj-raw>
        </mj-column>
      </mj-section>
    </mj-wrapper>
  </mj-body>
</mjml>`;

  const { html, errors } = await mjml2html(mjml, { validationLevel: "soft", minify: false });
  if (errors.length > 0) {
    const message = errors.map((e: { formattedMessage: string }) => e.formattedMessage).join("; ");
    throw new Error(`${invoicingDocumentKindLabel(input.kind)} email MJML compile failed: ${message}`);
  }
  return html;
};
