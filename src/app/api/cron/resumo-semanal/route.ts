import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isPremiumPriceId } from "@/lib/payments/priceIds";
import { loadOptouts } from "@/lib/emailOptout";
import { langFromMetadata, resolveLang } from "@/lib/user/lang";
import { FROM_BRIEFING, markSent, mascararEmail, sendEmail, shell } from "@/lib/email";
import { lerFotografias } from "@/lib/ai/historicoPortefolio";
import { getScore } from "@/lib/api/insights";
import { precoOkx } from "@/lib/market/okxSpot";
import { construirResumoSemanal, markdownSimplesParaHtml, semanaIso, type Lang } from "@/lib/ai/resumoSemanal";
import type { PosicaoDefi } from "@/lib/defi/posicoes";

// Resumo semanal do Block por email (Premium), segunda-feira de manhã: variação
// da semana/mês, máximo/mínimo, pontuação, posições DeFi fora do intervalo e
// concentração. Texto determinístico (src/lib/ai/resumoSemanal.ts), sem IA —
// corre em segundos e não depende dos tetos dos fornecedores. Um envio por
// utilizador e semana (notification_log), opt-out respeitado, link de
// cancelamento assinado em cada email.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_UTILIZADORES = 150;
const PARES_EUR: Array<["btc" | "eth" | "sol" | "ada", string, string]> = [["btc", "BTC-EUR", "BTC"], ["eth", "ETH-EUR", "ETH"], ["sol", "SOL-EUR", "SOL"], ["ada", "ADA-EUR", "ADA"]];

type Ultima = {
  _account?: string; _totalEur?: number;
  btc?: Array<{ balance?: string }>; eth?: Array<{ balance?: string }>; sol?: Array<{ balance?: string }>; ada?: Array<{ balance?: string }>;
  defiPosicoes?: Record<string, PosicaoDefi[]>;
};

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(process.env.RESEND_API_KEY ?? "").trim()) return NextResponse.json({ error: "RESEND_API_KEY em falta" }, { status: 503 });

  const admin = getSupabaseAdmin();
  const semana = semanaIso();

  // Premium ativos lidos DIRETAMENTE de `subscriptions` (sem listar todos os
  // utilizadores nem meter milhares de ids num .in()); o email e o idioma vêm
  // depois, um a um, só para esses.
  const premiumIds = new Set<string>();
  try {
    const { data, error } = await admin
      .from("subscriptions").select("user_id, price_id")
      .in("status", ["active", "trialing"])
      .or(`current_period_end.is.null,current_period_end.gt.${new Date().toISOString()}`);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ user_id: string; price_id: string | null }>) if (isPremiumPriceId(r.price_id)) premiumIds.add(r.user_id);
  } catch (e) {
    console.error("[resumo-semanal] subscriptions:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "subscriptions unavailable" }, { status: 503 });
  }
  const optouts = await loadOptouts(admin);
  const premium: Array<[string, { email: string; lang: Lang }]> = [];
  for (const id of [...premiumIds].filter((id) => !optouts.has(id)).slice(0, MAX_UTILIZADORES)) {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      const u = data.user;
      if (u?.email) premium.push([id, { email: u.email, lang: resolveLang(langFromMetadata(u.user_metadata)) }]);
    } catch (e) { console.error("[resumo-semanal] getUserById:", e instanceof Error ? e.message : e); }
  }

  // Preços em EUR uma vez (para a concentração por ativo).
  const precosEur: Record<string, number> = {};
  await Promise.all(PARES_EUR.map(async ([, par, sym]) => { const p = await precoOkx(par); if (p) precosEur[sym] = p; }));

  let enviados = 0, semDados = 0, jaEnviados = 0;
  const erros: string[] = [];
  for (const [userId, u] of premium) {
    try {
      const { data: ultimaRow } = await admin
        .from("portfolio_snapshots").select("created_at, data").eq("user_id", userId)
        .not("data->_totalEur", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const ultima = (ultimaRow?.data ?? null) as Ultima | null;
      if (!ultima) { semDados++; continue; }
      // Sem fotografia AO VIVO nos últimos 30 dias não há nada de novo a contar.
      // O cron diário copia a última fotografia todas as noites (sem `_bench`),
      // por isso a data da mais recente não diz nada; a que tem `_bench` foi
      // gravada pela página, com a pessoa lá.
      const { data: ultimaViva } = await admin
        .from("portfolio_snapshots").select("created_at").eq("user_id", userId)
        .not("data->_bench", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const dataViva = ultimaViva?.created_at ?? ultimaRow?.created_at;
      if (dataViva && Date.now() - new Date(dataViva).getTime() > 30 * 86_400_000) { semDados++; continue; }

      const accountId = typeof ultima._account === "string" ? ultima._account : "";
      const [rows, score] = await Promise.all([lerFotografias(userId, "premium"), getScore(userId).catch(() => null)]);

      const concentracao: Record<string, number> = {};
      const total = typeof ultima._totalEur === "number" ? ultima._totalEur : 0;
      if (total > 0) {
        for (const [campo, , sym] of PARES_EUR) {
          const qtd = (ultima[campo] ?? []).reduce((s, e) => s + (parseFloat(e.balance ?? "0") || 0), 0);
          if (qtd > 0 && precosEur[sym]) concentracao[sym] = (qtd * precosEur[sym] / total) * 100;
        }
      }
      const defi = Object.values(ultima.defiPosicoes ?? {}).flat().map((p) => ({
        nome: p.protocolo ?? p.name, par: p.par, estado: p.estado, noIntervalo: p.noIntervalo, fatorSaude: p.fatorSaude, usd: p.usd,
      }));

      const resumo = construirResumoSemanal({
        rows, accountId, lang: u.lang,
        score: score && score.score != null ? { valor: score.score, em: score.asOf } : null,
        defi, concentracao,
      });
      if (!resumo.temConteudo) { semDados++; continue; }

      const marca = `resumo-semanal:${semana}`;
      if (!(await markSent(admin, userId, marca))) { jaEnviados++; continue; }
      const html = shell(markdownSimplesParaHtml(resumo.markdown), { title: resumo.assunto });
      const ok = await sendEmail({ from: FROM_BRIEFING, to: u.email, subject: resumo.assunto, html, tag: "resumo-semanal", userId, lang: u.lang });
      if (ok) enviados++;
      else {
        // Envio falhado: liberta a marca para a execução seguinte voltar a tentar.
        erros.push(mascararEmail(u.email));
        try { await admin.from("notification_log").delete().match({ user_id: userId, kind: marca }); } catch { /* fica marcado; melhor um email a menos do que dois */ }
      }
    } catch (e) {
      console.error("[resumo-semanal]", mascararEmail(u.email), e instanceof Error ? e.message : e);
      erros.push(mascararEmail(u.email));
    }
  }

  return NextResponse.json({ semana, premium: premium.length, enviados, semDados, jaEnviados, erros });
}
