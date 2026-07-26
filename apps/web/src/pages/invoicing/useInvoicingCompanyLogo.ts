/**
 * Invoicing Company Logo hook.
 *
 * Loads and caches the tenant company logo URL for invoicing document previews.
 *
 * Responsibilities:
 * - Fetch logo metadata from tenant settings API
 * - Expose loading state for document header rendering
 *
 * Related:
 * - InvoicingDocumentView
 *
 * Security:
 * - Logo URL is tenant-scoped via authenticated API
 */
import { useEffect, useRef, useState } from "react";

import { useInvoicingApi } from "./useInvoicingApi.js";

/** Hook for invoicing & quoting screens; see implementation for inputs and return shape. */
export const useInvoicingCompanyLogoUrl = (hasCompanyLogo: boolean, cacheKey: string) => {
  const { authedFetch } = useInvoicingApi();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasCompanyLogo) {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    const photoGetUrl = `/tenant/invoicing/configuration/logo?cache=${encodeURIComponent(cacheKey)}`;

    void (async () => {
      const res = await authedFetch(photoGetUrl, { method: "GET" });
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
  }, [authedFetch, cacheKey, hasCompanyLogo]);

  useEffect(
    () => () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    },
    []
  );

  return objectUrl;
};
