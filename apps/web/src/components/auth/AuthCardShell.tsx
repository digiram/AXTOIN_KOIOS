/**
 * AuthCardShell
 *
 * Centered split card layout for login and signup flows.
 *
 * Responsibilities:
 * - Neutral full-viewport canvas with max-width column
 * - Left brand hero (`AuthBrandPanel`) and right form column on large screens
 * - Optional slot below the card (dev shortcuts, legal links)
 *
 * Related:
 * - `/login`, `/signup` pages; `AuthBrandPanel`
 */
import type { ReactNode } from "react";

import { AuthBrandPanel } from "./AuthBrandPanel.js";

type Variant = "login" | "signup";

/**
 * Centered card on a neutral canvas; split layout (intro left, form right on large screens).
 */
export const AuthCardShell = ({
  variant,
  eyebrow,
  title,
  children,
  belowCard
}: {
  variant: Variant;
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** Rendered below the white card, still aligned to the same max-width column (e.g. dev shortcuts). */
  belowCard?: ReactNode;
}) => (
  <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
    <div className="sm:mx-auto sm:w-full sm:max-w-4xl">
      <div className="flex flex-col overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5 lg:flex-row lg:items-stretch">
        <AuthBrandPanel variant={variant} />

        <div className="flex min-h-0 flex-1 flex-col justify-center border-t border-gray-200 bg-white px-6 py-8 sm:px-8 lg:border-l lg:border-t-0 lg:border-indigo-950/10 lg:px-10 lg:py-10">
          <p className="text-sm font-medium text-gray-500">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          <div className="mt-8">{children}</div>
        </div>
      </div>
      {belowCard ? <div className="mt-6">{belowCard}</div> : null}
    </div>
  </div>
);
