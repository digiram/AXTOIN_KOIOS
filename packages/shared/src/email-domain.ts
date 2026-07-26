/**
 * Email domain rules for realm signup: corporate domains share a tenant keyed by domain;
 * consumer / public-mailbox domains are handled separately on the API (see register route).
 */

/** Lowercase domains treated as personal mailboxes — one isolated tenant per address, no tenant_admin. */
export const CONSUMER_EMAIL_PROVIDER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "rocketmail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "gmx.de",
  "mail.com",
  "zoho.com",
  "hey.com",
  "fastmail.com",
  "tutanota.com",
  "skiff.com",
  "yandex.com",
  "yandex.ru",
  "qq.com",
  "163.com",
  "126.com"
]);

export const normalizeRegistrationEmail = (email: string): string => email.trim().toLowerCase();

/** Returns the DNS domain part of an email, lowercased, or null if invalid. */
export const extractEmailDomain = (email: string): string | null => {
  const n = normalizeRegistrationEmail(email);
  const at = n.lastIndexOf("@");
  if (at <= 0 || at === n.length - 1) return null;
  return n.slice(at + 1);
};

export const isConsumerEmailProviderDomain = (domain: string): boolean =>
  CONSUMER_EMAIL_PROVIDER_DOMAINS.has(domain.trim().toLowerCase());
