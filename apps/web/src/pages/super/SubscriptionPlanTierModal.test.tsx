/**
 * Subscription Plan Tier modal.
 *
 * Unit tests for Subscription Plan Tier Modal behavior in the super-admin module.
 *
 * Responsibilities:
 * - Assert edge cases and regressions for SubscriptionPlanTierModal
 * - Document expected inputs and outputs via test names
 *
 * Related:
 * - SubscriptionPlanTierModal.ts(x)
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import { SubscriptionPlanTierModal } from "./SubscriptionPlanTierModal.js";

describe("SubscriptionPlanTierModal", () => {
  it("SSR render open/create does not throw (hooks + required props)", () => {
    const html = renderToString(
      <SubscriptionPlanTierModal
        open
        mode="create"
        plan={null}
        subscriptionCurrencyCode="EUR"
        authHeaders={() => ({})}
        refreshSession={async () => true}
        logout={() => {}}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    );
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("EUR");
  });
});
