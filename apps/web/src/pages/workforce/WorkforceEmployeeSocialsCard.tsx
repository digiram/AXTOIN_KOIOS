/**
 * WorkforceEmployeeSocialsCard.
 *
 * Left-column card listing registered social profiles for an employee (LinkedIn first).
 *
 * Responsibilities:
 * - Render provider rows with outbound profile links
 * - Show only when at least one social is registered (parent gates visibility)
 *
 * Depends on:
 * - Employee detail socials from `/v1/tenant/workforce/employees/:id`
 *
 * Security:
 * - Display-only; profile URLs are tenant-scoped PII from the API
 */

import { ExternalLink } from "lucide-react";

export type WorkforceEmployeeSocialItem = {
  id: string;
  provider: string;
  profileUrl: string;
};

type Props = {
  socials: WorkforceEmployeeSocialItem[];
};

const providerLabel = (provider: string): string => {
  if (provider === "linkedin") return "LinkedIn";
  return provider;
};

/** Compact LinkedIn “in” mark (lucide has no LinkedIn glyph in this app’s version). */
const LinkedInMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden={true} focusable="false">
    <path
      fill="currentColor"
      d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z"
    />
  </svg>
);

const ProviderIcon = ({ provider }: { provider: string }) => {
  if (provider === "linkedin") {
    return <LinkedInMark className="h-5 w-5 shrink-0 text-[#0A66C2]" />;
  }
  return <ExternalLink className="h-5 w-5 shrink-0 text-slate-500" aria-hidden strokeWidth={1.75} />;
};

/**
 * Social profiles card for the employee detail left column.
 *
 * @param props.socials - Registered socials (non-empty when rendered)
 */
export const WorkforceEmployeeSocialsCard = ({ socials }: Props) => {
  if (socials.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-slate-900">Socials</h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {socials.map((s) => {
          const label = providerLabel(s.provider);
          const href = s.profileUrl.trim();
          return (
            <li key={s.id}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={[
                  "group flex w-full min-w-0 items-center gap-3 px-4 py-3.5 no-underline transition-colors sm:px-5",
                  "hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/45"
                ].join(" ")}
              >
                <ProviderIcon provider={s.provider} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500" title={href}>
                    {href}
                  </p>
                </div>
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                  strokeWidth={2}
                />
                <span className="sr-only">Open {label} profile in a new tab</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
