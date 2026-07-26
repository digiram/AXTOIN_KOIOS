/** True when `fetch` failed before an HTTP response (offline, wrong host, API process not running, CORS hard-fail). */
export const isLikelyFetchNetworkError = (e: unknown): boolean => {
  if (!(e instanceof TypeError)) return false;
  const m = e.message;
  return (
    typeof m === "string" &&
    (m.includes("Failed to fetch") || m.includes("fetch") || m.includes("NetworkError") || m.includes("LOAD_FAILED"))
  );
};
