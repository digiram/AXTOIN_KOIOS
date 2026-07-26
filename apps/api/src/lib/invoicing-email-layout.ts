/**
 * Shared HTML fragments for invoicing emails (issuer footer, offer response card, section helpers).
 */

import {
  escapeInvoicingEmailHtml,
  type InvoicingIssuerSnapshot
} from "@starter/shared";

import {
  invoicingEmailFooterIconSrc,
  type InvoicingEmailFooterIconKind
} from "./invoicing-email-footer-icons.js";

export const INVOICING_EMAIL_FONT_STACK =
  "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
export const INVOICING_EMAIL_DOC_MAX_WIDTH = "720px";
export const INVOICING_EMAIL_CONTENT_PAD_X = "24px";
export const INVOICING_EMAIL_CONTENT_PAD_Y = "16px";

/** Matches quote document footer icon tiles (`bg-emerald-600`). */
export const INVOICING_EMAIL_FOOTER_ICON_TILE_BG = "#059669";

export const invoicingEmailNl2br = (text: string): string =>
  escapeInvoicingEmailHtml(text).replace(/\r?\n/g, "<br/>");

export const invoicingEmailLeftText = (text: string, style: string): string =>
  `<div style="margin:0;padding:0;text-align:left;${style}">${escapeInvoicingEmailHtml(text)}</div>`;

export const invoicingEmailRightText = (text: string, style: string): string =>
  `<div style="margin:0;padding:0;text-align:right;${style}">${escapeInvoicingEmailHtml(text)}</div>`;

export const invoicingEmailCenterText = (text: string, style: string): string =>
  `<div style="margin:0;padding:0;text-align:center;${style}">${escapeInvoicingEmailHtml(text)}</div>`;

export const invoicingEmailPaddedSection = (innerHtml: string, extraStyle = ""): string =>
  `<div style="padding:${INVOICING_EMAIL_CONTENT_PAD_Y} ${INVOICING_EMAIL_CONTENT_PAD_X};${extraStyle}">${innerHtml}</div>`;

type IssuerFooterItemKind = InvoicingEmailFooterIconKind;

type IssuerFooterItem = {
  kind: IssuerFooterItemKind;
  label?: string;
  value: string;
};

const renderFooterIconTile = (kind: IssuerFooterItemKind): string =>
  `<img src="${invoicingEmailFooterIconSrc(kind)}" width="28" height="28" alt="" style="display:block;border:0;outline:none;" />`;

const issuerFooterItems = (issuerSnapshot: InvoicingIssuerSnapshot): IssuerFooterItem[] => {
  const items: IssuerFooterItem[] = [];
  const phone = issuerSnapshot.companyPhone?.trim();
  const email = issuerSnapshot.companyEmail?.trim();
  const vat = issuerSnapshot.vatIdentificationNumber?.trim();
  const coc = issuerSnapshot.chamberOfCommerceNumber?.trim();
  const bank = issuerSnapshot.bankAccountNumber?.trim();

  if (phone) items.push({ kind: "phone", value: phone });
  if (email) items.push({ kind: "email", value: email });
  if (vat) items.push({ kind: "vat", label: "VAT ID", value: vat });
  if (coc) items.push({ kind: "coc", label: "Chamber of Commerce", value: coc });
  if (bank) items.push({ kind: "bank", label: "Bank account", value: bank });
  return items;
};

const renderIssuerFooterItem = (item: IssuerFooterItem, index: number): string => {
  const separator =
    index > 0 ? "border-left:1px solid #d6d3d1;padding-left:16px;margin-left:16px;" : "";
  const text = item.label
    ? `<span style="color:#64748b;">${escapeInvoicingEmailHtml(item.label)}: </span><span style="color:#334155;">${escapeInvoicingEmailHtml(item.value)}</span>`
    : `<span style="color:#334155;">${escapeInvoicingEmailHtml(item.value)}</span>`;

  return `<span style="display:inline-block;vertical-align:middle;margin:0 0 12px 0;${separator}">
    <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-block;vertical-align:middle;border-collapse:collapse;">
      <tr>
        <td style="padding-right:8px;vertical-align:middle;">${renderFooterIconTile(item.kind)}</td>
        <td style="font-size:13px;line-height:1.4;text-align:left;vertical-align:middle;">${text}</td>
      </tr>
    </table>
  </span>`;
};

/** Issuer contact/legal strip + optional free-text footer (matches on-screen document footer). */
export const renderInvoicingEmailIssuerFooter = (
  issuerSnapshot: InvoicingIssuerSnapshot,
  footerText?: string | null
): string => {
  const items = issuerFooterItems(issuerSnapshot);
  const sections: string[] = [];

  if (items.length > 0) {
    sections.push(
      invoicingEmailPaddedSection(
        `<div style="text-align:center;font-size:0;line-height:0;">${items.map(renderIssuerFooterItem).join("")}</div>`,
        "padding-top:16px;border-top:1px solid #e7e5e4;"
      )
    );
  }

  const trimmedFooter = footerText?.trim() ?? "";
  if (trimmedFooter) {
    sections.push(
      invoicingEmailPaddedSection(
        `<div style="font-size:12px;line-height:1.5;color:#64748b;text-align:center;">${invoicingEmailNl2br(trimmedFooter)}</div>`,
        items.length > 0 ? "padding-top:12px;" : "padding-top:16px;border-top:1px solid #e7e5e4;"
      )
    );
  }

  return sections.join("");
};

/** Standalone card shown above the offer document in offer emails. */
export const renderOfferResponseCardHtml = (input: {
  theme: { primary: string };
  acceptUrl: string;
  rejectUrl: string;
}): string => {
  const buttonBase =
    "display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;";
  const acceptButton = `<a href="${escapeInvoicingEmailHtml(input.acceptUrl)}" style="${buttonBase}background:${input.theme.primary};color:#ffffff;margin:0 6px 8px;">Accept offer</a>`;
  const rejectButton = `<a href="${escapeInvoicingEmailHtml(input.rejectUrl)}" style="${buttonBase}background:#ffffff;color:#0f172a;border:1px solid #e7e5e4;margin:0 6px 8px;">Reject offer</a>`;

  const inner = invoicingEmailPaddedSection(
    `${invoicingEmailCenterText("Respond to this offer", "font-size:15px;font-weight:700;color:#0f172a;margin-bottom:10px;")}
     <div style="font-size:13px;line-height:1.5;color:#475569;margin-bottom:14px;text-align:center;">
       Use the secure links below to accept or reject this offer on our website. You will be asked for your name and a short comment.
     </div>
     <div style="text-align:center;">${acceptButton}${rejectButton}</div>`,
    "padding-top:20px;padding-bottom:20px;"
  );

  return `<div style="width:100%;max-width:${INVOICING_EMAIL_DOC_MAX_WIDTH};margin:0 auto;background-color:#ffffff;border:1px solid #e7e5e4;border-radius:12px;font-family:${INVOICING_EMAIL_FONT_STACK};color:#0f172a;">${inner}</div>`;
};

/** Bordered panel with a themed label strip (matches document “To” blocks). */
export const renderInvoicingEmailLabelPanel = (input: {
  theme: { primary: string };
  label: string;
  bodyHtml: string;
  extraSectionStyle?: string;
}): string =>
  invoicingEmailPaddedSection(
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
      <tr>
        <td width="56" valign="middle" align="center" style="background:${input.theme.primary};color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:12px 6px;">${escapeInvoicingEmailHtml(input.label)}</td>
        <td style="background:#fafaf9;padding:12px 20px;vertical-align:top;font-size:13px;line-height:1.5;color:#0f172a;text-align:left;">${input.bodyHtml}</td>
      </tr>
    </table>`,
    input.extraSectionStyle ?? "padding-top:8px;padding-bottom:8px;"
  );

/** Gray card with a label heading and note body (customer or company text). */
export const renderInvoicingEmailNoteCard = (input: {
  label: string;
  text: string;
  extraSectionStyle?: string;
}): string => {
  const text = input.text.trim();
  if (!text) return "";

  return invoicingEmailPaddedSection(
    `<div style="background:#f5f5f4;border-radius:12px;padding:16px 20px;">
      ${invoicingEmailLeftText(input.label, "font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;")}
      <div style="font-size:13px;line-height:1.5;color:#475569;text-align:left;white-space:pre-wrap;">${invoicingEmailNl2br(text)}</div>
    </div>`,
    input.extraSectionStyle ?? "padding-top:8px;padding-bottom:8px;"
  );
};

/** Customer dispute note — gray card with label and text only. */
export const renderInvoicingEmailCustomerNotePanel = (input: {
  note: string;
  extraSectionStyle?: string;
}): string =>
  renderInvoicingEmailNoteCard({
    label: "Customer note",
    text: input.note,
    extraSectionStyle: input.extraSectionStyle
  });
