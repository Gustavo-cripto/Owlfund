// Recetor de webhooks do ChainFolioAI — pronto a usar.
//
// O que faz: recebe o POST do ChainFolioAI, VERIFICA a assinatura HMAC-SHA256
// (para garantir que veio mesmo de nós), e reenvia o alerta para o teu bot.
//
// Como correr:
//   1) Vai a Conta → API & MCP → Webhook de alertas, guarda o teu URL e copia o SEGREDO.
//   2) export CHAINFOLIO_WEBHOOK_SECRET="whsec_…"   (o segredo do painel)
//   3) (opcional Telegram) export TELEGRAM_BOT_TOKEN="…"  e  export TELEGRAM_CHAT_ID="…"
//   4) node examples/webhook-receiver.mjs
//   5) Expõe-o publicamente (Render/Railway/Fly, ou local + `cloudflared tunnel`)
//      e mete esse URL público no painel do webhook.
//
// Zero dependências — usa só o Node (http + crypto).

import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = process.env.PORT || 3333;
const SECRET = process.env.CHAINFOLIO_WEBHOOK_SECRET || "";

if (!SECRET) {
  console.error("Falta CHAINFOLIO_WEBHOOK_SECRET (o segredo do painel do webhook).");
  process.exit(1);
}

// Confirma que a assinatura bate certo (protege contra pedidos falsos).
function assinaturaValida(rawBody, header) {
  const esperado = "sha256=" + createHmac("sha256", SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(header || "");
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Onde reenvias o alerta para o teu bot ──────────────────────────────────
// Substitui/adapta isto ao teu bot. Exemplo: Telegram.
async function reenviarParaBot(alerta) {
  const m = alerta.movement || {};
  const texto = `🐋 Movimento de baleia (${m.chain?.toUpperCase()})\n` +
                `${m.label || "carteira"}: ${m.description}\n` +
                `Tipo: ${m.type}`;

  console.log("ALERTA:", texto);

  // ── Exemplo Telegram (descomenta e mete o token + chat id) ──
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    }).catch((e) => console.error("Falha a enviar para o Telegram:", e));
  }

  // ── Para Discord: faz um POST ao webhook do Discord com { content: texto } ──
  // ── Para outro bot: chama aqui a API do teu bot ──
}

const server = createServer((req, res) => {
  if (req.method !== "POST") { res.writeHead(405).end("Só POST"); return; }

  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on("end", async () => {
    if (!assinaturaValida(raw, req.headers["x-chainfolioai-signature"])) {
      res.writeHead(401).end("assinatura inválida");
      return;
    }
    try {
      await reenviarParaBot(JSON.parse(raw));
    } catch (e) {
      console.error("Erro a processar:", e);
    }
    res.writeHead(200).end("ok"); // responde sempre 200 para o ChainFolioAI não reenviar
  });
});

server.listen(PORT, () => console.log(`Recetor de webhooks à escuta na porta ${PORT}`));
