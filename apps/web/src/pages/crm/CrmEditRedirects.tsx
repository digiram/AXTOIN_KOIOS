/**
 * CrmEditRedirects.
 *
 * Compatibility redirects from legacy `/edit` CRM URLs to detail pages with `?edit=1`.
 *
 * Responsibilities:
 * - Preserve bookmarks for organization and contact edit routes
 * - Resolve role-aware CRM base path via {@link useCrmBasePath}
 *
 * Related:
 * - {@link CrmOrganizationDetailPage} and {@link CrmContactDetailPage} open modals from search params
 */

import { Navigate, useParams } from "react-router-dom";

import { useCrmBasePath } from "./crmPaths.js";

/**
 * Old `/…/organizations/:id/edit` URLs open the detail page with the edit modal (`?edit=1`).
 *
 * @returns Navigate to organization detail or list when `id` is missing
 */
export const CrmOrganizationEditRedirect = () => {
  const { id } = useParams<{ id: string }>();
  const crmBase = useCrmBasePath();
  if (!id) return <Navigate to={`${crmBase}/organizations`} replace />;
  return <Navigate to={`${crmBase}/organizations/${encodeURIComponent(id)}?edit=1`} replace />;
};

/**
 * Old `/…/contacts/:id/edit` URLs open the detail page with the edit modal (`?edit=1`).
 *
 * @returns Navigate to contact detail or list when `id` is missing
 */
export const CrmContactEditRedirect = () => {
  const { id } = useParams<{ id: string }>();
  const crmBase = useCrmBasePath();
  if (!id) return <Navigate to={`${crmBase}/contacts`} replace />;
  return <Navigate to={`${crmBase}/contacts/${encodeURIComponent(id)}?edit=1`} replace />;
};
