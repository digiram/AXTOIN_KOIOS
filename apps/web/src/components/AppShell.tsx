/**
 * AppShell
 *
 * Shared application chrome for tenant admin, super-admin, and end-user dashboards.
 *
 * Responsibilities:
 * - Left icon menu (KOIOS owl mark, nav links, settings, sign out)
 * - Top header band with title, optional subtitle, and MFA enrollment ribbon
 * - Scrollable main content region with consistent horizontal padding
 * - Lock document (`html`/`body`/`#root`) overflow while mounted so only content scrolls
 * - Bridge to `useShellHeader` for per-page header overrides
 *
 * Related:
 * - Layout wrappers under `apps/web/src/layouts/`; `ShellHeaderContext`; `KoiosLogo`
 *
 * Security:
 * - Sign-out clears session via `AuthContext`; MFA ribbon reads realm MFA status.
 */
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { LogOut } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";
import { ShellHeaderBridge } from "./ShellHeaderContext.js";
import { KoiosLogoMark } from "./KoiosLogo.js";
import { SettingsIcon } from "./icons.js";
import { TenantMfaEnrollmentRibbon } from "./TenantMfaEnrollmentRibbon.js";

/** One entry in the left menu strip (icon + route). */
export type ShellNavItem = {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
};

type Props = {
  title: string;
  /** Optional single-line explainer after the title (separator `|`); truncates when space is tight. */
  headerSubtitle?: string;
  nav: ShellNavItem[];
  /** Account settings route (shown above sign out for every role). */
  settingsTo: string;
  children: ReactNode;
};

/**
 * Application chrome shared by platform, admin, and user dashboards.
 *
 * **Shell vocabulary** (use these names in docs, tests, and code review):
 * - **Menu** — left vertical strip (KOIOS owl mark, icon navigation, settings, sign out). Not the same as a single `<nav>` block;
 *   the whole `<aside>` is the menu region.
 * - **Header** — top band with `title`, optional inline `headerSubtitle` (same row, `Title | explainer`); **5%**
 *   horizontal padding each side. Pages may override via `useShellHeader`.
 * - **Content** — page body below the header (`children`); **only this region scrolls**. Menu and header stay
 *   fixed within the viewport. Document scroll is locked while the shell is mounted. Horizontal inset is
 *   **5% padding** on each side (relative to the main column width).
 *
 * Styling: menu gradient matches the auth card indigo pane (`AuthBrandPanel`).
 */
export const AppShell = ({ title, headerSubtitle, nav, settingsTo, children }: Props) => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { logout } = auth;

  const mfaRibbonAuth = useMemo(
    () => ({
      ready: auth.ready,
      user: auth.user,
      getAccessToken: auth.getAccessToken,
      refreshSession: auth.refreshSession,
      logout: auth.logout
    }),
    [auth.ready, auth.user, auth.getAccessToken, auth.refreshSession, auth.logout]
  );

  // Only the content `<main>` should scroll. Lock the document so `100dvh` chrome
  // never adds a second (viewport) scrollbar beside the shell scroller.
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const root = document.getElementById("root");
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevRootHeight = root?.style.height ?? "";
    const prevRootOverflow = root?.style.overflow ?? "";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (root) {
      root.style.height = "100%";
      root.style.overflow = "hidden";
    }
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      if (root) {
        root.style.height = prevRootHeight;
        root.style.overflow = prevRootOverflow;
      }
    };
  }, []);

  return (
    <ShellHeaderBridge layoutTitle={title} layoutSubtitle={headerSubtitle}>
      {({ headerTitle, headerSubtitle: shellSubtitle, headerTitleLeading }) => (
        <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden bg-slate-50 text-slate-900">
          <aside
            data-shell-section="menu"
            className="relative flex min-h-0 w-16 shrink-0 flex-col items-center self-stretch overflow-hidden border-r border-indigo-950/40 bg-gradient-to-b from-indigo-600 via-indigo-700 to-indigo-900 py-4 shadow-[inset_1px_0_0_0_rgba(255,255,255,0.06)]"
            aria-label="Menu"
          >
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.12),transparent_55%)]"
              aria-hidden
            />
            <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center">
              <div className="mb-6">
                <KoiosLogoMark className="h-10 w-10" logoClassName="h-7 w-7" />
              </div>
              <nav className="flex flex-1 flex-col items-center gap-1">
                {nav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={item.label}
                    className={({ isActive }) =>
                      [
                        "flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
                        isActive
                          ? "bg-white text-indigo-700 shadow-sm ring-1 ring-white/50"
                          : "text-indigo-100 hover:bg-white/10 hover:text-white"
                      ].join(" ")
                    }
                  >
                    <span className="sr-only">{item.label}</span>
                    {item.icon}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-auto flex flex-col items-center gap-1">
                <NavLink
                  to={settingsTo}
                  title="Settings"
                  className={({ isActive }) =>
                    [
                      "flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
                      isActive
                        ? "bg-white text-indigo-700 shadow-sm ring-1 ring-white/50"
                        : "text-indigo-100 hover:bg-white/10 hover:text-white"
                    ].join(" ")
                  }
                >
                  <span className="sr-only">Settings</span>
                  <SettingsIcon />
                </NavLink>
                <button
                  type="button"
                  title="Sign out"
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-indigo-200/90 hover:bg-white/10 hover:text-rose-300"
                >
                  <span className="sr-only">Sign out</span>
                  <LogOut className="h-5 w-5" aria-hidden strokeWidth={2} />
                </button>
              </div>
            </div>
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header
              data-shell-section="header"
              className="shrink-0 border-b border-slate-200 bg-white shadow-sm"
            >
              <div className="w-full min-w-0 px-[5%] pb-[0.5625rem] pt-[1.125rem]">
                <h1 className="flex min-w-0 flex-nowrap items-center gap-x-2 text-lg leading-6 text-slate-900">
                  {headerTitleLeading ? (
                    <span className="flex shrink-0 items-center text-slate-600" aria-hidden>
                      {headerTitleLeading}
                    </span>
                  ) : null}
                  <span className="shrink-0 font-semibold">{headerTitle}</span>
                  {shellSubtitle ? (
                    <>
                      <span className="shrink-0 select-none font-normal text-slate-300" aria-hidden>
                        |
                      </span>
                      <span className="min-w-0 flex-1 truncate text-base font-normal text-slate-600">
                        {shellSubtitle}
                      </span>
                    </>
                  ) : null}
                </h1>
              </div>
              <TenantMfaEnrollmentRibbon settingsTo={settingsTo} auth={mfaRibbonAuth} />
            </header>
            <main
              data-shell-section="content"
              aria-label="Content"
              className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain"
            >
              <div className="flex min-h-0 w-full flex-1 flex-col px-[5%] pb-8 pt-4 sm:pb-10 sm:pt-5">{children}</div>
            </main>
          </div>
        </div>
      )}
    </ShellHeaderBridge>
  );
};
