"use client";

import { useEffect, useRef, useState } from "react";
import { marcarEvento } from "@/lib/analytics/eventos";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { pageUrl } from "@/lib/i18n/routes";
import { btnPrimary } from "@/lib/ui/buttons";
import { detetarRede } from "@/lib/wallets/detetarRede";
import { saldoUrl } from "@/lib/tools/saldo";

// Bloco "Experimenta sem conta" da landing. Fala com /api/preview (publica,
// com limite por IP e cache por endereco). Nao guarda o endereco em lado
// nenhum — nem aqui, nem no servidor.

type Linha = { symbol: string; name: string; chain: string; balance: number; usdValue: number; logo?: string };
type Resposta = { kind: "evm" | "sol" | "btc"; networks: string[]; totalUsd: number; tokens: Linha[]; others: number; nftCount: number | null };

const REDE: Record<string, string> = {
  eth: "Ethereum", base: "Base", arbitrum: "Arbitrum", optimism: "Optimism", polygon: "Polygon", sol: "Solana", btc: "Bitcoin",
};
// Enderecos publicos muito conhecidos, so para quem nao tem um a mao:
// vitalik.eth, o endereco do bloco genesis do Bitcoin e um endereco de exemplo
// da documentacao da Solana. Confirmados contra /api/preview a 29 set 2026.
const EXEMPLOS = {
  eth: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  btc: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  sol: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg",
} as const;
export type RedeDemo = keyof typeof EXEMPLOS;

/**
 * `rede`: nas paginas por rede (/saldo-bitcoin…) muda o exemplo e o texto do
 * campo; a consulta aceita na mesma qualquer endereco suportado.
 * `semCabecalho`: nas paginas proprias o titulo e o <h1> da pagina.
 */
export default function ExperimentarSemConta({ rede, semCabecalho = false }: { rede?: RedeDemo; semCabecalho?: boolean } = {}) {
  const { t, lang } = useLanguage();
  const { formatUsd } = useCurrencyFormat();
  const [address, setAddress] = useState("");
  const [estado, setEstado] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [consultado, setConsultado] = useState("");
  const [copiado, setCopiado] = useState(false);
  const EXEMPLO = EXEMPLOS[rede ?? "eth"];

  // `daLigacao`: a consulta veio de um link partilhado (?address=…), nao de
  // quem esta a ver. Nesse caso nao conta como "experimentou" no funil nem fica
  // guardada para o registo — o endereco pode ser de outra pessoa, e quem
  // criasse conta a seguir via-o ja preenchido em Carteiras.
  const consultar = async (valor: string, daLigacao = false) => {
    const a = valor.trim();
    if (!a) return;
    // Enganos perigosos ANTES de qualquer pedido: uma frase de recuperacao ou
    // uma chave privada coladas aqui seguiam no URL do pedido para o servidor.
    // Agora nao saem do browser: apaga-se o campo e explica-se.
    const d = detetarRede(a);
    if (d.tipo === "frase" || d.tipo === "chave") {
      setAddress(""); setDados(null); setEstado("error");
      setErro(t(d.tipo === "frase" ? "wl_quick_seed" : "wl_quick_key"));
      return;
    }
    // Formato desconhecido, ou Cardano (a demonstracao nao o le): nem se pergunta.
    if (d.tipo === "desconhecido" || d.rede === "ada") {
      setDados(null); setEstado("error"); setErro(t("lp_try_err_invalid"));
      return;
    }
    setEstado("loading"); setErro(""); setDados(null); setCopiado(false);
    try {
      const r = await fetch(`/api/preview?address=${encodeURIComponent(a)}`);
      const j = (await r.json().catch(() => ({}))) as Resposta & { error?: string };
      if (!r.ok) {
        setErro(r.status === 429 ? t("lp_try_err_rate") : j.error === "invalid" ? t("lp_try_err_invalid") : t("lp_try_err_generic"));
        setEstado("error");
        return;
      }
      setDados(j); setEstado("ok"); setConsultado(a);
      if (!daLigacao) {
        marcarEvento("experimentar");
        // So no browser da pessoa: se criar conta, o endereco aparece ja no campo de Carteiras.
        try { localStorage.setItem("cfa-demo-address", a); } catch { /* sem armazenamento: nao faz mal */ }
      }
    } catch {
      setErro(t("lp_try_err_generic")); setEstado("error");
    }
  };

  // LIGACAO PARTILHAVEL: `?address=0x...` abre ja' com o saldo a' vista.
  //
  // Porque existe (29/09/2026): a demonstracao so' se podia mostrar dizendo
  // "vai ali e cola o teu endereco". A quem pergunta "como vejo o saldo da
  // minha carteira?", isso era mandar um anuncio; com isto e' mandar a resposta
  // ja' dada. E' a diferenca entre convidar e demonstrar, e nao custa nada — o
  // /api/preview ja' e' publico e sem sessao.
  //
  // Le-se o URL do browser em vez do useSearchParams do Next: esse obrigava a
  // envolver a landing inteira num <Suspense>, e este componente ja' e' de
  // cliente. Corre UMA vez (useRef), senao um re-render repetia a consulta.
  const jaAutomatico = useRef(false);
  useEffect(() => {
    if (jaAutomatico.current) return;
    jaAutomatico.current = true;
    let inicial = "";
    try {
      inicial = (new URLSearchParams(window.location.search).get("address") || "").trim();
    } catch { /* sem URL legivel: fica o campo vazio, como antes */ }
    if (!inicial) return;
    setAddress(inicial);
    void consultar(inicial, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ligacao para este resultado (so o endereco publico vai no URL).
  const copiarLigacao = async () => {
    try {
      const u = new URL(window.location.href);
      u.search = ""; u.hash = "";
      u.searchParams.set("address", consultado);
      await navigator.clipboard.writeText(u.toString());
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch { /* sem area de transferencia: nao faz mal */ }
  };

  const fmtQtd = (n: number) => n.toLocaleString(lang === "en" ? "en-GB" : `${lang}-${lang.toUpperCase()}`, { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6 });

  return (
    <section id="experimentar" className={`mx-auto w-full max-w-4xl scroll-mt-24 px-6 ${semCabecalho ? "" : "pt-16"}`}>
      <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/[0.07] to-slate-900/60 p-6 md:p-8">
        {!semCabecalho && (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/90">{t("lp_try_kicker")}</p>
            <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">{t("lp_try_title")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{t("lp_try_desc")}</p>
          </>
        )}

        <form
          className={`${semCabecalho ? "" : "mt-5 "}flex flex-col gap-2 sm:flex-row`}
          onSubmit={(e) => { e.preventDefault(); void consultar(address); }}
        >
          <label htmlFor="try-address" className="sr-only">{t("lp_try_ph")}</label>
          <input
            id="try-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={rede === "btc" ? "bc1…, 1… / 3…" : rede === "sol" ? t("lp_try_ph_sol") : rede === "eth" ? "0x…" : t("lp_try_ph")}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 font-mono text-sm text-slate-100 outline-none transition placeholder:font-sans placeholder:text-slate-500 focus:border-orange-400"
          />
          <button type="submit" disabled={estado === "loading" || !address.trim()} className={`${btnPrimary} px-6 py-3 text-sm`}>
            {estado === "loading" ? t("lp_try_loading") : t("lp_try_btn")}
          </button>
        </form>
        {!semCabecalho && (
          <a href={saldoUrl(lang, "todas")} className="mt-2 mr-4 inline-block text-xs text-slate-400 underline decoration-dotted underline-offset-2 transition hover:text-orange-300">
            {t("lp_try_own_page")}
          </a>
        )}
        <button
          type="button"
          onClick={() => { setAddress(EXEMPLO); void consultar(EXEMPLO); }}
          className="mt-2 text-xs text-slate-400 underline decoration-dotted underline-offset-2 transition hover:text-orange-300"
        >
          {t("lp_try_example")}
        </button>

        {estado === "error" && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{erro}</p>
        )}

        {estado === "ok" && dados && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-5" aria-live="polite">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("lp_try_total")}</p>
                <p className="metric-value mt-1 text-3xl font-black text-white">{formatUsd(dados.totalUsd)}</p>
              </div>
              <p className="text-xs text-slate-400">
                {t("lp_try_networks")}: {dados.networks.map((n) => REDE[n] ?? n).join(" · ")}
                {dados.nftCount != null && <> · {t(dados.kind === "sol" ? "lp_try_nfts_sol" : "lp_try_nfts")}: <span className="font-semibold text-slate-200">{dados.nftCount >= 10_000 ? `${(10_000).toLocaleString(lang === "en" ? "en-GB" : "pt-PT")}+` : dados.nftCount}</span></>}
              </p>
            </div>

            {dados.tokens.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">{t("lp_try_none")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-800/70">
                {dados.tokens.map((l, i) => (
                  <li key={`${l.chain}-${l.symbol}-${i}`} className="flex items-center gap-3 py-2.5">
                    {l.logo
                      ? <img src={l.logo} alt="" className="h-7 w-7 shrink-0 rounded-full bg-slate-800 object-cover" loading="lazy" />
                      : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">{l.symbol.slice(0, 3)}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{l.symbol}</span>
                      <span className="block truncate text-[11px] text-slate-400">{fmtQtd(l.balance)} · {REDE[l.chain] ?? l.chain}</span>
                    </span>
                    <span className="text-sm font-semibold text-slate-100">{formatUsd(l.usdValue)}</span>
                  </li>
                ))}
              </ul>
            )}
            {dados.others > 0 && <p className="mt-2 text-xs text-slate-400">{t("lp_try_tokens_more").replace("{n}", String(dados.others))}</p>}

            <a href={`${pageUrl("login", lang)}?mode=signup&next=%2Fwallets`} className={`${btnPrimary} mt-5 w-full px-6 py-3 text-sm sm:w-auto`}>
              {t("lp_try_cta")}
            </a>
            <button type="button" onClick={() => void copiarLigacao()}
              className="mt-3 block text-xs font-semibold text-orange-300/90 underline decoration-dotted underline-offset-2 transition hover:text-orange-200">
              {copiado ? t("lp_try_link_copied") : t("lp_try_link_copy")}
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{t("lp_try_note")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
