/**
 * CrmOrganizationSegmentationSettingsPage.
 *
 * CRM settings tab for three-layer market segments and marketing tags used on organizations.
 *
 * Responsibilities:
 * - Load and mutate segment layers and tags via `/v1/tenant/crm/organization-segments` APIs
 * - Present cascading L1/L2/L3 segment panes and tag list with delete confirmations
 * - Gate writes with {@link useCrmPermissions}
 *
 * Depends on:
 * - {@link useCrmApi}, {@link useCrmPermissions}
 *
 * Security:
 * - Destructive deletes require `canWrite`; usage counts shown before tag removal
 */

import { Check, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "../../lib/api.js";
import { useCrmApi } from "./useCrmApi.js";
import { useCrmPermissions } from "./useCrmPermissions.js";

type SegmentRow = {
  id: string;
  layer: 1 | 2 | 3;
  parentId: string | null;
  name: string;
  sortOrder: number;
};

type TagRow = {
  id: string;
  name: string;
  sortOrder: number;
  usageCount: number;
};

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";

type SegmentLayerPaneProps = {
  layer: 1 | 2 | 3;
  title: string;
  items: SegmentRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  addEnabled: boolean;
  addPlaceholder: string;
  newName: string;
  onNewNameChange: (value: string) => void;
  onAdd: () => void;
  canWrite: boolean;
  busy: boolean;
  loading: boolean;
  pendingDeleteId: string | null;
  onRequestDelete: (id: string) => void;
  emptyHint?: string;
};

const SegmentLayerPane = ({
  layer,
  title,
  items,
  selectedId,
  onSelect,
  addEnabled,
  addPlaceholder,
  newName,
  onNewNameChange,
  onAdd,
  canWrite,
  busy,
  loading,
  pendingDeleteId,
  onRequestDelete,
  emptyHint
}: SegmentLayerPaneProps) => {
  const inputId = `crm-new-segment-l${layer}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <div className="border-b border-stone-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p>
        {canWrite ? (
          <div className="mt-3 flex gap-2">
            <input
              id={inputId}
              value={newName}
              onChange={(e) => onNewNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && addEnabled && !busy && !loading) {
                  e.preventDefault();
                  onAdd();
                }
              }}
              placeholder={addPlaceholder}
              className={inputClass}
              disabled={!addEnabled || busy || loading}
            />
            <button
              type="button"
              disabled={!addEnabled || busy || loading}
              onClick={onAdd}
              title="Add segment"
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="sr-only">Add segment</span>
            </button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!addEnabled && emptyHint ? (
          <p className="px-2 py-3 text-xs text-stone-500">{emptyHint}</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-stone-500">No segments yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((s) => (
              <li
                key={s.id}
                className={[
                  "flex items-center justify-between rounded-lg px-2 py-1.5 text-sm",
                  layer < 3 && selectedId === s.id ? "bg-indigo-50 font-medium text-indigo-900" : "hover:bg-stone-50"
                ].join(" ")}
              >
                {layer < 3 ? (
                  <button type="button" onClick={() => onSelect(s.id)} className="min-w-0 flex-1 text-left">
                    {s.name}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1">{s.name}</span>
                )}
                {canWrite ? (
                  <button
                    type="button"
                    title={pendingDeleteId === s.id ? "Confirm delete" : "Delete"}
                    className={[
                      "rounded p-1",
                      pendingDeleteId === s.id ? "text-rose-600" : "text-stone-400 hover:text-rose-600"
                    ].join(" ")}
                    onClick={() => onRequestDelete(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

/**
 * Settings tab panel for CRM organization market segments (3 layers) and marketing tags.
 *
 * @returns Segmentation and tag management UI embedded in CRM settings
 */
export const CrmOrganizationSegmentationTabPanel = () => {
  const { authedFetch } = useCrmApi();
  const { canWrite } = useCrmPermissions();

  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedL1, setSelectedL1] = useState("");
  const [selectedL2, setSelectedL2] = useState("");
  const [newL1Name, setNewL1Name] = useState("");
  const [newL2Name, setNewL2Name] = useState("");
  const [newL3Name, setNewL3Name] = useState("");
  const [segmentBusy, setSegmentBusy] = useState(false);
  const [segmentErr, setSegmentErr] = useState("");
  const [pendingDeleteSegmentId, setPendingDeleteSegmentId] = useState<string | null>(null);

  const [newTagName, setNewTagName] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [tagErr, setTagErr] = useState("");
  const [pendingDeleteTagId, setPendingDeleteTagId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [segRes, tagRes] = await Promise.all([
        authedFetch(`${API_BASE_URL}/tenant/crm/organization-market-segments`),
        authedFetch(`${API_BASE_URL}/tenant/crm/organization-marketing-tags`)
      ]);
      if (!segRes?.ok || !tagRes?.ok) {
        setError("Could not load segmentation settings.");
        return;
      }
      const segJson = (await segRes.json()) as { segments: SegmentRow[] };
      const tagJson = (await tagRes.json()) as { tags: TagRow[] };
      setSegments(segJson.segments ?? []);
      setTags(tagJson.tags ?? []);
    } catch {
      setError("Could not load segmentation settings.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const layer1 = useMemo(
    () => segments.filter((s) => s.layer === 1).sort((a, b) => a.name.localeCompare(b.name)),
    [segments]
  );
  const layer2 = useMemo(() => {
    if (!selectedL1) return [];
    return segments
      .filter((s) => s.layer === 2 && s.parentId === selectedL1)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [segments, selectedL1]);
  const layer3 = useMemo(() => {
    if (!selectedL2) return [];
    return segments
      .filter((s) => s.layer === 3 && s.parentId === selectedL2)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [segments, selectedL2]);

  const selectedL1Name = useMemo(
    () => layer1.find((s) => s.id === selectedL1)?.name ?? "",
    [layer1, selectedL1]
  );
  const selectedL2Name = useMemo(
    () => layer2.find((s) => s.id === selectedL2)?.name ?? "",
    [layer2, selectedL2]
  );
  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.name.localeCompare(b.name)), [tags]);

  const addSegment = async (layer: 1 | 2 | 3, parentId: string | null, rawName: string, clear: () => void) => {
    const name = rawName.trim();
    if (!name) {
      setSegmentErr(`Enter a layer ${layer} segment name.`);
      return;
    }
    if (layer > 1 && !parentId) {
      setSegmentErr(`Select a layer ${layer - 1} segment first.`);
      return;
    }
    setSegmentBusy(true);
    setSegmentErr("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/crm/organization-market-segments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId })
      });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setSegmentErr(j?.message ?? "Could not add segment.");
        return;
      }
      clear();
      await load();
    } catch {
      setSegmentErr("Could not add segment.");
    } finally {
      setSegmentBusy(false);
    }
  };

  const deleteSegment = async (id: string) => {
    setSegmentBusy(true);
    setSegmentErr("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/crm/organization-market-segments/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setSegmentErr(j?.message ?? "Could not delete segment.");
        return;
      }
      setPendingDeleteSegmentId(null);
      if (selectedL2 === id) setSelectedL2("");
      if (selectedL1 === id) {
        setSelectedL1("");
        setSelectedL2("");
      }
      await load();
    } catch {
      setSegmentErr("Could not delete segment.");
    } finally {
      setSegmentBusy(false);
    }
  };

  const addTag = async () => {
    const name = newTagName.trim();
    if (!name) {
      setTagErr("Enter a tag name.");
      return;
    }
    setTagBusy(true);
    setTagErr("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/crm/organization-marketing-tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setTagErr(j?.message ?? "Could not add tag.");
        return;
      }
      setNewTagName("");
      await load();
    } catch {
      setTagErr("Could not add tag.");
    } finally {
      setTagBusy(false);
    }
  };

  const deleteTag = async (id: string) => {
    setTagBusy(true);
    setTagErr("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/crm/organization-marketing-tags/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setTagErr(j?.message ?? "Could not delete tag.");
        return;
      }
      setPendingDeleteTagId(null);
      await load();
    } catch {
      setTagErr("Could not delete tag.");
    } finally {
      setTagBusy(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-none space-y-8">
      <p className="text-sm leading-relaxed text-stone-600">
        Define hierarchical market segments (up to three layers) and marketing tags for organizations. Members pick from
        these lists when editing organization records.
      </p>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Market segments</h3>
        <p className="mt-1 text-sm text-stone-600">
          Add and browse segments in three layers. Select a layer 1 item to manage layer 2 beneath it, then select layer 2
          to manage layer 3.
        </p>

        {segmentErr ? (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {segmentErr}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-stone-500">Loading segments…</p>
        ) : (
          <div className="flex min-h-[22rem] overflow-hidden rounded-xl border border-stone-200 bg-stone-50/40 shadow-sm max-lg:flex-col max-lg:divide-y max-lg:divide-stone-200 lg:divide-x lg:divide-stone-200">
            <SegmentLayerPane
              layer={1}
              title="Layer 1"
              items={layer1}
              selectedId={selectedL1}
              onSelect={(id) => {
                setSelectedL1(id);
                setSelectedL2("");
              }}
              addEnabled
              addPlaceholder="New layer 1 segment"
              newName={newL1Name}
              onNewNameChange={setNewL1Name}
              onAdd={() => void addSegment(1, null, newL1Name, () => setNewL1Name(""))}
              canWrite={canWrite}
              busy={segmentBusy}
              loading={loading}
              pendingDeleteId={pendingDeleteSegmentId}
              onRequestDelete={(id) => {
                if (pendingDeleteSegmentId !== id) {
                  setPendingDeleteSegmentId(id);
                  return;
                }
                void deleteSegment(id);
              }}
            />
            <SegmentLayerPane
              layer={2}
              title="Layer 2"
              items={layer2}
              selectedId={selectedL2}
              onSelect={setSelectedL2}
              addEnabled={Boolean(selectedL1)}
              addPlaceholder={selectedL1Name ? `New segment under ${selectedL1Name}` : "Select layer 1 first"}
              newName={newL2Name}
              onNewNameChange={setNewL2Name}
              onAdd={() => void addSegment(2, selectedL1, newL2Name, () => setNewL2Name(""))}
              canWrite={canWrite}
              busy={segmentBusy}
              loading={loading}
              pendingDeleteId={pendingDeleteSegmentId}
              onRequestDelete={(id) => {
                if (pendingDeleteSegmentId !== id) {
                  setPendingDeleteSegmentId(id);
                  return;
                }
                void deleteSegment(id);
              }}
              emptyHint="Select a layer 1 segment to view and add layer 2 options."
            />
            <SegmentLayerPane
              layer={3}
              title="Layer 3"
              items={layer3}
              selectedId=""
              onSelect={() => {}}
              addEnabled={Boolean(selectedL2)}
              addPlaceholder={selectedL2Name ? `New segment under ${selectedL2Name}` : "Select layer 2 first"}
              newName={newL3Name}
              onNewNameChange={setNewL3Name}
              onAdd={() => void addSegment(3, selectedL2, newL3Name, () => setNewL3Name(""))}
              canWrite={canWrite}
              busy={segmentBusy}
              loading={loading}
              pendingDeleteId={pendingDeleteSegmentId}
              onRequestDelete={(id) => {
                if (pendingDeleteSegmentId !== id) {
                  setPendingDeleteSegmentId(id);
                  return;
                }
                void deleteSegment(id);
              }}
              emptyHint="Select a layer 2 segment to view and add layer 3 options."
            />
          </div>
        )}

        {!canWrite ? (
          <p className="text-xs text-stone-500">Your CRM role cannot edit segmentation settings.</p>
        ) : null}
      </section>

      <section className="space-y-4 border-t border-stone-100 pt-8">
        <h3 className="text-sm font-semibold text-slate-800">Marketing tags</h3>
        <p className="mt-1 text-sm text-stone-600">Tags appear as pickable chips when editing organizations.</p>

        {tagErr ? (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {tagErr}
          </p>
        ) : null}

        {canWrite ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="crm-new-tag" className="mb-1.5 block text-xs font-medium text-stone-600">
                New tag
              </label>
              <input
                id="crm-new-tag"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className={inputClass}
                disabled={tagBusy || loading}
              />
            </div>
            <button
              type="button"
              disabled={tagBusy || loading}
              onClick={() => void addTag()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add tag
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-stone-500">Loading…</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200/90 shadow-sm">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm" aria-label="Marketing tags">
              <thead className="bg-stone-50/90 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Tag
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Organizations
                  </th>
                  {canWrite ? (
                    <th scope="col" className="w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] px-0 py-3 text-left">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white text-stone-800">
                {sortedTags.length === 0 ? (
                  <tr className="bg-white">
                    <td colSpan={canWrite ? 3 : 2} className="px-4 py-6 text-center text-sm text-stone-500">
                      No marketing tags yet.
                    </td>
                  </tr>
                ) : (
                  sortedTags.map((t, idx) =>
                    pendingDeleteTagId === t.id ? (
                      <tr
                        key={t.id}
                        className={[idx % 2 === 0 ? "bg-white" : "bg-stone-50/40", "relative z-[1]"].join(" ")}
                      >
                        <td colSpan={canWrite ? 2 : 1} className="relative border-2 border-amber-400 border-r-0 p-0 align-middle">
                          <div className="pointer-events-none absolute inset-0 bg-white" aria-hidden />
                          <div className="relative flex min-h-[2.75rem] flex-col justify-center px-4 py-3 pr-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                            <p className="text-sm font-medium text-slate-800">
                              Delete tag &ldquo;{t.name}&rdquo;?{" "}
                              <span className="font-normal text-stone-600">Not used on any organizations.</span>
                            </p>
                          </div>
                        </td>
                        {canWrite ? (
                          <td className="relative border-2 border-l-0 border-amber-400 p-0 align-top text-sm">
                            <div className="flex min-h-[2.75rem] w-[4.5rem]">
                              <button
                                type="button"
                                title="Cancel"
                                aria-label="Cancel delete"
                                disabled={tagBusy}
                                onClick={() => setPendingDeleteTagId(null)}
                                className="flex flex-1 items-center justify-center bg-rose-100 text-rose-900 transition hover:bg-rose-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-400/80 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                title="Confirm delete"
                                aria-label={`Confirm delete tag ${t.name}`}
                                disabled={tagBusy}
                                onClick={() => void deleteTag(t.id)}
                                className="flex flex-1 items-center justify-center bg-emerald-100 text-emerald-900 transition hover:bg-emerald-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/80 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Check className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ) : (
                      <tr
                        key={t.id}
                        className={[idx % 2 === 0 ? "bg-white" : "bg-stone-50/40", "transition-colors hover:bg-stone-50/90"].join(
                          " "
                        )}
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-stone-900">{t.name}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-stone-700">
                          {t.usageCount}
                        </td>
                        {canWrite ? (
                          <td className="border-l border-stone-200 p-0 align-top text-sm">
                            <div className="flex min-h-[2.75rem] w-[4.5rem]">
                              <button
                                type="button"
                                title={
                                  t.usageCount > 0
                                    ? "Remove this tag from all organizations before deleting"
                                    : "Delete marketing tag"
                                }
                                aria-label={`Delete marketing tag ${t.name}`}
                                disabled={
                                  t.usageCount > 0 || (Boolean(pendingDeleteTagId) && pendingDeleteTagId !== t.id)
                                }
                                onClick={() => setPendingDeleteTagId(t.id)}
                                className="flex w-full items-center justify-center bg-stone-100 text-stone-800 transition hover:bg-stone-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400/80 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
