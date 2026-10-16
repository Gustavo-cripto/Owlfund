// Email de boas-vindas a quem cria conta (fora do beta: os testers têm os
// emails próprios). Sai no momento do registo (14 out 2026: o dono pediu que o
// cliente o receba logo no email com que se registou) por enviarBoasVindas; o
// cron beta-expiry fica como rede de segurança nos dias 1–3. O notification_log
// (kind welcome_account) garante um único envio, venha de onde vier.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n/translations";
import { mascararEmail, markSent, sendEmail, shell } from "@/lib/email";
import { isOptedOut } from "@/lib/emailOptout";
import { betaAberto } from "@/lib/plans";
import { langFromMetadata, resolveLang } from "@/lib/user/lang";

const APP = '<a href="https://chainfolioai.com/wallets" style="color:#38bdf8;font-weight:700">chainfolioai.com</a>';
const BETA_LINK = (lang: Lang) => `<a href="https://chainfolioai.com/${lang === "pt" ? "" : `${lang}/`}beta" style="color:#38bdf8;font-weight:700">chainfolioai.com/${lang === "pt" ? "" : `${lang}/`}beta</a>`;

const COPY: Record<Lang, (beta: boolean) => { subject: string; html: string }> = {
  pt: (beta: boolean) => ({
    subject: "Bem-vindo ao ChainFolioAI — o primeiro passo (2 minutos)",
    html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">A tua conta está criada 👋</p>
      <p>O site só te serve para alguma coisa quando vê o que tens. O primeiro passo é ligar uma carteira, e leva menos de dois minutos:</p>
      <p style="background:#1f2937;border-radius:10px;padding:12px 14px">1️⃣ Abre ${APP} → <b>Carteiras</b><br>2️⃣ Cola o <b>endereço público</b> (aquele que dás a quem te envia moedas)<br>3️⃣ Os saldos, os tokens e o histórico aparecem sozinhos</p>
      <p>Só precisamos do endereço público. <b>Nunca pedimos chaves privadas nem seed phrase</b>, e o site é só-leitura: não move fundos nem assina nada.</p>
      ${beta ? `<p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">🧪 Estamos em beta: podes ter o <b>Premium grátis durante 60 dias</b>. Inscreve-te com este email em ${BETA_LINK("pt")} e ativamos-to.</p>` : ""}
      <p>Dúvidas ou sugestões? Responde a este email.</p>`),
  }),
  en: (beta: boolean) => ({
    subject: "Welcome to ChainFolioAI — your first step (2 minutes)",
    html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Your account is ready 👋</p>
      <p>The site can only be useful once it can see what you hold. The first step is connecting a wallet, and it takes under two minutes:</p>
      <p style="background:#1f2937;border-radius:10px;padding:12px 14px">1️⃣ Open ${APP} → <b>Wallets</b><br>2️⃣ Paste the <b>public address</b> (the one you give people who send you coins)<br>3️⃣ Balances, tokens and history show up on their own</p>
      <p>We only need the public address. <b>We never ask for private keys or your seed phrase</b>, and the site is read-only: it moves nothing and signs nothing.</p>
      ${beta ? `<p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">🧪 We are in beta: you can get <b>Premium free for 60 days</b>. Sign up with this email at ${BETA_LINK("en")} and we will switch it on.</p>` : ""}
      <p>Questions or ideas? Just reply to this email.</p>`),
  }),
  es: (beta: boolean) => ({
    subject: "Bienvenido a ChainFolioAI — tu primer paso (2 minutos)",
    html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Tu cuenta ya está creada 👋</p>
      <p>El sitio solo te sirve cuando puede ver lo que tienes. El primer paso es conectar un monedero, y lleva menos de dos minutos:</p>
      <p style="background:#1f2937;border-radius:10px;padding:12px 14px">1️⃣ Abre ${APP} → <b>Monederos</b><br>2️⃣ Pega la <b>dirección pública</b> (la que das a quien te envía monedas)<br>3️⃣ Los saldos, los tokens y el historial aparecen solos</p>
      <p>Solo necesitamos la dirección pública. <b>Nunca pedimos claves privadas ni tu frase semilla</b>, y el sitio es de solo lectura: no mueve fondos ni firma nada.</p>
      ${beta ? `<p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">🧪 Estamos en beta: puedes tener el <b>Premium gratis durante 60 días</b>. Apúntate con este correo en ${BETA_LINK("es")} y te lo activamos.</p>` : ""}
      <p>¿Dudas o sugerencias? Responde a este correo.</p>`),
  }),
  fr: (beta: boolean) => ({
    subject: "Bienvenue sur ChainFolioAI — votre première étape (2 minutes)",
    html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Votre compte est créé 👋</p>
      <p>Le site ne sert à rien tant qu'il ne voit pas ce que vous détenez. La première étape est de connecter un portefeuille, en moins de deux minutes :</p>
      <p style="background:#1f2937;border-radius:10px;padding:12px 14px">1️⃣ Ouvrez ${APP} → <b>Portefeuilles</b><br>2️⃣ Collez l'<b>adresse publique</b> (celle que vous donnez à qui vous envoie des cryptos)<br>3️⃣ Les soldes, les jetons et l'historique arrivent tout seuls</p>
      <p>Nous n'avons besoin que de l'adresse publique. <b>Nous ne demandons jamais de clés privées ni votre phrase de récupération</b>, et le site est en lecture seule : il ne déplace rien et ne signe rien.</p>
      ${beta ? `<p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">🧪 Nous sommes en bêta : vous pouvez avoir le <b>Premium gratuit pendant 60 jours</b>. Inscrivez-vous avec cet email sur ${BETA_LINK("fr")} et nous l'activons.</p>` : ""}
      <p>Des questions ou des idées ? Répondez simplement à cet email.</p>`),
  }),
};

export function boasVindas(lang: Lang, beta: boolean): { subject: string; html: string } {
  return COPY[lang](beta);
}

export const KIND_BOAS_VINDAS = "welcome_account";
const JANELA_MS = 3 * 86_400_000;

type Conta = { id: string; email?: string | null; created_at?: string | null; user_metadata?: Record<string, unknown> | null };

/**
 * Envia as boas-vindas a uma conta acabada de criar, uma única vez. Nunca
 * lança: o registo/entrada não pode falhar por causa de um email. Fica de fora
 * quem não tem email (carteira), contas com mais de 3 dias, quem se inscreveu
 * no beta, testers e quem pediu para não receber emails.
 */
export async function enviarBoasVindas(admin: SupabaseClient, conta: Conta | null | undefined): Promise<boolean> {
  // Cada saída fica nos registos da Vercel ("[boas-vindas]"), com o email
  // mascarado: 14 out 2026 não havia forma de saber se tinha saído ou porquê não.
  const email = (conta?.email ?? "").trim();
  const nota = (o: string) => console.info(`[boas-vindas] ${mascararEmail(email)}: ${o}`);
  try {
    if (!conta?.id || !email || !conta.created_at) return false;
    // Contas do teste noturno de registo (e2e/conta-nova.spec.ts): sem email.
    if (/\+e2e[^@]*@/i.test(email)) return false;
    if (Date.now() - Date.parse(conta.created_at) > JANELA_MS) return false;
    const [{ data: beta }, { data: tester }] = await Promise.all([
      admin.from("beta_signups").select("email").ilike("email", email.replace(/[%_\\]/g, "\\$&")).limit(1),
      admin.from("subscriptions").select("user_id").eq("user_id", conta.id).eq("source", "manual").limit(1),
    ]);
    if ((beta ?? []).length) { nota("não enviado (inscrito no beta: recebe os emails do beta)"); return false; }
    if ((tester ?? []).length) { nota("não enviado (tester)"); return false; }
    if (await isOptedOut(admin, conta.id)) { nota("não enviado (pediu para não receber emails)"); return false; }
    // Regista ANTES de enviar (como o cron): dois pedidos ao mesmo tempo não dão dois emails.
    if (!(await markSent(admin, conta.id, KIND_BOAS_VINDAS, false))) { nota("já tinha sido enviado"); return false; }
    const lang = resolveLang(langFromMetadata(conta.user_metadata));
    const m = boasVindas(lang, betaAberto());
    const ok = await sendEmail({ to: email, subject: m.subject, html: m.html, tag: KIND_BOAS_VINDAS, userId: conta.id, lang });
    nota(ok ? `enviado (${lang})` : "FALHOU no envio (ver [email:welcome_account])");
    return ok;
  } catch (e) {
    console.error("[boas-vindas]", e instanceof Error ? e.message : e);
    return false;
  }
}
