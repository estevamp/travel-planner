import React from "react";
import { cn } from "../utils";

interface CurrencySelectorProps {
  value: string;
  onChange: (currency: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const CURRENCIES = [
  { code: "BRL", name: "Real Brasileiro", symbol: "R$" },
  { code: "USD", name: "Dólar Americano", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "Libra Esterlina", symbol: "£" },
  { code: "JPY", name: "Iene Japonês", symbol: "¥" },
  { code: "ARS", name: "Peso Argentino", symbol: "$" },
  { code: "CLP", name: "Peso Chileno", symbol: "$" },
  { code: "PYG", name: "Guarani Paraguaio", symbol: "₲" },
];

export function CurrencySelector({
  value,
  onChange,
  label,
  disabled = false,
  className,
}: CurrencySelectorProps) {
  // If label is provided, wrap in a container with spacing
  if (label) {
    return (
      <div className={cn("space-y-1", className)}>
        <label className="block text-sm font-semibold">
          {label}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full px-3 py-2 rounded-xl border-2",
            "text-sm font-medium",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--card-border)',
            color: 'inherit'
          }}
        >
          {CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} - {currency.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // If no label, return just the select without wrapper
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "w-full px-3 py-2 rounded-xl border-2",
        "text-sm font-medium",
        "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
        "transition-all duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      style={{
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--card-border)',
        color: 'inherit'
      }}
    >
      {CURRENCIES.map((currency) => (
        <option key={currency.code} value={currency.code}>
          {currency.code} - {currency.name}
        </option>
      ))}
    </select>
  );
}

export { CURRENCIES };
