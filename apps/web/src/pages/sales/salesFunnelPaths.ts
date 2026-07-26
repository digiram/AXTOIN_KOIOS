/**
 * SalesFunnelPaths.
 *
 * Canonical path constants and builders for Sales funnel boards and record detail routes.
 *
 * Responsibilities:
 * - Export BDR, pipeline, and records list paths
 * - Build encoded lead and deal detail URLs
 */

/** BDR kanban board route under tenant admin sales hub. */
export const salesBdrBoardPath = "/admin/sales/bdr";
/** Pipeline kanban board route. */
export const salesPipelineBoardPath = "/admin/sales/pipeline";
/** Cross-board funnel records list route. */
export const salesFunnelRecordsPath = "/admin/sales/records";

/**
 * Full-page BDR lead detail path.
 *
 * @param leadId - Funnel record id
 */
export const salesLeadDetailPath = (leadId: string) =>
  `${salesBdrBoardPath}/leads/${encodeURIComponent(leadId)}`;

/**
 * Full-page pipeline deal detail path.
 *
 * @param dealId - Funnel record id
 */
export const salesDealDetailPath = (dealId: string) =>
  `${salesPipelineBoardPath}/deals/${encodeURIComponent(dealId)}`;
