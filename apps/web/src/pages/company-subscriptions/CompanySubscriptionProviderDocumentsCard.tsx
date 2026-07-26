/**
 * Company Subscription Provider Documents Card.
 *
 * Reusable company subscriptions UI building block: Company Subscription Provider Documents Card.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/company-subscriptions
 */
import { Check, Download, File, FileImage, FileSpreadsheet, FileText, FileType, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import {
  COMPANY_SUBSCRIPTIONS_API,
  type CompanySubscriptionProviderDocumentRow,
  useCompanySubscriptionsApi
} from "./useCompanySubscriptionsApi.js";

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

type DocumentFileKind = "pdf" | "word" | "excel" | "image" | "text" | "other";

const fileExt = (filename: string) => {
  const m = /\.([^.]+)$/.exec(filename.trim());
  return m ? m[1]!.toLowerCase() : "";
};

const classifyDocumentFile = (mimeType: string | null, filename: string): DocumentFileKind => {
  const mime = (mimeType ?? "").toLowerCase().trim();
  const ext = fileExt(filename);

  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  ) {
    return "word";
  }
  if (
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    mime === "text/csv" ||
    ["xls", "xlsx", "ods", "csv"].includes(ext)
  ) {
    return "excel";
  }
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (mime.startsWith("text/") || ["txt", "md", "json", "xml"].includes(ext)) return "text";
  return "other";
};

const DOCUMENT_FILE_ICON: Record<
  DocumentFileKind,
  { Icon: typeof FileText; className: string; label: string }
> = {
  pdf: { Icon: FileText, className: "text-rose-600", label: "PDF" },
  word: { Icon: FileType, className: "text-blue-600", label: "Word document" },
  excel: { Icon: FileSpreadsheet, className: "text-emerald-600", label: "Spreadsheet" },
  image: { Icon: FileImage, className: "text-violet-600", label: "Image" },
  text: { Icon: FileText, className: "text-slate-600", label: "Text file" },
  other: { Icon: File, className: "text-slate-500", label: "File" }
};

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/** React component for company subscriptions UI. */
export const CompanySubscriptionProviderDocumentsCard = ({ providerId }: { providerId: string }) => {
  const { formatDateTime } = useUserDisplayDatetime();
  const { authedFetch } = useCompanySubscriptionsApi();
  const { canWrite, canDelete } = useModulePermissions("company_subscriptions");
  const [documents, setDocuments] = useState<CompanySubscriptionProviderDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const base = `${COMPANY_SUBSCRIPTIONS_API}/providers/${encodeURIComponent(providerId)}/documents`;

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authedFetch(base);
      if (!res?.ok) {
        setError("Could not load documents.");
        return;
      }
      const j = (await res.json()) as { documents: CompanySubscriptionProviderDocumentRow[] };
      setDocuments(j.documents ?? []);
    } catch {
      setError("Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, base]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!canWrite) return;
      const list = files instanceof FileList ? Array.from(files) : files;
      if (list.length === 0) return;
      setUploading(true);
      setError("");
      try {
        for (const file of list) {
          if (file.size > MAX_DOCUMENT_BYTES) {
            setError(`"${file.name}" exceeds the 25 MB limit.`);
            continue;
          }
          const fd = new FormData();
          fd.append("file", file, file.name);
          const title = file.name.replace(/\.[^.]+$/, "").trim();
          if (title) fd.append("title", title);
          const res = await authedFetch(base, { method: "POST", body: fd });
          if (!res?.ok) {
            const j = res ? ((await res.json().catch(() => null)) as { message?: string } | null) : null;
            setError(j?.message ?? `Could not upload "${file.name}".`);
          }
        }
        await load();
      } finally {
        setUploading(false);
      }
    },
    [authedFetch, base, canWrite, load]
  );

  const remove = useCallback(
    async (docId: string) => {
      if (!canDelete) return false;
      setDeletingId(docId);
      setError("");
      try {
        const res = await authedFetch(`${base}/${encodeURIComponent(docId)}`, { method: "DELETE" });
        if (!res?.ok) {
          setError("Could not delete document.");
          return false;
        }
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        return true;
      } finally {
        setDeletingId(null);
      }
    },
    [authedFetch, base, canDelete]
  );

  const download = useCallback(
    async (doc: CompanySubscriptionProviderDocumentRow) => {
      setError("");
      try {
        const res = await authedFetch(`${base}/${encodeURIComponent(doc.id)}`);
        if (!res?.ok) {
          setError("Could not download document.");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.originalFilename || doc.title;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        setError("Could not download document.");
      }
    },
    [authedFetch, base]
  );

  return (
    <div
      className={[
        "rounded-2xl border bg-white p-5 shadow-sm ring-1 transition-[border-color,box-shadow,background-color] sm:p-6",
        dragOver && canWrite
          ? "border-indigo-300 bg-indigo-50/30 ring-indigo-200"
          : "border-slate-200/90 ring-slate-900/5",
        uploading ? "pointer-events-none opacity-70" : ""
      ].join(" ")}
      onDragEnter={
        canWrite
          ? (e) => {
              e.preventDefault();
              dragDepth.current += 1;
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={
        canWrite
          ? (e) => {
              e.preventDefault();
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragOver(false);
            }
          : undefined
      }
      onDragOver={canWrite ? (e) => e.preventDefault() : undefined}
      onDrop={
        canWrite
          ? (e) => {
              e.preventDefault();
              dragDepth.current = 0;
              setDragOver(false);
              if (uploading) return;
              void uploadFiles(e.dataTransfer.files);
            }
          : undefined
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3 gap-y-1">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Documents</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
            {canWrite
              ? dragOver
                ? "Drop files to upload…"
                : uploading
                  ? "Uploading…"
                  : "Contracts and vendor files (max 25 MB each)."
              : "Contracts and vendor files attached to this provider."}
          </p>
        </div>
        {canWrite ? (
          <div>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Browse…
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files;
                e.target.value = "";
                if (files?.length) void uploadFiles(files);
              }}
            />
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading documents…</p>
      ) : documents.length === 0 ? (
        <p className="mt-4 text-sm italic text-slate-500">No documents yet.</p>
      ) : (
        <ul className="mt-4 list-none space-y-2 p-0">
          {documents.map((doc) => {
            const kind = classifyDocumentFile(doc.mimeType, doc.originalFilename);
            const { Icon, className, label } = DOCUMENT_FILE_ICON[kind];
            const confirmingDelete = confirmDeleteId === doc.id;
            const deleting = deletingId === doc.id;
            return (
              <li
                key={doc.id}
                className="relative flex items-center gap-3 rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm"
              >
                <span className="flex shrink-0 items-center" title={label}>
                  <Icon className={`h-5 w-5 ${className}`} aria-hidden strokeWidth={1.75} />
                  <span className="sr-only">{label}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900" title={doc.title}>
                    {doc.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500" title={doc.originalFilename}>
                    {doc.originalFilename} · {formatBytes(doc.byteSize)} · {formatDateTime(doc.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title="Download"
                    disabled={confirmingDelete || deleting}
                    onClick={() => void download(doc)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-indigo-700 disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" aria-hidden strokeWidth={2} />
                    <span className="sr-only">Download {doc.title}</span>
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      title="Remove"
                      disabled={deleting}
                      onClick={() => setConfirmDeleteId(doc.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden strokeWidth={2} />
                      <span className="sr-only">Remove {doc.title}</span>
                    </button>
                  ) : null}
                </div>
                {confirmingDelete ? (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center gap-3 rounded-lg bg-white/95 px-3 ring-1 ring-rose-200/80 backdrop-blur-[1px]"
                    role="alertdialog"
                    aria-modal="true"
                  >
                    <p className="min-w-0 flex-1 text-center text-sm font-medium text-slate-800">Delete this file?</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        title="Confirm delete"
                        disabled={deleting}
                        onClick={() => void remove(doc.id).then((ok) => ok && setConfirmDeleteId(null))}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" aria-hidden strokeWidth={2.5} />
                        <span className="sr-only">Confirm delete</span>
                      </button>
                      <button
                        type="button"
                        title="Cancel"
                        disabled={deleting}
                        onClick={() => setConfirmDeleteId(null)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="h-4 w-4" aria-hidden strokeWidth={2.5} />
                        <span className="sr-only">Cancel delete</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
