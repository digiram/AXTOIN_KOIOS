/**
 * ShellRouteMeta.
 *
 * Maps tenant shell pathnames to default header title and subtitle used
 * by `AppShell` before pages override via `useShellHeader`.
 *
 * Responsibilities:
 * - CRM, workforce, sales, invoicing, mailbox, and settings path patterns
 * - Export `metaForTenantAdminPath` and `metaForTenantMemberPath`
 */
import { SETTINGS_SHELL_SUBTITLE, SETTINGS_SHELL_TITLE } from "../pages/settings/settingsShellCopy.js";

/** Default shell header copy for a pathname under `/admin/*`. */
export type ShellRouteMeta = {
  title: string;
  subtitle?: string;
};

const CRM_ORG_DETAIL = /\/crm\/organizations\/[^/]+$/;
const CRM_ORG_LIST = /\/crm\/organizations\/?$/;

const CRM_CONTACT_DETAIL = /\/crm\/contacts\/[^/]+$/;
const CRM_CONTACT_LIST = /\/crm\/contacts\/?$/;

function metaForCrmPath(pathname: string): ShellRouteMeta | null {
  if (CRM_ORG_DETAIL.test(pathname)) {
    return {
      title: "Organization",
      subtitle: "Profile, relationships, and activity."
    };
  }
  if (CRM_ORG_LIST.test(pathname)) {
    return {
      title: "Organizations",
      subtitle: "Companies and entities in your tenant — search, add, and open records."
    };
  }

  if (CRM_CONTACT_DETAIL.test(pathname)) {
    return {
      title: "Contact",
      subtitle: "Profile, relationships, and activity."
    };
  }
  if (CRM_CONTACT_LIST.test(pathname)) {
    return {
      title: "Contacts",
      subtitle: "People in your CRM — search, add, and open records."
    };
  }

  return null;
}

/** Tenant admin (`/admin/*`) shell title + one-line explainer. */
export function metaForTenantAdminPath(pathname: string): ShellRouteMeta {
  if (pathname.endsWith("/settings")) {
    return { title: SETTINGS_SHELL_TITLE, subtitle: SETTINGS_SHELL_SUBTITLE };
  }
  if (/\/admin\/workforce\/employees\/[0-9a-f-]{36}\/?$/i.test(pathname)) {
    return {
      title: "Employee",
      subtitle: "Workforce record — org chart assignees are managed separately."
    };
  }
  if (pathname === "/admin/workforce/employees" || pathname === "/admin/workforce/employees/") {
    return {
      title: "Employees",
      subtitle: "Workforce people and agents — data for org-chart assignees."
    };
  }
  if (pathname === "/admin/workforce/chart" || pathname === "/admin/workforce/chart/") {
    return {
      title: "Organizational Structure & Leadership",
      subtitle: "Drag staff onto the canvas or boxes to place roles in the hierarchy."
    };
  }
  if (pathname === "/admin/workforce/organization" || pathname === "/admin/workforce/organization/") {
    return {
      title: "Organization",
      subtitle: "Org hierarchy with employment members under each unit (excluding managers)."
    };
  }
  if (pathname === "/admin/workforce" || pathname === "/admin/workforce/") {
    return {
      title: "Employees",
      subtitle: "Workforce people and agents — data for org-chart assignees."
    };
  }
  if (pathname.includes("/admin/sales/records")) {
    return {
      title: "Sales",
      subtitle: "Search and filter all BDR leads and sales deals in one table."
    };
  }
  if (pathname.match(/\/admin\/sales\/pipeline\/deals\/[^/]+$/)) {
    return {
      title: "Deal",
      subtitle: "Deal profile and activity."
    };
  }
  if (pathname.includes("/admin/sales/pipeline")) {
    return {
      title: "Sales",
      subtitle: "Opportunity pipeline — deals and revenue progression."
    };
  }
  if (pathname.match(/\/admin\/sales\/bdr\/leads\/[^/]+$/)) {
    return {
      title: "Lead",
      subtitle: "Lead profile and activity."
    };
  }
  if (pathname.includes("/admin/sales/settings")) {
    return {
      title: "Sales",
      subtitle: "Contact role labels for leads and deals."
    };
  }
  if (pathname.includes("/admin/sales")) {
    return {
      title: "Sales",
      subtitle: "BDR prospecting and lead qualification."
    };
  }
  if (pathname.match(/\/admin\/company-subscriptions\/providers\/[^/]+$/)) {
    return {
      title: "Provider",
      subtitle: "Vendor subscription, plans, seats, and documents."
    };
  }
  if (pathname.includes("/admin/company-subscriptions")) {
    return {
      title: "Company subscriptions",
      subtitle: "Track vendor SaaS subscriptions, renewal dates, seats, and documented costs."
    };
  }
  if (pathname.includes("/admin/invoicing/payments")) {
    return {
      title: "Invoicing & quoting",
      subtitle: "Register and review payments against sent invoices."
    };
  }
  if (pathname.match(/\/admin\/invoicing\/quotes\/[^/]+\/edit$/)) {
    return {
      title: "Edit quote",
      subtitle: "Update customer, lines, and dates while the quote is still a draft."
    };
  }
  if (pathname.match(/\/admin\/invoicing\/quotes\/new$/)) {
    return {
      title: "New quote",
      subtitle: "Create a commercial quote and link a CRM customer before promoting."
    };
  }
  if (pathname.match(/\/admin\/invoicing\/quotes\/[^/]+$/)) {
    return {
      title: "Quote",
      subtitle: "Commercial quote — promote to offer or invoice when ready."
    };
  }
  if (pathname.match(/\/admin\/invoicing\/offers\/[^/]+$/)) {
    return {
      title: "Offer",
      subtitle: "Customer-facing commercial offer — promote to invoice when accepted."
    };
  }
  if (pathname.match(/\/admin\/invoicing\/invoices\/[^/]+$/)) {
    return {
      title: "Invoice",
      subtitle: "Billing document — send when amounts and customer details are correct."
    };
  }
  if (pathname.includes("/admin/invoicing/payments")) {
    return {
      title: "Payments",
      subtitle: "Registered invoice payments and partial-payment revisions."
    };
  }
  if (pathname.includes("/admin/invoicing/catalog")) {
    return {
      title: "Catalog",
      subtitle: "Reusable products and services for quote line items."
    };
  }
  if (pathname.includes("/admin/invoicing/configuration")) {
    return {
      title: "Configuration",
      subtitle: "Numbering, quote-to-invoice rules, and default document text."
    };
  }
  if (pathname.includes("/admin/invoicing")) {
    return {
      title: "Invoicing & quoting",
      subtitle: "Quotes, offers, and invoices for your customers — separate from platform billing."
    };
  }
  if (pathname.includes("/admin/mailbox/accounts")) {
    return {
      title: "Mailbox settings",
      subtitle: "Connected accounts, sync, and mailbox preferences."
    };
  }
  if (pathname.includes("/admin/mailbox/calendar")) {
    return {
      title: "Calendar",
      subtitle: "Appointments from meeting invites and RSVPs."
    };
  }
  if (pathname.includes("/admin/mailbox/compose")) {
    return {
      title: "Compose",
      subtitle: "Send mail from a connected account."
    };
  }
  if (pathname.includes("/admin/mailbox")) {
    return {
      title: "Mailbox",
      subtitle: "Internal notifications and synced external inboxes in one place."
    };
  }
  if (pathname.includes("/admin/users")) {
    return {
      title: "Users",
      subtitle: "People in your organization (tenant-scoped). Reset passwords or open member details."
    };
  }
  if (pathname.includes("/admin/system")) {
    return {
      title: "System configuration",
      subtitle:
        "Realm general options, outbound email SMTP, CRM relationship types, and organization market segments — tabbed settings below."
    };
  }

  const crm = metaForCrmPath(pathname);
  if (crm) return crm;

  return {
    title: "Dashboard",
    subtitle: "Tenant administration — members, CRM, workforce, and realm settings for your organization."
  };
}

/** Tenant member (`/user/*`) shell title + one-line explainer. */
export function metaForTenantMemberPath(pathname: string): ShellRouteMeta {
  if (pathname.endsWith("/settings")) {
    return { title: SETTINGS_SHELL_TITLE, subtitle: SETTINGS_SHELL_SUBTITLE };
  }
  if (pathname.includes("/user/profile")) {
    return {
      title: "Profile",
      subtitle: "Your account identifiers on this tenant."
    };
  }

  const crm = metaForCrmPath(pathname);
  if (crm) return crm;

  return {
    title: "Home",
    subtitle: "Your workspace — CRM shortcuts, profile, and account settings."
  };
}
