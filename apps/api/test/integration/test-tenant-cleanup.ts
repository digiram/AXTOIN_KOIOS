/**
 * Tear down tenants (and cascaded users) created by integration tests.
 */

import { deleteTenantsByIds } from "@starter/db";

export const cleanupTestTenants = async (
  ...tenantIds: Array<string | undefined | null>
): Promise<void> => {
  const ids = tenantIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return;
  await deleteTenantsByIds(ids);
};
