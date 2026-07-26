/**
 * ShellHeaderContext
 *
 * Lets pages override the AppShell header title and subtitle without duplicating chrome.
 *
 * Responsibilities:
 * - Hold optional header overrides while a page is mounted
 * - Expose `useShellHeader` for effect-based set/clear on mount/unmount
 *
 * Related:
 * - `AppShell`; CRM detail pages and workforce screens that retitle the shell
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

/** Partial override; `undefined` fields fall back to layout props. */
export type ShellHeaderOverride = {
  title?: string;
  subtitle?: string;
  /** Shown before the title in the shell header (e.g. workforce person vs agent). */
  titleLeading?: ReactNode;
};

type ShellHeaderApi = {
  /** Pass `null` to clear overrides and use layout header props again. */
  setShellHeader: (patch: ShellHeaderOverride | null) => void;
};

const ShellHeaderContext = createContext<ShellHeaderApi | null>(null);

/** Internal bridge between `AppShell` layout props and `useShellHeader` consumers. */
export const ShellHeaderBridge = ({
  layoutTitle,
  layoutSubtitle,
  children
}: {
  layoutTitle: string;
  layoutSubtitle?: string;
  children: (effective: {
    headerTitle: string;
    headerSubtitle?: string;
    headerTitleLeading?: ReactNode;
  }) => ReactNode;
}) => {
  const [override, setOverrideState] = useState<ShellHeaderOverride | null>(null);
  const setShellHeader = useCallback((patch: ShellHeaderOverride | null) => {
    setOverrideState(patch);
  }, []);

  const api = useMemo(() => ({ setShellHeader }), [setShellHeader]);

  const headerTitle = override?.title ?? layoutTitle;
  const headerSubtitle =
    override != null && override.subtitle !== undefined ? override.subtitle : layoutSubtitle;
  const headerTitleLeading = override?.titleLeading;

  return (
    <ShellHeaderContext.Provider value={api}>
      {children({ headerTitle, headerSubtitle, headerTitleLeading })}
    </ShellHeaderContext.Provider>
  );
};

/**
 * Set shell header overrides for the lifetime of the calling component.
 *
 * @param patch - Partial override, or `null` to restore layout defaults.
 */
export const useShellHeader = (patch: ShellHeaderOverride | null): void => {
  const ctx = useContext(ShellHeaderContext);
  const title = patch?.title;
  const subtitle = patch?.subtitle;
  const titleLeading = patch?.titleLeading;

  useEffect(() => {
    if (!ctx) return;
    ctx.setShellHeader(patch);
    return () => ctx.setShellHeader(null);
  }, [ctx, title, subtitle, titleLeading]);
};
