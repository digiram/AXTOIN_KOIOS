/**
 * SalesPipelinePage.
 *
 * Thin route wrapper mounting the pipeline kanban board at `/admin/sales/pipeline`.
 */

import { SalesPipelineKanban } from "./SalesPipelineKanban.js";

/** Pipeline board page — delegates to {@link SalesPipelineKanban}. */
export const SalesPipelinePage = () => <SalesPipelineKanban />;
