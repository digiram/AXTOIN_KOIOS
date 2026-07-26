/** Common salutations for contact name (optional). */
export const CRM_CONTACT_SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Mx.", "Dr.", "Prof."] as const;

/** Include `current` in the option list when it is not one of the presets (e.g. legacy data). */
export function contactSalutationSelectOptions(current: string): string[] {
  const t = current.trim();
  const known = [...CRM_CONTACT_SALUTATIONS] as string[];
  if (t.length > 0 && !known.includes(t)) return [t, ...known];
  return known;
}
