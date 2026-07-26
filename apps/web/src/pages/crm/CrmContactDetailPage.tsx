/**
 * CrmContactDetailPage.
 *
 * Single-contact CRM detail view with profile, associations, activity, and inline edit.
 *
 * Responsibilities:
 * - Fetch contact by route `:id` from `/v1/tenant/crm/contacts/:id`
 * - Set shell header title via {@link useShellHeader}
 * - Open edit modal from `?edit=1` (legacy redirect compatibility)
 * - Render associated organizations and activity timeline
 *
 * Depends on:
 * - {@link useCrmApi}, {@link useCrmBasePath}, {@link useCrmPermissions}
 *
 * Security:
 * - Edit and photo actions respect `canWrite`; API re-authorizes mutations
 */

import {
  crmAddressEntryHasContent,
  formatCrmAddressEntryOneLine,
  type CrmAddressEntry,
  type CrmChannelEntry
} from "@starter/shared";
import { ChevronLeft, Pencil, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useShellHeader } from "../../components/ShellHeaderContext.js";
import { ActivityTimeline } from "../../components/crm/ActivityTimeline.js";
import { EditContactModal } from "../../components/crm/EditContactModal.js";
import { CrmAssociatedCard } from "../../components/crm/CrmAssociatedCard.js";
import { CrmDetailProfileCard } from "../../components/crm/CrmDetailProfileCard.js";
import { API_BASE_URL } from "../../lib/api.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { useCrmBasePath } from "./crmPaths.js";
import { useCrmPermissions } from "./useCrmPermissions.js";
import { useCrmApi } from "./useCrmApi.js";
import type { EntityProfilePhotoHandlers } from "../../components/crm/ProfileEntityPhoto.js";

type ContactDetail = {
  id: string;
  firstName: string;
  lastName: string;
  salutation: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  emails?: CrmChannelEntry[];
  phones?: CrmChannelEntry[];
  addresses?: CrmAddressEntry[];
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
  employerOrganizationId?: string | null;
  employerOrganizationName?: string | null;
  employerOrganizationPrimaryAddress?: string | null;
  employerOrganizationCity?: string | null;
  hasPhoto?: boolean;
};

const titleCase = (s: string) => (s.length === 0 ? s : s.slice(0, 1).toUpperCase() + s.slice(1));

const legacyContactAddressLine = (c: ContactDetail): string =>
  [
    c.addressLine1,
    c.addressLine2,
    [c.postalCode, c.city].filter(Boolean).join(" "),
    c.state,
    c.country
  ]
    .filter((x) => x && String(x).trim().length > 0)
    .join(", ");

/**
 * CRM contact detail: profile card, channels, employer link, associations, and activity.
 *
 * @returns Contact detail UI or loading/error states; gated by parent {@link CrmModuleGate}
 */
export const CrmContactDetailPage = () => {
  const crmBase = useCrmBasePath();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authHeaders, authedFetch, refreshSession, logout } = useCrmApi();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const { formatDateTime } = useUserDisplayDatetime();

  const loadContact = useCallback(async () => {
    if (!id) return;
    setError("");
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(id)}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(id)}`, {
          headers: authHeaders()
        });
      }
      if (res.status === 404) {
        setError("Contact not found.");
        return;
      }
      if (!res.ok) {
        setError("Could not load contact.");
        return;
      }
      const json = (await res.json()) as ContactDetail;
      setContact(json);
    } catch {
      setError("Could not load contact.");
    } finally {
      setLoading(false);
    }
  }, [id, authHeaders, refreshSession, logout]);

  useEffect(() => {
    void loadContact();
  }, [loadContact]);

  useEffect(() => {
    if (searchParams.get("edit") !== "1") return;
    setEditOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const fullName = contact ? `${contact.firstName} ${contact.lastName}`.trim() : "";
  const sal = contact?.salutation?.trim();
  const withSalutation = sal && fullName ? `${sal} ${fullName}`.trim() : fullName;
  const headline = withSalutation || contact?.email || contact?.phone || "Contact";
  const cardDisplayName =
    [sal, fullName].map((s) => s?.trim()).filter((s) => s && s.length > 0).join(" ").trim() ||
    contact?.email ||
    contact?.phone ||
    "Contact";
  const avatarInitials =
    contact && fullName
      ? `${titleCase(contact.firstName).slice(0, 1)}${titleCase(contact.lastName).slice(0, 1)}`
      : contact
        ? (contact.email ?? contact.phone ?? "?").slice(0, 2).toUpperCase()
        : "";

  const shellPatch = useMemo(() => {
    if (!id) return { title: "Contact", subtitle: "" };
    if (error) return { title: "Contact", subtitle: error };
    if (contact) return { title: headline, subtitle: "Profile and activity." };
    return { title: "Contact", subtitle: "Loading record…" };
  }, [id, error, contact, headline]);

  useShellHeader(shellPatch);

  const { canWrite, canDelete } = useCrmPermissions();

  const profilePhotoHandlers = useMemo((): EntityProfilePhotoHandlers | undefined => {
    if (!id || !contact) return undefined;
    const base = `${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(id)}/photo`;
    return {
      hasPhoto: Boolean(contact.hasPhoto),
      cacheKey: contact.updatedAt,
      photoGetUrl: base,
      photoPostUrl: base,
      photoDeleteUrl: base,
      authedFetch,
      onChanged: () => void loadContact()
    };
  }, [id, contact, authedFetch, loadContact]);

  if (!id) {
    return null;
  }

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <Link
            to={`${crmBase}/contacts`}
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden strokeWidth={2} />
            Contacts
          </Link>
        </nav>
        {contact && canWrite ? (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
          >
            <Pencil className="h-4 w-4" aria-hidden strokeWidth={2} />
            Edit contact
          </button>
        ) : null}
      </div>

      {editOpen ? (
        <EditContactModal
          contactId={id}
          onClose={() => setEditOpen(false)}
          onSaved={() => void loadContact()}
          onDeleted={() => navigate(`${crmBase}/contacts`, { replace: true })}
          canDelete={canDelete}
        />
      ) : null}

      {error ? (
        <p className="mt-6 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      {contact ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <div className="space-y-6 lg:col-span-1">
            <CrmDetailProfileCard
              variant="contact"
              displayName={cardDisplayName}
              avatarInitials={avatarInitials}
              titleLine={contact.title?.trim() || null}
              employerOrganizationName={contact.employerOrganizationName?.trim() || null}
              profilePhoto={profilePhotoHandlers}
              emails={contact.emails}
              phones={contact.phones}
              legacyEmail={contact.email}
              legacyPhone={contact.phone}
              addressFields={(() => {
                const filled = (contact.addresses ?? []).filter(crmAddressEntryHasContent);
                if (filled.length > 0) {
                  const a = filled.find((x) => x.isPrimary) ?? filled[0]!;
                  return [
                    {
                      label: `Address · ${a.kind.trim() || "Other"}`,
                      value: formatCrmAddressEntryOneLine(a) || "—"
                    }
                  ];
                }
                return [
                  {
                    label: "Address",
                    value: legacyContactAddressLine(contact) || "No address on file",
                    italicEmpty: true
                  }
                ];
              })()}
              metaFields={[
                (() => {
                  const empName = contact.employerOrganizationName?.trim();
                  const empCity = contact.employerOrganizationCity?.trim();
                  if (!empName) {
                    return {
                      label: "Employer organization",
                      value: "None — set in Edit contact",
                      italicEmpty: true
                    };
                  }
                  return {
                    label: "Employer organization",
                    value: empCity ? `${empName} · ${empCity}` : empName,
                    italicEmpty: false
                  };
                })(),
                {
                  label: "Last interaction",
                  value: "No communication activity yet",
                  italicEmpty: true
                },
                {
                  label: "Record updated",
                  value: formatDateTime(contact.updatedAt)
                }
              ]}
            />
            <CrmAssociatedCard
              entityKind="CONTACT"
              entityId={contact.id}
              authHeaders={authHeaders}
              refreshSession={refreshSession}
              logout={logout}
            />
          </div>

          <div className="lg:col-span-3">
            <ActivityTimeline
              entityKind="CONTACT"
              entityId={contact.id}
              authHeaders={authHeaders}
              refreshSession={refreshSession}
              logout={logout}
            />
          </div>
        </div>
      ) : loading ? (
        <div className="mt-10 flex justify-center text-sm text-stone-500">
          <User className="mr-2 h-5 w-5 animate-pulse text-emerald-500" aria-hidden />
          Loading…
        </div>
      ) : null}
    </div>
  );
};
