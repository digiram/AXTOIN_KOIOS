/**
 * CrmDetailProfileCard
 *
 * Hero profile card on CRM contact and organization detail pages.
 *
 * Responsibilities:
 * - Indigo header with photo, name, and primary channel links
 * - Contact vs organization prop variants with typed detail fields
 * - Reusable `CrmProfileDetailField` for label/value rows
 *
 * Related:
 * - CRM detail routes; `ProfileEntityPhoto`
 */
import type { CrmChannelEntry } from "@starter/shared";
import { Mail, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  AuthenticatedRoundPhoto,
  useEntityProfilePhoto,
  type EntityProfilePhotoHandlers
} from "./ProfileEntityPhoto.js";

/** Same indigo gradient and sheen as `AppShell` menu (`from-indigo-600 via-indigo-700 to-indigo-900`). */
const profileCardHeaderShellClass =
  "relative z-20 bg-gradient-to-b from-indigo-600 via-indigo-700 to-indigo-900 border-b border-indigo-950/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]";

const channelSubLabel = (kind: string, isPrimary: boolean) =>
  `${kind.trim() || "Other"} · ${isPrimary ? "Main" : "Alternate"}`;

const telHref = (value: string) => {
  const compact = value.trim().replace(/\s+/g, "");
  return compact.length > 0 ? `tel:${compact}` : "#";
};

/** At most one row: primary channel if any, else first filled row, else legacy. */
const primaryRowsFromChannels = (entries: CrmChannelEntry[] | undefined, legacy: string | null) => {
  const rows = (entries ?? []).filter((e) => e.value.trim().length > 0);
  if (rows.length > 0) {
    const chosen = rows.find((e) => e.isPrimary) ?? rows[0]!;
    return [
      {
        value: chosen.value.trim(),
        sub: channelSubLabel(chosen.kind, chosen.isPrimary)
      }
    ];
  }
  if (legacy?.trim()) return [{ value: legacy.trim(), sub: "Primary · Main" }];
  return [];
};

/** Label/value row inside the CRM detail profile card. */
export const CrmProfileDetailField = ({
  label,
  value,
  italicEmpty
}: {
  label: string;
  value: string;
  italicEmpty?: boolean;
}) => {
  const empty = value === "—" || value.startsWith("No ") || value.startsWith("None");
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={[
          "mt-1 text-sm leading-snug text-slate-700",
          italicEmpty && empty ? "italic text-slate-500" : "font-medium text-slate-800"
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
};

const channelRowLinkClass =
  [
    "group flex w-full min-w-0 cursor-pointer gap-3 px-4 py-3.5 no-underline transition-colors sm:px-5",
    "hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/45"
  ].join(" ");

const ChannelBlock = ({
  icon: Icon,
  rows,
  emptyLabel,
  hrefKind
}: {
  icon: LucideIcon;
  rows: { value: string; sub: string }[];
  emptyLabel: string;
  hrefKind: "mailto" | "tel";
}) => (
  <div className="divide-y divide-slate-100">
    {rows.length === 0 ? (
      <div className="flex gap-3 px-4 py-3.5 sm:px-5">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden strokeWidth={1.75} />
        <p className="text-sm italic text-slate-500">{emptyLabel}</p>
      </div>
    ) : (
      rows.map((row, i) => (
        <a
          key={`${row.value}-${i}`}
          href={hrefKind === "mailto" ? `mailto:${row.value}` : telHref(row.value)}
          className={channelRowLinkClass}
        >
          <Icon
            className="mt-0.5 h-5 w-5 shrink-0 text-slate-500 transition-colors group-hover:text-indigo-700"
            aria-hidden
            strokeWidth={1.75}
          />
          <div className="min-w-0 flex-1 text-left">
            <span className="block break-words font-semibold text-indigo-950 transition-colors group-hover:text-indigo-800">
              {row.value}
            </span>
            <p className="mt-0.5 text-xs text-slate-500 transition-colors group-hover:text-slate-600">{row.sub}</p>
          </div>
        </a>
      ))
    )}
  </div>
);

type ProfileField = { label: string; value: string; italicEmpty?: boolean };

type BaseProps = {
  emails: CrmChannelEntry[] | undefined;
  phones: CrmChannelEntry[] | undefined;
  legacyEmail: string | null;
  legacyPhone: string | null;
  addressFields: ProfileField[];
  metaFields: ProfileField[];
};

/** Contact variant props for {@link CrmDetailProfileCard}. */
export type CrmDetailProfileCardContactProps = BaseProps & {
  variant: "contact";
  displayName: string;
  avatarInitials: string;
  titleLine: string | null;
  /** Employer org name; shown with job title under the header as `org / title`. */
  employerOrganizationName?: string | null;
  /** Optional profile photo (upload / drag-drop); birthday panel doubles as drop target when set. */
  profilePhoto?: EntityProfilePhotoHandlers;
};

/** Organization variant props for {@link CrmDetailProfileCard}. */
export type CrmDetailProfileCardOrgProps = BaseProps & {
  variant: "organization";
  name: string;
  avatarLetter: string;
  /** Holding org name; shown under the header when set (Subsidiary → Holding). */
  holdingOrganizationName?: string | null;
};

/** Discriminated union for contact vs organization detail profile cards. */
export type CrmDetailProfileCardProps = CrmDetailProfileCardContactProps | CrmDetailProfileCardOrgProps;

/** Hero profile card on CRM entity detail pages. */
export const CrmDetailProfileCard = (props: CrmDetailProfileCardProps) => {
  const contactProfileHandlers = props.variant === "contact" ? props.profilePhoto : undefined;
  const photoDrop = useEntityProfilePhoto(contactProfileHandlers);

  const emailRows = primaryRowsFromChannels(props.emails, props.legacyEmail);
  const phoneRows = primaryRowsFromChannels(props.phones, props.legacyPhone);

  const name = props.variant === "contact" ? props.displayName : props.name;
  const initials =
    props.variant === "contact" ? props.avatarInitials : props.avatarLetter.slice(0, 1).toUpperCase();

  const contactTitleTrim = props.variant === "contact" ? (props.titleLine?.trim() ?? "") : "";
  const contactEmployerTrim =
    props.variant === "contact" ? (props.employerOrganizationName?.trim() ?? "") : "";
  const contactSubtitleParts =
    props.variant === "contact" ? [contactEmployerTrim, contactTitleTrim].filter((s) => s.length > 0) : [];
  const contactSubtitleUnderHeader =
    props.variant === "contact" && contactSubtitleParts.length > 0 ? contactSubtitleParts.join(" / ") : "";
  const orgHoldingTrim =
    props.variant === "organization" ? (props.holdingOrganizationName?.trim() ?? "") : "";
  const orgSubtitleUnderHeader = props.variant === "organization" && orgHoldingTrim ? orgHoldingTrim : "";
  const showSubtitleUnderHeader =
    (props.variant === "contact" && contactSubtitleUnderHeader.length > 0) ||
    (props.variant === "organization" && orgSubtitleUnderHeader.length > 0);

  return (
    <section
      className={[
        "relative isolate overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5 transition-shadow",
        contactProfileHandlers && photoDrop.dragOver ? "outline outline-2 outline-offset-2 outline-amber-400/80" : ""
      ].join(" ")}
      {...(contactProfileHandlers ? photoDrop.cardDropSurfaceProps : {})}
    >
      <div
        className={[
          `${profileCardHeaderShellClass} rounded-t-2xl flex min-h-[5.25rem] min-w-0 flex-col justify-end px-4 pb-2.5 pt-5`,
          "sm:min-h-[5.75rem] sm:px-5 sm:pb-3 sm:pt-6"
        ].join(" ")}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.12),transparent_55%)]"
          aria-hidden
        />
        <div className="relative z-10 flex min-w-0 items-end gap-3 sm:gap-4">
          <div className="w-[4.5rem] shrink-0 sm:w-[5.25rem]" aria-hidden />
          <h2 className="min-w-0 flex-1 break-words text-lg font-bold leading-tight tracking-tight text-white sm:text-xl">
            {name}
          </h2>
        </div>
        <div
          className={[
            "absolute bottom-0 left-4 z-30 flex h-[4.5rem] w-[4.5rem] translate-y-1/2 items-center justify-center overflow-hidden rounded-full border-[5px] border-white",
            "bg-slate-200 text-lg font-bold tracking-tight text-indigo-950 shadow-lg ring-1 ring-black/10",
            "sm:left-5 sm:h-[5.25rem] sm:w-[5.25rem] sm:text-xl"
          ].join(" ")}
          aria-hidden
        >
          {props.variant === "contact" && props.profilePhoto?.hasPhoto ? (
            <AuthenticatedRoundPhoto
              handlers={props.profilePhoto}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
          <span
            className={[
              "select-none",
              props.variant === "contact" && props.profilePhoto?.hasPhoto ? "sr-only" : ""
            ].join(" ")}
          >
            {initials}
          </span>
        </div>
      </div>

      {showSubtitleUnderHeader ? (
        <div className="relative z-10 bg-white px-4 pt-2 pb-2 sm:px-5 sm:pt-2 sm:pb-2">
          <div className="flex min-w-0 gap-3 sm:gap-4">
            <div className="w-[4.5rem] shrink-0 sm:w-[5.25rem]" aria-hidden />
            <div className="min-w-0 flex-1">
              {props.variant === "organization" ? (
                <p
                  className="truncate text-sm font-medium leading-snug text-slate-600 sm:text-[0.9375rem]"
                  title={orgSubtitleUnderHeader}
                >
                  {orgSubtitleUnderHeader}
                </p>
              ) : (
                <p
                  className="truncate text-sm font-medium leading-snug text-slate-600 sm:text-[0.9375rem]"
                  title={contactSubtitleParts.join(" / ")}
                >
                  {contactSubtitleUnderHeader}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={[
          "relative z-0 rounded-b-2xl bg-white px-4 pb-5 sm:px-5 sm:pb-6",
          showSubtitleUnderHeader
            ? "pt-3 sm:pt-4"
            : "pt-[calc(2.25rem+1.25rem)] sm:pt-[calc(2.625rem+1.5rem)]"
        ].join(" ")}
      >
        <div className="-mx-4 border-b border-t border-slate-100 sm:-mx-5">
          <ChannelBlock icon={Mail} rows={emailRows} emptyLabel="No email on file" hrefKind="mailto" />
          <div className="border-t border-slate-100">
            <ChannelBlock icon={Phone} rows={phoneRows} emptyLabel="No phone on file" hrefKind="tel" />
          </div>
        </div>

        {props.variant === "contact" && !props.profilePhoto ? (
          <div className="mt-5 rounded-xl border border-dashed border-sky-200/90 bg-sky-50/50 px-3 py-3 sm:px-4">
            <p className="text-sm font-semibold text-slate-700">No birthday on file</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Add a birthday when editing this contact — it will show here with age and countdown.
            </p>
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          {props.addressFields.map((f, i) => (
            <CrmProfileDetailField
              key={`${f.label}-${i}`}
              label={f.label}
              value={f.value}
              italicEmpty={f.italicEmpty}
            />
          ))}
        </div>

        <div className="mt-5 space-y-4">
          {props.metaFields.map((f, i) => (
            <CrmProfileDetailField
              key={`${f.label}-${i}`}
              label={f.label}
              value={f.value}
              italicEmpty={f.italicEmpty}
            />
          ))}
        </div>

        {props.variant === "contact" && props.profilePhoto ? (
          <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">
            No birthday on file yet — add one when editing this contact.
          </p>
        ) : null}

        {contactProfileHandlers && photoDrop.error ? (
          <p className="mt-3 text-xs text-rose-600" role="alert">
            {photoDrop.error}
          </p>
        ) : null}
      </div>
    </section>
  );
};
