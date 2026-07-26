/**
 * SalesBdrPage.
 *
 * Thin route wrapper mounting the BDR kanban board at `/admin/sales/bdr`.
 */

import { SalesBdrKanban } from "./SalesBdrKanban.js";

/** BDR board page — delegates to {@link SalesBdrKanban}. */
export const SalesBdrPage = () => <SalesBdrKanban />;
