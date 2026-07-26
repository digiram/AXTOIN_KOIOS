/**
 * Invoicing Document Sidebar Action.
 *
 * Reusable invoicing and quoting UI building block: Invoicing Document Sidebar Action.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/invoicing
 */
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentSidebarActionIconClass = "h-4 w-4 shrink-0";

const SidebarActionIcon = ({ icon: Icon }: { icon: LucideIcon }) => (
  <Icon className={invDocumentSidebarActionIconClass} aria-hidden strokeWidth={2} />
);

/** React component for invoicing & quoting UI. */
export const InvoicingDocumentSidebarActionButton = ({
  icon,
  children,
  className,
  ...props
}: {
  icon: LucideIcon;
  children: ReactNode;
  className: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "type">) => (
  <button type="button" className={className} {...props}>
    <SidebarActionIcon icon={icon} />
    <span>{children}</span>
  </button>
);

/** React component for invoicing & quoting UI. */
export const InvoicingDocumentSidebarActionLink = ({
  icon,
  children,
  className,
  ...props
}: {
  icon: LucideIcon;
  children: ReactNode;
  className: string;
} & Omit<LinkProps, "children" | "className">) => (
  <Link className={className} {...props}>
    <SidebarActionIcon icon={icon} />
    <span>{children}</span>
  </Link>
);
