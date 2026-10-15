"use client";

// Miniatura de NFT que, ao toque, abre o detalhe com o contrato na blockchain
// (ou o mint/inscrição/policy, conforme a rede), para copiar e abrir no
// explorador. Antes o toque saltava direto para o OpenSea da Ethereum.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import NftImage from "@/components/NftImage";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { ligacoesNft, type TipoId } from "@/lib/nft/ligacoes";
import type { TranslationKey } from "@/lib/i18n/translations";

type NftDados = { id: string; name?: string; image?: string; tokenUri?: string; tokenAddress?: string; tokenId?: string };

const ROTULO: Record<TipoId, TranslationKey> = { contrato: "nft_contract", mint: "nft_mint", inscricao: "nft_inscription", policy: "nft_policy" };

export default function NftBotao({ nft, rede, className, children }: { nft: NftDados; rede?: string | null; className?: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={className} title={nft.name} aria-label={nft.name || "NFT"}>
        {children}
      </button>
      {aberto && <NftDetalhe nft={nft} rede={rede} onFechar={() => setAberto(false)} />}
    </>
  );
}

function NftDetalhe({ nft, rede, onFechar }: { nft: NftDados; rede?: string | null; onFechar: () => void }) {
  const { t } = useLanguage();
  const l = ligacoesNft(nft, rede);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);
  const copiar = async () => {
    if (!l.id) return;
    try { await navigator.clipboard.writeText(l.id); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sem permissão */ }
  };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="cf-nft-titulo" onClick={onFechar}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
            {(nft.image || nft.tokenUri)
              ? <NftImage src={nft.image} tokenUri={nft.tokenUri} alt={nft.name ?? "NFT"} className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center text-2xl text-slate-600">🖼️</div>}
          </div>
          <div className="min-w-0 flex-1">
            <p id="cf-nft-titulo" className="break-words text-sm font-bold text-white">{nft.name || "NFT"}</p>
            <p className="mt-0.5 text-xs text-slate-400">{t("nft_network")}: {l.rede}</p>
            {l.tokenId && <p className="mt-0.5 break-all text-xs text-slate-400">{t("nft_token_id")}: <span className="font-mono text-slate-300">{l.tokenId}</span></p>}
          </div>
          <button type="button" onClick={onFechar} aria-label={t("nft_close")} className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t(ROTULO[l.tipo])}</p>
          {l.id ? (
            <div className="mt-1 flex items-start gap-2">
              <p className="min-w-0 flex-1 break-all font-mono text-xs text-slate-200">{l.id}</p>
              <button type="button" onClick={copiar} className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white">{copiado ? t("nft_copied") : t("nft_copy")}</button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">—</p>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {l.explorador && (
            <a href={l.explorador} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-xl bg-orange-500 px-3 py-2 text-center text-xs font-semibold text-slate-950 hover:bg-orange-400">{t("nft_view_chain")} ↗</a>
          )}
          {l.mercado && (
            <a href={l.mercado} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-xl border border-slate-700 px-3 py-2 text-center text-xs font-semibold text-slate-200 hover:border-slate-500">{t("nft_view_market")} ↗</a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
