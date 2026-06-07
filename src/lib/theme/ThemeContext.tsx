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

type ThemeContextValue = AppSettings & {
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  ...DEFAULTS,
  setSetting: () => {},
  resetSettings: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [mounted, setMounted] = useState(false);

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

    // Listen for system changes when in "system" mode
    if (settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = (e: MediaQueryListEvent) => {
        document.body.classList.toggle("theme-light", e.matches);
        document.body.classList.toggle("theme-dark", !e.matches);
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
    <ThemeContext.Provider value={{ ...settings, setSetting, resetSettings }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

// ── Currency formatting helper ────────────────────────────────────────────
const EUR_TO: Record<Currency, number> = { EUR: 1, USD: 1.08, GBP: 0.86, BTC: 0.0000107 };
const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£", BTC: "₿" };

export function useCurrencyFormat() {
  const { currency, numberFormat, hideBalances } = useTheme();

  const format = (eurValue: number, opts?: { compact?: boolean; decimals?: number }): string => {
    if (hideBalances) return "••••";
    const converted = eurValue * (EUR_TO[currency] ?? 1);
    const sym = CURRENCY_SYMBOL[currency];

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

  return { format, symbol: CURRENCY_SYMBOL[currency], currency, hideBalances };
}
