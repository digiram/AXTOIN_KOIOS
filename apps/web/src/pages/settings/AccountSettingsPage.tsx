/**
 * Account Settings page.
 *
 * Tenant account settings screen mounted under AppShell at /admin/settings.
 *
 * Responsibilities:
 * - Load and render primary account settings data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/settings
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import { Check, Loader2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AccountAddressGeocodeSection } from "../../components/settings/AccountAddressGeocodeSection.js";
import { SecuritySettingsPanel } from "./SecuritySettingsPanel.js";
import { UserSubscriptionSettingsPanel } from "./UserSubscriptionSettingsPanel.js";

import { useAuth } from "../../auth/AuthContext.js";
import { AUTOSAVE_UI_RESET_MS, type AutosaveUiStatus } from "../../components/autosave-status-ui.js";
import { AutosaveFieldWrap } from "../../components/AutosaveFieldWrap.js";
import { AutosaveTextField } from "../../components/AutosaveTextField.js";
import { SearchableCountrySelect } from "../../components/SearchableCountrySelect.js";
import { SearchableCurrencySelect } from "../../components/SearchableCurrencySelect.js";
import { SearchableTimezoneSelect } from "../../components/SearchableTimezoneSelect.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import {
  authFieldClass,
  authFieldDescriptionClass,
  authFieldReadOnlyClass,
  authLabelClass,
  authReadOnlyBadgeClass
} from "../../components/auth/fieldStyles.js";
import { AddressFields, type AddressValue } from "../../components/crm/AddressFields.js";
import {
  getPresetForCountry,
  type CurrencyFormatId,
  type MeasurementSystemId
} from "../../lib/country-presets.js";
import { DATE_TIME_FORMAT_IDS, DATE_TIME_FORMAT_LABELS, type DateTimeFormatId } from "@starter/shared";
import { API_BASE_URL } from "../../lib/api.js";

type TabId = "personalization" | "localization" | "security" | "devices" | "subscription";

type DeviceListItem = {
  id: string;
  platform: string;
  label: string | null;
  installKeyPreview: string;
  createdAt: string;
  lastSeenAt: string;
};

type SettingsDto = {
  email: string;
  displayName: string | null;
  countryCode: string | null;
  measurementSystem: string | null;
  timezone: string | null;
  currencyCode: string | null;
  currencyFormat: string | null;
  dateTimeFormat: string | null;
  /** `12h` | `24h` when user overrides tenant Finance default; null/undefined = inherit. */
  timeFormat?: string | null;
  homeAddressLine1: string | null;
  homeAddressLine2: string | null;
  homePostalCode: string | null;
  homeCity: string | null;
  homeState: string | null;
  homeCountry: string | null;
};

const emptyHomeAddress = (): AddressValue => ({
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  state: "",
  country: ""
});

const homeAddressFromDto = (data: SettingsDto): AddressValue => ({
  addressLine1: data.homeAddressLine1 ?? "",
  addressLine2: data.homeAddressLine2 ?? "",
  postalCode: data.homePostalCode ?? "",
  city: data.homeCity ?? "",
  state: data.homeState ?? "",
  country: data.homeCountry ?? ""
});

const normalizeHomeAddress = (h: AddressValue): AddressValue => ({
  addressLine1: (h.addressLine1 ?? "").trim(),
  addressLine2: (h.addressLine2 ?? "").trim(),
  postalCode: (h.postalCode ?? "").trim(),
  city: (h.city ?? "").trim(),
  state: (h.state ?? "").trim(),
  country: (h.country ?? "").trim()
});

type ClockTimeFormatPref = "" | "12h" | "24h";

const currencyFormatLabels: Record<CurrencyFormatId, string> = {
  comma_dot: "1,234.56 (comma thousands, dot decimals)",
  dot_comma: "1.234,56 (dot thousands, comma decimals)",
  space_comma: "1 234,56 (space thousands, comma decimals)"
};

const dateFormatLabels = DATE_TIME_FORMAT_LABELS;

type LocalizationFieldKey =
  | "country"
  | "measurement"
  | "timezone"
  | "currency"
  | "currencyFormat"
  | "dateFormat"
  | "timeFormat";

type PasswordSubmitUi = "idle" | "saving" | "saved";

type PasswordFieldKey = "currentPassword" | "newPassword" | "confirmPassword";

const PASSWORD_MISMATCH_MESSAGE = "New password and confirmation do not match.";

/** Surfaced inline next to the label instead of the native min-length tooltip. */
const PASSWORD_MIN_LENGTH_MESSAGE = "Password needs to be at least 8 characters.";

const MIN_NEW_PASSWORD_LENGTH = 8;

const HOME_ADDRESS_AUTOSAVE_DEBOUNCE_MS = 600;

/** Gray rail next to section titles only (optional intro paragraph sits inside the same rail). */
const settingsHeadingAccentClass = "border-l-4 border-slate-200 pl-4";

function passwordInputClassNames(hasError: boolean): string {
  return [
    authFieldClass,
    hasError && "border-l-4 border-l-rose-600 ring-rose-400 focus:border-l-rose-600 focus:ring-rose-600"
  ]
    .filter(Boolean)
    .join(" ");
}

/** Route page component for tenant account settings under AppShell. */
export const AccountSettingsPage = () => {
  const { getAccessToken, refreshSession, logout, user } = useAuth();
  const { formatDateTime } = useUserDisplayDatetime();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>("personalization");
  const [loadError, setLoadError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (
      raw === "personalization" ||
      raw === "localization" ||
      raw === "security" ||
      raw === "devices" ||
      raw === "subscription"
    ) {
      setTab(raw);
    }
  }, [searchParams]);

  const [accountEmail, setAccountEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSubmitUi, setPasswordSubmitUi] = useState<PasswordSubmitUi>("idle");
  const [pwdFieldErrors, setPwdFieldErrors] = useState<Partial<Record<PasswordFieldKey, string>>>({});

  const [countryCode, setCountryCode] = useState("");
  const [measurementSystem, setMeasurementSystem] = useState<MeasurementSystemId | "">("");
  const [timezone, setTimezone] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [currencyFormat, setCurrencyFormat] = useState<CurrencyFormatId | "">("");
  const [dateTimeFormat, setDateTimeFormat] = useState<DateTimeFormatId | "">("");
  const [clockTimeFormat, setClockTimeFormat] = useState<ClockTimeFormatPref>("");
  const [localizationUi, setLocalizationUi] = useState<
    Partial<Record<LocalizationFieldKey, AutosaveUiStatus>>
  >({});

  const [homeAddress, setHomeAddress] = useState<AddressValue>(() => emptyHomeAddress());
  const [homeAddressSavedJson, setHomeAddressSavedJson] = useState("");
  const [homeAddressReady, setHomeAddressReady] = useState(false);
  const [homeAddressUi, setHomeAddressUi] = useState<AutosaveUiStatus>("idle");

  const homeAddressRef = useRef(homeAddress);
  homeAddressRef.current = homeAddress;
  const homeAddressSavedJsonRef = useRef(homeAddressSavedJson);
  homeAddressSavedJsonRef.current = homeAddressSavedJson;
  const homeAddressDebounceRef = useRef<number | null>(null);

  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [devicesLoadState, setDevicesLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [devicesMsg, setDevicesMsg] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);

  /** After probe: show Subscription tab only when there is something to do or show (active sub, catalog tiers, or billing off notice). */
  const [subscriptionTabProbe, setSubscriptionTabProbe] = useState<"loading" | "ready">("loading");
  const [subscriptionTabVisible, setSubscriptionTabVisible] = useState(false);

  /** Value shown in the display-name field: saved name, or email when none is set on the server. */
  const savedDisplayValue = useMemo(() => {
    const fallback = accountEmail || user?.email || "";
    return displayName.trim() ? displayName : fallback;
  }, [displayName, accountEmail, user?.email]);

  const showRealmSubscriptionTab = Boolean(user?.tenantId && user.role !== "super_admin");
  const showSubscriptionTab =
    showRealmSubscriptionTab && subscriptionTabProbe === "ready" && subscriptionTabVisible;

  useEffect(() => {
    if (tab !== "subscription") return;
    if (subscriptionTabProbe !== "ready") return;
    if (!showRealmSubscriptionTab || !subscriptionTabVisible) {
      setTab("personalization");
    }
  }, [tab, subscriptionTabProbe, showRealmSubscriptionTab, subscriptionTabVisible]);

  const applySettingsFromDto = useCallback((data: SettingsDto) => {
    setAccountEmail(data.email);
    setDisplayName(data.displayName ?? "");
    setCountryCode(data.countryCode ?? "");
    setMeasurementSystem((data.measurementSystem as MeasurementSystemId) || "");
    setTimezone(data.timezone ?? "");
    setCurrencyCode(data.currencyCode ?? "");
    setCurrencyFormat((data.currencyFormat as CurrencyFormatId) || "");
    setDateTimeFormat((data.dateTimeFormat as DateTimeFormatId) || "");
    setClockTimeFormat(
      data.timeFormat === "24h" ? "24h" : data.timeFormat === "12h" ? "12h" : ""
    );
    const nextHome = homeAddressFromDto(data);
    setHomeAddress(nextHome);
    setHomeAddressSavedJson(JSON.stringify(normalizeHomeAddress(nextHome)));
    setHomeAddressReady(true);
    setHomeAddressUi("idle");
  }, []);

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = { "content-type": "application/json" };
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  useEffect(() => {
    if (!showRealmSubscriptionTab) {
      setSubscriptionTabProbe("ready");
      setSubscriptionTabVisible(false);
      return;
    }
    let cancelled = false;
    setSubscriptionTabProbe("loading");
    (async () => {
      const doFetch = async (url: string) => {
        let res = await fetch(url, { headers: authHeaders() });
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return null;
          }
          res = await fetch(url, { headers: authHeaders() });
        }
        return res;
      };
      try {
        const [cRes, sRes] = await Promise.all([
          doFetch(`${API_BASE_URL}/account/subscription/catalog`),
          doFetch(`${API_BASE_URL}/account/subscription`)
        ]);
        if (cancelled) return;
        if (!cRes?.ok || !sRes?.ok) {
          setSubscriptionTabVisible(false);
          setSubscriptionTabProbe("ready");
          return;
        }
        const cj = (await cRes.json()) as { plans?: unknown[] };
        const sj = (await sRes.json()) as { subscription?: unknown | null; subscriptionsEnabled?: boolean };
        const plans = Array.isArray(cj.plans) ? cj.plans : [];
        const hasSub = sj.subscription != null;
        const billingEnabled = sj.subscriptionsEnabled === true;
        setSubscriptionTabVisible(hasSub || plans.length > 0 || !billingEnabled);
        setSubscriptionTabProbe("ready");
      } catch {
        if (!cancelled) {
          setSubscriptionTabVisible(false);
          setSubscriptionTabProbe("ready");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showRealmSubscriptionTab, authHeaders, refreshSession, logout]);

  const accountGeocodeApi = useMemo(
    () => ({ authHeaders, refreshSession, logout }),
    [authHeaders, refreshSession, logout]
  );

  const load = useCallback(async () => {
    setLoadError("");
    let res = await fetch(`${API_BASE_URL}/account/settings`, { headers: authHeaders() });
    if (res.status === 401) {
      const ok = await refreshSession();
      if (!ok) {
        setLoadError("Session expired. Sign in again.");
        return;
      }
      res = await fetch(`${API_BASE_URL}/account/settings`, { headers: authHeaders() });
    }
    if (!res.ok) {
      setLoadError("Could not load settings.");
      return;
    }
    const data = (await res.json()) as SettingsDto;
    applySettingsFromDto(data);
    setPasswordSubmitUi("idle");
    setPwdFieldErrors({});
  }, [authHeaders, refreshSession, applySettingsFromDto]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDevices = useCallback(async () => {
    setDevicesLoadState("loading");
    let res = await fetch(`${API_BASE_URL}/account/devices`, { headers: authHeaders() });
    if (res.status === 401) {
      const ok = await refreshSession();
      if (!ok) {
        setDevicesLoadState("error");
        return;
      }
      res = await fetch(`${API_BASE_URL}/account/devices`, { headers: authHeaders() });
    }
    if (!res.ok) {
      setDevicesLoadState("error");
      return;
    }
    const data = (await res.json()) as { devices: DeviceListItem[] };
    setDevices(data.devices ?? []);
    setDevicesLoadState("idle");
  }, [authHeaders, refreshSession]);

  useEffect(() => {
    if (tab !== "devices") return;
    void loadDevices();
  }, [tab, loadDevices]);

  const revokeDevice = async (deviceId: string) => {
    setRevokingId(deviceId);
    setDevicesMsg("");
    try {
      let res = await fetch(`${API_BASE_URL}/account/devices/${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          setRevokingId(null);
          return;
        }
        res = await fetch(`${API_BASE_URL}/account/devices/${encodeURIComponent(deviceId)}`, {
          method: "DELETE",
          headers: authHeaders()
        });
      }
      if (!res.ok) {
        setDevicesMsg("Could not revoke device.");
        setRevokingId(null);
        return;
      }
      setDevicesMsg("Device removed. That install must sign in again.");
      await loadDevices();
    } finally {
      setRevokingId(null);
    }
  };

  const flashSaved = useCallback(() => {
    setSavedMsg("Saved.");
    setTimeout(() => setSavedMsg(""), 2500);
  }, []);

  /** PATCH `/account/settings` and merge response into local state. */
  const patchSettings = useCallback(
    async (
      patch: Record<string, unknown>,
      options?: { flashGlobal?: boolean }
    ): Promise<boolean> => {
      let res = await fetch(`${API_BASE_URL}/account/settings`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(patch)
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return false;
        }
        res = await fetch(`${API_BASE_URL}/account/settings`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(patch)
        });
      }
      if (!res.ok) {
        return false;
      }
      const data = (await res.json()) as SettingsDto;
      applySettingsFromDto(data);
      if (options?.flashGlobal !== false) flashSaved();
      return true;
    },
    [authHeaders, refreshSession, logout, applySettingsFromDto, flashSaved]
  );

  const patchLocalizationField = useCallback(
    async (fieldKey: LocalizationFieldKey, patch: Record<string, unknown>) => {
      setLocalizationUi((prev) => ({ ...prev, [fieldKey]: "saving" }));
      const ok = await patchSettings(patch, { flashGlobal: false });
      if (ok) {
        setLocalizationUi((prev) => ({ ...prev, [fieldKey]: "saved" }));
        window.setTimeout(() => {
          setLocalizationUi((prev) => ({ ...prev, [fieldKey]: "idle" }));
        }, AUTOSAVE_UI_RESET_MS);
      } else {
        setLocalizationUi((prev) => ({ ...prev, [fieldKey]: "error" }));
        window.setTimeout(() => {
          setLocalizationUi((prev) => ({ ...prev, [fieldKey]: "idle" }));
        }, AUTOSAVE_UI_RESET_MS);
        setSavedMsg("Could not save localization.");
        void load();
      }
      return ok;
    },
    [patchSettings, load]
  );

  /** After a successful save, revert the green “Saved” state when the user edits any password field. */
  const onPasswordFieldChange = useCallback(
    (setter: (v: string) => void, value: string) => {
      setter(value);
      setPwdFieldErrors({});
      setPasswordSubmitUi((u) => (u === "saved" ? "idle" : u));
    },
    []
  );

  const clearHomeAddressDebounce = useCallback(() => {
    if (homeAddressDebounceRef.current !== null) {
      clearTimeout(homeAddressDebounceRef.current);
      homeAddressDebounceRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHomeAddressDebounce(), [clearHomeAddressDebounce]);

  const flushHomeAddress = useCallback(
    async (override?: AddressValue) => {
      if (!homeAddressReady) return;
      const n = normalizeHomeAddress(override ?? homeAddressRef.current);
      const json = JSON.stringify(n);
      if (json === homeAddressSavedJsonRef.current) return;

      setHomeAddressUi("saving");
      const ok = await patchSettings(
        {
          homeAddressLine1: n.addressLine1 ?? "",
          homeAddressLine2: n.addressLine2 ?? "",
          homePostalCode: n.postalCode ?? "",
          homeCity: n.city ?? "",
          homeState: n.state ?? "",
          homeCountry: n.country ?? ""
        },
        { flashGlobal: false }
      );
      if (ok) {
        setHomeAddressUi("saved");
        window.setTimeout(() => {
          setHomeAddressUi("idle");
        }, AUTOSAVE_UI_RESET_MS);
      } else {
        setHomeAddressUi("error");
        setSavedMsg("Could not save home address.");
        void load();
        window.setTimeout(() => {
          setHomeAddressUi("idle");
        }, AUTOSAVE_UI_RESET_MS);
      }
    },
    [homeAddressReady, patchSettings, load]
  );

  const scheduleHomeAddressAutosave = useCallback(() => {
    clearHomeAddressDebounce();
    homeAddressDebounceRef.current = window.setTimeout(() => {
      homeAddressDebounceRef.current = null;
      void flushHomeAddress();
    }, HOME_ADDRESS_AUTOSAVE_DEBOUNCE_MS);
  }, [clearHomeAddressDebounce, flushHomeAddress]);

  const onHomeAddressFieldChange = useCallback(
    (next: AddressValue) => {
      setHomeAddress(next);
      setHomeAddressUi((u) => (u === "saved" ? "idle" : u));
      if (homeAddressReady) scheduleHomeAddressAutosave();
    },
    [homeAddressReady, scheduleHomeAddressAutosave]
  );

  const onHomeAddressGeocodePick = useCallback(
    (next: AddressValue) => {
      clearHomeAddressDebounce();
      setHomeAddress(next);
      void flushHomeAddress(next);
    },
    [clearHomeAddressDebounce, flushHomeAddress]
  );

  const saveDisplayName = useCallback(
    async (trimmed: string): Promise<boolean> => {
      const body = { displayName: trimmed };
      let res = await fetch(`${API_BASE_URL}/account/settings`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return false;
        }
        res = await fetch(`${API_BASE_URL}/account/settings`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(body)
        });
      }
      if (!res.ok) {
        return false;
      }
      const data = (await res.json()) as SettingsDto;
      applySettingsFromDto(data);
      return true;
    },
    [authHeaders, refreshSession, logout, applySettingsFromDto]
  );

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwdFieldErrors({});
    if (newPassword.length > 0 && newPassword.length < MIN_NEW_PASSWORD_LENGTH) {
      setPwdFieldErrors({ newPassword: PASSWORD_MIN_LENGTH_MESSAGE });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdFieldErrors({
        newPassword: PASSWORD_MISMATCH_MESSAGE,
        confirmPassword: PASSWORD_MISMATCH_MESSAGE
      });
      return;
    }
    setPasswordSubmitUi("saving");
    try {
      let res = await fetch(`${API_BASE_URL}/account/change-password`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          setPasswordSubmitUi("idle");
          setPwdFieldErrors({});
          return;
        }
        res = await fetch(`${API_BASE_URL}/account/change-password`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ currentPassword, newPassword })
        });
      }
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setPwdFieldErrors({
          currentPassword: body?.message ?? "Password change failed."
        });
        setPasswordSubmitUi("idle");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwdFieldErrors({});
      setPasswordSubmitUi("saved");
    } catch {
      setPwdFieldErrors({ currentPassword: "Password change failed." });
      setPasswordSubmitUi("idle");
    }
  };

  const onCountryChange = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) {
        setCountryCode("");
        return;
      }
      const upper = trimmed.toUpperCase();
      const preset = getPresetForCountry(upper);
      if (preset) {
        const unchanged =
          countryCode.trim().toUpperCase() === upper &&
          measurementSystem === preset.measurementSystem &&
          timezone.trim() === preset.timezone.trim() &&
          currencyCode.trim().toUpperCase() === preset.currencyCode.toUpperCase() &&
          currencyFormat === preset.currencyFormat &&
          dateTimeFormat === preset.dateTimeFormat;
        if (unchanged) return;

        setCountryCode(upper);
        setMeasurementSystem(preset.measurementSystem);
        setTimezone(preset.timezone);
        setCurrencyCode(preset.currencyCode);
        setCurrencyFormat(preset.currencyFormat);
        setDateTimeFormat(preset.dateTimeFormat);
        void patchLocalizationField("country", {
          countryCode: upper,
          measurementSystem: preset.measurementSystem,
          timezone: preset.timezone,
          currencyCode: preset.currencyCode,
          currencyFormat: preset.currencyFormat,
          dateTimeFormat: preset.dateTimeFormat
        });
        return;
      }
      if (/^[A-Z]{2}$/.test(upper)) {
        if (countryCode.trim().toUpperCase() === upper) return;

        setCountryCode(upper);
        void patchLocalizationField("country", { countryCode: upper });
      }
    },
    [patchLocalizationField, countryCode, measurementSystem, timezone, currencyCode, currencyFormat, dateTimeFormat]
  );

  const onMeasurementChange = useCallback(
    async (next: MeasurementSystemId | "") => {
      if (next === measurementSystem) return;
      setMeasurementSystem(next);
      if (!next) return;
      void patchLocalizationField("measurement", { measurementSystem: next });
    },
    [patchLocalizationField, measurementSystem]
  );

  const onTimezoneAutosave = useCallback(
    async (tz: string) => {
      if (tz.trim() === timezone.trim()) return;
      setTimezone(tz);
      const t = tz.trim();
      if (!t) return;
      void patchLocalizationField("timezone", { timezone: t });
    },
    [patchLocalizationField, timezone]
  );

  const onCurrencyAutosave = useCallback(
    async (ccy: string) => {
      const c = ccy.trim().toUpperCase();
      if (c.length !== 3) return;
      if (c === currencyCode.trim().toUpperCase()) return;

      setCurrencyCode(ccy);
      void patchLocalizationField("currency", { currencyCode: c });
    },
    [patchLocalizationField, currencyCode]
  );

  const onCurrencyFormatChange = useCallback(
    async (next: CurrencyFormatId | "") => {
      if (next === currencyFormat) return;
      setCurrencyFormat(next);
      if (!next) return;
      void patchLocalizationField("currencyFormat", { currencyFormat: next });
    },
    [patchLocalizationField, currencyFormat]
  );

  const onDateTimeFormatChange = useCallback(
    async (next: DateTimeFormatId | "") => {
      if (next === dateTimeFormat) return;
      setDateTimeFormat(next);
      if (!next) return;
      void patchLocalizationField("dateFormat", { dateTimeFormat: next });
    },
    [patchLocalizationField, dateTimeFormat]
  );

  const onClockTimeFormatChange = useCallback(
    async (next: ClockTimeFormatPref) => {
      if (next === clockTimeFormat) return;
      setClockTimeFormat(next);
      void patchLocalizationField("timeFormat", { timeFormat: next === "" ? null : next });
    },
    [patchLocalizationField, clockTimeFormat]
  );

  return (
    <div className="w-full">
      {loadError ? (
        <p className="text-sm text-rose-600" role="alert">
          {loadError}
        </p>
      ) : null}

      <div
        className="mt-6 flex w-full min-w-0 flex-nowrap gap-1 overflow-x-auto overflow-y-hidden rounded-full bg-slate-100 p-1 ring-1 ring-slate-900/5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Settings sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "personalization"}
          id="settings-tab-personalization"
          onClick={() => setTab("personalization")}
          className={[
            "min-h-[2.5rem] min-w-0 shrink-0 flex-1 rounded-full px-3 py-2 text-sm transition-all duration-200 sm:px-4",
            tab === "personalization"
              ? "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
              : "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900"
          ].join(" ")}
        >
          Personalization
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "localization"}
          id="settings-tab-localization"
          onClick={() => setTab("localization")}
          className={[
            "min-h-[2.5rem] min-w-0 shrink-0 flex-1 rounded-full px-3 py-2 text-sm transition-all duration-200 sm:px-4",
            tab === "localization"
              ? "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
              : "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900"
          ].join(" ")}
        >
          Localization
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "security"}
          id="settings-tab-security"
          onClick={() => setTab("security")}
          className={[
            "min-h-[2.5rem] min-w-0 shrink-0 flex-1 rounded-full px-3 py-2 text-sm transition-all duration-200 sm:px-4",
            tab === "security"
              ? "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
              : "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900"
          ].join(" ")}
        >
          Security
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "devices"}
          id="settings-tab-devices"
          onClick={() => setTab("devices")}
          className={[
            "min-h-[2.5rem] min-w-0 shrink-0 flex-1 rounded-full px-3 py-2 text-sm transition-all duration-200 sm:px-4",
            tab === "devices"
              ? "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
              : "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900"
          ].join(" ")}
        >
          Devices
        </button>
        {showSubscriptionTab ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "subscription"}
            id="settings-tab-subscription"
            onClick={() => setTab("subscription")}
            className={[
              "min-h-[2.5rem] min-w-0 shrink-0 flex-1 rounded-full px-3 py-2 text-sm transition-all duration-200 sm:px-4",
              tab === "subscription"
                ? "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                : "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900"
            ].join(" ")}
          >
            Subscription
          </button>
        ) : null}
      </div>

      <div
        className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        role="tabpanel"
        aria-labelledby={
          tab === "personalization"
            ? "settings-tab-personalization"
            : tab === "localization"
              ? "settings-tab-localization"
              : tab === "security"
                ? "settings-tab-security"
                : tab === "devices"
                  ? "settings-tab-devices"
                  : "settings-tab-subscription"
        }
      >
        {tab === "personalization" ? (
          <div className="space-y-8">
            <div className="space-y-4">
              <div className={settingsHeadingAccentClass}>
                <h3 className="text-sm font-semibold text-slate-800">Name</h3>
              </div>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
                <div className="min-w-0 flex-1">
                  <AutosaveTextField
                    id="displayName"
                    label="Display name"
                    savedValue={savedDisplayValue}
                    onSave={saveDisplayName}
                    maxLength={200}
                    autoComplete="name"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <label className="text-sm font-medium leading-6 text-slate-900" htmlFor="accountEmail">
                      Email
                    </label>
                    <span className={authReadOnlyBadgeClass}>Read-only</span>
                  </div>
                  <input
                    id="accountEmail"
                    type="email"
                    className={authFieldReadOnlyClass}
                    value={accountEmail || user?.email || ""}
                    readOnly
                    aria-readonly="true"
                    aria-describedby="account-email-hint"
                    autoComplete="email"
                  />
                  <p id="account-email-hint" className={authFieldDescriptionClass}>
                    Your sign-in address. It cannot be edited here; you can still select and copy it. The server stores
                    this address encrypted at rest.
                  </p>
                </div>
              </div>
            </div>

            <form noValidate onSubmit={onChangePassword} className="space-y-4 border-t border-slate-100 pt-8">
              <div className={settingsHeadingAccentClass}>
                <h3 className="text-sm font-semibold text-slate-800">Change password</h3>
              </div>
              <div>
                <PasswordFieldLabel
                  htmlFor="currentPassword"
                  label="Current password"
                  inlineError={pwdFieldErrors.currentPassword}
                />
                <input
                  id="currentPassword"
                  type="password"
                  className={passwordInputClassNames(Boolean(pwdFieldErrors.currentPassword))}
                  value={currentPassword}
                  onChange={(ev) => onPasswordFieldChange(setCurrentPassword, ev.target.value)}
                  autoComplete="current-password"
                  aria-invalid={Boolean(pwdFieldErrors.currentPassword)}
                />
              </div>
              <div>
                <PasswordFieldLabel
                  htmlFor="newPassword"
                  label="New password"
                  inlineError={pwdFieldErrors.newPassword}
                />
                <input
                  id="newPassword"
                  type="password"
                  className={passwordInputClassNames(Boolean(pwdFieldErrors.newPassword))}
                  value={newPassword}
                  onChange={(ev) => onPasswordFieldChange(setNewPassword, ev.target.value)}
                  autoComplete="new-password"
                  aria-invalid={Boolean(pwdFieldErrors.newPassword)}
                />
              </div>
              <div>
                <PasswordFieldLabel
                  htmlFor="confirmPassword"
                  label="Confirm new password"
                  inlineError={pwdFieldErrors.confirmPassword}
                />
                <input
                  id="confirmPassword"
                  type="password"
                  className={passwordInputClassNames(Boolean(pwdFieldErrors.confirmPassword))}
                  value={confirmPassword}
                  onChange={(ev) => onPasswordFieldChange(setConfirmPassword, ev.target.value)}
                  autoComplete="new-password"
                  aria-invalid={Boolean(pwdFieldErrors.confirmPassword)}
                />
              </div>
              <button
                type="submit"
                aria-busy={passwordSubmitUi === "saving"}
                disabled={
                  passwordSubmitUi === "saving" ||
                  passwordSubmitUi === "saved" ||
                  !currentPassword.trim() ||
                  !newPassword.trim()
                }
                className={[
                  "inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  passwordSubmitUi === "saved"
                    ? "bg-emerald-600 text-white hover:bg-emerald-600 focus-visible:outline-emerald-500"
                    : "bg-slate-800 text-white hover:bg-slate-700 focus-visible:outline-slate-400",
                  passwordSubmitUi === "idle" &&
                    (!currentPassword.trim() || !newPassword.trim()) &&
                    "opacity-50",
                  passwordSubmitUi === "saving" && "cursor-wait opacity-100"
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {passwordSubmitUi === "saving" ? (
                  <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden strokeWidth={2} />
                    Saving…
                  </>
                ) : passwordSubmitUi === "saved" ? (
                  <>
                    <Check className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.5} />
                    Saved
                  </>
                ) : (
                  "Update password"
                )}
              </button>
            </form>

            <div className="space-y-4 border-t border-slate-100 pt-8">
              <div className={settingsHeadingAccentClass}>
                <h3 className="text-sm font-semibold text-slate-800">Home address</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Optional postal address for your account. When address search is enabled, pick a result to apply it
                  immediately (replacing the fields below). Edits to any field save automatically shortly after you stop
                  typing.
                </p>
              </div>
              <AccountAddressGeocodeSection
                geocodeApi={accountGeocodeApi}
                inputClass={authFieldClass}
                onPick={onHomeAddressGeocodePick}
              />
              <AddressFields
                idPrefix="settings-home"
                value={homeAddress}
                onChange={onHomeAddressFieldChange}
                inputClass={authFieldClass}
                autosaveGroup={{ status: homeAddressUi, statusId: "settings-home-address-autosave" }}
              />
            </div>
          </div>
        ) : tab === "localization" ? (
          <div className="space-y-4">
            <div className={settingsHeadingAccentClass}>
              <h3 className="text-sm font-semibold text-slate-800">Localization</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Changes save automatically. Choosing a country fills time zone, currency, and regional formats and saves
                those together.
              </p>
            </div>
            <div>
              <label className={authLabelClass} htmlFor="countryCode">
                Country
              </label>
              <AutosaveFieldWrap
                statusId="localization-country-autosave"
                status={localizationUi.country ?? "idle"}
              >
                <SearchableCountrySelect inputId="countryCode" value={countryCode} onChange={onCountryChange} />
              </AutosaveFieldWrap>
            </div>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
              <div className="min-w-0 flex-1">
                <label className={authLabelClass} htmlFor="currencyCode">
                  Currency
                </label>
                <AutosaveFieldWrap statusId="localization-currency-autosave" status={localizationUi.currency ?? "idle"}>
                  <SearchableCurrencySelect inputId="currencyCode" value={currencyCode} onChange={onCurrencyAutosave} />
                </AutosaveFieldWrap>
              </div>
              <div className="min-w-0 flex-1">
                <label className={authLabelClass} htmlFor="currencyFormat">
                  Currency formatting
                </label>
                <AutosaveFieldWrap
                  statusId="localization-currency-format-autosave"
                  status={localizationUi.currencyFormat ?? "idle"}
                >
                  <select
                    id="currencyFormat"
                    className={authFieldClass}
                    value={currencyFormat}
                    onChange={(ev) => void onCurrencyFormatChange(ev.target.value as CurrencyFormatId | "")}
                  >
                    <option value="">—</option>
                    {(Object.keys(currencyFormatLabels) as CurrencyFormatId[]).map((k) => (
                      <option key={k} value={k}>
                        {currencyFormatLabels[k]}
                      </option>
                    ))}
                  </select>
                </AutosaveFieldWrap>
              </div>
            </div>
            <div>
              <label className={authLabelClass} htmlFor="timezone">
                Time zone
              </label>
              <AutosaveFieldWrap statusId="localization-timezone-autosave" status={localizationUi.timezone ?? "idle"}>
                <SearchableTimezoneSelect inputId="timezone" value={timezone} onChange={onTimezoneAutosave} />
              </AutosaveFieldWrap>
            </div>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
              <div className="min-w-0 flex-1">
                <label className={authLabelClass} htmlFor="dateTimeFormat">
                  Date format (regional)
                </label>
                <AutosaveFieldWrap
                  statusId="localization-date-format-autosave"
                  status={localizationUi.dateFormat ?? "idle"}
                >
                  <select
                    id="dateTimeFormat"
                    className={authFieldClass}
                    value={dateTimeFormat}
                    onChange={(ev) => void onDateTimeFormatChange(ev.target.value as DateTimeFormatId | "")}
                  >
                    <option value="">—</option>
                    {(DATE_TIME_FORMAT_IDS as readonly DateTimeFormatId[]).map((k) => (
                      <option key={k} value={k}>
                        {dateFormatLabels[k]}
                      </option>
                    ))}
                  </select>
                </AutosaveFieldWrap>
              </div>
              <div className="min-w-0 flex-1">
                <label className={authLabelClass} htmlFor="clockTimeFormat">
                  Time format
                </label>
                <AutosaveFieldWrap
                  statusId="localization-time-format-autosave"
                  status={localizationUi.timeFormat ?? "idle"}
                >
                  <select
                    id="clockTimeFormat"
                    className={authFieldClass}
                    value={clockTimeFormat}
                    onChange={(ev) => void onClockTimeFormatChange(ev.target.value as ClockTimeFormatPref)}
                  >
                    <option value="">Tenant default</option>
                    <option value="12h">12-hour (AM/PM)</option>
                    <option value="24h">24-hour</option>
                  </select>
                </AutosaveFieldWrap>
              </div>
            </div>
            <div className="w-full min-w-0">
              <label className={authLabelClass} htmlFor="measurementSystem">
                Measurement system
              </label>
              <AutosaveFieldWrap
                statusId="localization-measurement-autosave"
                status={localizationUi.measurement ?? "idle"}
              >
                <select
                  id="measurementSystem"
                  className={authFieldClass}
                  value={measurementSystem}
                  onChange={(ev) => void onMeasurementChange(ev.target.value as MeasurementSystemId | "")}
                >
                  <option value="">—</option>
                  <option value="si">Metric</option>
                  <option value="imperial">Imperial</option>
                </select>
              </AutosaveFieldWrap>
            </div>
          </div>
        ) : tab === "security" ? (
          <div className="space-y-4">
            <div className={settingsHeadingAccentClass}>
              <h3 className="text-sm font-semibold text-slate-800">Multi-factor authentication</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                After you sign in with your password, you can require a code from an authenticator app or from email.
                If your organization enforces MFA, complete setup before the grace period ends.
              </p>
            </div>
            <SecuritySettingsPanel />
          </div>
        ) : tab === "devices" ? (
          <div className="space-y-4">
            <div className={settingsHeadingAccentClass}>
              <h3 className="text-sm font-semibold text-slate-800">Registered devices</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                React Native installs appear here after they register following sign-in. Full mobile integration is planned;
                until then you can revoke access for any listed install—the app must sign in again on that device.
              </p>
            </div>
            {devicesLoadState === "loading" ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : devicesLoadState === "error" ? (
              <p className="text-sm text-rose-600" role="alert">
                Could not load devices.
              </p>
            ) : devices.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                No mobile devices registered yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {devices.map((d) => (
                  <li key={d.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-slate-900">
                        {d.label?.trim() ? d.label : "Mobile device"}{" "}
                        <span className="font-normal text-slate-500">({d.platform})</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Install key {d.installKeyPreview} · Last active{" "}
                        {formatDateTime(d.lastSeenAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={revokingId === d.id}
                      onClick={() => void revokeDevice(d.id)}
                      className="shrink-0 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {revokingId === d.id ? "Removing…" : "Revoke"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {devicesMsg ? (
              <p className="text-sm text-slate-600" role="status">
                {devicesMsg}
              </p>
            ) : null}
          </div>
        ) : tab === "subscription" && showRealmSubscriptionTab ? (
          subscriptionTabProbe === "loading" ? (
            <p className="text-sm text-slate-500">Loading subscription…</p>
          ) : showSubscriptionTab ? (
            <UserSubscriptionSettingsPanel authHeaders={authHeaders} refreshSession={refreshSession} logout={logout} />
          ) : null
        ) : null}
      </div>

      {savedMsg ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          {savedMsg}
        </p>
      ) : null}
    </div>
  );
};

function PasswordFieldLabel({
  htmlFor,
  label,
  inlineError
}: {
  htmlFor: string;
  label: string;
  inlineError?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-medium leading-6 text-gray-900"
    >
      <span>{label}</span>
      {inlineError ? (
        <>
          <span className="font-normal text-slate-400" aria-hidden>
            |
          </span>
          <span className="font-normal text-rose-600">{inlineError}</span>
        </>
      ) : null}
    </label>
  );
}
