/**
 * CrmOverviewEntityCard
 *
 * Linked card for CRM list and overview grids (contact or organization).
 *
 * Responsibilities:
 * - Show avatar, name, sublabel, primary phone/email, and address footer
 * - Optional authenticated profile photo and segmentation chips
 * - Helper to pick primary channel value from API entries
 *
 * Related:
 * - CRM overview pages; `ProfileEntityPhoto`
 */
import type { CrmChannelEntry } from "@starter/shared";
import { Building2, Mail, MapPin, Phone } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { AuthenticatedRoundPhoto, type EntityProfilePhotoHandlers } from "./ProfileEntityPhoto.js";

/** Primary channel value for CRM list cards (mirrors profile card channel pick). */
export const crmListPrimaryChannelValue = (
  entries: CrmChannelEntry[] | undefined,
  legacy: string | null
): string | null => {
  const rows = (entries ?? []).filter((e) => e.value.trim().length > 0);
  if (rows.length === 0) {
    const t = legacy?.trim() ?? "";
    return t.length > 0 ? t : null;
  }
  const chosen = rows.find((e) => e.isPrimary) ?? rows[0]!;
  const v = chosen.value.trim();
  return v.length > 0 ? v : null;
};

const telHref = (value: string) => {
  const compact = value.trim().replace(/\s+/g, "");
  return compact.length > 0 ? `tel:${compact}` : "#";
};

/** List/overview cards: GET-only photo (same endpoint as detail; post/delete unused). */
export type CrmOverviewAvatarPhoto = Pick<EntityProfilePhotoHandlers, "hasPhoto" | "cacheKey" | "photoGetUrl" | "authedFetch">;

type Props = {
  to: string;
  name: string;
  sublabel: string;
  /** Single letter or two-letter initials inside the circle */
  avatarText: string;
  /** Optional glyph before the name (e.g. workforce person vs agent). */
  nameLeading?: ReactNode;
  /** When `hasPhoto`, fetches and shows the profile image over initials. */
  avatarPhoto?: CrmOverviewAvatarPhoto | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  /** Shown when `addressLine` is empty (default: “No address on file”). */
  addressEmptyLabel?: string;
  /** Icon for the footer meta row (default: map pin). */
  addressIcon?: "map-pin" | "building";
  /** Optional segmentation / tag labels shown under the sublabel. */
  chips?: string[];
};

/** Overview grid card linking to a CRM contact or organization detail page. */
export const CrmOverviewEntityCard = ({
  to,
  name,
  sublabel,
  avatarText,
  nameLeading,
  avatarPhoto,
  phone,
  email,
  addressLine,
  addressEmptyLabel = "No address on file",
  addressIcon = "map-pin",
  chips = []
}: Props) => {
  const MetaIcon = addressIcon === "building" ? Building2 : MapPin;
  const phoneT = phone?.trim() ?? "";
  const emailT = email?.trim() ?? "";
  const showPhoneBtn = phoneT.length > 0;
  const showMailBtn = emailT.length > 0;

  const photoHandlers = useMemo((): EntityProfilePhotoHandlers | null => {
    if (!avatarPhoto?.hasPhoto) return null;
    const noop = () => {};
    return {
      hasPhoto: true,
      cacheKey: avatarPhoto.cacheKey,
      photoGetUrl: avatarPhoto.photoGetUrl,
      photoPostUrl: avatarPhoto.photoGetUrl,
      photoDeleteUrl: avatarPhoto.photoGetUrl,
      authedFetch: avatarPhoto.authedFetch,
      onChanged: noop
    };
  }, [avatarPhoto?.hasPhoto, avatarPhoto?.cacheKey, avatarPhoto?.photoGetUrl, avatarPhoto?.authedFetch]);

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-800 shadow-sm transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/45";

  return (
    <article className="relative flex min-h-[11.5rem] flex-row overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm ring-1 ring-stone-900/5">
      <Link to={to} className="absolute inset-0 z-0" aria-label={`View ${name}`} />
      <div
        className="w-1.5 shrink-0 self-stretch rounded-l-2xl bg-gradient-to-b from-indigo-600 via-indigo-700 to-indigo-900"
        aria-hidden
      />
      <div className="pointer-events-none relative z-10 flex min-h-[11.5rem] min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              defaultChecked={false}
              className="pointer-events-auto h-4 w-4 shrink-0 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
              aria-label={`Select ${name}`}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
              <div
                className="relative flex size-[calc(2.75rem*1.3)] shrink-0 overflow-hidden rounded-full bg-slate-200 text-[0.975rem] font-bold tracking-tight text-indigo-950"
                aria-hidden
              >
                <span
                  className={[
                    "flex h-full w-full items-center justify-center",
                    photoHandlers ? "absolute inset-0 z-0" : ""
                  ].join(" ")}
                >
                  {avatarText.slice(0, 2).toUpperCase()}
                </span>
                {photoHandlers ? (
                  <span className="absolute inset-0 z-[1]">
                    <AuthenticatedRoundPhoto handlers={photoHandlers} alt="" className="h-full w-full object-cover" />
                  </span>
                ) : null}
              </div>
              <div className="hidden w-px shrink-0 self-stretch bg-stone-200 sm:block" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-base font-bold leading-tight text-stone-900">
                  {nameLeading ? <span className="shrink-0">{nameLeading}</span> : null}
                  <span className="min-w-0 truncate">{name}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-stone-500">{sublabel}</p>
                {chips.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {chips.slice(0, 4).map((chip) => (
                      <span
                        key={chip}
                        className="max-w-full truncate rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-800"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
                  {phoneT ? (
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden strokeWidth={2} />
                      <span className="truncate">{phoneT}</span>
                    </span>
                  ) : null}
                  {emailT ? (
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden strokeWidth={2} />
                      <span className="truncate">{emailT}</span>
                    </span>
                  ) : (
                    <span className="inline-flex min-w-0 items-center gap-1 text-stone-400">
                      <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2} />
                      <span className="truncate italic">No email</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-stone-100 pt-2.5">
            {addressLine?.trim() ? (
              <p className="flex items-start gap-1.5 text-xs leading-snug text-stone-600">
                <MetaIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden strokeWidth={2} />
                <span className="min-w-0 break-words">{addressLine.trim()}</span>
              </p>
            ) : (
              <p className="flex items-start gap-1.5 text-xs italic text-stone-400">
                <MetaIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2} />
                {addressEmptyLabel}
              </p>
            )}
          </div>
        </div>
        <div className="pointer-events-auto relative z-20 mt-auto flex justify-end gap-2 border-t border-stone-100 bg-stone-50/90 px-3 py-2.5 sm:px-4">
          {showPhoneBtn ? (
            <a
              href={telHref(phoneT)}
              title={`Call ${phoneT}`}
              onClick={(e) => e.stopPropagation()}
              className={iconBtn}
            >
              <Phone className="h-4 w-4" aria-hidden strokeWidth={2} />
              <span className="sr-only">Call {phoneT}</span>
            </a>
          ) : (
            <span className={`${iconBtn} cursor-not-allowed opacity-40`} title="No phone on file" aria-disabled>
              <Phone className="h-4 w-4" aria-hidden strokeWidth={2} />
              <span className="sr-only">No phone</span>
            </span>
          )}
          {showMailBtn ? (
            <a
              href={`mailto:${emailT}`}
              title={`Email ${emailT}`}
              onClick={(e) => e.stopPropagation()}
              className={iconBtn}
            >
              <Mail className="h-4 w-4" aria-hidden strokeWidth={2} />
              <span className="sr-only">Email {emailT}</span>
            </a>
          ) : (
            <span className={`${iconBtn} cursor-not-allowed opacity-40`} title="No email on file" aria-disabled>
              <Mail className="h-4 w-4" aria-hidden strokeWidth={2} />
              <span className="sr-only">No email</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
};
