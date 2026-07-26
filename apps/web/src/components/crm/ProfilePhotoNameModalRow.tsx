/**
 * ProfilePhotoNameModalRow
 *
 * Two-column modal layout aligning profile photo height with the name field block.
 *
 * Responsibilities:
 * - Measure name column height and cap photo column to match
 * - Optional photo slot (omitted for org-only or name-only rows)
 *
 * Related:
 * - CRM create/edit contact modals
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  /** When omitted, only the name column is shown (full width). */
  photo?: ReactNode;
  name: ReactNode;
};

/**
 * Side-by-side profile photo + name fields: photo column height never exceeds the name column
 * (heading + fields), so the photo block does not visually tower past the name section.
 */
export const ProfilePhotoNameModalRow = ({ photo, name }: Props) => {
  const nameColRef = useRef<HTMLDivElement>(null);
  const [nameBlockPx, setNameBlockPx] = useState<number | null>(null);
  const hasPhotoColumn = photo != null;

  useLayoutEffect(() => {
    if (!hasPhotoColumn) return;
    const el = nameColRef.current;
    if (!el) return;
    const sync = () => setNameBlockPx(Math.ceil(el.getBoundingClientRect().height));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasPhotoColumn]);

  if (!hasPhotoColumn) {
    return <div className="min-w-0">{name}</div>;
  }

  const photoColStyle =
    nameBlockPx != null ? ({ height: nameBlockPx, maxHeight: nameBlockPx } as const) : undefined;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
      <div
        className="flex min-h-0 w-full shrink-0 flex-col overflow-y-auto sm:max-w-[14rem]"
        style={photoColStyle}
      >
        {photo}
      </div>
      <div ref={nameColRef} className="min-w-0 flex-1">
        {name}
      </div>
    </div>
  );
};
