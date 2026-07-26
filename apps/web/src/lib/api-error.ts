/** Reads `{ message }` from a failed API response body. */
export const readApiErrorMessage = async (res: Response, fallback = "Request failed."): Promise<string> => {
  const j = (await res.json().catch(() => null)) as { message?: string } | null;
  return j?.message ?? fallback;
};
