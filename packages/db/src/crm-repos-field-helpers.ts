/**
 * Shared CRM JSON columns: addresses, email/phone channel arrays (organizations + contacts).
 */

import type { CrmAddressEntry, CrmChannelEntry } from "@starter/shared";

const stringifyChannels = (list: CrmChannelEntry[]): string => JSON.stringify(list);

export const parseChannelsJson = (raw: string | null | undefined): CrmChannelEntry[] => {
  if (raw == null || raw === "") return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        kind: typeof x.kind === "string" ? x.kind : "Other",
        value: typeof x.value === "string" ? x.value : "",
        isPrimary: Boolean(x.isPrimary)
      }))
      .filter((x) => x.value.length > 0);
  } catch {
    return [];
  }
};

function trimOrNullAddr(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length === 0 ? null : t;
}

function addressEntryHasContent(a: CrmAddressEntry): boolean {
  return [
    a.addressLine1,
    a.addressLine2,
    a.houseNumber,
    a.postalCode,
    a.city,
    a.state,
    a.country
  ].some((x) => (x ?? "").trim().length > 0);
}

export const parseAddressesJson = (raw: string | null | undefined): CrmAddressEntry[] => {
  if (raw == null || raw === "") return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map(
        (x): CrmAddressEntry => ({
          kind: typeof x.kind === "string" ? x.kind : "Home",
          addressLine1: trimOrNullAddr(typeof x.addressLine1 === "string" ? x.addressLine1 : null),
          addressLine2: trimOrNullAddr(typeof x.addressLine2 === "string" ? x.addressLine2 : null),
          houseNumber: trimOrNullAddr(typeof x.houseNumber === "string" ? x.houseNumber : null),
          postalCode: trimOrNullAddr(typeof x.postalCode === "string" ? x.postalCode : null),
          city: trimOrNullAddr(typeof x.city === "string" ? x.city : null),
          state: trimOrNullAddr(typeof x.state === "string" ? x.state : null),
          country: trimOrNullAddr(typeof x.country === "string" ? x.country : null),
          isPrimary: Boolean(x.isPrimary)
        })
      )
      .filter(addressEntryHasContent);
  } catch {
    return [];
  }
};

const stringifyAddresses = (list: CrmAddressEntry[]): string => JSON.stringify(list);

type AddressMirror = {
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

const emptyAddressMirror = (): AddressMirror => ({
  addressLine1: null,
  addressLine2: null,
  postalCode: null,
  city: null,
  state: null,
  country: null
});

function normalizeAddressEntriesRaw(entries: CrmAddressEntry[]): {
  list: CrmAddressEntry[];
  mirror: AddressMirror;
} {
  const trimmed = entries
    .map((e) => ({
      kind: (e.kind || "Home").trim().slice(0, 64) || "Home",
      addressLine1: trimOrNullAddr(e.addressLine1),
      addressLine2: trimOrNullAddr(e.addressLine2),
      houseNumber: trimOrNullAddr(e.houseNumber),
      postalCode: trimOrNullAddr(e.postalCode),
      city: trimOrNullAddr(e.city),
      state: trimOrNullAddr(e.state),
      country: trimOrNullAddr(e.country),
      isPrimary: Boolean(e.isPrimary)
    }))
    .filter(addressEntryHasContent);

  if (trimmed.length === 0) {
    return { list: [], mirror: emptyAddressMirror() };
  }
  let pi = trimmed.findIndex((a) => a.isPrimary);
  if (pi < 0) pi = 0;
  const list = trimmed.map((a, i) => ({ ...a, isPrimary: i === pi }));
  const p = list[pi]!;
  return {
    list,
    mirror: {
      addressLine1: p.addressLine1,
      addressLine2: p.addressLine2,
      postalCode: p.postalCode,
      city: p.city,
      state: p.state,
      country: p.country
    }
  };
}

type FlatAddressFields = {
  addresses?: CrmAddressEntry[];
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

function legacyFlatInputToAddresses(input: FlatAddressFields): CrmAddressEntry[] {
  const parts = [
    input.addressLine1,
    input.addressLine2,
    input.postalCode,
    input.city,
    input.state,
    input.country
  ].map((v) => (v ?? "").trim());
  if (!parts.some((p) => p.length > 0)) return [];
  return [
    {
      kind: "Home",
      addressLine1: trimOrNullAddr(input.addressLine1),
      addressLine2: trimOrNullAddr(input.addressLine2),
      houseNumber: null,
      postalCode: trimOrNullAddr(input.postalCode),
      city: trimOrNullAddr(input.city),
      state: trimOrNullAddr(input.state),
      country: trimOrNullAddr(input.country),
      isPrimary: true
    }
  ];
}

export function resolveAddressesInsert(input: FlatAddressFields): { addressesJson: string } & AddressMirror {
  if (input.addresses !== undefined) {
    const n = normalizeAddressEntriesRaw(input.addresses);
    return { addressesJson: stringifyAddresses(n.list), ...n.mirror };
  }
  const n = normalizeAddressEntriesRaw(legacyFlatInputToAddresses(input));
  return { addressesJson: stringifyAddresses(n.list), ...n.mirror };
}

type ExistingAddrEntity = {
  addresses: CrmAddressEntry[];
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

function mirrorRowToAddresses(e: ExistingAddrEntity): CrmAddressEntry[] {
  return legacyFlatInputToAddresses(e);
}

function emptyMirrorEntity(): ExistingAddrEntity {
  return {
    addresses: [],
    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    city: null,
    state: null,
    country: null
  };
}

function applyLegacyAddressPatch(base: CrmAddressEntry[], patch: FlatAddressFields): CrmAddressEntry[] {
  let pi = base.findIndex((a) => a.isPrimary);
  if (pi < 0) pi = 0;
  if (base.length === 0) {
    const synth: CrmAddressEntry = {
      kind: "Home",
      addressLine1:
        patch.addressLine1 !== undefined ? trimOrNullAddr(patch.addressLine1) : null,
      addressLine2:
        patch.addressLine2 !== undefined ? trimOrNullAddr(patch.addressLine2) : null,
      houseNumber: null,
      postalCode:
        patch.postalCode !== undefined ? trimOrNullAddr(patch.postalCode) : null,
      city: patch.city !== undefined ? trimOrNullAddr(patch.city) : null,
      state: patch.state !== undefined ? trimOrNullAddr(patch.state) : null,
      country: patch.country !== undefined ? trimOrNullAddr(patch.country) : null,
      isPrimary: true
    };
    return addressEntryHasContent(synth) ? [synth] : [];
  }
  const cur = { ...base[pi]! };
  if (patch.addressLine1 !== undefined) cur.addressLine1 = trimOrNullAddr(patch.addressLine1);
  if (patch.addressLine2 !== undefined) cur.addressLine2 = trimOrNullAddr(patch.addressLine2);
  if (patch.postalCode !== undefined) cur.postalCode = trimOrNullAddr(patch.postalCode);
  if (patch.city !== undefined) cur.city = trimOrNullAddr(patch.city);
  if (patch.state !== undefined) cur.state = trimOrNullAddr(patch.state);
  if (patch.country !== undefined) cur.country = trimOrNullAddr(patch.country);
  const next = [...base];
  next[pi] = cur;
  return next;
}

export function mergeAddressesForPatch(
  existing: ExistingAddrEntity | undefined,
  patch: Partial<FlatAddressFields>
): ({ addressesJson: string } & AddressMirror) | null {
  const touch =
    patch.addresses !== undefined ||
    patch.addressLine1 !== undefined ||
    patch.addressLine2 !== undefined ||
    patch.postalCode !== undefined ||
    patch.city !== undefined ||
    patch.state !== undefined ||
    patch.country !== undefined;
  if (!touch) return null;

  if (patch.addresses !== undefined) {
    const n = normalizeAddressEntriesRaw(patch.addresses);
    return { addressesJson: stringifyAddresses(n.list), ...n.mirror };
  }

  const base =
    existing && existing.addresses.length > 0
      ? existing.addresses.map((a) => ({ ...a }))
      : mirrorRowToAddresses(existing ?? emptyMirrorEntity());

  const merged = applyLegacyAddressPatch(base, patch);
  const n = normalizeAddressEntriesRaw(merged);
  return { addressesJson: stringifyAddresses(n.list), ...n.mirror };
}

const normalizeEmailChannels = (
  entries: CrmChannelEntry[] | undefined
): { list: CrmChannelEntry[]; primary: string | null } => {
  const trimmed = (entries ?? [])
    .map((e) => ({
      kind: (e.kind || "Home").trim().slice(0, 64) || "Home",
      value: (e.value || "").trim().slice(0, 320),
      isPrimary: Boolean(e.isPrimary)
    }))
    .filter((e) => e.value.length > 0);
  if (trimmed.length === 0) return { list: [], primary: null };
  let pi = trimmed.findIndex((e) => e.isPrimary);
  if (pi < 0) pi = 0;
  const list = trimmed.map((e, i) => ({ ...e, isPrimary: i === pi }));
  return { list, primary: list[pi]!.value };
};

const normalizePhoneChannels = (
  entries: CrmChannelEntry[] | undefined
): { list: CrmChannelEntry[]; primary: string | null } => {
  const trimmed = (entries ?? [])
    .map((e) => ({
      kind: (e.kind || "Mobile").trim().slice(0, 64) || "Mobile",
      value: (e.value || "").trim().slice(0, 64),
      isPrimary: Boolean(e.isPrimary)
    }))
    .filter((e) => e.value.length > 0);
  if (trimmed.length === 0) return { list: [], primary: null };
  let pi = trimmed.findIndex((e) => e.isPrimary);
  if (pi < 0) pi = 0;
  const list = trimmed.map((e, i) => ({ ...e, isPrimary: i === pi }));
  return { list, primary: list[pi]!.value };
};

export function resolveOrgChannelsInsert(input: {
  email?: string | null;
  phone?: string | null;
  emails?: CrmChannelEntry[];
  phones?: CrmChannelEntry[];
}): { emailsJson: string; phonesJson: string; email: string | null; phone: string | null } {
  let emailsIn = input.emails;
  let phonesIn = input.phones;
  if ((!emailsIn || emailsIn.length === 0) && input.email?.trim()) {
    emailsIn = [{ kind: "Work", value: input.email.trim(), isPrimary: true }];
  }
  if ((!phonesIn || phonesIn.length === 0) && input.phone?.trim()) {
    phonesIn = [{ kind: "Mobile", value: input.phone.trim(), isPrimary: true }];
  }
  const em = normalizeEmailChannels(emailsIn);
  const ph = normalizePhoneChannels(phonesIn);
  return {
    emailsJson: stringifyChannels(em.list),
    phonesJson: stringifyChannels(ph.list),
    email: em.primary,
    phone: ph.primary
  };
}

export function mergeOrgChannelsForPatch(
  existing: { emails: CrmChannelEntry[]; phones: CrmChannelEntry[] } | undefined,
  patch: Partial<{ email: string | null; phone: string | null; emails?: CrmChannelEntry[]; phones?: CrmChannelEntry[] }>
): { emailsJson: string; phonesJson: string; email: string | null; phone: string | null } | null {
  const touchEmail = patch.emails !== undefined || patch.email !== undefined;
  const touchPhone = patch.phones !== undefined || patch.phone !== undefined;
  if (!touchEmail && !touchPhone) return null;

  let emailsIn: CrmChannelEntry[] | undefined;
  if (patch.emails !== undefined) emailsIn = patch.emails;
  else if (patch.email !== undefined) {
    const v = patch.email?.trim() ?? "";
    emailsIn = v ? [{ kind: "Work", value: v, isPrimary: true }] : [];
  } else emailsIn = existing?.emails;

  let phonesIn: CrmChannelEntry[] | undefined;
  if (patch.phones !== undefined) phonesIn = patch.phones;
  else if (patch.phone !== undefined) {
    const v = patch.phone?.trim() ?? "";
    phonesIn = v ? [{ kind: "Mobile", value: v, isPrimary: true }] : [];
  } else phonesIn = existing?.phones;

  const em = normalizeEmailChannels(emailsIn);
  const ph = normalizePhoneChannels(phonesIn);
  return {
    emailsJson: stringifyChannels(em.list),
    phonesJson: stringifyChannels(ph.list),
    email: em.primary,
    phone: ph.primary
  };
}
