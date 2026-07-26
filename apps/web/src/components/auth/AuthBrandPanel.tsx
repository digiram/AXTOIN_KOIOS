/**
 * Left column inside the auth card — indigo hero pane (matches primary `indigo-600` actions on the form).
 *
 * Responsibilities:
 * - Brand kicker, title, and blurb for login / signup
 * - KOIOS owl mark (`KoiosLogoMark`) matching the shell menu chip
 *
 * Related:
 * - `AuthCardShell`, `KoiosLogo`
 */

import { KoiosLogoMark } from "../KoiosLogo.js";

type Variant = "login" | "signup";

const copy: Record<Variant, { kicker: string; title: string; blurb: string }> = {
  login: {
    kicker: "KOIOS",
    title: "Workspace access",
    blurb:
      "Sign in with your work email — your organization is inferred from the domain. Platform administrators use their assigned username or id."
  },
  signup: {
    kicker: "KOIOS",
    title: "New organization",
    blurb:
      "Your work email domain groups your realm; the first colleague to sign up becomes tenant administrator. Personal mail providers get a private member realm instead."
  }
};

export const AuthBrandPanel = ({ variant }: { variant: Variant }) => {
  const c = copy[variant];

  return (
    <aside className="relative flex min-h-[14rem] flex-shrink-0 flex-col justify-center overflow-hidden border-b border-indigo-950/30 bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 px-6 py-10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] sm:px-8 lg:min-h-0 lg:w-[42%] lg:max-w-md lg:border-b-0 lg:border-r lg:border-indigo-950/40 lg:py-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_0%_0%,rgba(255,255,255,0.14),transparent_52%)]"
        aria-hidden
      />
      <div className="relative z-10">
        <KoiosLogoMark />
        <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-indigo-200">{c.kicker}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{c.title}</h2>
        <div className="mt-4 h-1 w-10 rounded-full bg-indigo-300/90" aria-hidden />
        <p className="mt-5 max-w-sm text-sm leading-6 text-indigo-100">{c.blurb}</p>
      </div>
    </aside>
  );
};
