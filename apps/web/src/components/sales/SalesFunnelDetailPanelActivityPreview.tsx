/**
 * SalesFunnelDetailPanelActivityPreview
 *
 * Compact recent-activity preview on funnel board detail panels.
 *
 * Responsibilities:
 * - Fetch the latest N activities for a lead or deal
 * - Render mini timeline with link to full detail activity tab
 *
 * Related:
 * - Sales funnel kanban detail panel; `SalesFunnelActivityTimeline`
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { API_BASE_URL } from "../../lib/api.js";
import { useCrmBasePath } from "../../pages/crm/crmPaths.js";
import {
  SalesFunnelActivityTimeline,
  type FunnelActivityItem
} from "../../pages/sales/SalesFunnelActivityTimeline.js";
import { useSalesApi } from "../../pages/sales/useSalesApi.js";

const RECENT_ACTIVITY_LIMIT = 3;

type Props = {
  kind: "lead" | "deal";
  recordId: string;
  detailHref?: string | null;
};

/** Recent activity snippet with optional link to the full activity view. */
export const SalesFunnelDetailPanelActivityPreview = ({ kind, recordId, detailHref }: Props) => {
  const { authedFetch } = useSalesApi();
  const crmBase = useCrmBasePath();
  const [activities, setActivities] = useState<FunnelActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const activitiesUrl =
    kind === "lead"
      ? `${API_BASE_URL}/tenant/sales/bdr/leads/${encodeURIComponent(recordId)}/activities`
      : `${API_BASE_URL}/tenant/sales/deals/${encodeURIComponent(recordId)}/activities`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(activitiesUrl);
      if (!res?.ok) {
        setActivities([]);
        return;
      }
      const j = (await res.json()) as { activities: FunnelActivityItem[] };
      setActivities(j.activities ?? []);
    } catch {
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [activitiesUrl, authedFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const recent = activities.slice(0, RECENT_ACTIVITY_LIMIT);

  return (
    <section className="mt-6 border-t border-stone-100 pt-4" aria-label="Recent activity">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Recent activity</h4>
        {detailHref && activities.length > 0 ? (
          <Link
            to={detailHref}
            className="shrink-0 text-xs font-medium text-indigo-700 underline decoration-indigo-400/60 underline-offset-2 hover:text-indigo-900"
          >
            View all
          </Link>
        ) : null}
      </div>
      {loading ? (
        <p className="mt-3 text-sm text-stone-500">Loading activity…</p>
      ) : (
        <SalesFunnelActivityTimeline
          activities={recent}
          variant="compact"
          heading={null}
          className="mt-3"
          crmBase={crmBase}
        />
      )}
    </section>
  );
};
