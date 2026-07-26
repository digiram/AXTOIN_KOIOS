/** Shell nav icons — Lucide (`lucide-react`) with consistent sizing for the left ribbon. */

import {
  Boxes,
  Building2,
  Contact,
  Home,
  Layers,
  LayoutDashboard,
  Mail,
  Inbox,
  Landmark,
  Network,
  Plug2,
  ReceiptText,
  RefreshCw,
  Repeat,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  User,
  Users
} from "lucide-react";

const shell = "h-5 w-5 shrink-0";

export const DashboardIcon = () => (
  <LayoutDashboard className={shell} aria-hidden strokeWidth={2} />
);

export const SettingsIcon = () => <Settings className={shell} aria-hidden strokeWidth={2} />;

export const HomeIcon = () => <Home className={shell} aria-hidden strokeWidth={2} />;

export const UserIcon = () => <User className={shell} aria-hidden strokeWidth={2} />;

export const UsersIcon = () => <Users className={shell} aria-hidden strokeWidth={2} />;

export const JobQueuesIcon = () => <Layers className={shell} aria-hidden strokeWidth={2} />;

export const MailIcon = () => <Mail className={shell} aria-hidden strokeWidth={2} />;

export const IntegrationsIcon = () => <Plug2 className={shell} aria-hidden strokeWidth={2} />;

export const SubscriptionsIcon = () => <Repeat className={shell} aria-hidden strokeWidth={2} />;

export const FeaturesIcon = () => <SlidersHorizontal className={shell} aria-hidden strokeWidth={2} />;

export const SystemConfigIcon = () => <Boxes className={shell} aria-hidden strokeWidth={2} />;

export const CrmOrganizationsIcon = () => <Building2 className={shell} aria-hidden strokeWidth={2} />;

export const CrmContactsIcon = () => <Contact className={shell} aria-hidden strokeWidth={2} />;

export const WorkforceIcon = () => <Network className={shell} aria-hidden strokeWidth={2} />;

export const FinanceIcon = () => <Landmark className={shell} aria-hidden strokeWidth={2} />;

export const SalesIcon = () => <TrendingUp className={shell} aria-hidden strokeWidth={2} />;

/** Tenant vendor/SaaS subscription registry (recurring spend). */
export const CompanySubscriptionsIcon = () => (
  <RefreshCw className={shell} aria-hidden strokeWidth={2} />
);

/** Tenant commercial quotes, offers, and invoices. */
export const InvoicingIcon = () => <ReceiptText className={shell} aria-hidden strokeWidth={2} />;

export const MailboxIcon = () => <Inbox className={shell} aria-hidden strokeWidth={2} />;
