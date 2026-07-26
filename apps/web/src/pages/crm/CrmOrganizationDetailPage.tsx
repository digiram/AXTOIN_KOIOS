/**
 * CrmOrganizationDetailPage.
 *
 * Single-organization CRM detail view with profile, segments, associations, and inline edit.
 *
 * Responsibilities:
 * - Fetch organization by route `:id` from `/v1/tenant/crm/organizations/:id`
 * - Set shell header title via {@link useShellHeader}
 * - Open edit modal from `?edit=1` (legacy redirect compatibility)
 * - Render holding company, market segments, tags, and activity timeline
 *
 * Depends on:
 * - {@link useCrmApi}, {@link useCrmBasePath}, {@link useCrmPermissions}
 *
 * Security:
 * - Edit actions respect `canWrite`; API re-authorizes mutations
 */

import type { CrmAddressEntry, CrmChannelEntry } from "@starter/shared";
import { Building2, ChevronLeft, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useShellHeader } from "../../components/ShellHeaderContext.js";
import { ActivityTimeline } from "../../components/crm/ActivityTimeline.js";
import { CrmModal } from "../../components/crm/CrmModal.js";
import { formatCrmOrganizationSegmentSummary } from "../../components/crm/CrmOrganizationSegmentFields.js";
import { EditOrganizationModal } from "../../components/crm/EditOrganizationModal.js";
import { CrmAssociatedCard } from "../../components/crm/CrmAssociatedCard.js";
import { CrmDetailProfileCard } from "../../components/crm/CrmDetailProfileCard.js";
import { API_BASE_URL } from "../../lib/api.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { useCrmBasePath } from "./crmPaths.js";
import { useCrmPermissions } from "./useCrmPermissions.js";
import { useCrmApi } from "./useCrmApi.js";

type OrgDetail = {
  id: string;
  name: string;
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
  holdingOrganizationId?: string | null;
  holdingOrganizationName?: string | null;
  holdingOrganizationPrimaryAddress?: string | null;
  marketSegmentLayer1?: { id: string; name: string } | null;
  marketSegmentLayer2?: { id: string; name: string } | null;
  marketSegmentLayer3?: { id: string; name: string } | null;
  marketingTags?: { id: string; name: string }[];
};

const crmAddressEntryHasContent = (a: CrmAddressEntry) =>
  [
    a.addressLine1,
    a.addressLine2,
    a.houseNumber,
    a.postalCode,
    a.city,
    a.state,
    a.country
  ].some((v) => (v ?? "").trim().length > 0);

const formatCrmAddressDetailBody = (a: CrmAddressEntry): string => {
  const line1 = [a.addressLine1, a.houseNumber].filter((x) => (x ?? "").trim()).join(" ").trim();
  return [
    line1 || undefined,
    a.addressLine2?.trim() || undefined,
    [a.postalCode, a.city].filter((x) => (x ?? "").trim()).join(" ").trim() || undefined,
    a.state?.trim() || undefined,
    a.country?.trim() || undefined
  ]
    .filter((x) => x && String(x).length > 0)
    .join(", ");
};

const legacyOrgAddressLine = (o: OrgDetail): string =>
  [
    o.addressLine1,
    o.addressLine2,
    [o.postalCode, o.city].filter(Boolean).join(" "),
    o.state,
    o.country
  ]
    .filter((x) => x && String(x).trim().length > 0)
    .join(", ");

/**
 * CRM organization detail: profile, addresses, segments, associations, and activity.
 *
 * @returns Organization detail UI or loading/error states; gated by parent {@link CrmModuleGate}
 */
export const CrmOrganizationDetailPage = () => {
  const crmBase = useCrmBasePath();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authHeaders, refreshSession, logout } = useCrmApi();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState("");
  const { formatDateTime } = useUserDisplayDatetime();
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const loadOrg = useCallback(async () => {
    if (!id) return;
    setError("");
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(id)}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(id)}`, {
          headers: authHeaders()
        });
      }
      if (res.status === 404) {
        setError("Organization not found.");
        return;
      }
      if (!res.ok) {
        setError("Could not load organization.");
        return;
      }
      const json = (await res.json()) as OrgDetail;
      setOrg(json);
    } catch {
      setError("Could not load organization.");
    } finally {
      setLoading(false);
    }
  }, [id, authHeaders, refreshSession, logout]);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  useEffect(() => {
    if (searchParams.get("edit") !== "1") return;
    setEditOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const shellPatch = useMemo(() => {
    if (error) return { title: "Organization", subtitle: error };
    if (org) return { title: org.name, subtitle: "Profile and activity." };
    return { title: "Organization", subtitle: "Loading record…" };
  }, [error, org]);

  useShellHeader(shellPatch);

  const { canWrite, canDelete } = useCrmPermissions();

  if (!id) {
    return null;
  }

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <Link
            to={`${crmBase}/organizations`}
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden strokeWidth={2} />
            Organizations
          </Link>
        </nav>
        {org && canWrite ? (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
          >
            <Pencil className="h-4 w-4" aria-hidden strokeWidth={2} />
            Edit
          </button>
        ) : null}
      </div>

      <CrmModal title="Edit organization" open={editOpen} onClose={() => setEditOpen(false)}>
        <EditOrganizationModal
          organizationId={id}
          onClose={() => setEditOpen(false)}
          onSaved={() => void loadOrg()}
          onDeleted={() => navigate(`${crmBase}/organizations`, { replace: true })}
          canDelete={canDelete}
        />
      </CrmModal>

      {error ? (
        <p className="mt-6 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      {org ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <div className="space-y-6 lg:col-span-1">
            <CrmDetailProfileCard
              variant="organization"
              name={org.name}
              avatarLetter={org.name.slice(0, 1)}
              holdingOrganizationName={org.holdingOrganizationName?.trim() || null}
              emails={org.emails}
              phones={org.phones}
              legacyEmail={org.email}
              legacyPhone={org.phone}
              addressFields={(() => {
                const filled = (org.addresses ?? []).filter(crmAddressEntryHasContent);
                if (filled.length > 0) {
                  const a = filled.find((x) => x.isPrimary) ?? filled[0]!;
                  return [
                    {
                      label: `Address · ${a.kind.trim() || "Other"}`,
                      value: formatCrmAddressDetailBody(a) || "—"
                    }
                  ];
                }
                return [
                  {
                    label: "Address",
                    value: legacyOrgAddressLine(org) || "No address on file",
                    italicEmpty: true
                  }
                ];
              })()}
              metaFields={[
                {
                  label: "Market segment",
                  value:
                    formatCrmOrganizationSegmentSummary(
                      org.marketSegmentLayer1,
                      org.marketSegmentLayer2,
                      org.marketSegmentLayer3
                    ) ?? "None — set in Edit organization",
                  italicEmpty: !formatCrmOrganizationSegmentSummary(
                    org.marketSegmentLayer1,
                    org.marketSegmentLayer2,
                    org.marketSegmentLayer3
                  )
                },
                {
                  label: "Marketing tags",
                  value:
                    (org.marketingTags ?? []).length > 0
                      ? (org.marketingTags ?? []).map((t) => t.name).join(", ")
                      : "None — set in Edit organization",
                  italicEmpty: (org.marketingTags ?? []).length === 0
                },
                (() => {
                  const hName = org.holdingOrganizationName?.trim();
                  const hAddr = org.holdingOrganizationPrimaryAddress?.trim();
                  if (!hName) {
                    return {
                      label: "Holding organization",
                      value: "None — set in Edit organization",
                      italicEmpty: true
                    };
                  }
                  return {
                    label: "Holding organization",
                    value: hAddr ? `${hName} · ${hAddr}` : hName,
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
                  value: formatDateTime(org.updatedAt)
                }
              ]}
            />
            <CrmAssociatedCard
              entityKind="ORGANIZATION"
              entityId={org.id}
              authHeaders={authHeaders}
              refreshSession={refreshSession}
              logout={logout}
            />
          </div>

          <div className="lg:col-span-3">
            <ActivityTimeline
              entityKind="ORGANIZATION"
              entityId={org.id}
              authHeaders={authHeaders}
              refreshSession={refreshSession}
              logout={logout}
            />
          </div>
        </div>
      ) : loading ? (
        <div className="mt-10 flex justify-center text-sm text-stone-500">
          <Building2 className="mr-2 h-5 w-5 animate-pulse text-indigo-400" aria-hidden />
          Loading…
        </div>
      ) : null}
    </div>
  );
};
