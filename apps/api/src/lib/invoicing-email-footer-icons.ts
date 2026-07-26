/**
 * Footer icon tiles for invoicing emails — Lucide SVGs rasterized to PNG via sharp,
 * attached inline with `cid:` for broad email client support.
 */
import { Building2, Landmark, Mail, Phone, Receipt } from "lucide-static";
import type { Attachment } from "nodemailer/lib/mailer/index.js";
import sharp from "sharp";

export type InvoicingEmailFooterIconKind = "phone" | "email" | "vat" | "coc" | "bank";

const TILE_SIZE = 28;
const ICON_SIZE = 14;
const ICON_OFFSET = (TILE_SIZE - ICON_SIZE) / 2;
const ICON_SCALE = ICON_SIZE / 24;
const TILE_BG = "#059669";

const FOOTER_LUCIDE_SVGS: Record<InvoicingEmailFooterIconKind, string> = {
  phone: Phone,
  email: Mail,
  vat: Receipt,
  coc: Building2,
  bank: Landmark
};

const lucideInnerContent = (svg: string): string =>
  svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]?.trim() ?? "";

const renderFooterIconTileSvg = (lucideSvg: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}">
  <rect width="${TILE_SIZE}" height="${TILE_SIZE}" rx="4" fill="${TILE_BG}"/>
  <g transform="translate(${ICON_OFFSET}, ${ICON_OFFSET}) scale(${ICON_SCALE})">
    <g fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${lucideInnerContent(lucideSvg)}
    </g>
  </g>
</svg>`;

const renderFooterIconTilePng = async (kind: InvoicingEmailFooterIconKind): Promise<Buffer> =>
  sharp(Buffer.from(renderFooterIconTileSvg(FOOTER_LUCIDE_SVGS[kind]))).png().toBuffer();

export const invoicingEmailFooterIconCid = (kind: InvoicingEmailFooterIconKind): string =>
  `invoicing-footer-${kind}@starter`;

export const invoicingEmailFooterIconSrc = (kind: InvoicingEmailFooterIconKind): string =>
  `cid:${invoicingEmailFooterIconCid(kind)}`;

const invoicingEmailFooterIconDataSrc = async (kind: InvoicingEmailFooterIconKind): Promise<string> => {
  const png = await renderFooterIconTilePng(kind);
  return `data:image/png;base64,${png.toString("base64")}`;
};

/** Replace email-only `cid:` footer icons with inline data URLs for browser HTML previews. */
export const rewriteInvoicingEmailFooterCidsForBrowserPreview = async (html: string): Promise<string> => {
  if (!html.includes("cid:invoicing-footer-")) return html;
  const kinds = Object.keys(FOOTER_LUCIDE_SVGS) as InvoicingEmailFooterIconKind[];
  let result = html;
  for (const kind of kinds) {
    const cidSrc = invoicingEmailFooterIconSrc(kind);
    if (!result.includes(cidSrc)) continue;
    const dataSrc = await invoicingEmailFooterIconDataSrc(kind);
    result = result.split(cidSrc).join(dataSrc);
  }
  return result;
};

let cachedAttachments: Promise<Attachment[]> | null = null;

/** Inline PNG attachments referenced by footer `cid:` image sources. */
export const getInvoicingEmailFooterIconAttachments = (): Promise<Attachment[]> => {
  cachedAttachments ??= (async () => {
    const kinds = Object.keys(FOOTER_LUCIDE_SVGS) as InvoicingEmailFooterIconKind[];
    return Promise.all(
      kinds.map(async (kind) => ({
        filename: `${kind}.png`,
        content: await renderFooterIconTilePng(kind),
        cid: invoicingEmailFooterIconCid(kind),
        contentType: "image/png",
        contentDisposition: "inline" as const
      }))
    );
  })();
  return cachedAttachments;
};
