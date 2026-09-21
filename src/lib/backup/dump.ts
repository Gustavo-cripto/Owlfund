import { gzipSync } from "zlib";

import type { SupabaseClient } from "@supabase/supabase-js";

// Cópia de segurança da base de dados, feita por nós.
//
// PORQUÊ: o plano gratuito do Supabase não inclui cópias nenhumas. Verificado
// no painel a 20 de setembro de 2026: "Free Plan does not include project
// backups". Não há cópias diárias nem recuperação para um momento anterior.
//
// O que se perde sem isto, por ordem de gravidade:
//   0. `auth.users` — as contas em si: o email e o identificador. Sem elas,
//      tudo o resto fica órfão, porque cada linha aponta para um `user_id` que
//      já não existiria. Não é uma tabela pública, por isso vai por outro
//      caminho (ver `lerContas`), e a palavra-passe não vem — não dá.
//   1. `wallet_config` — é onde vive o HISTÓRICO DE TRANSAÇÕES de cada pessoa,
//      que é o que alimenta o relatório fiscal. É a única coisa no produto que
//      o utilizador não consegue voltar a obter de lado nenhum.
//   2. `portfolio_snapshots` — o histórico de valor, ponto por ponto. Não se
//      reconstrói: são preços de dias que já passaram.
//   3. As subscrições, as inscrições no beta e os fundadores.
//
// O QUE ISTO COBRE E O QUE NÃO COBRE, sem rodeios:
//   ✅ Um erro numa migração, um apagamento acidental, uma tabela corrompida.
//      É o que acontece de facto, e é o que isto resolve.
//   ❌ Perder o projeto Supabase inteiro. A cópia vive no mesmo projeto, por
//      isso ia com ele. Para isso é preciso o plano pago do Supabase ou uma
//      cópia fora de casa, e ambos dependem de uma decisão do dono.
//
// O ficheiro fica num balde PRIVADO: não é servido a ninguém.

export const BUCKET = "backups";

/** Tabelas públicas copiadas, por ordem de importância. As contas vão à parte. */
export const TABELAS = [
  "wallet_config",
  "portfolio_snapshots",
  "subscriptions",
  "profiles",
  "beta_signups",
  "founders",
  "smart_money_watchlist",
  "webhook_config",
  "news_briefing_schedule",
  "crypto_payments",
  "api_keys",
  "chat_usage",
] as const;

/** Lê tudo de uma tabela, paginado (o PostgREST devolve no máximo ~1000 linhas). */
/** A tabela ainda nao existe? (ha SQL do repositorio que nem sempre foi corrido) */
class TabelaAusente extends Error {}

const naoExiste = (e: { code?: string; message?: string }) =>
  e.code === "42P01" || e.code === "PGRST205" ||
  /does not exist|could not find the table/i.test(e.message ?? "");

async function lerTudo(admin: SupabaseClient, tabela: string): Promise<unknown[]> {
  const PAGINA = 1000;
  const linhas: unknown[] = [];
  for (let de = 0; de < 500_000; de += PAGINA) {
    const { data, error } = await admin.from(tabela).select("*").range(de, de + PAGINA - 1);
    if (error && naoExiste(error)) throw new TabelaAusente(tabela);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    linhas.push(...data);
    if (data.length < PAGINA) break;
  }
  return linhas;
}

/**
 * As contas em si vivem em `auth.users`, que NÃO é uma tabela do esquema
 * público: o PostgREST não a serve, por isso o ciclo das TABELAS nunca lhe
 * chega. Sem isto, a cópia guardava o histórico de transações de pessoas que
 * já não existiriam — linhas com um `user_id` que não aponta para ninguém.
 *
 * O que dá para guardar, e o que não dá:
 *   ✅ o email e o identificador. É o par que interessa: com ele as contas
 *      recriam-se e cada `user_id` volta a apontar para a pessoa certa.
 *   ❌ a palavra-passe. A API de administração nunca devolve o resumo
 *      criptográfico, e é bom que não devolva. Numa recuperação, as pessoas
 *      passam pelo "esqueci-me da palavra-passe" uma vez.
 */
async function lerContas(admin: SupabaseClient): Promise<unknown[]> {
  const PAGINA = 200;
  const contas: unknown[] = [];
  for (let pagina = 1; pagina <= 500; pagina += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: PAGINA });
    if (error) throw new Error(`auth.users: ${error.message}`);
    const lote = data?.users ?? [];
    if (lote.length === 0) break;
    for (const u of lote) {
      contas.push({
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        // Por onde entrou (email, github, google...). Sem isto não se sabe se
        // a conta se recria com palavra-passe ou com um fornecedor externo.
        providers: u.app_metadata?.providers ?? (u.app_metadata?.provider ? [u.app_metadata.provider] : []),
        user_metadata: u.user_metadata ?? {},
      });
    }
    if (lote.length < PAGINA) break;
  }
  return contas;
}

export type Resultado = {
  ficheiro: string;
  /** O ficheiro comprimido, para quem chama o enviar por email ou espelhar. */
  gz: Buffer;
  bytes: number;
  contagens: Record<string, number>;
  /** Leituras que falharam a sério. Motivo para avisar. */
  falhas: string[];
  /**
   * Tabelas que ainda não existem na base de dados. NÃO é falha: há SQL no
   * repositório que só é corrido quando a funcionalidade entra (os pagamentos
   * em cripto, por exemplo, estão prontos mas desligados). Ficam registadas
   * para se ver que não foram esquecidas, sem gerar aviso todos os dias.
   */
  ausentes: string[];
  /** Tabelas que encolheram mais de 20% desde a cópia anterior. */
  encolheram: Array<{ tabela: string; antes: number; agora: number }>;
};

/**
 * Faz a cópia e guarda-a no balde privado. Devolve as contagens, para quem
 * chama poder avisar — uma tabela que encolhe de repente é o primeiro sinal de
 * perda de dados, e é o aviso que interessa ter.
 */
export async function correrCopia(admin: SupabaseClient, hoje: string): Promise<Resultado> {
  const conteudo: Record<string, unknown[]> = {};
  const contagens: Record<string, number> = {};
  const falhas: string[] = [];
  const ausentes: string[] = [];

  for (const t of TABELAS) {
    try {
      const linhas = await lerTudo(admin, t);
      conteudo[t] = linhas;
      contagens[t] = linhas.length;
    } catch (e) {
      if (e instanceof TabelaAusente) { ausentes.push(t); continue; }
      falhas.push(t);
      console.error("[backup]", e instanceof Error ? e.message : e);
    }
  }

  // As contas não são uma tabela pública: vão por outro caminho.
  try {
    const contas = await lerContas(admin);
    conteudo["auth.users"] = contas;
    contagens["auth.users"] = contas.length;
  } catch (e) {
    falhas.push("auth.users");
    console.error("[backup]", e instanceof Error ? e.message : e);
  }

  // Comparar com a cópia anterior ANTES de gravar a nova.
  const encolheram = await compararComAnterior(admin, contagens);

  const payload = JSON.stringify({ geradoEm: new Date().toISOString(), contagens, falhas, ausentes, dados: conteudo });
  const gz = gzipSync(Buffer.from(payload, "utf8"), { level: 9 });
  const ficheiro = `${hoje}.json.gz`;

  const { error } = await admin.storage.from(BUCKET).upload(ficheiro, gz, {
    contentType: "application/gzip",
    upsert: true,
  });
  if (error) throw new Error(`upload: ${error.message}`);

  // Guardar as contagens à parte, pequenas, para a comparação do dia seguinte
  // não ter de descarregar e descomprimir a cópia inteira.
  await admin.storage.from(BUCKET).upload(
    `contagens/${hoje}.json`,
    Buffer.from(JSON.stringify(contagens), "utf8"),
    { contentType: "application/json", upsert: true },
  );

  return { ficheiro, gz, bytes: gz.byteLength, contagens, falhas, ausentes, encolheram };
}

/** Uma tabela que encolhe de repente é o primeiro sinal de perda de dados. */
async function compararComAnterior(
  admin: SupabaseClient,
  agora: Record<string, number>,
): Promise<Resultado["encolheram"]> {
  try {
    const { data } = await admin.storage.from(BUCKET).list("contagens", {
      limit: 2, sortBy: { column: "name", order: "desc" },
    });
    const anterior = (data ?? []).find((f) => f.name.endsWith(".json"));
    if (!anterior) return [];
    const { data: blob } = await admin.storage.from(BUCKET).download(`contagens/${anterior.name}`);
    if (!blob) return [];
    const antes = JSON.parse(await blob.text()) as Record<string, number>;
    const saltos: Resultado["encolheram"] = [];
    for (const [t, n] of Object.entries(agora)) {
      const a = antes[t];
      // Só avisa se havia dados e se o que falta é significativo: uma linha a
      // menos é normal (alguém apagou a conta), 20% a menos não é.
      if (typeof a === "number" && a >= 5 && n < a * 0.8) saltos.push({ tabela: t, antes: a, agora: n });
    }
    return saltos;
  } catch (e) {
    console.error("[backup] comparacao indisponivel:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Apaga cópias com mais de `dias`. Sem isto, o balde cresce sem fim. */
export async function podar(admin: SupabaseClient, dias: number): Promise<number> {
  const limite = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  let apagados = 0;
  for (const pasta of ["", "contagens"]) {
    const { data } = await admin.storage.from(BUCKET).list(pasta || undefined, { limit: 1000 });
    const velhos = (data ?? [])
      .filter((f) => /^\d{4}-\d{2}-\d{2}\./.test(f.name) && f.name.slice(0, 10) < limite)
      .map((f) => (pasta ? `${pasta}/${f.name}` : f.name));
    if (velhos.length) {
      await admin.storage.from(BUCKET).remove(velhos);
      apagados += velhos.length;
    }
  }
  return apagados;
}

/**
 * Espelha a cópia num SEGUNDO projeto Supabase.
 *
 * O buraco do que está acima é simples: a cópia vive no mesmo projeto que os
 * dados, por isso se o projeto se perder ela vai com ele. Um segundo projeto
 * gratuito é outra base de dados, e sobrevive a perder a primeira.
 *
 * Só corre se as duas variáveis existirem. Sem elas não faz nada e não se
 * queixa — é uma melhoria opcional, não um requisito.
 *
 * Nota honesta sobre o alcance: sobrevive a perder o PROJETO, não a perder a
 * CONTA do Supabase. Para isso vale a cópia que vai por email.
 */
export async function espelhar(ficheiro: string, gz: Buffer): Promise<"feito" | "sem-configuracao" | "falhou"> {
  const url = process.env.BACKUP_MIRROR_URL;
  const key = process.env.BACKUP_MIRROR_SERVICE_KEY;
  if (!url || !key) return "sem-configuracao";
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const espelho = createClient(url, key, { auth: { persistSession: false } });
    try { await espelho.storage.createBucket(BUCKET, { public: false }); } catch { /* já existe */ }
    const { error } = await espelho.storage.from(BUCKET).upload(ficheiro, gz, {
      contentType: "application/gzip", upsert: true,
    });
    if (error) throw new Error(error.message);
    return "feito";
  } catch (e) {
    console.error("[backup] espelho falhou:", e instanceof Error ? e.message : e);
    return "falhou";
  }
}

/**
 * Manda a cópia por email, como anexo.
 *
 * É a única das três vias que sobrevive a perder a CONTA do Supabase: fica na
 * caixa de correio, fora de casa. Vai para o suporte@, que reencaminha.
 *
 * Tecto de tamanho: acima disto o anexo não passa nos servidores de email, e é
 * melhor dizê-lo do que falhar em silêncio. Hoje a cópia tem dez kilobytes, por
 * isso há muita folga.
 */
const MAX_ANEXO_MB = 10;

export async function enviarPorEmail(
  ficheiro: string,
  gz: Buffer,
  resumo: { linhas: number; contagens: Record<string, number>; ausentes: string[] },
): Promise<"enviado" | "grande-demais" | "desligado" | "falhou"> {
  const para = process.env.BACKUP_EMAIL_TO ?? process.env.BETA_SIGNUP_TO ?? "suporte@chainfolioai.com";
  if (process.env.BACKUP_EMAIL_ENABLED === "false") return "desligado";

  const mb = gz.byteLength / (1024 * 1024);
  const tabelas = Object.entries(resumo.contagens)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `<tr><td style="padding:3px 12px 3px 0;color:#94a3b8">${t}</td><td style="padding:3px 0;color:#e2e8f0;text-align:right">${n}</td></tr>`)
    .join("");

  const corpo = `
    <p style="color:#fff;font-size:16px;font-weight:700;margin:0 0 10px">Cópia de segurança de ${ficheiro.slice(0, 10)}</p>
    <p style="margin:0 0 14px">${resumo.linhas} linhas, ${Math.max(1, Math.round(gz.byteLength / 1024))} kB comprimidos.
    ${mb > MAX_ANEXO_MB ? "<b>O ficheiro é grande demais para ir em anexo</b> — descarrega-o em /api/v1/admin/backups." : "Vai em anexo."}</p>
    <table style="border-collapse:collapse;font-size:13px">${tabelas}</table>
    ${resumo.ausentes.length ? `<p style="margin:14px 0 0;color:#94a3b8;font-size:12px">Tabelas que ainda não existem (normal, o SQL só corre quando a funcionalidade entrar): ${resumo.ausentes.join(", ")}.</p>` : ""}
    <p style="margin:14px 0 0;color:#64748b;font-size:12px">Guarda este email. É a única cópia que fica FORA do Supabase, e por isso a única que sobrevive a perder a conta.</p>`;

  try {
    const { Resend } = await import("resend");
    const key = process.env.RESEND_API_KEY ?? "";
    if (!key) return "falhou";
    const { FROM, REPLY_TO, shell } = await import("@/lib/email");
    const { error } = await new Resend(key).emails.send({
      from: FROM,
      to: para,
      replyTo: REPLY_TO,
      subject: `[backup] ChainFolioAI ${ficheiro.slice(0, 10)} — ${resumo.linhas} linhas`,
      html: shell(corpo),
      ...(mb <= MAX_ANEXO_MB
        ? { attachments: [{ filename: ficheiro, content: gz, contentType: "application/gzip" }] }
        : {}),
    });
    if (error) throw new Error(error.message);
    return mb > MAX_ANEXO_MB ? "grande-demais" : "enviado";
  } catch (e) {
    console.error("[backup] email falhou:", e instanceof Error ? e.message : e);
    return "falhou";
  }
}
