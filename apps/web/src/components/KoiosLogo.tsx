/**
 * KoiosLogo
 *
 * Owl app mark for KOIOS — used on auth, the shell menu strip, and as the favicon source of truth in UI.
 *
 * Responsibilities:
 * - Render the geometric owl glyph at any size via `className`
 * - Provide `KoiosLogoMark` (white tile + owl) matching the auth / menu brand chip
 *
 * Related:
 * - `apps/web/public/favicon.svg`, `apps/web/public/koios-logo.svg`
 * - `AuthBrandPanel`, `AppShell`
 */

type LogoProps = {
  className?: string;
  /** Accessible name; omit when decorative (`aria-hidden`). */
  title?: string;
};

/**
 * Indigo owl glyph (transparent background). Prefer `KoiosLogoMark` in chrome.
 */
export const KoiosLogo = ({ className, title }: LogoProps) => (
  <svg
    viewBox="0 0 32 32"
    className={className}
    role={title ? "img" : "presentation"}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <path fill="#4f46e5" d="M7.5 12.2 11.2 3.8 14.2 11.4z" />
    <path fill="#4f46e5" d="M17.8 11.4 20.8 3.8 24.5 12.2z" />
    <ellipse cx="16" cy="18.2" rx="11.2" ry="10.4" fill="#4f46e5" />
    <circle cx="11.4" cy="16.6" r="4.15" fill="#eef2ff" />
    <circle cx="20.6" cy="16.6" r="4.15" fill="#eef2ff" />
    <circle cx="11.4" cy="16.6" r="1.7" fill="#1e1b4b" />
    <circle cx="20.6" cy="16.6" r="1.7" fill="#1e1b4b" />
    <circle cx="12.35" cy="15.55" r="0.65" fill="#fff" />
    <circle cx="21.55" cy="15.55" r="0.65" fill="#fff" />
    <path fill="#a5b4fc" d="M16 18.4 13.9 22.1h4.2z" />
  </svg>
);

type MarkProps = {
  className?: string;
  /** Extra classes for the owl glyph inside the tile. */
  logoClassName?: string;
  title?: string;
};

/**
 * White rounded tile + owl — login brand chip and shell menu mark.
 */
export const KoiosLogoMark = ({ className, logoClassName, title = "KOIOS" }: MarkProps) => (
  <div
    className={[
      "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-white/60",
      className
    ]
      .filter(Boolean)
      .join(" ")}
    title={title}
  >
    <KoiosLogo className={["h-8 w-8", logoClassName].filter(Boolean).join(" ")} title={title} />
  </div>
);
