/**
 * Server-rendered HTML email explaining why an invoice dispute was denied (MJML wrapper).
 */

import mjml2html from "mjml";

import {
  escapeInvoicingEmailHtml,
  formatInvoicingCustomerBillingAddress,
  formatInvoicingIsoDate,
  formatInvoicingMoneyMinor,
  invoicingDocumentEmailThemeHex,
  type InvoicingCustomerSnapshot,
  type InvoicingDocumentThemeColor,
  type InvoicingIssuerSnapshot
} from "@starter/shared";

import {
  INVOICING_EMAIL_CONTENT_PAD_X,
  INVOICING_EMAIL_CONTENT_PAD_Y,
  INVOICING_EMAIL_DOC_MAX_WIDTH,
  INVOICING_EMAIL_FONT_STACK,
  invoicingEmailLeftText,
  invoicingEmailNl2br,
  invoicingEmailPaddedSection,
  invoicingEmailRightText,
  renderInvoicingEmailIssuerFooter,
  renderInvoicingEmailNoteCard
} from "./invoicing-email-layout.js";

export type InvoicingInvoiceDisputeDeniedEmailRenderInput = {
  displayNumber: string;
  documentDate: string;
  currencyCode: string;
  totalIncludingTaxMinor: number;
  denialReason: string;
  issuerSnapshot: InvoicingIssuerSnapshot;
  customerSnapshot: InvoicingCustomerSnapshot;
  footerText: string;
  documentThemeColor: InvoicingDocumentThemeColor;
  logoDataUrl?: string | null;
};

const splitAddressLines = (address: string): string[] =>
  address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const renderCompanyBlock = (companyName: string, companyAddressLines: string[]): string => {
  const parts: string[] = [];
  if (companyName) {
    parts.push(
      invoicingEmailLeftText(companyName, "font-size:18px;font-weight:700;line-height:1.2;color:#0f172a;")
    );
  }
  for (const [index, line] of companyAddressLines.entries()) {
    const marginTop = index === 0 && companyName ? "margin-top:4px;" : "";
    parts.push(
      invoicingEmailLeftText(line, `font-size:13px;line-height:1.35;color:#475569;${marginTop}`)
    );
  }
  return parts.join("");
};

const renderHeaderMeta = (lines: string[]): string =>
  lines
    .map((line, index) =>
      invoicingEmailRightText(
        line,
        `font-size:13px;line-height:1.45;color:#475569;${index > 0 ? "margin-top:2px;" : ""}`
      )
    )
    .join("");

const renderDenialHeader = (input: {
  theme: ReturnType<typeof invoicingDocumentEmailThemeHex>;
  companyName: string;
  companyAddressLines: string[];
  logoDataUrl: string | null | undefined;
  headerMetaLines: string[];
}): string => {
  const { theme, companyName, companyAddressLines, logoDataUrl, headerMetaLines } = input;
  const hasCompanyBlock = Boolean(companyName || companyAddressLines.length > 0);
  const hasLogo = Boolean(logoDataUrl?.trim());

  const logoCell = hasLogo
    ? `<td width="88" valign="middle" align="center" style="background:${theme.primaryDark};padding:12px 8px;">
        <img src="${input.logoDataUrl}" alt="${escapeInvoicingEmailHtml(companyName || "Company logo")}" width="72" style="display:block;max-width:72px;max-height:64px;border:0;outline:none;" />
      </td>`
    : "";

  const companyCell = hasCompanyBlock
    ? `<td valign="top" align="left" style="padding:${INVOICING_EMAIL_CONTENT_PAD_Y} 16px ${INVOICING_EMAIL_CONTENT_PAD_Y} ${hasLogo ? "16px" : INVOICING_EMAIL_CONTENT_PAD_X};width:${hasLogo ? "38%" : "50%"};">
        ${renderCompanyBlock(companyName, companyAddressLines)}
      </td>`
    : "";

  const metaCell = `<td valign="top" align="right" style="padding:${INVOICING_EMAIL_CONTENT_PAD_Y} ${INVOICING_EMAIL_CONTENT_PAD_X} ${INVOICING_EMAIL_CONTENT_PAD_Y} ${hasCompanyBlock ? "16px" : INVOICING_EMAIL_CONTENT_PAD_X};width:${hasCompanyBlock ? (hasLogo ? "42%" : "50%") : "100%"};">
      ${invoicingEmailRightText("Dispute denied", "font-size:18px;font-weight:700;line-height:1.2;color:#b91c1c;text-transform:uppercase;letter-spacing:0.04em;")}
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
      invoicingEmailLeftText(customerName, "font-size:18px;font-weight:700;line-height:1.2;color:#0f172a;margin-bottom:4px;")
    );
  }
  if (contactName) {
    customerParts.push(invoicingEmailLeftText(contactName, "font-size:14px;line-height:1.35;color:#1e293b;margin-bottom:4px;"));
  }
  if (customerPhone) {
    customerParts.push(invoicingEmailLeftText(customerPhone, "font-size:14px;line-height:1.35;color:#1e293b;margin-bottom:4px;"));
  }
  if (customerEmail) {
    customerParts.push(invoicingEmailLeftText(customerEmail, "font-size:14px;line-height:1.35;color:#1e293b;margin-bottom:4px;"));
  }

  const customerCell = hasCustomerDetails
    ? `<td valign="top" align="left" width="50%" style="font-size:14px;color:#1e293b;">${customerParts.join("")}</td>`
    : "";

  const addressCell = billingAddressText
    ? `<td valign="top" align="left" width="50%" style="font-size:13px;line-height:1.45;color:#475569;white-space:pre-wrap;${hasCustomerDetails ? "border-left:1px solid #e7e5e4;padding-left:20px;" : ""}">${invoicingEmailNl2br(billingAddressText)}</td>`
    : "";

  return invoicingEmailPaddedSection(
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

const buildDenialMessage = (input: InvoicingInvoiceDisputeDeniedEmailRenderInput): string =>
  [
    `Your dispute for invoice ${input.displayNumber} has been denied.`,
    "You will receive a separate email with the updated invoice, including the remaining amount and the new due date."
  ].join("\n\n");

const renderInvoiceSummarySection = (input: {
  theme: ReturnType<typeof invoicingDocumentEmailThemeHex>;
  renderInput: InvoicingInvoiceDisputeDeniedEmailRenderInput;
}): string => {
  const { theme, renderInput } = input;
  const summaryBg = "#fafaf9";
  const labelStyle = `padding:10px 8px;font-size:13px;color:#334155;text-align:left;background:${summaryBg};`;
  const valueStyle = `padding:10px 8px;font-size:13px;color:#0f172a;text-align:right;background:${summaryBg};`;

  const rows = [
    `<tr style="background:${summaryBg};">
      <td style="${labelStyle}">Invoice number</td>
      <td style="${valueStyle}font-weight:600;">${escapeInvoicingEmailHtml(renderInput.displayNumber)}</td>
    </tr>`,
    `<tr style="background:${summaryBg};">
      <td style="${labelStyle}">Invoice date</td>
      <td style="${valueStyle}">${escapeInvoicingEmailHtml(formatInvoicingIsoDate(renderInput.documentDate))}</td>
    </tr>`,
    `<tr>
      <td colspan="2" style="padding-top:12px;background:#ffffff;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td style="background:${theme.primary};color:#ffffff;font-size:14px;font-weight:600;padding:12px 16px;text-align:left;">Total</td>
            <td style="background:${theme.totalHighlight};color:#ffffff;font-size:18px;font-weight:700;padding:12px 8px;text-align:right;white-space:nowrap;">${escapeInvoicingEmailHtml(formatInvoicingMoneyMinor(renderInput.totalIncludingTaxMinor, renderInput.currencyCode))}</td>
          </tr>
        </table>
      </td>
    </tr>`
  ];

  return invoicingEmailPaddedSection(
    `${invoicingEmailLeftText("Invoice summary", "font-size:14px;font-weight:700;color:#0f172a;margin-bottom:10px;")}
     <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
       ${rows.join("")}
     </table>`,
    "padding-top:8px;padding-bottom:8px;"
  );
};

export const buildInvoicingInvoiceDisputeDeniedEmailSubject = (input: {
  displayNumber: string;
  companyName: string | null;
}): string => {
  const company = input.companyName?.trim();
  return company
    ? `Dispute denied for invoice ${input.displayNumber} — ${company}`
    : `Dispute denied for invoice ${input.displayNumber}`;
};

export const renderInvoicingInvoiceDisputeDeniedEmailHtml = async (
  input: InvoicingInvoiceDisputeDeniedEmailRenderInput
): Promise<string> => {
  const theme = invoicingDocumentEmailThemeHex(input.documentThemeColor);
  const companyName = input.issuerSnapshot.companyName?.trim() ?? "";
  const companyAddress = input.issuerSnapshot.companyAddress?.trim() ?? "";
  const companyAddressLines = companyAddress ? splitAddressLines(companyAddress) : [];
  const billingAddress = formatInvoicingCustomerBillingAddress(input.customerSnapshot);
  const customerName = input.customerSnapshot.organizationName?.trim() ?? "";
  const contactName = input.customerSnapshot.contactName?.trim() ?? "";
  const customerPhone = input.customerSnapshot.phone?.trim() ?? "";
  const customerEmail = input.customerSnapshot.email?.trim() ?? "";
  const headerMetaLines = [`Invoice number ${input.displayNumber}`];
  const message = buildDenialMessage(input);

  const documentCard = `<div style="width:100%;max-width:${INVOICING_EMAIL_DOC_MAX_WIDTH};margin:0 auto;background-color:#ffffff;font-family:${INVOICING_EMAIL_FONT_STACK};color:#0f172a;">
    ${renderDenialHeader({
      theme,
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
    ${invoicingEmailPaddedSection(
      `${invoicingEmailLeftText("Confirmation", "font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;")}
       <div style="font-size:13px;line-height:1.5;color:#475569;text-align:left;">${invoicingEmailNl2br(message)}</div>`,
      "padding-top:8px;padding-bottom:8px;"
    )}
    ${renderInvoicingEmailNoteCard({
      label: "Comment",
      text: input.denialReason,
      extraSectionStyle: "padding-bottom:8px;border-bottom:1px solid #e7e5e4;"
    })}
    ${renderInvoiceSummarySection({ theme, renderInput: input })}
    ${renderInvoicingEmailIssuerFooter(input.issuerSnapshot, input.footerText)}
  </div>`;

  const mjml = `<mjml>
  <mj-head>
    <mj-title>${escapeInvoicingEmailHtml("Dispute denied")} — ${escapeInvoicingEmailHtml(input.displayNumber)}</mj-title>
    <mj-attributes>
      <mj-all font-family="${INVOICING_EMAIL_FONT_STACK}" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f5f5f4" width="${INVOICING_EMAIL_DOC_MAX_WIDTH}">
    <mj-wrapper background-color="#f5f5f4" padding="24px 16px">
      <mj-section background-color="#ffffff" border="1px solid #e7e5e4" border-radius="12px" padding="0">
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
    throw new Error(`Invoice dispute denial email MJML compile failed: ${message}`);
  }
  return html;
};
