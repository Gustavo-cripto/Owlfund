#!/usr/bin/env node
// Teste de isolamento entre contas — uma conta NUNCA pode ler nem alterar os
// dados de outra. Obrigatório antes de haver clientes pagantes.
//
// Corre-se À MÃO, com duas contas de TESTE (nunca contas reais de clientes):
//
//   E2E_EMAIL=teste1@… E2E_PASSWORD=… \
//   E2E_EMAIL_2=teste2@… E2E_PASSWORD_2=… \
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave anon, a pública> \
//   node scripts/testar-isolamento.mjs
//
//   node scripts/testar-isolamento.mjs --dry-run   → só lista o que vai testar
//
// O que faz, nos dois sentidos (A contra B e B contra A):
//   1. Tabelas: com a sessão de A (chave anon + RLS, como o browser), tenta LER
//      as linhas de B e fazer um UPDATE sem efeito nelas. Tem de vir 0 linhas.
//      Tenta também INSERIR uma linha em nome de B: tem de ser recusada. Se por
//      azar entrar, é apagada logo a seguir e o teste marca FALHA.
//   2. Ficheiros (bucket avatars): A não pode listar, descarregar nem gravar na
//      pasta de B. Um ficheiro gravado por engano é apagado.
//   3. API do site (rotas que aceitam o token no cabeçalho): a lista de
//      corretoras de A não pode conter nenhuma das de B.
// Nada é apagado nem alterado nos dados existentes de nenhuma das contas.
// Sai com código 1 se houver alguma FALHA.

import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");
const SITE = (process.env.SITE_URL || "https://chainfolioai.com").replace(/\/$/, "");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Tabelas com dados por utilizador e a coluna que diz quem é o dono.
// `inserir` = linha mínima para a tentativa de escrita em nome da outra conta
// (se faltar uma coluna obrigatória, a recusa vem da base e não da política:
// o teste marca "inconclusivo" em vez de OK, para não dar falsa confiança).
export const TABELAS = [
  { nome: "profiles", dono: "id" },
  { nome: "subscriptions", dono: "user_id" },
  { nome: "portfolio_snapshots", dono: "user_id", inserir: { data: { _isolamento: true } } },
  { nome: "wallet_config", dono: "user_id", inserir: { data: { _isolamento: true } } },
  { nome: "cex_keys", dono: "user_id" },
  { nome: "smart_money_watchlist", dono: "user_id" },
  { nome: "chat_usage", dono: "user_id" },
  { nome: "api_keys", dono: "user_id" },
  { nome: "webhook_config", dono: "user_id" },
  { nome: "news_briefing_schedule", dono: "user_id" },
  { nome: "mfa_recovery_codes", dono: "user_id" },
  { nome: "crypto_payments", dono: "user_id" },
  { nome: "founders", dono: "user_id" },
  { nome: "email_optout", dono: "user_id", inserir: {} },
  { nome: "notification_log", dono: "user_id" },
  { nome: "whale_alert_log", dono: "user_id" },
];

const resultados = [];
const marcar = (sentido, alvo, teste, estado, nota = "") => resultados.push({ sentido, alvo, teste, estado, nota });

// 42501 = "insufficient_privilege" (política RLS); PGRST301/401 = sem permissão.
const eRecusaDePolitica = (e) => Boolean(e) && (e.code === "42501" || /row-level security|permission denied/i.test(e.message ?? ""));

async function entrar(email, password) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login falhou para ${email}: ${error?.message ?? "sem sessão"}`);
  return { cliente: c, uid: data.user.id, token: data.session.access_token, email };
}

async function testarTabelas(a, b, sentido) {
  for (const t of TABELAS) {
    // Leitura das linhas da outra conta.
    const ler = await a.cliente.from(t.nome).select("*").eq(t.dono, b.uid).limit(5);
    if (ler.error) marcar(sentido, t.nome, "ler", ler.error.code === "42P01" ? "INCONCLUSIVO" : "OK", `recusado (${ler.error.code ?? ler.error.message})`);
    else marcar(sentido, t.nome, "ler", ler.data.length === 0 ? "OK" : "FALHA", `${ler.data.length} linha(s) de outra conta`);

    // UPDATE sem efeito (o dono fica igual): só conta se devolve linhas.
    const up = await a.cliente.from(t.nome).update({ [t.dono]: b.uid }).eq(t.dono, b.uid).select(t.dono);
    if (up.error) marcar(sentido, t.nome, "alterar", "OK", `recusado (${up.error.code ?? "erro"})`);
    else marcar(sentido, t.nome, "alterar", up.data.length === 0 ? "OK" : "FALHA", `${up.data.length} linha(s) alteráveis`);

    // INSERT em nome da outra conta.
    if (!t.inserir) continue;
    const ins = await a.cliente.from(t.nome).insert({ ...t.inserir, [t.dono]: b.uid }).select(t.dono);
    if (!ins.error) {
      // Apagar SÓ a linha acabada de criar: nas tabelas com `data`, pela marca
      // _isolamento; nas outras a linha não existia antes (senão o insert
      // tinha dado chave duplicada), por isso a do dono é esta.
      let limpar = a.cliente.from(t.nome).delete().eq(t.dono, b.uid);
      if (t.inserir.data) limpar = limpar.eq("data->>_isolamento", "true");
      const { error: eLimpar } = await limpar;
      marcar(sentido, t.nome, "inserir", "FALHA", `linha criada em nome de outra conta — ${eLimpar ? `NÃO apagada (${eLimpar.code}), apagar à mão` : "apagada a seguir"}`);
    } else if (eRecusaDePolitica(ins.error)) marcar(sentido, t.nome, "inserir", "OK", "recusado pela política");
    else marcar(sentido, t.nome, "inserir", "INCONCLUSIVO", `recusado por outro motivo (${ins.error.code ?? ins.error.message})`);
  }
}

async function testarFicheiros(a, b, sentido) {
  const bucket = a.cliente.storage.from("avatars");
  const lista = await bucket.list(b.uid, { limit: 5 });
  marcar(sentido, "avatars", "listar", lista.error || (lista.data ?? []).length === 0 ? "OK" : "INCONCLUSIVO",
    lista.error ? "recusado" : `${(lista.data ?? []).length} ficheiro(s) visíveis (o bucket pode ser público de propósito — ver política)`);

  const caminho = `${b.uid}/isolamento-${Date.now()}.txt`;
  const up = await bucket.upload(caminho, new Blob(["teste de isolamento"]), { contentType: "text/plain" });
  if (up.error) marcar(sentido, "avatars", "gravar", "OK", "recusado");
  else {
    marcar(sentido, "avatars", "gravar", "FALHA", "gravou na pasta de outra conta — apagado a seguir");
    await bucket.remove([caminho]);
  }
}

async function idsCorretoras(conta) {
  const r = await fetch(`${SITE}/api/cex-keys`, { headers: { Authorization: `Bearer ${conta.token}` } });
  if (!r.ok) return { erro: `HTTP ${r.status}` };
  const j = await r.json().catch(() => ({}));
  const lista = Array.isArray(j) ? j : j.keys ?? j.data ?? [];
  return { ids: new Set(lista.map((x) => x.id).filter(Boolean)), texto: JSON.stringify(j) };
}

async function testarApi(a, b) {
  const [ra, rb] = await Promise.all([idsCorretoras(a), idsCorretoras(b)]);
  if (ra.erro || rb.erro) { marcar("A↔B", "/api/cex-keys", "comparar", "INCONCLUSIVO", ra.erro ?? rb.erro); return; }
  const cruzados = [...ra.ids].filter((id) => rb.ids.has(id));
  const fuga = ra.texto.includes(b.uid) || rb.texto.includes(a.uid);
  marcar("A↔B", "/api/cex-keys", "comparar", cruzados.length || fuga ? "FALHA" : "OK",
    `${ra.ids.size} + ${rb.ids.size} corretora(s), ${cruzados.length} em comum${fuga ? ", id da outra conta na resposta" : ""}`);
}

async function main() {
  if (DRY) {
    console.log("Tabelas:", TABELAS.map((t) => `${t.nome}(${t.dono}${t.inserir ? ", +inserir" : ""})`).join(", "));
    console.log("Ficheiros: avatars (listar, gravar)");
    console.log(`API: ${SITE}/api/cex-keys`);
    return;
  }
  const falta = ["E2E_EMAIL", "E2E_PASSWORD", "E2E_EMAIL_2", "E2E_PASSWORD_2"].filter((k) => !process.env[k]);
  if (!URL || !ANON) falta.push("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (falta.length) { console.error("Falta definir:", falta.join(", ")); process.exit(2); }
  if (process.env.E2E_EMAIL === process.env.E2E_EMAIL_2) { console.error("As duas contas têm de ser diferentes."); process.exit(2); }

  const a = await entrar(process.env.E2E_EMAIL, process.env.E2E_PASSWORD);
  const b = await entrar(process.env.E2E_EMAIL_2, process.env.E2E_PASSWORD_2);

  await testarTabelas(a, b, "A→B");
  await testarTabelas(b, a, "B→A");
  await testarFicheiros(a, b, "A→B");
  await testarFicheiros(b, a, "B→A");
  await testarApi(a, b);
  await Promise.all([a.cliente.auth.signOut(), b.cliente.auth.signOut()]);

  console.table(resultados);
  const falhas = resultados.filter((r) => r.estado === "FALHA");
  const inconclusivos = resultados.filter((r) => r.estado === "INCONCLUSIVO");
  console.log(`\n${resultados.length} verificações · ${falhas.length} FALHA · ${inconclusivos.length} inconclusivas`);
  if (falhas.length) { console.error("❌ Há dados de uma conta acessíveis à outra. Não abrir pagamentos até corrigir."); process.exit(1); }
  console.log("✅ Nenhuma conta chega aos dados da outra.");
}

main().catch((e) => { console.error("Erro:", e.message); process.exit(2); });
