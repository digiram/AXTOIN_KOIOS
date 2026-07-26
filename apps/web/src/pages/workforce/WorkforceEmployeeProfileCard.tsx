/**
 * WorkforceEmployeeProfileCard.
 *
 * Profile header and contact channels card for a workforce employee detail view.
 *
 * Responsibilities:
 * - Render photo, name, kind icon, job title, and channel rows (phone/email)
 * - Format personal address and employment metadata for display
 *
 * Depends on:
 * - {@link formatWorkforcePersonalAddressLine}, optional {@link EntityProfilePhotoHandlers}
 */

import { workforceEmployeeDisplayName } from "@starter/shared";
import { Building2, CalendarDays, Mail, Phone, StickyNote } from "lucide-react";

import { CrmProfileDetailField } from "../../components/crm/CrmDetailProfileCard.js";
import {
  AuthenticatedRoundPhoto,
  useEntityProfilePhoto,
  type EntityProfilePhotoHandlers
} from "../../components/crm/ProfileEntityPhoto.js";
import { EmployeeKindIcon } from "./EmployeeKindIcon.js";
import { formatWorkforcePersonalAddressLine } from "./workforcePersonalAddress.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";

const profileCardHeaderShellClass =
  "relative z-20 bg-gradient-to-b from-indigo-600 via-indigo-700 to-indigo-900 border-b border-indigo-950/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]";

const channelRowLinkClass =
  [
    "group flex w-full min-w-0 cursor-pointer gap-3 px-4 py-3.5 no-underline transition-colors sm:px-5",
    "hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/45"
  ].join(" ");

const telHref = (value: string) => {
  const compact = value.trim().replace(/\s+/g, "");
  return compact.length > 0 ? `tel:${compact}` : "#";
};

/** View model for {@link WorkforceEmployeeProfileCard} display fields. */
export type WorkforceEmployeeProfileModel = {
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  employeeKind: string;
  dateOfEmployment: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  workPhone: string | null;
  workEmail: string | null;
  personalAddress: string | null;
  workLocation: string | null;
  employmentOrgUnitName: string | null;
  notes: string | null;
  updatedAt: string;
};

const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "?";
};

type ChannelRow = { value: string; sub: string; href: string };

const ChannelRows = ({
  icon: Icon,
  rows,
  emptyLabel
}: {
  icon: typeof Mail;
  rows: ChannelRow[];
  emptyLabel: string;
}) => (
  <div className="divide-y divide-slate-100">
    {rows.length === 0 ? (
      <div className="flex gap-3 px-4 py-3.5 sm:px-5">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden strokeWidth={1.75} />
        <p className="text-sm italic text-slate-500">{emptyLabel}</p>
      </div>
    ) : (
      rows.map((row, i) => (
        <a key={`${row.value}-${i}`} href={row.href} className={channelRowLinkClass}>
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

/**
 * Employee profile card with photo, channels, address, and employment summary.
 *
 * @param employee - Display model loaded from workforce employee API
 * @param profilePhoto - Optional upload/delete handlers for round profile photo
 */
export const WorkforceEmployeeProfileCard = ({
  employee,
  profilePhoto
}: {
  employee: WorkforceEmployeeProfileModel;
  profilePhoto?: EntityProfilePhotoHandlers;
}) => {
  const photoDrop = useEntityProfilePhoto(profilePhoto);
  const { formatDate, formatDateTime } = useUserDisplayDatetime();

  const fullName = workforceEmployeeDisplayName(employee.firstName, employee.lastName);
  const initials = initialsFromName(fullName);
  const subtitle = employee.jobTitle?.trim() ?? "";

  const personalAddressDisplay = formatWorkforcePersonalAddressLine(employee.personalAddress);

  const emailRows: ChannelRow[] = [];
  if (employee.personalEmail?.trim()) {
    emailRows.push({
      value: employee.personalEmail.trim(),
      sub: "Personal · Email",
      href: `mailto:${employee.personalEmail.trim()}`
    });
  }
  if (employee.workEmail?.trim()) {
    emailRows.push({
      value: employee.workEmail.trim(),
      sub: "Work · Email",
      href: `mailto:${employee.workEmail.trim()}`
    });
  }

  const phoneRows: ChannelRow[] = [];
  if (employee.personalPhone?.trim()) {
    phoneRows.push({
      value: employee.personalPhone.trim(),
      sub: "Personal · Phone",
      href: telHref(employee.personalPhone)
    });
  }
  if (employee.workPhone?.trim()) {
    phoneRows.push({
      value: employee.workPhone.trim(),
      sub: "Work · Phone",
      href: telHref(employee.workPhone)
    });
  }

  const employmentLabel = employee.dateOfEmployment ? formatDate(employee.dateOfEmployment) : "Not set";

  return (
    <section
      className={[
        "relative isolate overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5 transition-shadow",
        profilePhoto && photoDrop.dragOver ? "outline outline-2 outline-offset-2 outline-amber-400/80" : ""
      ].join(" ")}
      {...(profilePhoto ? photoDrop.cardDropSurfaceProps : {})}
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
          <h2 className="flex min-w-0 flex-1 items-center gap-2 break-words text-lg font-bold leading-tight tracking-tight text-white sm:gap-2.5 sm:text-xl">
            <EmployeeKindIcon kind={employee.employeeKind} className="h-6 w-6 shrink-0 text-white sm:h-7 sm:w-7" />
            <span className="min-w-0 flex-1">{fullName}</span>
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
          {profilePhoto?.hasPhoto ? (
            <AuthenticatedRoundPhoto handlers={profilePhoto} alt="" className="h-full w-full object-cover" />
          ) : null}
          <span className={profilePhoto?.hasPhoto ? "sr-only" : ""}>{initials}</span>
        </div>
      </div>

      {subtitle ? (
        <div className="relative z-10 bg-white px-4 pt-2 pb-2 sm:px-5 sm:pt-2 sm:pb-2">
          <div className="flex min-w-0 gap-3 sm:gap-4">
            <div className="w-[4.5rem] shrink-0 sm:w-[5.25rem]" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-slate-600 sm:text-[0.9375rem]" title={subtitle}>
              {subtitle}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className={[
          "relative z-0 rounded-b-2xl bg-white px-4 pb-5 sm:px-5 sm:pb-6",
          subtitle ? "pt-3 sm:pt-4" : "pt-[calc(2.25rem+1.25rem)] sm:pt-[calc(2.625rem+1.5rem)]"
        ].join(" ")}
      >
        <div className="-mx-4 border-b border-t border-slate-100 sm:-mx-5">
          <ChannelRows icon={Mail} rows={emailRows} emptyLabel="No email on file" />
          <div className="border-t border-slate-100">
            <ChannelRows icon={Phone} rows={phoneRows} emptyLabel="No phone on file" />
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <CrmProfileDetailField
            label="Personal address"
            value={personalAddressDisplay || "No personal address on file"}
            italicEmpty={!personalAddressDisplay.trim()}
          />
          <CrmProfileDetailField
            label="Work location"
            value={employee.workLocation?.trim() || "No work location on file"}
            italicEmpty={!employee.workLocation?.trim()}
          />
        </div>

        <div className="mt-5 flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 sm:gap-4 sm:px-4">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Organizational unit</p>
            <p
              className={[
                "mt-1 text-sm leading-snug",
                employee.employmentOrgUnitName?.trim()
                  ? "font-medium text-slate-800"
                  : "italic text-slate-500"
              ].join(" ")}
            >
              {employee.employmentOrgUnitName?.trim() || "Not assigned"}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 sm:gap-4 sm:px-4">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Date of employment</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{employmentLabel}</p>
          </div>
        </div>

        <div className="mt-5 flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 sm:gap-4 sm:px-4">
          <StickyNote className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Internal notes</p>
            <p
              className={[
                "mt-1 whitespace-pre-wrap text-sm leading-snug",
                employee.notes?.trim() ? "font-medium text-slate-800" : "italic text-slate-500"
              ].join(" ")}
            >
              {employee.notes?.trim() || "No notes on file"}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <CrmProfileDetailField label="Record updated" value={formatDateTime(employee.updatedAt)} />
        </div>

        {profilePhoto && photoDrop.error ? (
          <p className="mt-3 text-xs text-rose-600" role="alert">
            {photoDrop.error}
          </p>
        ) : null}
      </div>
    </section>
  );
};
