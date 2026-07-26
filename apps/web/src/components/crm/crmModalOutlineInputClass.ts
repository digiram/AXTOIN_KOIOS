/** Outline input style used in CRM modals; switches to rose when `invalid`. */
export function crmModalOutlineInputClass(invalid: boolean): string {
  const base =
    "w-full rounded-lg border px-3 py-2.5 text-sm text-stone-900 shadow-sm bg-white focus:outline-none focus:ring-2 ";
  if (invalid) {
    return `${base}border-rose-500 ring-2 ring-inset ring-rose-200 focus:border-rose-500 focus:ring-rose-300`;
  }
  return `${base}border-stone-200/90 focus:border-amber-400 focus:ring-amber-400/25`;
}
