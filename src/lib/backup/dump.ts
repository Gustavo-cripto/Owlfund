import { gzipSync } from "zlib";

import type { SupabaseClient } from "@supabase/supabase-js";

// Cópia de segurança da base de dados, feita por nós.
//
// PORQUÊ: o plano gratuito do Supabase não inclui cópias nenhumas. Verificado
// no painel a 20 de setembro de 2026: "Free Plan does not include project
// backups". Não há cópias diárias nem recuperação para um momento anterior.
//
// O que se perde sem isto, por ordem de gravidade:
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

/** Tabelas copiadas, por ordem de importância. */
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
async function lerTudo(admin: SupabaseClient, tabela: string): Promise<unknown[]> {
  const PAGINA = 1000;
  const linhas: unknown[] = [];
  for (let de = 0; de < 500_000; de += PAGINA) {
    const { data, error } = await admin.from(tabela).select("*").range(de, de + PAGINA - 1);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    linhas.push(...data);
    if (data.length < PAGINA) break;
  }
  return linhas;
}

export type Resultado = {
  ficheiro: string;
  bytes: number;
  contagens: Record<string, number>;
  falhas: string[];
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

  for (const t of TABELAS) {
    try {
      const linhas = await lerTudo(admin, t);
      conteudo[t] = linhas;
      contagens[t] = linhas.length;
    } catch (e) {
      falhas.push(t);
      console.error("[backup]", e instanceof Error ? e.message : e);
    }
  }

  // Comparar com a cópia anterior ANTES de gravar a nova.
  const encolheram = await compararComAnterior(admin, contagens);

  const payload = JSON.stringify({ geradoEm: new Date().toISOString(), contagens, falhas, dados: conteudo });
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

  return { ficheiro, bytes: gz.byteLength, contagens, falhas, encolheram };
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
