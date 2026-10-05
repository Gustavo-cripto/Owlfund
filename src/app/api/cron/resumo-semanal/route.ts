import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { activeSubscribers } from "@/lib/api/entitlement";
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

  // Utilizadores (email + idioma), paginados.
  const users = new Map<string, { email: string; lang: Lang }>();
  try {
    for (let page = 1; page <= 10; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      for (const u of data.users) if (u.email) users.set(u.id, { email: u.email, lang: resolveLang(langFromMetadata(u.user_metadata)) });
      if (data.users.length < 1000) break;
    }
  } catch (e) {
    console.error("[resumo-semanal] listUsers:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "users unavailable" }, { status: 503 });
  }

  let planos: Map<string, "free" | "pro" | "premium">;
  try { planos = await activeSubscribers(admin, [...users.keys()]); }
  catch (e) {
    console.error("[resumo-semanal] planos:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "subscriptions unavailable" }, { status: 503 });
  }
  const optouts = await loadOptouts(admin);
  const premium = [...users.entries()].filter(([id]) => planos.get(id) === "premium" && !optouts.has(id)).slice(0, MAX_UTILIZADORES);

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
      // Sem fotografia nos últimos 30 dias não há nada de novo a contar.
      if (ultimaRow && Date.now() - new Date(ultimaRow.created_at).getTime() > 30 * 86_400_000) { semDados++; continue; }

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

      if (!(await markSent(admin, userId, `resumo-semanal:${semana}`))) { jaEnviados++; continue; }
      const html = shell(markdownSimplesParaHtml(resumo.markdown), { title: resumo.assunto });
      const ok = await sendEmail({ from: FROM_BRIEFING, to: u.email, subject: resumo.assunto, html, tag: "resumo-semanal", userId, lang: u.lang });
      if (ok) enviados++; else erros.push(mascararEmail(u.email));
    } catch (e) {
      console.error("[resumo-semanal]", mascararEmail(u.email), e instanceof Error ? e.message : e);
      erros.push(mascararEmail(u.email));
    }
  }

  return NextResponse.json({ semana, premium: premium.length, enviados, semDados, jaEnviados, erros });
}
