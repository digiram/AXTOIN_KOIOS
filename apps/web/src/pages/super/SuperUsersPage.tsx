/**
 * Super Users page.
 *
 * Tenant super-admin screen mounted under AppShell at /super-admin.
 *
 * Responsibilities:
 * - Load and render primary super-admin data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /super-admin
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import type { PlatformUsersQueryInput } from "@starter/shared";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Filter,
  Globe,
  KeyRound,
  List,
  Search,
  Shield,
  ShieldCheck,
  User,
  UserPlus,
  X
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { API_BASE_URL } from "../../lib/api.js";
import {
  superDataTableClass,
  superDataTableEmptyCellClass,
  superDataTableEmptyRowClass,
  superDataTableOuterClass,
  superDataTableRowClass,
  superDataTableTbodyClass,
  superDataTableThClass,
  superDataTableTheadClass,
  superDataTableUsersActionsTdClass,
  superDataTableUsersActionsThClass
} from "./superDataTableStyles.js";
import { SuperAddUserModal } from "./SuperAddUserModal.js";

type ApiUserRow = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: string;
};

type SortCol = PlatformUsersQueryInput["sort"];

type ListResponse = {
  users: ApiUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** Platform super admin passwords are provisioned via env/bootstrap — not resettable through this UI or `/platform/.../reset-password`. */
const canResetPasswordInApp = (u: { role: string }): boolean => u.role !== "super_admin";

const roleLabel = (role: string): string => {
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "tenant_admin":
      return "Tenant admin";
    case "tenant_user":
      return "Member";
    default:
      return role;
  }
};

/** Amber-forward pills inspired by reference UI (light fill + defined border). */
const roleBadgeClass = (role: string): string => {
  switch (role) {
    case "super_admin":
      return "border-amber-400/70 bg-amber-50 text-amber-950";
    case "tenant_admin":
      return "border-amber-300/90 bg-[#fffbeb] text-amber-950";
    default:
      return "border-stone-200 bg-stone-50 text-stone-800";
  }
};

const SORT_COLS: { key: SortCol; label: string; align?: "left" | "right" }[] = [
  { key: "email", label: "Email" },
  { key: "displayName", label: "Display name" },
  { key: "role", label: "Role" },
  { key: "tenantName", label: "Tenant" },
  { key: "createdAt", label: "Created" }
];

function RoleBadgeIcon({ role }: { role: string }) {
  const cls = "h-3.5 w-3.5 shrink-0 opacity-90";
  switch (role) {
    case "super_admin":
      return <ShieldCheck className={cls} aria-hidden strokeWidth={2} />;
    case "tenant_admin":
      return <Building2 className={cls} aria-hidden strokeWidth={2} />;
    default:
      return <User className={cls} aria-hidden strokeWidth={2} />;
  }
}

/** Route page component for tenant super-admin under AppShell. */
export const SuperUsersPage = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const { formatDateTime } = useUserDisplayDatetime();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlQ = searchParams.get("q") ?? "";
  const [qDraft, setQDraft] = useState(urlQ);

  useEffect(() => {
    setQDraft(urlQ);
  }, [urlQ]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const nextTrim = qDraft.trim();
          const urlTrim = (prev.get("q") ?? "").trim();
          if (nextTrim === urlTrim) return prev;
          const next = new URLSearchParams(prev);
          if (nextTrim) next.set("q", nextTrim);
          else next.delete("q");
          next.set("page", "1");
          return next;
        },
        { replace: true }
      );
    }, 320);
    return () => window.clearTimeout(id);
  }, [qDraft, setSearchParams]);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "25") || 25));
  const sort = (searchParams.get("sort") as SortCol | null) ?? "createdAt";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";
  const roleFilter = searchParams.get("role") as PlatformUsersQueryInput["role"] | null;
  const realm =
    searchParams.get("realm") === "platform" || searchParams.get("realm") === "realm"
      ? searchParams.get("realm")!
      : "all";

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    p.set("sort", SORT_COLS.some((c) => c.key === sort) ? sort : "createdAt");
    p.set("order", order);
    if (urlQ.trim()) p.set("q", urlQ.trim());
    if (roleFilter && ["super_admin", "tenant_admin", "tenant_user"].includes(roleFilter)) {
      p.set("role", roleFilter);
    }
    if (realm !== "all") p.set("realm", realm);
    return p.toString();
  }, [page, pageSize, sort, order, urlQ, roleFilter, realm]);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailUser, setDetailUser] = useState<ApiUserRow | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const passwordResultCloseRef = useRef<HTMLButtonElement>(null);
  const [resetPwBusy, setResetPwBusy] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);
  /** Row-level reset: first tap opens confirmation mask + ✓/✗ in the actions column. */
  const [pendingResetUserId, setPendingResetUserId] = useState<string | null>(null);
  const [pendingResetError, setPendingResetError] = useState("");
  /** After confirming a row reset — temporary password + copy (separate from profile detail modal). */
  const [passwordResultModal, setPasswordResultModal] = useState<
    | { user: ApiUserRow; password: string }
    | { user: ApiUserRow; serverMessage: string; variant: "email" | "generic" }
    | null
  >(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError("");
      setLoading(true);
      try {
        let res = await fetch(`${API_BASE_URL}/platform/users?${queryString}`, {
          headers: authHeaders()
        });
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/platform/users?${queryString}`, {
            headers: authHeaders()
          });
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          if (!cancelled) setError(body?.message ?? "Could not load users.");
          return;
        }
        const json = (await res.json()) as ListResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not load users.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [queryString, authHeaders, refreshSession, logout, listRefreshKey]);

  const openUserDetail = useCallback((u: ApiUserRow) => {
    setCopiedPw(false);
    setPendingResetUserId(null);
    setPendingResetError("");
    setDetailUser(u);
  }, []);

  type ResetPwResult =
    | { ok: true; temporaryPassword: string }
    | { ok: true; passwordResetMessage: string }
    | { ok: true; passwordSentMessage: string }
    | { ok: false; message: string };

  const performResetPassword = useCallback(
    async (user: ApiUserRow): Promise<ResetPwResult | null> => {
      setResetPwBusy(true);
      try {
        const post = async () =>
          fetch(`${API_BASE_URL}/platform/users/${user.id}/reset-password`, {
            method: "POST",
            headers: { ...authHeaders(), "content-type": "application/json" },
            body: "{}"
          });

        let res = await post();
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return null;
          }
          res = await post();
        }
        const body = (await res.json().catch(() => null)) as {
          temporaryPassword?: string;
          passwordReset?: boolean;
          passwordSent?: boolean;
          message?: string;
        } | null;
        if (!res.ok) {
          return { ok: false, message: body?.message ?? "Could not reset password." };
        }
        if (body?.temporaryPassword) {
          return { ok: true, temporaryPassword: body.temporaryPassword };
        }
        if (body?.passwordSent === true && typeof body.message === "string") {
          return { ok: true, passwordSentMessage: body.message };
        }
        if (body?.passwordReset === true && typeof body.message === "string") {
          return { ok: true, passwordResetMessage: body.message };
        }
        return { ok: false, message: "Could not reset password." };
      } catch {
        return { ok: false, message: "Could not reset password." };
      } finally {
        setResetPwBusy(false);
      }
    },
    [authHeaders, refreshSession, logout]
  );

  const confirmPendingRowReset = useCallback(
    async (u: ApiUserRow) => {
      setPendingResetError("");
      const r = await performResetPassword(u);
      if (r == null) return;
      if (!r.ok) {
        setPendingResetError(r.message);
        return;
      }
      setPendingResetUserId(null);
      setCopiedPw(false);
      if ("temporaryPassword" in r) {
        setPasswordResultModal({ user: u, password: r.temporaryPassword });
      } else if ("passwordSentMessage" in r) {
        setPasswordResultModal({ user: u, serverMessage: r.passwordSentMessage, variant: "email" });
      } else {
        setPasswordResultModal({ user: u, serverMessage: r.passwordResetMessage, variant: "generic" });
      }
    },
    [performResetPassword]
  );

  const cancelPendingRowReset = useCallback(() => {
    setPendingResetUserId(null);
    setPendingResetError("");
  }, []);

  const copyPasswordToClipboard = useCallback(async (password: string) => {
    try {
      await navigator.clipboard.writeText(password);
      setCopiedPw(true);
      window.setTimeout(() => setCopiedPw(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  useEffect(() => {
    const modalOpen = Boolean(detailUser || passwordResultModal);
    if (!modalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (passwordResultModal) passwordResultCloseRef.current?.focus();
    else detailCloseRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [detailUser, passwordResultModal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (passwordResultModal) {
        setPasswordResultModal(null);
        return;
      }
      if (pendingResetUserId) {
        cancelPendingRowReset();
        return;
      }
      if (detailUser) setDetailUser(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailUser, passwordResultModal, pendingResetUserId, cancelPendingRowReset]);

  const setParam = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v === undefined || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const toggleSort = useCallback(
    (col: SortCol) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const cur = prev.get("sort") ?? "createdAt";
          const ord = prev.get("order") === "asc" ? "asc" : "desc";
          if (cur === col) {
            next.set("order", ord === "asc" ? "desc" : "asc");
          } else {
            next.set("sort", col);
            next.set("order", col === "createdAt" ? "desc" : "asc");
          }
          next.set("page", "1");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const activeSort = SORT_COLS.some((c) => c.key === sort) ? sort : "createdAt";
  const total = data?.total ?? 0;
  const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));

  const recordsFoundLabel = loading
    ? "Loading…"
    : `${total.toLocaleString()} ${total === 1 ? "record" : "records"} found`;

  const filterInputClass =
    "w-full rounded-lg border border-stone-200/90 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  const filterSelectClass =
    "w-full min-w-[10rem] rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 pr-9 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  return (
    <div className="w-full min-w-0 max-w-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-stone-800">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-amber-800/90" aria-hidden strokeWidth={2} />
          <h2 id="super-users-filters-heading" className="text-base font-semibold tracking-tight">
            Filters
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setAddUserOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100"
        >
          <UserPlus className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
          Add user
        </button>
      </div>
      <section
        className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6"
        aria-labelledby="super-users-filters-heading"
      >
        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_11rem_11rem] xl:grid-rows-[auto_auto] xl:items-center xl:gap-x-5 xl:gap-y-1.5">
          <div className="min-w-0 flex-1 xl:contents">
            <label
              htmlFor="super-users-search"
              className="mb-1.5 block text-xs font-medium text-stone-600 xl:col-start-1 xl:row-start-1 xl:mb-0"
            >
              Search users
            </label>
            <div className="relative min-w-0 xl:col-start-1 xl:row-start-2">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-stone-400">
                <Search className="h-5 w-5" aria-hidden strokeWidth={2} />
              </span>
              <input
                id="super-users-search"
                type="search"
                placeholder="Email, display name…"
                autoComplete="off"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                className={filterInputClass}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:gap-4 xl:contents xl:shrink-0">
            <div className="min-w-0 sm:min-w-[10rem] xl:w-[11rem] xl:contents">
              <label
                htmlFor="super-users-role"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-600 xl:col-start-2 xl:row-start-1 xl:mb-0"
              >
                <Shield className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden strokeWidth={2} />
                Role
              </label>
              <select
                id="super-users-role"
                value={roleFilter ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setParam({
                    role: v || undefined,
                    page: "1"
                  });
                }}
                className={`${filterSelectClass} xl:col-start-2 xl:row-start-2 xl:w-full`}
              >
                <option value="">Any role</option>
                <option value="super_admin">Super admin</option>
                <option value="tenant_admin">Tenant admin</option>
                <option value="tenant_user">Member</option>
              </select>
            </div>
            <div className="min-w-0 sm:min-w-[10rem] xl:w-[11rem] xl:contents">
              <label
                htmlFor="super-users-realm"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-600 xl:col-start-3 xl:row-start-1 xl:mb-0"
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden strokeWidth={2} />
                Scope
              </label>
              <select
                id="super-users-realm"
                value={realm}
                onChange={(e) =>
                  setParam({ realm: e.target.value === "all" ? undefined : e.target.value, page: "1" })
                }
                className={`${filterSelectClass} xl:col-start-3 xl:row-start-2 xl:w-full`}
              >
                <option value="all">All accounts</option>
                <option value="platform">Platform only</option>
                <option value="realm">Tenant realms only</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="mt-4 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      {/* Stats row: records count + compact rows-per-page */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-stone-600">{recordsFoundLabel}</p>
        <div className="flex w-full justify-end sm:w-auto">
          <label htmlFor="super-users-pagesize" className="sr-only">
            Rows per page
          </label>
          <div
            className="inline-flex min-h-8 shrink-0 items-stretch overflow-hidden rounded-md border border-stone-200 bg-white text-xs shadow-sm"
            title="Rows per page"
          >
            <span
              className="flex items-center gap-1 border-r border-stone-200 bg-stone-50 px-2 py-1 font-medium text-stone-600"
              aria-hidden
            >
              <List className="h-3 w-3 shrink-0 text-stone-400" strokeWidth={2} aria-hidden />
              Rows
            </span>
            <select
              id="super-users-pagesize"
              value={String(pageSize)}
              onChange={(e) => setParam({ pageSize: e.target.value, page: "1" })}
              className="min-w-[4.25rem] cursor-pointer border-0 bg-white py-1 pl-2 pr-8 text-xs font-semibold tabular-nums text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/45"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table — PCM-style density; stone reset + amber view action rail */}
      <div className={["mt-3", superDataTableOuterClass].join(" ")}>
        <table className={superDataTableClass("min-w-[760px]")} aria-label="Platform users">
          <caption className="sr-only">Platform users directory with sortable columns</caption>
          <thead className={superDataTableTheadClass}>
            <tr>
              {SORT_COLS.map(({ key, label, align }) => {
                const isSorted = activeSort === key;
                const ariaSort =
                  !isSorted ? "none" : order === "asc" ? "ascending" : "descending";
                const roleCol = key === "role";
                const right = align === "right";
                return (
                  <th
                    key={key}
                    scope="col"
                    className={[
                      superDataTableThClass,
                      right ? "text-right" : roleCol ? "text-center sm:text-left" : "text-left",
                      key === "email" ? "min-w-[12rem] md:w-[28%]" : "",
                      key === "displayName" ? "min-w-[9rem]" : "",
                      key === "tenantName" ? "min-w-[8rem] md:max-w-[20rem]" : "",
                      key === "createdAt" ? "whitespace-nowrap md:min-w-[11rem]" : "",
                      roleCol ? "w-[1%]" : ""
                    ].join(" ")}
                    aria-sort={ariaSort}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={[
                        "inline-flex w-full cursor-pointer items-center gap-1 border-0 bg-transparent text-inherit transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50",
                        right ? "justify-end text-right" : roleCol ? "justify-center sm:justify-start" : "justify-start text-left"
                      ].join(" ")}
                    >
                      <span>{label}</span>
                      <SortIndicator active={isSorted} ascending={order === "asc"} />
                    </button>
                  </th>
                );
              })}
              <th scope="col" className={superDataTableUsersActionsThClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className={superDataTableTbodyClass}>
            {loading ? (
              <tr className={superDataTableEmptyRowClass}>
                <td colSpan={6} className={superDataTableEmptyCellClass}>
                  Loading…
                </td>
              </tr>
            ) : !data?.users.length ? (
              <tr className={superDataTableEmptyRowClass}>
                <td colSpan={6} className={superDataTableEmptyCellClass}>
                  No users match your filters.
                </td>
              </tr>
            ) : (
              data.users.map((u, idx) =>
                pendingResetUserId === u.id ? (
                  <tr
                    key={u.id}
                    className={[idx % 2 === 0 ? "bg-white" : "bg-slate-50/40", "relative z-[1]"].join(" ")}
                  >
                    <td
                      colSpan={5}
                      className="relative border-2 border-amber-400 border-r-0 p-0 align-middle"
                    >
                      <div className="pointer-events-none absolute inset-0 bg-white" aria-hidden />
                      <div className="relative flex min-h-[2.75rem] items-center justify-end px-3 py-2 pr-2">
                        <div className="max-w-full text-right">
                          <p className="text-sm font-medium text-slate-800">
                            Reset password and clear MFA for this user?
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            Authenticator and email MFA are removed. Realm users get a new enrollment window if their
                            tenant requires MFA.
                          </p>
                          {pendingResetError ? (
                            <p className="mt-1 text-sm text-rose-600" role="alert">
                              {pendingResetError}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="relative border-2 border-l-0 border-amber-400 p-0 align-top text-sm">
                      <div className="flex min-h-[2.75rem] w-[4.5rem]">
                        <button
                          type="button"
                          title="Cancel"
                          aria-label="Cancel password reset"
                          disabled={resetPwBusy}
                          onClick={cancelPendingRowReset}
                          className="flex flex-1 items-center justify-center bg-rose-100 text-rose-900 transition hover:bg-rose-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-400/80 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          title="Confirm reset password"
                          aria-label={`Confirm password reset for ${u.email}`}
                          disabled={resetPwBusy}
                          onClick={() => void confirmPendingRowReset(u)}
                          className="flex flex-1 items-center justify-center bg-emerald-100 text-emerald-900 transition hover:bg-emerald-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/80 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Check className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id} className={superDataTableRowClass(idx)}>
                    <td className="max-w-0 whitespace-nowrap px-3 py-2 align-middle">
                      <span className="block truncate font-medium" title={u.email}>
                        {u.email}
                      </span>
                    </td>
                    <td className="max-w-0 whitespace-nowrap px-3 py-2 align-middle">
                      <span className="block truncate" title={u.displayName ?? undefined}>
                        {u.displayName?.trim() ? (
                          u.displayName
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </span>
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-3 py-2 align-middle">
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-none shadow-sm",
                          roleBadgeClass(u.role)
                        ].join(" ")}
                      >
                        <RoleBadgeIcon role={u.role} />
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="max-w-0 whitespace-nowrap px-3 py-2 align-middle">
                      <span className="block truncate" title={u.tenantId ? u.tenantName ?? undefined : "Platform"}>
                        {u.tenantId ? (
                          u.tenantName ?? "—"
                        ) : (
                          <span className="font-medium text-slate-600">Platform</span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-middle tabular-nums text-slate-700">
                      {formatDateTime(u.createdAt)}
                    </td>
                    <td className={superDataTableUsersActionsTdClass}>
                      <div className="flex min-h-[2.75rem] w-[4.5rem]">
                        <button
                          type="button"
                          title={
                            canResetPasswordInApp(u)
                              ? "Reset password and clear MFA"
                              : "Super admin passwords are set via environment variables only"
                          }
                          aria-label={
                            canResetPasswordInApp(u)
                              ? `Reset password for ${u.email}`
                              : "Password reset unavailable — super admin uses environment configuration"
                          }
                          disabled={resetPwBusy || !canResetPasswordInApp(u)}
                          onClick={() => {
                            if (!canResetPasswordInApp(u)) return;
                            setPendingResetUserId(u.id);
                            setPendingResetError("");
                          }}
                          className="flex flex-1 items-center justify-center bg-stone-100 text-stone-800 transition hover:bg-stone-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400/80 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <KeyRound className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          title="View user details"
                          aria-label={`View details for ${u.email}`}
                          onClick={() => openUserDetail(u)}
                          className="flex flex-1 items-center justify-center bg-amber-100 text-amber-950 transition hover:bg-amber-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/80"
                        >
                          <Eye className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {!loading && data ? (
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-stone-600">
            {total === 0 ? (
              "No results."
            ) : (
              <>
                Page <span className="font-medium text-stone-900">{page}</span> of{" "}
                <span className="font-medium text-stone-900">{totalPages}</span>
              </>
            )}
          </p>
          <nav className="flex flex-wrap items-center gap-2" aria-label="Pagination">
            <button
              type="button"
              disabled={page <= 1 || total === 0}
              onClick={() => setParam({ page: String(Math.max(1, page - 1)) })}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={total === 0 || page >= totalPages}
              onClick={() => setParam({ page: String(page + 1) })}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        </div>
      ) : null}

      {detailUser ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div
            role="presentation"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setDetailUser(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="super-user-detail-title"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_18px_50px_rgba(15,15,15,0.18)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="super-user-detail-title" className="text-lg font-semibold tracking-tight text-stone-900">
                  User details
                </h2>
                <p className="mt-0.5 truncate text-sm text-stone-500" title={detailUser.email}>
                  {detailUser.email}
                </p>
              </div>
              <button
                ref={detailCloseRef}
                type="button"
                onClick={() => setDetailUser(null)}
                className="shrink-0 rounded-lg border border-transparent p-2 text-stone-500 transition hover:border-stone-200 hover:bg-stone-50 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden strokeWidth={2} />
              </button>
            </div>
            <div className="max-h-[min(70vh,28rem)] overflow-y-auto px-5 py-4 sm:px-6">
              <dl className="space-y-4 text-sm">
                <DetailRow label="Email">
                  <span className="break-all font-medium text-stone-900">{detailUser.email}</span>
                </DetailRow>
                <DetailRow label="Display name">
                  {detailUser.displayName?.trim() ? (
                    <span className="text-stone-800">{detailUser.displayName}</span>
                  ) : (
                    <span className="text-stone-400">—</span>
                  )}
                </DetailRow>
                <DetailRow label="Role">
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none shadow-sm",
                      roleBadgeClass(detailUser.role)
                    ].join(" ")}
                  >
                    <RoleBadgeIcon role={detailUser.role} />
                    {roleLabel(detailUser.role)}
                  </span>
                </DetailRow>
                <DetailRow label="Tenant">
                  {detailUser.tenantId ? (
                    <>
                      <span className="block font-medium text-stone-900">{detailUser.tenantName ?? "—"}</span>
                      <span className="mt-1 block font-mono text-xs text-stone-500">{detailUser.tenantId}</span>
                    </>
                  ) : (
                    <span className="font-medium text-stone-700">Platform (no tenant)</span>
                  )}
                </DetailRow>
                <DetailRow label="User ID">
                  <span className="break-all font-mono text-xs text-stone-700">{detailUser.id}</span>
                </DetailRow>
                <DetailRow label="Created">
                  <span className="tabular-nums text-stone-800">{formatDateTime(detailUser.createdAt)}</span>
                </DetailRow>
              </dl>
            </div>
            <div className="border-t border-stone-100 bg-stone-50/80 px-5 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {passwordResultModal ? (
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6">
          <div
            role="presentation"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setPasswordResultModal(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="super-user-temp-pw-title"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_18px_50px_rgba(15,15,15,0.18)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="super-user-temp-pw-title" className="text-lg font-semibold tracking-tight text-stone-900">
                  {"password" in passwordResultModal
                    ? "Temporary password"
                    : passwordResultModal.variant === "email"
                      ? "Password emailed"
                      : "Password reset"}
                </h2>
                <p className="mt-0.5 truncate text-sm text-stone-500" title={passwordResultModal.user.email}>
                  {passwordResultModal.user.email}
                </p>
              </div>
              <button
                ref={passwordResultCloseRef}
                type="button"
                onClick={() => setPasswordResultModal(null)}
                className="shrink-0 rounded-lg border border-transparent p-2 text-stone-500 transition hover:border-stone-200 hover:bg-stone-50 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden strokeWidth={2} />
              </button>
            </div>
            <div className="px-5 py-4 sm:px-6">
              {"password" in passwordResultModal ? (
                <>
                  <p className="text-xs leading-relaxed text-stone-600">
                    Share this password with the user securely; their previous password will stop working. Any
                    authenticator or email MFA on this account was cleared so they can enroll again after signing in.
                  </p>
                  <TemporaryPasswordCopyBlock
                    password={passwordResultModal.password}
                    copied={copiedPw}
                    onCopy={() => void copyPasswordToClipboard(passwordResultModal.password)}
                  />
                </>
              ) : (
                <p className="text-sm leading-relaxed text-stone-700">{passwordResultModal.serverMessage}</p>
              )}
            </div>
            <div className="border-t border-stone-100 bg-stone-50/80 px-5 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setPasswordResultModal(null)}
                className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SuperAddUserModal
        open={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        authHeaders={authHeaders}
        refreshSession={refreshSession}
        logout={logout}
        onCreated={(result) => {
          setListRefreshKey((k) => k + 1);
          setCopiedPw(false);
          const row: ApiUserRow = {
            id: result.user.id,
            tenantId: result.user.tenantId,
            tenantName: result.user.tenantName,
            email: result.user.email,
            displayName: result.user.displayName,
            role: result.user.role,
            createdAt: result.user.createdAt
          };
          if (result.temporaryPassword) {
            setPasswordResultModal({ user: row, password: result.temporaryPassword });
          } else if (result.passwordSent && result.message) {
            setPasswordResultModal({ user: row, serverMessage: result.message, variant: "email" });
          } else if (result.message) {
            setPasswordResultModal({ user: row, serverMessage: result.message, variant: "generic" });
          }
        }}
      />
    </div>
  );
};

function TemporaryPasswordCopyBlock({
  password,
  copied,
  onCopy
}: {
  password: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <code className="break-all font-mono text-sm font-semibold tracking-wide text-stone-900">{password}</code>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-300/80 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-sm transition hover:bg-amber-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 text-stone-800">{children}</dd>
    </div>
  );
}

/** Single arrow for the active sort column only (matches common table UX). */
function SortIndicator({ active, ascending }: { active: boolean; ascending: boolean }) {
  if (!active) {
    return <span className="inline-block h-4 w-4 shrink-0" aria-hidden />;
  }
  const cls = "h-4 w-4 shrink-0 text-slate-700";
  return ascending ? (
    <ChevronUp strokeWidth={2} className={cls} aria-hidden />
  ) : (
    <ChevronDown strokeWidth={2} className={cls} aria-hidden />
  );
}
