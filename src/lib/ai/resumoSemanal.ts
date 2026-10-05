// Resumo semanal do Block por email (Premium): o que mudou no portefólio na
// semana, sem IA — texto determinístico em 4 línguas a partir das fotografias
// guardadas, da pontuação e da última fotografia (posições DeFi, concentração).
// Puro, para ser testado (scripts/testes/resumoSemanal.test.ts); quem lê a
// base de dados e envia é src/app/api/cron/resumo-semanal/route.ts.

import { PERIODOS_ALARGADOS, variacoes, type Ponto, type SnapRow } from "@/lib/api/pnlMath";
import { serieDaConta } from "@/lib/ai/historicoTexto";

export type Lang = "pt" | "en" | "es" | "fr";

export type EntradaResumo = {
  rows: SnapRow[];
  accountId: string;
  lang: Lang;
  agora?: number;
  score?: { valor: number; em: string | null } | null;
  /** Posições DeFi da última fotografia (só o que interessa ao aviso). */
  defi?: Array<{ nome: string; par?: string[]; estado?: string; noIntervalo?: boolean | null; fatorSaude?: number | null; usd: number }>;
  /** Peso de cada ativo no total, em % (ex.: { BTC: 62 }). */
  concentracao?: Record<string, number>;
};

export type ResumoSemanal = { assunto: string; markdown: string; temConteudo: boolean };

const T: Record<Lang, Record<string, string>> = {
  pt: {
    assunto: "O teu resumo semanal do Block",
    titulo: "Resumo semanal do portefólio",
    intro: "Olá! Aqui vai o que mudou na tua carteira esta semana, com base nas fotografias guardadas pela plataforma.",
    valor: "Valor atual",
    semana: "Na última semana",
    mes: "Nos últimos 30 dias",
    inicio: "Desde a primeira fotografia",
    semDados: "Ainda não há fotografias suficientes desta conta para calcular a variação. Abre o Portefólio uma vez por semana: a plataforma guarda uma fotografia por dia a partir daí.",
    maxmin: "Máximo e mínimo registados",
    pontuacao: "Pontuação do portefólio",
    alertas: "A verificar",
    fora: "fora do intervalo de preço (deixou de gerar taxas)",
    saude: "fator de saúde",
    conc: "do portefólio num só ativo",
    semAlertas: "Nenhum alerta: sem posições fora do intervalo nem concentração acima de metade do portefólio.",
    fecho: "Para o detalhe, pergunta ao Block em /gestor: ele tem acesso a tudo isto.",
    nota: "Este resumo descreve; não recomenda comprar nem vender. As fotografias automáticas repetem o último valor conhecido se não abrires o Portefólio.",
    em: "em",
  },
  en: {
    assunto: "Your weekly summary from Block",
    titulo: "Weekly portfolio summary",
    intro: "Hi! Here is what changed in your portfolio this week, based on the snapshots the platform saved.",
    valor: "Current value",
    semana: "Over the last week",
    mes: "Over the last 30 days",
    inicio: "Since the first snapshot",
    semDados: "There are not enough snapshots of this account yet to compute a change. Open the Portfolio once a week: the platform then saves one snapshot per day.",
    maxmin: "Highest and lowest recorded",
    pontuacao: "Portfolio score",
    alertas: "Worth checking",
    fora: "out of its price range (no longer earning fees)",
    saude: "health factor",
    conc: "of the portfolio in a single asset",
    semAlertas: "No alerts: no positions out of range and no asset above half of the portfolio.",
    fecho: "For details, ask Block at /gestor: it has access to all of this.",
    nota: "This summary describes; it does not recommend buying or selling. Automatic snapshots repeat the last known value if you do not open the Portfolio.",
    em: "on",
  },
  es: {
    assunto: "Tu resumen semanal de Block",
    titulo: "Resumen semanal de la cartera",
    intro: "¡Hola! Esto es lo que cambió en tu cartera esta semana, según las instantáneas guardadas por la plataforma.",
    valor: "Valor actual",
    semana: "En la última semana",
    mes: "En los últimos 30 días",
    inicio: "Desde la primera instantánea",
    semDados: "Todavía no hay instantáneas suficientes de esta cuenta para calcular la variación. Abre la Cartera una vez por semana: a partir de ahí la plataforma guarda una instantánea al día.",
    maxmin: "Máximo y mínimo registrados",
    pontuacao: "Puntuación de la cartera",
    alertas: "A revisar",
    fora: "fuera del rango de precio (ya no genera comisiones)",
    saude: "factor de salud",
    conc: "de la cartera en un solo activo",
    semAlertas: "Sin alertas: no hay posiciones fuera de rango ni activos por encima de la mitad de la cartera.",
    fecho: "Para el detalle, pregunta a Block en /gestor: tiene acceso a todo esto.",
    nota: "Este resumen describe; no recomienda comprar ni vender. Las instantáneas automáticas repiten el último valor conocido si no abres la Cartera.",
    em: "el",
  },
  fr: {
    assunto: "Votre résumé hebdomadaire par Block",
    titulo: "Résumé hebdomadaire du portefeuille",
    intro: "Bonjour ! Voici ce qui a changé dans votre portefeuille cette semaine, d'après les instantanés enregistrés par la plateforme.",
    valor: "Valeur actuelle",
    semana: "Sur la dernière semaine",
    mes: "Sur les 30 derniers jours",
    inicio: "Depuis le premier instantané",
    semDados: "Il n'y a pas encore assez d'instantanés de ce compte pour calculer la variation. Ouvrez le Portefeuille une fois par semaine : la plateforme enregistre ensuite un instantané par jour.",
    maxmin: "Maximum et minimum enregistrés",
    pontuacao: "Score du portefeuille",
    alertas: "À vérifier",
    fora: "hors de sa fourchette de prix (ne génère plus de frais)",
    saude: "facteur de santé",
    conc: "du portefeuille sur un seul actif",
    semAlertas: "Aucune alerte : pas de position hors fourchette ni d'actif au-dessus de la moitié du portefeuille.",
    fecho: "Pour le détail, demandez à Block sur /gestor : il a accès à tout cela.",
    nota: "Ce résumé décrit ; il ne recommande ni d'acheter ni de vendre. Les instantanés automatiques répètent la dernière valeur connue si vous n'ouvrez pas le Portefeuille.",
    em: "le",
  },
};

const LOCALE: Record<Lang, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };

export function construirResumoSemanal(e: EntradaResumo): ResumoSemanal {
  const t = T[e.lang] ?? T.pt;
  const loc = LOCALE[e.lang] ?? "pt-PT";
  const agora = e.agora ?? Date.now();
  const eur = (v: number) => `€ ${v.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sinal = (v: number) => (v >= 0 ? "+" : "−") + eur(Math.abs(v));
  const pct = (v: number | null) => (v == null ? "" : ` (${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString(loc, { maximumFractionDigits: 1 })} %)`);
  const data = (iso: string) => new Date(iso).toLocaleDateString(loc);

  const serie: Ponto[] = serieDaConta(e.rows, e.accountId, { agora });
  const linhas: string[] = [`# ${t.titulo}`, "", t.intro, ""];
  let temConteudo = false;

  if (serie.length >= 2) {
    temConteudo = true;
    const ultimo = serie[serie.length - 1];
    linhas.push(`**${t.valor}:** ${eur(ultimo.total)} (${data(ultimo.iso)})`, "");
    const v = variacoes(serie, agora, PERIODOS_ALARGADOS);
    const get = (p: string) => v.find((x) => x.period === p);
    const linha = (rotulo: string, c?: { eur: number | null; pct: number | null }) =>
      c && c.eur != null ? `- **${rotulo}:** ${sinal(c.eur)}${pct(c.pct)}` : null;
    for (const l of [linha(t.semana, get("7d")), linha(t.mes, get("30d")), linha(t.inicio, get("all"))]) if (l) linhas.push(l);
    const max = serie.reduce((a, b) => (b.total > a.total ? b : a));
    const min = serie.reduce((a, b) => (b.total < a.total ? b : a));
    linhas.push(`- **${t.maxmin}:** ${eur(max.total)} ${t.em} ${data(max.iso)} · ${eur(min.total)} ${t.em} ${data(min.iso)}`);
  } else {
    linhas.push(t.semDados);
  }

  if (e.score && Number.isFinite(e.score.valor)) {
    temConteudo = true;
    linhas.push(`- **${t.pontuacao}:** ${Math.round(e.score.valor)}/100${e.score.em ? ` (${data(e.score.em)})` : ""}`);
  }

  const alertas: string[] = [];
  for (const p of e.defi ?? []) {
    if (p.estado === "fechada") continue;
    const nome = `${p.nome}${p.par?.length ? ` ${p.par.join("/")}` : ""}`;
    if (p.noIntervalo === false) alertas.push(`${nome}: ${t.fora}`);
    if (p.fatorSaude != null && p.fatorSaude > 0 && p.fatorSaude < 1.3) alertas.push(`${nome}: ${t.saude} ${p.fatorSaude.toLocaleString(loc, { maximumFractionDigits: 2 })}`);
  }
  for (const [sym, peso] of Object.entries(e.concentracao ?? {})) {
    if (peso >= 50) alertas.push(`${Math.round(peso)} % ${t.conc} (${sym})`);
  }
  linhas.push("", `## ${t.alertas}`);
  if (alertas.length) { temConteudo = true; for (const a of alertas) linhas.push(`- ${a}`); }
  else linhas.push(t.semAlertas);

  linhas.push("", t.fecho, "", `_${t.nota}_`);
  return { assunto: t.assunto, markdown: linhas.join("\n"), temConteudo };
}

const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Markdown simples (títulos, negrito, itálico, listas) → HTML escapado para o email. */
export function markdownSimplesParaHtml(md: string): string {
  const inline = (s: string) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong style=\"color:#fff\">$1</strong>")
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1<em style=\"color:#94a3b8\">$2</em>");
  const out: string[] = [];
  let lista: string[] = [];
  const fechaLista = () => { if (lista.length) { out.push(`<ul style="margin:8px 0 12px 18px;padding:0">${lista.join("")}</ul>`); lista = []; } };
  for (const linha of md.split("\n")) {
    const l = linha.trimEnd();
    if (/^- /.test(l)) { lista.push(`<li style="margin:4px 0">${inline(l.slice(2))}</li>`); continue; }
    fechaLista();
    if (/^# /.test(l)) out.push(`<h1 style="font-size:20px;color:#fff;margin:0 0 12px">${inline(l.slice(2))}</h1>`);
    else if (/^## /.test(l)) out.push(`<h2 style="font-size:15px;color:#fb923c;margin:18px 0 6px">${inline(l.slice(3))}</h2>`);
    else if (l) out.push(`<p style="margin:0 0 10px">${inline(l)}</p>`);
  }
  fechaLista();
  return out.join("\n");
}

/** Semana ISO ("2026-W41") para a idempotência do envio. */
export function semanaIso(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dia = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((x.getTime() - inicioAno.getTime()) / 86_400_000) + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}
