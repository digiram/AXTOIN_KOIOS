/**
 * SalesFunnelActivityContactLinks
 *
 * Renders CRM contact links attached to a funnel activity row.
 *
 * Responsibilities:
 * - Resolve contact refs from activity payload or parsed contact ids
 * - Link each contact to the CRM contact detail route
 *
 * Related:
 * - `SalesFunnelActivitySection`; `@starter/shared` contact id parser
 */
import { Link } from "react-router-dom";

import { parseSalesFunnelActivityContactIds } from "@starter/shared";

import type { FunnelActivityContactRef, FunnelActivityItem } from "../../pages/sales/SalesFunnelActivityTimeline.js";

const activityContacts = (a: FunnelActivityItem): FunnelActivityContactRef[] => {
  if (a.activityContacts?.length) return a.activityContacts;
  return parseSalesFunnelActivityContactIds(a.payload).map((contactId) => ({
    contactId,
    displayName: contactId
  }));
};

type Props = {
  activity: FunnelActivityItem;
  crmBase: string;
  className?: string;
};

/** Inline CRM contact links for one funnel activity entry. */
export const SalesFunnelActivityContactLinks = ({ activity, crmBase, className = "" }: Props) => {
  const contacts = activityContacts(activity);
  if (contacts.length === 0) return null;

  return (
    <div className={`flex flex-wrap justify-end gap-1 ${className}`.trim()}>
      {contacts.map((c) => (
        <Link
          key={c.contactId}
          to={`${crmBase}/contacts/${encodeURIComponent(c.contactId)}`}
          className="max-w-[10rem] truncate rounded-full border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800 underline decoration-indigo-400/50 underline-offset-2 hover:bg-indigo-100 hover:text-indigo-950"
        >
          {c.displayName}
        </Link>
      ))}
    </div>
  );
};
