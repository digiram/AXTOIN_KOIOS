/**
 * ToastProvider
 *
 * App-root portal host for short-lived success and error toasts.
 *
 * Responsibilities:
 * - Expose `useToast()` for imperative messages from any descendant
 * - Auto-dismiss toasts after `TOAST_DURATION_MS`
 * - Render messages in a fixed bottom-center portal stack
 *
 * Related:
 * - Wraps the web app in `main.tsx`; CRM and settings flows call `toast()`
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4500;

function ToastMessage({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  const shellClass =
    item.variant === "error"
      ? "border-rose-200 bg-rose-50 text-rose-950 shadow-rose-900/10"
      : "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-emerald-900/10";

  return (
    <div
      role="status"
      className={[
        "pointer-events-auto w-full max-w-md rounded-lg border px-4 py-2.5 text-center text-sm font-medium shadow-lg",
        shellClass
      ].join(" ")}
    >
      {item.message}
    </div>
  );
}

function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed left-1/2 top-4 z-[9999] flex w-[min(100%,28rem)] -translate-x-1/2 flex-col items-stretch gap-2 px-4"
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map((item) => (
        <ToastMessage key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </div>
  );
}

/** Mount once near the app root and call {@link useToast} from descendants. */
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message: trimmed, variant }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  const viewport =
    mounted && typeof document !== "undefined"
      ? createPortal(<ToastViewport items={items} onDismiss={dismiss} />, document.body)
      : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {viewport}
    </ToastContext.Provider>
  );
};

/** Imperative toast API — throws if used outside {@link ToastProvider}. */
export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
};
