/**
 * Company Subscription Amount Field.
 *
 * Reusable company subscriptions UI building block: Company Subscription Amount Field.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/company-subscriptions
 */
import { useMemo } from "react";

import {
  authSearchableInputClass,
  authSearchableLeadingClass,
  authSearchableShellClass
} from "../../components/auth/fieldStyles.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import type { CurrencyFormatId } from "../../lib/country-presets.js";
import {
  formatAmountMajorForInput,
  getCurrencyNarrowSymbol,
  parseLocalizedMajorToMinor
} from "../../lib/currencyFormat.js";
import { csLabelClass } from "./companySubscriptionsUi.js";

const amountPlaceholder = (currencyFormat: CurrencyFormatId | null): string => {
  if (currencyFormat === "dot_comma") return "1.234,56";
  if (currencyFormat === "space_comma") return "1 234,56";
  return "1,234.56";
};

type Props = {
  inputId: string;
  label: string;
  value: string;
  currencyCode: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlurFormat?: boolean;
};

/** React component for company subscriptions UI. */
export const CompanySubscriptionAmountField = ({
  inputId,
  label,
  value,
  currencyCode,
  disabled = false,
  onChange,
  onBlurFormat = true
}: Props) => {
  const { preferences } = useTenantDisplayPreferences();
  const locale = preferences?.locale ?? "en-US";
  const currencyFormat = preferences?.currencyFormat ?? null;
  const ccy = currencyCode.trim().toUpperCase() || preferences?.preferredCurrency || "USD";

  const symbol = useMemo(() => getCurrencyNarrowSymbol(locale, ccy), [locale, ccy]);

  const formatOnBlur = () => {
    if (!onBlurFormat || disabled) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const minor = parseLocalizedMajorToMinor(trimmed, currencyFormat);
    if (minor == null) return;
    onChange(formatAmountMajorForInput(minor / 100, locale, currencyFormat));
  };

  return (
    <div>
      <label htmlFor={inputId} className={csLabelClass}>
        {label}
      </label>
      <div className={disabled ? "opacity-60" : undefined}>
        <div className={authSearchableShellClass}>
          <div className={`${authSearchableLeadingClass} min-w-12 w-12 px-0.5`} aria-hidden>
            {symbol ? (
              <span
                className="max-w-full truncate text-center text-lg font-semibold leading-none text-slate-700"
                title={ccy}
              >
                {symbol}
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-600">{ccy}</span>
            )}
          </div>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            disabled={disabled}
            className={authSearchableInputClass}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={formatOnBlur}
            placeholder={amountPlaceholder(currencyFormat)}
            aria-label={`${label} in ${ccy}`}
          />
        </div>
      </div>
    </div>
  );
};
