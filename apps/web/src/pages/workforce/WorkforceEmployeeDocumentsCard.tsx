/**
 * WorkforceEmployeeDocumentsCard.
 *
 * Employee document attachments list with upload, download, and delete.
 *
 * Responsibilities:
 * - List documents from `/v1/tenant/workforce/employees/:id/documents`
 * - Enforce 25 MB upload limit client-side
 * - Classify file types for icon display
 *
 * Depends on:
 * - {@link useWorkforceApi}
 *
 * Security:
 * - Downloads use authenticated fetch; tenant scope enforced on API
 */

import {
  Check,
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE_URL } from "../../lib/api.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { useWorkforceApi } from "./useWorkforceApi.js";

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Workforce employee document metadata row from list API. */
export type WorkforceEmployeeDocumentRow = {
  id: string;
  employeeId: string;
  title: string;
  originalFilename: string;
  mimeType: string | null;
  byteSize: number;
  createdAt: string;
};

/** File kind bucket for document list icons. */
export type DocumentFileKind = "pdf" | "word" | "excel" | "image" | "text" | "other";

const fileExt = (filename: string) => {
  const m = /\.([^.]+)$/.exec(filename.trim());
  return m ? m[1]!.toLowerCase() : "";
};

/** Classify by MIME when present, then filename extension. */
export const classifyDocumentFile = (
  mimeType: string | null,
  filename: string
): DocumentFileKind => {
  const mime = (mimeType ?? "").toLowerCase().trim();
  const ext = fileExt(filename);

  if (mime === "application/pdf" || ext === "pdf") return "pdf";

  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    mime === "application/rtf" ||
    mime === "application/vnd.oasis.opendocument.text" ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  ) {
    return "word";
  }

  if (
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    mime === "text/csv" ||
    mime === "application/vnd.oasis.opendocument.spreadsheet" ||
    ["xls", "xlsx", "ods", "csv"].includes(ext)
  ) {
    return "excel";
  }

  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "tif", "tiff"].includes(ext)) {
    return "image";
  }

  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    ["txt", "md", "json", "xml", "log", "yaml", "yml"].includes(ext)
  ) {
    return "text";
  }

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

const DocumentFileIcon = ({
  mimeType,
  filename
}: {
  mimeType: string | null;
  filename: string;
}) => {
  const kind = classifyDocumentFile(mimeType, filename);
  const { Icon, className, label } = DOCUMENT_FILE_ICON[kind];
  return (
    <span className="flex shrink-0 items-center" title={label}>
      <Icon className={`h-5 w-5 ${className}`} aria-hidden strokeWidth={1.75} />
      <span className="sr-only">{label}</span>
    </span>
  );
};

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Employee documents card with upload, download, and delete actions.
 *
 * @param employeeId - Workforce employee id for document API scope
 */
export const WorkforceEmployeeDocumentsCard = ({ employeeId }: { employeeId: string }) => {
  const { formatDateTime } = useUserDisplayDatetime();
  const { authedFetch } = useWorkforceApi();
  const [documents, setDocuments] = useState<WorkforceEmployeeDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const base = `${API_BASE_URL}/tenant/workforce/employees/${encodeURIComponent(employeeId)}/documents`;

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authedFetch(base);
      if (!res?.ok) {
        setError("Could not load documents.");
        return;
      }
      const j = (await res.json()) as { documents: WorkforceEmployeeDocumentRow[] };
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
    [authedFetch, base, load]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      if (uploading) return;
      void uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles, uploading]
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }, []);

  const remove = useCallback(
    async (docId: string) => {
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
    [authedFetch, base]
  );

  const confirmRemove = useCallback(
    async (docId: string) => {
      const ok = await remove(docId);
      if (ok) setConfirmDeleteId(null);
    },
    [remove]
  );

  const download = useCallback(
    async (doc: WorkforceEmployeeDocumentRow) => {
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
        dragOver
          ? "border-indigo-300 bg-indigo-50/30 ring-indigo-200"
          : "border-slate-200/90 ring-slate-900/5",
        uploading ? "pointer-events-none opacity-70" : ""
      ].join(" ")}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 gap-y-1">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Documents</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
            {dragOver
              ? "Drop files to upload…"
              : uploading
                ? "Uploading…"
                : "Contracts, agreements, and other files. Drag anywhere on this card or browse (max 25 MB each)."}
          </p>
        </div>
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
            const confirmingDelete = confirmDeleteId === doc.id;
            const deleting = deletingId === doc.id;
            return (
              <li
                key={doc.id}
                className="relative flex items-center gap-3 rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm"
              >
                <DocumentFileIcon mimeType={doc.mimeType} filename={doc.originalFilename} />
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
                </div>
                {confirmingDelete ? (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center gap-3 rounded-lg bg-white/95 px-3 ring-1 ring-rose-200/80 backdrop-blur-[1px]"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby={`wf-doc-delete-prompt-${doc.id}`}
                  >
                    <p
                      id={`wf-doc-delete-prompt-${doc.id}`}
                      className="min-w-0 flex-1 text-center text-sm font-medium text-slate-800"
                    >
                      Delete this file?
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        title="Confirm delete"
                        disabled={deleting}
                        onClick={() => void confirmRemove(doc.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" aria-hidden strokeWidth={2.5} />
                        <span className="sr-only">Confirm delete {doc.title}</span>
                      </button>
                      <button
                        type="button"
                        title="Cancel"
                        disabled={deleting}
                        onClick={() => setConfirmDeleteId(null)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="h-4 w-4" aria-hidden strokeWidth={2.5} />
                        <span className="sr-only">Cancel delete {doc.title}</span>
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