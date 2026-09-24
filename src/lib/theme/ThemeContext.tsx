"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { repetirVisivel, CINCO_MIN } from "@/lib/polling";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { currencySign } from "@/lib/currency/symbols";
import type { Lang } from "@/lib/i18n/translations";

export type Theme = "dark" | "light" | "system";
// As moedas acompanham os paises dos guias fiscais: euro (10 paises), libra,
// dolar, franco suico, dolares canadiano/australiano, real, zloti, peso
// mexicano e dolar de Singapura. Ficam de fora o dirham (AE) e o peso
// argentino (AR): a fonte de cambios do BCE nao os publica, e preferimos nao
// oferecer uma moeda cuja taxa nao sabemos ir buscar.
export type Currency = "EUR" | "USD" | "GBP" | "CHF" | "CAD" | "AUD" | "BRL" | "PLN" | "MXN" | "SGD" | "BTC";
/** "auto" segue o idioma do site; as outras forçam um formato. */
export type NumberFormat = "auto" | "pt-PT" | "en-US";

/** Formato numérico de cada idioma, quando a definição está em "auto". */
const NUMBER_LOCALE: Record<Lang, string> = {
  pt: "pt-PT",
  en: "en-GB",
  es: "es-ES",
  fr: "fr-FR",
};

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
  numberFormat: "auto",
  alertsEnabled: true,
  autoSnapshot: true,
  compactMode: false,
};

// EUR-based FX rates: how much 1 EUR is worth in each currency.
export type FxRates = Record<Currency, number>;
// Valores de recurso, so ate a /api/fx responder. Nao precisam de ser exatos.
const STATIC_RATES: FxRates = {
  EUR: 1, USD: 1.16, GBP: 0.86, CHF: 0.94, CAD: 1.60, AUD: 1.76,
  BRL: 6.30, PLN: 4.25, MXN: 21.5, SGD: 1.50, BTC: 0.0000107,
};

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
    const parar = repetirVisivel(load, CINCO_MIN);
    return () => { active = false; parar(); };
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("owlfund-settings");
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AppSettings> & { v?: number };
        // Migração (uma vez): até aqui o formato numérico era "pt-PT" por
        // omissão e ficava gravado mal se mexesse em qualquer definição. Quem
        // tivesse o site em inglês via na mesma "€377,44". Sem forma de saber
        // quem o escolheu de propósito, passa a "auto" — quem quiser português
        // volta a escolhê-lo, e para quem já usa português nada muda.
        if (saved.v == null && saved.numberFormat === "pt-PT") delete saved.numberFormat;
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
      try { localStorage.setItem("owlfund-settings", JSON.stringify({ ...next, v: 1 })); } catch { /* ignore */ }
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
const CURRENCY_SYMBOL = (c: Currency): string => currencySign(c);

export function useCurrencyFormat() {
  const { currency, numberFormat, hideBalances, rates } = useTheme();
  // Em "auto" o formato segue o idioma: quem lê o site em inglês espera
  // 1,234.56 e não 1.234,56 — no ecrã e nos ficheiros que exporta.
  const { lang } = useLanguage();
  const numberLocale = numberFormat === "auto" ? (NUMBER_LOCALE[lang] ?? "pt-PT") : numberFormat;
  const rate = rates[currency] ?? 1;
  const sym = CURRENCY_SYMBOL(currency);

  // Convert an EUR amount into the selected currency (no formatting).
  const convert = (eurValue: number): number => eurValue * rate;

  const format = (eurValue: number, opts?: { compact?: boolean; decimals?: number }): string => {
    if (hideBalances) return "••••";
    const converted = eurValue * rate;

    if (opts?.compact) {
      // B e T existiam em falta: uma capitalizacao de mercado de 2,3 biliões
      // saía como "2300000.00M".
      if (Math.abs(converted) >= 1e12) return `${sym} ${(converted / 1e12).toFixed(2)}T`;
      if (Math.abs(converted) >= 1e9) return `${sym} ${(converted / 1e9).toFixed(2)}B`;
      if (Math.abs(converted) >= 1_000_000) return `${sym} ${(converted / 1_000_000).toFixed(2)}M`;
      if (Math.abs(converted) >= 1_000) return `${sym} ${(converted / 1_000).toFixed(1)}K`;
    }

    const decimals = opts?.decimals ?? (currency === "BTC" ? 6 : 2);
    const formatted = converted.toLocaleString(numberLocale, {
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

  /**
   * Como formatUsd, mas NUNCA esconde o valor.
   * "Esconder saldos" serve para tapar o dinheiro de quem esta a ver — nao o
   * preco publico do Bitcoin. Usar so para dados de mercado, nunca para saldos.
   */
  const formatMarketUsd = (usdValue: number, opts?: { compact?: boolean; decimals?: number }): string => {
    const converted = usdValue * usdToEur * rate;
    if (opts?.compact) {
      if (Math.abs(converted) >= 1e12) return `${sym} ${(converted / 1e12).toFixed(2)}T`;
      if (Math.abs(converted) >= 1e9) return `${sym} ${(converted / 1e9).toFixed(2)}B`;
      if (Math.abs(converted) >= 1_000_000) return `${sym} ${(converted / 1_000_000).toFixed(2)}M`;
      if (Math.abs(converted) >= 1_000) return `${sym} ${(converted / 1_000).toFixed(1)}K`;
    }
    const decimals = opts?.decimals ?? (currency === "BTC" ? 6 : 2);
    return `${sym} ${converted.toLocaleString(numberLocale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  };

  return { format, formatSigned, formatUsd, formatMarketUsd, convert, usdToEur, symbol: sym, currency, rate, hideBalances, numberFormat: numberLocale, rates };
}
