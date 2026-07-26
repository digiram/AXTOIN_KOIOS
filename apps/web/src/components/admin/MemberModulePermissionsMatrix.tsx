/**
 * MemberModulePermissionsMatrix
 *
 * Interactive grid for assigning optional-module CRUD flags when editing a tenant member.
 *
 * Responsibilities:
 * - Render one row per `TENANT_MODULE_KEY` with View / Add / Edit / Delete toggles
 * - Apply implied-permission rules via `applyUiPermissionToggle` from shared
 * - Expose a per-row “grant all / clear all” shortcut
 *
 * Related:
 * - Tenant Users admin page; `@starter/shared` module permission UI helpers
 *
 * Security:
 * - Display-only editor — parent persists via tenant admin API; server enforces final roles.
 */
import type { ModulePermissionUiFlags, ModulePermissionUiKey, TenantModuleKey } from "@starter/shared";
import {
  MODULE_LABELS,
  MODULE_PERMISSION_UI_COLUMNS,
  TENANT_MODULE_KEYS,
  applyUiPermissionToggle
} from "@starter/shared";

type Props = {
  value: Record<TenantModuleKey, ModulePermissionUiFlags>;
  onChange: (next: Record<TenantModuleKey, ModulePermissionUiFlags>) => void;
  disabled?: boolean;
};

const cellClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/45 disabled:cursor-not-allowed disabled:opacity-50";

const isImplied = (flags: ModulePermissionUiFlags, col: ModulePermissionUiKey): boolean => {
  if (col === "view") return flags.add || flags.edit || flags.delete;
  if (col === "add") return flags.delete;
  if (col === "edit") return flags.delete;
  return false;
};

/**
 * Checkbox matrix for one member's module permissions across all tenant modules.
 *
 * @param value - Current UI flags keyed by module.
 * @param onChange - Called with the next full flags record after any toggle.
 */
export const MemberModulePermissionsMatrix = ({ value, onChange, disabled = false }: Props) => {
  const setToggle = (module: TenantModuleKey, toggle: ModulePermissionUiKey, enabled: boolean) => {
    onChange({
      ...value,
      [module]: applyUiPermissionToggle(value[module], toggle, enabled)
    });
  };

  const setRow = (module: TenantModuleKey, flags: ModulePermissionUiFlags) => {
    onChange({ ...value, [module]: flags });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-stone-600">
        Permissions stack left to right: <span className="font-medium">View</span>, then{" "}
        <span className="font-medium">Add</span> and <span className="font-medium">Edit</span>, then{" "}
        <span className="font-medium">Delete</span>. Higher levels include the ones to the left.
      </p>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm ring-1 ring-stone-900/5">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">Module permissions for this member</caption>
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th
                scope="col"
                className="w-[7rem] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-600"
              >
                Module
              </th>
              {MODULE_PERMISSION_UI_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="min-w-[4.5rem] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-stone-600"
                >
                  {col.label}
                </th>
              ))}
              <th
                scope="col"
                className="w-[4.5rem] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-stone-600"
              >
                All
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {TENANT_MODULE_KEYS.map((moduleKey) => {
              const flags = value[moduleKey];
              const allOn = flags.view && flags.add && flags.edit && flags.delete;
              return (
                <tr key={moduleKey} className="bg-white">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-stone-900">
                    {MODULE_LABELS[moduleKey]}
                  </th>
                  {MODULE_PERMISSION_UI_COLUMNS.map((col) => {
                    const checked = flags[col.key];
                    const implied = isImplied(flags, col.key);
                    return (
                      <td key={col.key} className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled || implied}
                          title={
                            implied
                              ? `Included when ${col.key === "view" ? "Add, Edit, or Delete" : "Delete"} is enabled`
                              : col.label
                          }
                          aria-label={`${MODULE_LABELS[moduleKey]} — ${col.label}`}
                          className="h-4 w-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
                          onChange={(e) => setToggle(moduleKey, col.key, e.target.checked)}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      title={allOn ? "Clear module access" : "Grant full access"}
                      aria-label={`${allOn ? "Clear" : "Grant full"} ${MODULE_LABELS[moduleKey]} access`}
                      className={cellClass}
                      onClick={() =>
                        setRow(
                          moduleKey,
                          allOn
                            ? { view: false, add: false, edit: false, delete: false }
                            : { view: true, add: true, edit: true, delete: true }
                        )
                      }
                    >
                      {allOn ? (
                        <span className="text-xs font-semibold text-stone-500">—</span>
                      ) : (
                        <span className="text-xs font-semibold text-indigo-700">✓</span>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
