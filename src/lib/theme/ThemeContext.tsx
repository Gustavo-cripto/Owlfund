"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";
export type Currency = "EUR" | "USD" | "GBP" | "BTC";
export type NumberFormat = "pt-PT" | "en-US";

export type AppSettings = {
  theme: Theme;
  currency: Currency;
  hideBalances: boolean;
  numberFormat: NumberFormat;
  alertsEnabled: boolean;
  autoSnapshot: boolean;
  compactMode: boolean;
};

const DEFAULTS: AppSettings = {
  theme: "dark",
  currency: "EUR",
  hideBalances: false,
  numberFormat: "pt-PT",
  alertsEnabled: true,
  autoSnapshot: true,
  compactMode: false,
};

// EUR-based FX rates: how much 1 EUR is worth in each currency.
export type FxRates = Record<Currency, number>;
const STATIC_RATES: FxRates = { EUR: 1, USD: 1.08, GBP: 0.86, BTC: 0.0000107 };

type ThemeContextValue = AppSettings & {
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
  rates: FxRates;
};

const ThemeContext = createContext<ThemeContextValue>({
  ...DEFAULTS,
  setSetting: () => {},
  resetSettings: () => {},
  rates: STATIC_RATES,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [mounted, setMounted] = useState(false);
  const [rates, setRates] = useState<FxRates>(STATIC_RATES);

  // Fetch live FX rates on mount and refresh every 60s.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/fx");
        if (!res.ok) return;
        const json = (await res.json()) as { rates?: Partial<FxRates> };
        if (active && json.rates) setRates((prev) => ({ ...prev, ...json.rates }));
      } catch { /* keep previous rates */ }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("owlfund-settings");
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AppSettings>;
        setSettings((prev) => ({ ...prev, ...saved }));
      }
    } catch { /* ignore */ }
    setMounted(true);
  }, []);

  // Apply theme to <body>
  useEffect(() => {
    if (!mounted) return;

    const resolveTheme = (): "light" | "dark" => {
      if (settings.theme === "system") {
        return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      }
      return settings.theme;
    };

    const resolved = resolveTheme();
    document.body.classList.toggle("theme-light", resolved === "light");
    document.body.classList.toggle("theme-dark", resolved === "dark");
    // Tailwind `dark:` variants use darkMode:"class" — mirror the resolved
    // theme onto <html> so those variants (portfolio AI card, etc.) activate.
    document.documentElement.classList.toggle("dark", resolved === "dark");

    // Listen for system changes when in "system" mode
    if (settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = (e: MediaQueryListEvent) => {
        document.body.classList.toggle("theme-light", e.matches);
        document.body.classList.toggle("theme-dark", !e.matches);
        document.documentElement.classList.toggle("dark", !e.matches);
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [settings.theme, mounted]);

  // Apply compact mode
  useEffect(() => {
    if (!mounted) return;
    document.body.classList.toggle("compact-mode", settings.compactMode);
  }, [settings.compactMode, mounted]);

  const setSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem("owlfund-settings", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULTS);
    try { localStorage.removeItem("owlfund-settings"); } catch { /* ignore */ }
  };

  return (
    <ThemeContext.Provider value={{ ...settings, setSetting, resetSettings, rates }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

// ── Currency formatting helper ────────────────────────────────────────────
const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£", BTC: "₿" };

export function useCurrencyFormat() {
  const { currency, numberFormat, hideBalances, rates } = useTheme();
  const rate = rates[currency] ?? 1;
  const sym = CURRENCY_SYMBOL[currency];

  // Convert an EUR amount into the selected currency (no formatting).
  const convert = (eurValue: number): number => eurValue * rate;

  const format = (eurValue: number, opts?: { compact?: boolean; decimals?: number }): string => {
    if (hideBalances) return "••••";
    const converted = eurValue * rate;

    if (opts?.compact) {
      if (Math.abs(converted) >= 1_000_000) return `${sym} ${(converted / 1_000_000).toFixed(2)}M`;
      if (Math.abs(converted) >= 1_000) return `${sym} ${(converted / 1_000).toFixed(1)}K`;
    }

    const decimals = opts?.decimals ?? (currency === "BTC" ? 6 : 2);
    const formatted = converted.toLocaleString(numberFormat, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${sym} ${formatted}`;
  };

  // Like format() but with a leading +/- sign (for PNL values).
  const formatSigned = (eurValue: number, opts?: { compact?: boolean; decimals?: number }): string => {
    if (hideBalances) return "••••";
    const sign = eurValue >= 0 ? "+" : "-";
    return `${sign} ${format(Math.abs(eurValue), opts)}`;
  };

  // Format a USD-denominated amount (e.g. DeFi/CEX values) in the selected currency.
  const usdToEur = rates.USD ? 1 / rates.USD : 1;
  const formatUsd = (usdValue: number, opts?: { compact?: boolean; decimals?: number }): string =>
    format(usdValue * usdToEur, opts);

  return { format, formatSigned, formatUsd, convert, usdToEur, symbol: sym, currency, rate, hideBalances };
}
