// Bot de administração do Telegram: segredo do webhook, quem pode carregar nos
// botões, leitura do callback_data e classificação das respostas da API
// (transitória vs recusada) e do getWebhookInfo. A 13 set 2026 todos os botões
// passaram a dar 401 sem ninguém saber — isto apanha regressões antes do deploy.
import {
  classificarResposta,
  cliqueAutorizado,
  configAdmin,
  diagnosticarWebhook,
  lerCallback,
  RECENTE_S,
  segredoConfere,
} from "@/lib/notify/telegramRegras";

let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };

// ─── Segredo ────────────────────────────────────────────────────────────────
const S = "a".repeat(64);
ok("segredo certo", segredoConfere(S, S));
ok("sem cabeçalho", !segredoConfere(null, S));
ok("cabeçalho vazio", !segredoConfere("", S));
ok("segredo errado com o mesmo tamanho", !segredoConfere("b".repeat(64), S));
ok("segredo com outro tamanho", !segredoConfere(S + "x", S));
ok("sem segredo configurado recusa sempre", !segredoConfere("", "") && !segredoConfere("x", ""));

// ─── Quem pode carregar ─────────────────────────────────────────────────────
const privado = configAdmin(undefined, " 12345 ");
ok("sem lista: usa o TELEGRAM_CHAT_ID", privado.adminIds.length === 1 && privado.adminIds[0] === "12345" && privado.chatId === "12345");
ok("chat privado: o admin carrega", cliqueAutorizado({ fromId: 12345, chatId: 12345 }, privado));
ok("chat privado: outro utilizador não", !cliqueAutorizado({ fromId: 999, chatId: 12345 }, privado));
ok("sem from.id não", !cliqueAutorizado({ fromId: undefined, chatId: 12345 }, privado));
ok("clique noutro chat não", !cliqueAutorizado({ fromId: 12345, chatId: 777 }, privado));
ok("clique sem mensagem (só from) passa", cliqueAutorizado({ fromId: 12345 }, privado));

const grupo = configAdmin("111, 222,abc,", "-100555");
ok("lista: ignora ids inválidos", grupo.adminIds.join(",") === "111,222");
ok("grupo: admin da lista carrega", cliqueAutorizado({ fromId: 222, chatId: -100555 }, grupo));
ok("grupo: membro fora da lista não", !cliqueAutorizado({ fromId: 333, chatId: -100555 }, grupo));
ok("grupo: o id do grupo não é um utilizador", !cliqueAutorizado({ fromId: -100555, chatId: -100555 }, grupo));
ok("grupo sem lista: ninguém passa (from.id nunca é negativo)", !cliqueAutorizado({ fromId: 111, chatId: -100555 }, configAdmin("", "-100555")));

const nada = configAdmin(undefined, undefined);
ok("sem configuração nenhuma: ninguém", nada.adminIds.length === 0 && !cliqueAutorizado({ fromId: 1, chatId: 1 }, nada));
ok("lista só com lixo: cai no chat", configAdmin("x,y", "42").adminIds.join() === "42");

// ─── callback_data ──────────────────────────────────────────────────────────
const uuid = "123e4567-e89b-12d3-a456-426614174000";
const f = lerCallback(`f:${uuid}`);
ok("f:<uuid> = fundador", f?.tipo === "fundador" && f.userId === uuid);
ok("f: com uuid inválido = null", lerCallback("f:abc") === null && lerCallback(`f:${uuid}x`) === null);
const x = lerCallback("x:ana@ex.pt");
ok("x:<email> = dispensar", x?.tipo === "dispensar" && x.email === "ana@ex.pt");
ok("x: vazio = null", lerCallback("x:") === null);
const g = lerCallback("g:premium:ana@ex.pt");
ok("g:premium:<email> = ativar premium", g?.tipo === "ativar" && g.plano === "premium" && g.email === "ana@ex.pt");
const gp = lerCallback("g:pro:b@c.io");
ok("g:pro:<email> = ativar pro", gp?.tipo === "ativar" && gp.plano === "pro" && gp.email === "b@c.io");
ok("g: com plano desconhecido = null", lerCallback("g:gold:ana@ex.pt") === null);
ok("done = já tratado", lerCallback("done")?.tipo === "feito");
ok("vazio / undefined / lixo = null", lerCallback("") === null && lerCallback(undefined) === null && lerCallback("zzz") === null);

// ─── Respostas da API ───────────────────────────────────────────────────────
ok("ok:true = ok", classificarResposta(200, { ok: true, result: 1 }).tipo === "ok");
ok("sem resposta (timeout/rede) = transitório", classificarResposta(null, null).tipo === "transitorio");
ok("502 em HTML (corpo não JSON) = transitório", classificarResposta(502, null).tipo === "transitorio");
ok("500 com JSON = transitório", classificarResposta(500, { ok: false, error_code: 500, description: "Internal" }).tipo === "transitorio");
ok("429 = transitório", classificarResposta(429, { ok: false, error_code: 429, description: "Too Many Requests" }).tipo === "transitorio");
const r401 = classificarResposta(401, { ok: false, error_code: 401, description: "Unauthorized" });
ok("401 = recusado (token inválido)", r401.tipo === "recusado" && r401.detalhe.includes("Unauthorized"));
ok("404 = recusado", classificarResposta(404, { ok: false, error_code: 404, description: "Not Found" }).tipo === "recusado");
ok("400 = recusado", classificarResposta(400, { ok: false, error_code: 400, description: "Bad Request" }).tipo === "recusado");

// ─── Diagnóstico do getWebhookInfo ──────────────────────────────────────────
const URL = "https://chainfolioai.com/api/telegram-webhook";
const agora = 2_000_000_000;
const bom = { url: URL, allowed_updates: ["callback_query"], pending_update_count: 0 };
ok("tudo bem", (() => { const d = diagnosticarWebhook(bom, agora, URL); return !d.motivo && !d.erroRecente; })());
ok("sem info = não registado", diagnosticarWebhook(undefined, agora, URL).motivo === "webhook não registado");
ok("url vazio = não registado", diagnosticarWebhook({ url: "" }, agora, URL).motivo === "webhook não registado");
ok("url errada", diagnosticarWebhook({ ...bom, url: "https://outro.pt/x" }, agora, URL).motivo.startsWith("webhook aponta para outro endereço"));
ok("sem callback_query", diagnosticarWebhook({ ...bom, allowed_updates: ["message"] }, agora, URL).motivo.includes("allowed_updates"));
ok("401 recente = repara", diagnosticarWebhook({ ...bom, last_error_date: agora - 60, last_error_message: "Wrong response from the webhook: 401 Unauthorized" }, agora, URL).motivo.startsWith("o site recusou"));
const antigo = diagnosticarWebhook({ ...bom, last_error_date: agora - RECENTE_S - 10, last_error_message: "401 Unauthorized" }, agora, URL);
ok("401 antigo = ignora", !antigo.motivo && !antigo.erroRecente);
const timeout = diagnosticarWebhook({ ...bom, last_error_date: agora - 60, last_error_message: "Read timeout expired" }, agora, URL);
ok("timeout recente = transitório, não repara", !timeout.motivo && timeout.erroRecente === "Read timeout expired");
const e5xx = diagnosticarWebhook({ ...bom, last_error_date: agora - 60, last_error_message: "Wrong response from the webhook: 502 Bad Gateway" }, agora, URL);
ok("502 recente = transitório, não repara", !e5xx.motivo && !!e5xx.erroRecente);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
