"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { ACCOUNTS_EVENT } from "@/lib/portfolios/accounts";
import { EVENTO_HISTORICO, lerEventos, type Evento, type GrupoEvento } from "@/lib/wallets/historico";

// Histórico de movimentações das Carteiras: cada diferença entre leituras
// (o que a pessoa fez e o que mudou na rede), do mais recente para o mais antigo.

const ICONE: Record<GrupoEvento, string> = { carteira: "👛", exchange: "🏦", defi: "🧪", nft: "🖼️", manual: "✍️" };
const POR_PAGINA = 40;

export default function HistoricoCarteiras() {
  const { t, lang } = useLanguage();
  const { hideBalances, numberFormat } = useCurrencyFormat();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [filtro, setFiltro] = useState<GrupoEvento | "todos">("todos");
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  useEffect(() => {
    const ler = () => setEventos(lerEventos());
    ler();
    window.addEventListener(EVENTO_HISTORICO, ler);
    window.addEventListener(ACCOUNTS_EVENT, ler);
    return () => { window.removeEventListener(EVENTO_HISTORICO, ler); window.removeEventListener(ACCOUNTS_EVENT, ler); };
  }, []);

  const filtrados = useMemo(() => eventos.filter((e) => filtro === "todos" || e.grupo === filtro), [eventos, filtro]);
  const visiveis = filtrados.slice(0, mostrar);
  const locale = lang === "en" ? "en-GB" : lang === "pt" ? "pt-PT" : lang;
  const dia = (ms: number) => new Date(ms).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const hora = (ms: number) => new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const q = (x: number | null | undefined) => (x == null ? "?" : hideBalances ? "••••" : x.toLocaleString(numberFormat, { maximumFractionDigits: Math.abs(x) >= 1 ? 4 : 8 }));
  const delta = (a?: number | null, b?: number | null) => {
    if (a == null || b == null || hideBalances) return "";
    const d = b - a;
    return ` (${d >= 0 ? "+" : "−"}${Math.abs(d).toLocaleString(numberFormat, { maximumFractionDigits: Math.abs(d) >= 1 ? 4 : 8 })})`;
  };

  const texto = (e: Evento): string => {
    const s = e.simbolo ?? "";
    const r = (k: Parameters<typeof t>[0]) => t(k).replace("{alvo}", e.alvo).replace("{s}", s)
      .replace("{antes}", q(e.antes)).replace("{depois}", q(e.depois)).replace("{n}", String(e.quantos ?? 0))
      .replace("{nomes}", (e.nomes ?? []).join(", "));
    switch (e.tipo) {
      case "inicio": return t("hw_ev_inicio");
      case "carteira_adicionada": return r("hw_ev_carteira_adicionada") + (e.depois != null ? ` · ${q(e.depois)} ${s}` : "");
      case "carteira_removida": return r("hw_ev_carteira_removida");
      case "saldo": case "token_saldo": case "exchange_saldo": return r("hw_ev_saldo") + delta(e.antes, e.depois);
      case "token_entrou": case "exchange_ativo_entrou": return r("hw_ev_entrou");
      case "token_saiu": case "exchange_ativo_saiu": return r("hw_ev_saiu");
      case "exchange_ligada": return r("hw_ev_exchange_ligada");
      case "exchange_removida": return r("hw_ev_exchange_removida");
      case "manual_adicionado": return r("hw_ev_manual_adicionado");
      case "manual_removido": return r("hw_ev_manual_removido");
      case "manual_alterado": return r("hw_ev_manual_alterado");
      case "defi_aberta": return r("hw_ev_defi_aberta");
      case "defi_fechada": return r("hw_ev_defi_fechada");
      case "defi_removida": return r("hw_ev_defi_removida");
      case "nft_entrou": return r("hw_ev_nft_entrou") + (e.nomes?.length ? ` · ${e.nomes.join(", ")}` : "");
      case "nft_saiu": return r("hw_ev_nft_saiu") + (e.nomes?.length ? ` · ${e.nomes.join(", ")}` : "");
    }
  };
  const corDe = (e: Evento) =>
    e.tipo === "saldo" || e.tipo === "token_saldo" || e.tipo === "exchange_saldo"
      ? (e.depois ?? 0) >= (e.antes ?? 0) ? "text-emerald-300" : "text-rose-300"
      : /removid|saiu|fechada/.test(e.tipo) ? "text-amber-200" : /adicionad|entrou|ligada|aberta/.test(e.tipo) ? "text-emerald-200" : "text-slate-200";

  // Agrupar por dia, mantendo a ordem (mais recente primeiro).
  const grupos: Array<{ dia: string; lista: Evento[] }> = [];
  for (const e of visiveis) {
    const d = dia(e.em);
    if (grupos.at(-1)?.dia !== d) grupos.push({ dia: d, lista: [] });
    grupos.at(-1)!.lista.push(e);
  }
  const FILTROS: Array<{ id: GrupoEvento | "todos"; label: string }> = [
    { id: "todos", label: t("hw_f_all") }, { id: "carteira", label: t("hw_f_wallets") }, { id: "exchange", label: t("hw_f_exchanges") },
    { id: "defi", label: "DeFi" }, { id: "nft", label: "NFT" }, { id: "manual", label: t("hw_f_manual") },
  ];

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("hw_title")}</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-400">{t("hw_hint")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => { setFiltro(f.id); setMostrar(POR_PAGINA); }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filtro === f.id ? "border-orange-400/60 bg-orange-500/15 text-orange-100" : "border-slate-700 text-slate-300 hover:border-slate-500"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">{eventos.length ? t("hw_empty_filter") : t("hw_empty")}</p>
      ) : (
        <div className="mt-5 space-y-4">
          {grupos.map((g) => (
            <div key={g.dia}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{g.dia}</p>
              <ul className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/40">
                {g.lista.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                    <span aria-hidden className="mt-0.5">{e.tipo === "inicio" ? "🟢" : ICONE[e.grupo]}</span>
                    <span className={`min-w-0 flex-1 break-words ${corDe(e)}`}>{texto(e)}</span>
                    <span className="shrink-0 tabular-nums text-xs text-slate-500">{hora(e.em)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {filtrados.length > mostrar && (
            <button type="button" onClick={() => setMostrar((m) => m + POR_PAGINA)} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500">
              {t("hw_more").replace("{n}", String(filtrados.length - mostrar))}
            </button>
          )}
        </div>
      )}
      <p className="mt-4 text-[11px] text-slate-500">{t("hw_note")}</p>
    </section>
  );
}
