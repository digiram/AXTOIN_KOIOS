/**
 * SalesFunnelRecordProfileCard
 *
 * Hero profile card for sales funnel lead and deal detail pages.
 *
 * Responsibilities:
 * - Stage, owner, organization, contacts, tags, and deal value display
 * - Optional inline editing via `SalesFunnelRecordDetailsEditor`
 * - Archive, reactivate, and permanent-delete actions when permitted
 *
 * Related:
 * - Sales funnel detail routes; CRM organization links
 */
import { Archive, RotateCcw, Tag, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { CrmProfileDetailField } from "../crm/CrmDetailProfileCard.js";
import type { FunnelDetailRecord } from "../../pages/sales/SalesFunnelDetailPanel.js";
import { SalesFunnelRecordDetailsEditor } from "../../pages/sales/SalesFunnelRecordDetailsEditor.js";
import type { FunnelDetailsPatch } from "../../pages/sales/SalesFunnelRecordDetailsEditor.js";
import {
  salesDealDetailPath,
  salesLeadDetailPath
} from "../../pages/sales/salesFunnelPaths.js";
import type { CurrencyFormatId } from "../../lib/country-presets.js";
import { formatFinanceAmount } from "../../lib/currencyFormat.js";

const headerShellClass =
  "relative z-20 bg-gradient-to-b from-indigo-600 via-indigo-700 to-indigo-900 border-b border-indigo-950/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]";

/** Contact linked to a funnel record with role and optional display name. */
export type SalesFunnelContactRow = {
  contactId: string;
  role: string;
  displayName?: string;
};

type Props = {
  kind: "lead" | "deal";
  title: string;
  stageLabel: string;
  description: string;
  ownerLabel: string | null;
  organizationName: string | null;
  organizationId: string | null;
  contacts: SalesFunnelContactRow[];
  tags: string[];
  expectedValueMinor?: number | null;
  expectedValueCurrency?: string | null;
  locale: string;
  currencyFormat: CurrencyFormatId | null;
  outcomeLabel?: string | null;
  promotedDealId?: string | null;
  promotedFromLeadId?: string | null;
  inactiveLabel?: string | null;
  recordUpdatedAt: string;
  crmBase: string;
  /** When set with `onSaveDetails`, description/owner/org/contacts/deal size are editable. */
  canEdit?: boolean;
  editRecord?: FunnelDetailRecord;
  onSaveDetails?: (patch: FunnelDetailsPatch) => Promise<boolean>;
  archivedAt?: string | null;
  canArchive?: boolean;
  archiveBusy?: boolean;
  onArchive?: () => void;
  canPermanentlyDelete?: boolean;
  permanentDeleteBusy?: boolean;
  onPermanentDelete?: () => void;
  canReactivate?: boolean;
  reactivateBusy?: boolean;
  onReactivate?: () => void;
  firstLaneName?: string | null;
};

/** Profile card for a funnel lead or deal with optional inline edit and lifecycle actions. */
export const SalesFunnelRecordProfileCard = (props: Props) => {
  const {
    kind,
    title,
    stageLabel,
    description,
    ownerLabel,
    organizationName,
    organizationId,
    contacts,
    tags,
    expectedValueMinor,
    expectedValueCurrency,
    locale,
    currencyFormat,
    outcomeLabel,
    promotedDealId,
    promotedFromLeadId,
    inactiveLabel,
    recordUpdatedAt,
    crmBase,
    canEdit = false,
    editRecord,
    onSaveDetails,
    archivedAt = null,
    canArchive = false,
    archiveBusy = false,
    onArchive,
    canPermanentlyDelete = false,
    permanentDeleteBusy = false,
    onPermanentDelete,
    canReactivate = false,
    reactivateBusy = false,
    onReactivate,
    firstLaneName = null
  } = props;

  const editable = Boolean(canEdit && editRecord && onSaveDetails && !archivedAt);
  const showArchive = Boolean(!archivedAt && canArchive && onArchive);
  const showPermanentDelete = Boolean(archivedAt && canPermanentlyDelete && onPermanentDelete);
  const showReactivate = Boolean(inactiveLabel && canReactivate && onReactivate);

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
      <ProfileHeader title={title} />

      <div className="relative z-10 bg-white px-4 pb-1.5 pt-1.5 sm:px-5 sm:pb-2 sm:pt-2">
        <p className="text-sm font-semibold leading-snug text-indigo-900">{stageLabel}</p>
      </div>

      <div className="px-4 pb-5 pt-4 sm:px-5">
        {inactiveLabel ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {inactiveLabel}
            </p>
            {showReactivate && onReactivate ? (
              <button
                type="button"
                disabled={reactivateBusy}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onReactivate}
              >
                <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
                {reactivateBusy
                  ? "Reactivating…"
                  : firstLaneName
                    ? `Reactivate to ${firstLaneName}`
                    : "Reactivate to first lane"}
              </button>
            ) : null}
          </div>
        ) : null}

        {editable && editRecord && onSaveDetails ? (
          <SalesFunnelRecordDetailsEditor
            kind={kind}
            record={editRecord}
            canEdit={canEdit}
            onSave={onSaveDetails}
            className="mt-7"
          />
        ) : null}

        {!editable && description.trim() ? (
          <div className="mb-4 mt-7">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Description</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{description.trim()}</p>
          </div>
        ) : !editable ? (
          <p className="mb-4 mt-7 text-sm italic text-slate-500">No description.</p>
        ) : null}

        {!editable ? (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <CrmProfileDetailField
            label={kind === "deal" ? "Deal owner" : "Lead owner"}
            value={ownerLabel ?? "Unassigned"}
            italicEmpty={!ownerLabel}
          />
          <OrganizationField
            kind={kind}
            organizationId={organizationId}
            organizationName={organizationName}
            crmBase={crmBase}
          />

          {kind === "deal" && expectedValueMinor != null && expectedValueCurrency ? (
            <CrmProfileDetailField
              label="Expected deal size"
              value={formatFinanceAmount(
                expectedValueMinor,
                expectedValueCurrency,
                locale,
                currencyFormat
              )}
            />
          ) : null}

          <ContactsList contacts={contacts} crmBase={crmBase} kind={kind} />
        </div>
        ) : null}

        <div className="space-y-4 border-t border-slate-100 pt-4">
          {outcomeLabel ? <CrmProfileDetailField label="Outcome" value={outcomeLabel} /> : null}

          {kind === "lead" && promotedDealId ? (
            <p className="text-sm text-violet-800">
              Promoted to Sales.{" "}
              <Link
                to={salesDealDetailPath(promotedDealId)}
                className="font-medium text-indigo-700 underline hover:text-indigo-900"
              >
                Open deal
              </Link>
            </p>
          ) : null}

          {kind === "deal" && promotedFromLeadId ? (
            <p className="text-sm text-violet-800">
              <Link
                to={salesLeadDetailPath(promotedFromLeadId)}
                className="font-medium text-indigo-700 underline hover:text-indigo-900"
              >
                View originating lead
              </Link>
            </p>
          ) : null}

          {tags.length > 0 ? <TagsList tags={tags} /> : null}

          <CrmProfileDetailField label="Record updated" value={recordUpdatedAt} />

          {showArchive && onArchive ? (
            <ArchiveSection kind={kind} busy={archiveBusy} onArchive={onArchive} />
          ) : null}

          {showPermanentDelete && onPermanentDelete ? (
            <PermanentDeleteSection
              kind={kind}
              busy={permanentDeleteBusy}
              onPermanentDelete={onPermanentDelete}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
};

function ArchiveSection({
  kind,
  busy,
  onArchive
}: {
  kind: "lead" | "deal";
  busy: boolean;
  onArchive: () => void;
}) {
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  useEffect(() => {
    if (!awaitingConfirm) return;
    const id = window.setTimeout(() => setAwaitingConfirm(false), 5000);
    return () => window.clearTimeout(id);
  }, [awaitingConfirm]);

  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Archive</p>
      <p className="mt-1 text-sm text-slate-600">
        Hides this {kind === "deal" ? "deal" : "lead"} from the pipeline board. You can reactivate or permanently delete
        it later.
      </p>
      <button
        type="button"
        disabled={busy}
        className={[
          "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
          awaitingConfirm
            ? "border border-amber-800 bg-amber-700 text-white hover:bg-amber-800"
            : "border border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100"
        ].join(" ")}
        onClick={() => {
          if (!awaitingConfirm) {
            setAwaitingConfirm(true);
            return;
          }
          setAwaitingConfirm(false);
          onArchive();
        }}
      >
        <Archive className="h-4 w-4 shrink-0" aria-hidden />
        {awaitingConfirm
          ? "Click again to archive"
          : kind === "deal"
            ? "Archive deal"
            : "Archive lead"}
      </button>
    </div>
  );
}

function PermanentDeleteSection({
  kind,
  busy,
  onPermanentDelete
}: {
  kind: "lead" | "deal";
  busy: boolean;
  onPermanentDelete: () => void;
}) {
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  useEffect(() => {
    if (!awaitingConfirm) return;
    const id = window.setTimeout(() => setAwaitingConfirm(false), 5000);
    return () => window.clearTimeout(id);
  }, [awaitingConfirm]);

  const label = kind === "deal" ? "deal" : "lead";

  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Danger zone</p>
      <p className="mt-1 text-sm text-slate-600">
        Permanently removes this archived {label} and its activity history. This cannot be undone.
      </p>
      <button
        type="button"
        disabled={busy}
        className={[
          "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
          awaitingConfirm
            ? "border border-rose-900 bg-rose-600 text-white hover:bg-rose-700"
            : "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
        ].join(" ")}
        onClick={() => {
          if (!awaitingConfirm) {
            setAwaitingConfirm(true);
            return;
          }
          setAwaitingConfirm(false);
          onPermanentDelete();
        }}
      >
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        {awaitingConfirm
          ? "Click again to delete permanently"
          : kind === "deal"
            ? "Delete deal permanently"
            : "Delete lead permanently"}
      </button>
    </div>
  );
}

function ProfileHeader({ title }: { title: string }) {
  return (
    <div className={`${headerShellClass} rounded-t-2xl`}>
      <div className="relative px-4 py-4 sm:px-5 sm:py-5">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.12),transparent_55%)]"
          aria-hidden
        />
        <h2 className="relative z-10 break-words text-lg font-bold leading-tight tracking-tight text-white sm:text-xl">
          {title}
        </h2>
      </div>
    </div>
  );
}

function OrganizationField({
  kind,
  organizationId,
  organizationName,
  crmBase
}: {
  kind: "lead" | "deal";
  organizationId: string | null;
  organizationName: string | null;
  crmBase: string;
}) {
  const label = kind === "deal" ? "Deal organization" : "Lead organization";
  const name = organizationName?.trim();
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {organizationId && name ? (
        <Link
          to={`${crmBase}/organizations/${organizationId}`}
          className="mt-1 block text-sm font-medium leading-snug text-indigo-700 hover:underline"
        >
          {name}
        </Link>
      ) : (
        <p className="mt-1 text-sm italic leading-snug text-slate-500">None</p>
      )}
    </div>
  );
}

function ContactsList({
  contacts,
  crmBase,
  kind
}: {
  contacts: SalesFunnelContactRow[];
  crmBase: string;
  kind: "lead" | "deal";
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Contacts on this {kind}
      </p>
      {contacts.length === 0 ? (
        <p className="mt-2 text-sm italic text-slate-500">No linked contacts.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {contacts.map((c) => (
            <li
              key={c.contactId}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-2 ring-1 ring-stone-200/80"
            >
              <User className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
              <Link
                to={`${crmBase}/contacts/${c.contactId}`}
                className="min-w-0 flex-1 truncate text-sm font-medium text-indigo-700 hover:underline"
              >
                {c.displayName?.trim() || c.contactId}
              </Link>
              {c.role.trim() ? (
                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-600 ring-1 ring-stone-200">
                  {c.role}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagsList({ tags }: { tags: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tags</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 ring-1 ring-stone-200/80"
          >
            <Tag className="h-3 w-3" aria-hidden />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
