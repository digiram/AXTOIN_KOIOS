/**
 * ProfileEntityPhoto
 *
 * Authenticated profile photo upload, display, and drag-drop for CRM entities.
 *
 * Responsibilities:
 * - `useEntityProfilePhoto` hook for upload/remove and drag state
 * - Round photo display with cache-busting via `cacheKey`
 * - Modal ring and drop panel variants for create/edit flows
 *
 * Related:
 * - CRM contact/organization detail and modals; tenant blob photo routes
 *
 * Security:
 * - All photo URLs require bearer token via `authedFetch`; images are tenant-scoped.
 */
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";

/** URLs and callbacks for entity profile photo CRUD (contact or organization). */
export type EntityProfilePhotoHandlers = {
  hasPhoto: boolean;
  /** Bust image cache when the server updates (e.g. `contact.updatedAt`). */
  cacheKey: string;
  photoGetUrl: string;
  photoPostUrl: string;
  photoDeleteUrl: string;
  authedFetch: (url: string, init?: RequestInit) => Promise<Response | null>;
  onChanged: () => void;
};

/** Returns the first image file from a file list, or the first file as fallback. */
export const pickFirstImageFile = (list: FileList | File[]): File | null => {
  const arr = list instanceof FileList ? Array.from(list) : list;
  for (const f of arr) {
    if (f.type.startsWith("image/")) return f;
  }
  return arr[0] ?? null;
};

/** Two-letter initials from first/last name with sensible fallbacks. */
export const initialsFromFirstLast = (firstName: string, lastName: string) => {
  const a = firstName.trim();
  const b = lastName.trim();
  if (a.length >= 1 && b.length >= 1) return `${a.slice(0, 1)}${b.slice(0, 1)}`.toUpperCase();
  if (a.length >= 2) return a.slice(0, 2).toUpperCase();
  if (b.length >= 2) return b.slice(0, 2).toUpperCase();
  const single = a || b;
  if (single.length === 1) return `${single.toUpperCase()}?`;
  return "?";
};

/** Upload / remove + optional whole-card drag surface (depth counter avoids flicker on nested children). */
export const useEntityProfilePhoto = (handlers: EntityProfilePhotoHandlers | undefined) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const upload = useCallback(
    async (file: File) => {
      if (!handlers) return;
      setError(null);
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", file, file.name);
        const res = await handlers.authedFetch(handlers.photoPostUrl, { method: "POST", body: fd });
        if (!res?.ok) {
          const j = res ? ((await res.json().catch(() => null)) as { message?: string } | null) : null;
          setError(j?.message ?? "Upload failed.");
          return;
        }
        handlers.onChanged();
      } catch {
        setError("Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [handlers]
  );

  const remove = useCallback(async () => {
    if (!handlers) return;
    setError(null);
    setBusy(true);
    try {
      const res = await handlers.authedFetch(handlers.photoDeleteUrl, { method: "DELETE" });
      if (!res?.ok) {
        setError("Could not remove photo.");
        return;
      }
      handlers.onChanged();
    } catch {
      setError("Could not remove photo.");
    } finally {
      setBusy(false);
    }
  }, [handlers]);

  const cardDropSurfaceProps =
    handlers !== undefined
      ? {
          onDragEnter: (e: DragEvent) => {
            e.preventDefault();
            dragDepth.current += 1;
            setDragOver(true);
          },
          onDragLeave: (e: DragEvent) => {
            e.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragOver(false);
          },
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragOver(false);
            const f = pickFirstImageFile(e.dataTransfer.files);
            if (f) void upload(f);
          }
        }
      : {};

  return { upload, remove, busy, error, dragOver, cardDropSurfaceProps };
};

/** Fetches and displays a round profile photo using authenticated GET. */
export const AuthenticatedRoundPhoto = ({
  handlers,
  className,
  alt
}: {
  handlers: EntityProfilePhotoHandlers;
  className?: string;
  alt: string;
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!handlers.hasPhoto) {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await handlers.authedFetch(handlers.photoGetUrl, { method: "GET" });
      if (cancelled || !res?.ok) return;
      const blob = await res.blob();
      if (cancelled) return;
      const u = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = u;
      setObjectUrl(u);
    })();

    return () => {
      cancelled = true;
    };
  }, [handlers.hasPhoto, handlers.cacheKey, handlers.photoGetUrl, handlers.authedFetch]);

  useEffect(
    () => () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    },
    []
  );

  if (!handlers.hasPhoto || !objectUrl) return null;
  return <img src={objectUrl} alt={alt} className={className} />;
};

/** Circular preview + actions for CRM / workforce edit dialogs (drop target is usually the modal `panelProps`). */
export const ProfilePhotoEditModalRing = ({
  handlers,
  upload,
  remove,
  busy,
  error,
  initials,
  dragOver
}: {
  handlers: EntityProfilePhotoHandlers;
  upload: (file: File) => void | Promise<void>;
  remove: () => Promise<void>;
  busy: boolean;
  error: string | null;
  initials: string;
  dragOver?: boolean;
}) => {
  const inputId = useId();

  return (
    <div className={busy ? "pointer-events-none opacity-60" : ""}>
      <div className="flex w-full flex-col items-center gap-2">
        <label
          htmlFor={inputId}
          title={handlers.hasPhoto ? "Click to replace photo" : "Click to add photo"}
          className={[
            "relative mx-auto flex h-[4.5rem] w-[4.5rem] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-[5px] border-white bg-slate-200 text-lg font-bold tracking-tight text-indigo-950 shadow-lg transition-shadow sm:h-[5.25rem] sm:w-[5.25rem] sm:text-xl",
            dragOver ? "ring-2 ring-amber-400/85 ring-offset-1 ring-offset-white" : "ring-1 ring-black/10"
          ].join(" ")}
        >
          {handlers.hasPhoto ? (
            <AuthenticatedRoundPhoto handlers={handlers} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>{initials}</span>
          )}
          <span className="sr-only">
            {handlers.hasPhoto ? "Replace profile photo — choose an image file" : "Choose profile photo — choose an image file"}
          </span>
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        {handlers.hasPhoto ? (
          <div className="flex w-full flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50"
            >
              Remove photo
            </button>
          </div>
        ) : null}
        {error ? (
          <p className="mx-auto max-w-[12rem] text-center text-xs text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
};

/** Same outer layout as {@link ProfilePhotoEditModalRing} when there is no upload target yet (create flows). */
export const ProfilePhotoEditModalPlaceholder = ({ initials }: { initials: string }) => (
  <div className="flex w-full flex-col items-center gap-2">
    <div
      aria-hidden
      className="mx-auto flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full border-[5px] border-white bg-slate-200 text-lg font-bold tracking-tight text-indigo-950 shadow-lg ring-1 ring-black/10 sm:h-[5.25rem] sm:w-[5.25rem] sm:text-xl"
    >
      {initials}
    </div>
  </div>
);

/** Compact panel for modals (drag works on the panel only). */
export const ProfilePhotoDropPanel = ({
  handlers,
  title,
  hint,
  footnote,
  spacingClass = "mt-5"
}: {
  handlers: EntityProfilePhotoHandlers;
  title: string;
  hint: string;
  footnote?: string;
  /** Top spacing below a section heading (e.g. `mt-3` when the panel sits in a split row). */
  spacingClass?: string;
}) => {
  const inputId = useId();
  const { upload, remove, busy, error, dragOver, cardDropSurfaceProps } = useEntityProfilePhoto(handlers);

  return (
    <div
      className={[
        spacingClass,
        "rounded-xl border border-dashed px-3 py-3 transition-colors sm:px-4",
        dragOver ? "border-amber-400/90 bg-amber-50/50 ring-2 ring-amber-300/40" : "border-stone-200/90 bg-stone-50/60",
        busy ? "opacity-70" : ""
      ].join(" ")}
      {...cardDropSurfaceProps}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
          {footnote ? <p className="mt-1 text-[11px] text-slate-400">{footnote}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            {handlers.hasPhoto ? "Replace" : "Upload"}
          </label>
          {handlers.hasPhoto ? (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};
