// Vercel Cron (diário 08:00 UTC — ver vercel.json). Ciclo de vida do beta:
//  1) EXPIRA os testers manuais cujo período terminou (voltam ao Free) — antes
//     nada o fazia e o gating ignorava a data.
//  2) Email ao tester a ≤3 dias, oferta de fundador a ≤10 dias, "obrigado" no fim,
//     alerta ao admin (email + Telegram) e inatividade aos 14 dias.
//  Idempotente: cada marco é registado em notification_log (o cron pode correr
//  2× e um dia falhado é apanhado no seguinte). Idioma do tester lido de
//  beta_signups (pt/en; es/fr caem em en).
import { NextResponse } from "next/server";
import { internalError } from "@/lib/api/response";
import { isPremiumPriceId } from "@/lib/payments/priceIds";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import type { Lang } from "@/lib/i18n/translations";
import { langFromMetadata, resolveLang, signupLangByEmail } from "@/lib/user/lang";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { esc, fmtDate, markSent, sendEmail, shell, TZ } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TO = process.env.BETA_SIGNUP_TO ?? "suporte@chainfolioai.com";
const DAY = 86_400_000;
const OFFER_DAY = 10; // dia 50 do trial: oferta de fundador (faltam ≤10 dias)
const TRIAL_DAYS = 60; // tem de bater certo com o TRIAL_DAYS de src/lib/beta/grant.ts
const IDLE_DAYS = 14;  // dias sem entrar a partir dos quais se toca no tester
const APP = '<a href="https://chainfolioai.com/dashboard" style="color:#38bdf8;font-weight:700">chainfolioai.com</a>';
const BOT = '<a href="https://t.me/ChainFolioAiBetaBot" style="color:#38bdf8;font-weight:700">@ChainFolioAiBetaBot</a>';

// Lingua por tester: user_metadata.lang → beta_signups.lang → pt (ver src/lib/user/lang.ts).

const COPY: {
  step1: Record<Lang, (plan: string) => { subject: string; html: string }>;
  idle: Record<Lang, (days: number) => { subject: string; html: string }>;
  d3: Record<Lang, (plan: string, end: string) => { subject: string; html: string }>;
  offer: Record<Lang, (plan: string) => { subject: string; html: string }>;
  ended: Record<Lang, () => { subject: string; html: string }>;
} = {
  // Primeiro passo, no dia seguinte a ativacao. Ate aqui um tester ativado nao
  // recebia absolutamente nada ate ao dia 50, e os dois primeiros entraram uma
  // unica vez, no dia da ativacao, e nunca mais voltaram.
  step1: {
    pt: (plan: string) => ({
      subject: "O teu primeiro passo no ChainFolioAI (2 minutos)",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">O teu ${esc(plan)} está ligado 🎉</p>
        <p>Para o site te servir para alguma coisa precisa de ver o que tens. O primeiro passo é ligar uma carteira, e leva menos de dois minutos:</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">1️⃣ Abre ${APP} → <b>Carteiras</b><br>2️⃣ Cola o <b>endereço público</b> (aquele que dás a quem te envia moedas)<br>3️⃣ Os saldos, os tokens e o histórico aparecem sozinhos</p>
        <p>Só precisamos do endereço público. <b>Nunca pedimos chaves privadas nem seed phrase</b>, e o site é só-leitura: não move fundos nem assina nada.</p>
        <p>Se não tens carteira on-chain, dá para ligar uma corretora por chave de leitura, ou importar um CSV.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">📬 O teu plano inclui um <b>briefing diário</b> por email, com o mercado e o teu portefólio. Está desligado até o ligares: <b>Definições → Briefing</b>.</p>
        <p>Se alguma coisa correr mal, ou se achares que falta qualquer coisa, diz aqui: ${BOT}. É para isso que estás no beta, e lemos tudo.</p>`),
    }),
    en: (plan: string) => ({
      subject: "Your first step in ChainFolioAI (2 minutes)",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Your ${esc(plan)} is live 🎉</p>
        <p>The site can only be useful once it can see what you hold. The first step is connecting a wallet, and it takes under two minutes:</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">1️⃣ Open ${APP} → <b>Wallets</b><br>2️⃣ Paste the <b>public address</b> (the one you give people who send you coins)<br>3️⃣ Balances, tokens and history show up on their own</p>
        <p>We only need the public address. <b>We never ask for private keys or your seed phrase</b>, and the site is read-only: it moves nothing and signs nothing.</p>
        <p>No on-chain wallet? You can connect an exchange with a read-only API key, or import a CSV.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">📬 Your plan includes a <b>daily briefing</b> email with the market and your portfolio. It stays off until you turn it on: <b>Settings → Briefing</b>.</p>
        <p>If anything breaks, or something is missing, tell us here: ${BOT}. That is what the beta is for, and we read everything.</p>`),
    }),
    es: (plan: string) => ({
      subject: "Tu primer paso en ChainFolioAI (2 minutos)",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Tu ${esc(plan)} ya está activo 🎉</p>
        <p>El sitio solo te sirve cuando puede ver lo que tienes. El primer paso es conectar un monedero, y lleva menos de dos minutos:</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">1️⃣ Abre ${APP} → <b>Monederos</b><br>2️⃣ Pega la <b>dirección pública</b> (la que das a quien te envía monedas)<br>3️⃣ Los saldos, los tokens y el historial aparecen solos</p>
        <p>Solo necesitamos la dirección pública. <b>Nunca pedimos claves privadas ni tu frase semilla</b>, y el sitio es de solo lectura: no mueve fondos ni firma nada.</p>
        <p>¿No tienes monedero on-chain? Puedes conectar un exchange con una clave de solo lectura, o importar un CSV.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">📬 Tu plan incluye un <b>briefing diario</b> por correo con el mercado y tu cartera. Está desactivado hasta que lo actives: <b>Ajustes → Briefing</b>.</p>
        <p>Si algo falla, o si echas algo en falta, dilo aquí: ${BOT}. Para eso está la beta, y lo leemos todo.</p>`),
    }),
    fr: (plan: string) => ({
      subject: "Votre première étape sur ChainFolioAI (2 minutes)",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Votre ${esc(plan)} est actif 🎉</p>
        <p>Le site ne sert à rien tant qu'il ne voit pas ce que vous détenez. La première étape est de connecter un portefeuille, en moins de deux minutes :</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">1️⃣ Ouvrez ${APP} → <b>Portefeuilles</b><br>2️⃣ Collez l'<b>adresse publique</b> (celle que vous donnez à qui vous envoie des cryptos)<br>3️⃣ Les soldes, les jetons et l'historique arrivent tout seuls</p>
        <p>Nous n'avons besoin que de l'adresse publique. <b>Nous ne demandons jamais de clés privées ni votre phrase de récupération</b>, et le site est en lecture seule : il ne déplace rien et ne signe rien.</p>
        <p>Pas de portefeuille on-chain ? Vous pouvez connecter une plateforme avec une clé en lecture seule, ou importer un CSV.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">📬 Votre accès inclut un <b>briefing quotidien</b> par email, avec le marché et votre portefeuille. Il reste désactivé tant que vous ne l'activez pas : <b>Paramètres → Briefing</b>.</p>
        <p>Si quelque chose casse, ou s'il manque quelque chose, dites-le ici : ${BOT}. C'est à ça que sert la bêta, et nous lisons tout.</p>`),
    }),
  },
  // Toque ao tester que nao entra ha IDLE_DAYS dias. O alerta que ja existia ia
  // so para o dono no Telegram ("vale a pena um toque pessoal?") e ficava por ai.
  idle: {
    pt: (days: number) => ({
      subject: "Está tudo bem? O teu acesso está à espera",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Não te vemos há ${days} dias 👋</p>
        <p>O teu acesso de tester continua a contar, e seria pena gastá-lo sem o site te ter servido para nada.</p>
        <p>Se ficaste preso em alguma coisa, é a informação mais útil que nos podes dar. Responde a este email ou diz no ${BOT}: o que tentaste fazer e onde é que emperrou.</p>
        <p>E se foi só falta de tempo, o primeiro passo continua a ser o mesmo: ${APP} → <b>Carteiras</b> → colar o endereço público.</p>`),
    }),
    en: (days: number) => ({
      subject: "Everything all right? Your access is waiting",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">We haven't seen you in ${days} days 👋</p>
        <p>Your tester access keeps counting down, and it would be a shame to spend it without the site ever being useful to you.</p>
        <p>If you got stuck on something, that is the single most useful thing you can tell us. Reply to this email or write on ${BOT}: what you tried and where it jammed.</p>
        <p>And if it was just a busy fortnight, the first step is still the same: ${APP} → <b>Wallets</b> → paste the public address.</p>`),
    }),
    es: (days: number) => ({
      subject: "¿Va todo bien? Tu acceso te espera",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">No te vemos desde hace ${days} días 👋</p>
        <p>Tu acceso de tester sigue corriendo, y sería una pena gastarlo sin que el sitio te haya servido para nada.</p>
        <p>Si te atascaste en algo, es lo más útil que nos puedes contar. Responde a este correo o escribe en ${BOT}: qué intentaste y dónde se trabó.</p>
        <p>Y si solo fue falta de tiempo, el primer paso sigue siendo el mismo: ${APP} → <b>Monederos</b> → pegar la dirección pública.</p>`),
    }),
    fr: (days: number) => ({
      subject: "Tout va bien ? Votre accès vous attend",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">On ne vous voit plus depuis ${days} jours 👋</p>
        <p>Votre accès testeur continue de s'écouler, et ce serait dommage de le dépenser sans que le site vous ait servi à quoi que ce soit.</p>
        <p>Si vous avez buté sur quelque chose, c'est l'information la plus utile que vous puissiez nous donner. Répondez à cet email ou écrivez sur ${BOT} : ce que vous avez tenté et où ça a coincé.</p>
        <p>Et si c'était juste le temps qui a manqué, la première étape reste la même : ${APP} → <b>Portefeuilles</b> → coller l'adresse publique.</p>`),
    }),
  },
  d3: {
    pt: (plan: string, end: string) => ({
      subject: "O teu acesso beta ChainFolioAI termina em 3 dias",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Faltam 3 dias de ${plan} 🚀</p>
        <p>O teu período de beta tester termina a <b>${esc(end)}</b>. Depois disso a conta volta ao plano Free — os teus dados ficam todos guardados.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">🙏 <b>Antes de acabar, conta-nos como correu:</b> o que gostaste, o que faltou, o que mudarias. Fala connosco no Telegram: ${BOT}</p>
        <p style="color:#94a3b8;font-size:12px">Como beta tester, tens condições especiais no lançamento. Ficas na lista. 💛</p>`),
    }),
    en: (plan: string, end: string) => ({
      subject: "Your ChainFolioAI beta access ends in 3 days",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">3 days of ${plan} left 🚀</p>
        <p>Your beta tester period ends on <b>${esc(end)}</b>. After that the account goes back to the Free plan — all your data stays saved.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">🙏 <b>Before it ends, tell us how it went:</b> what you liked, what was missing, what you'd change. Talk to us on Telegram: ${BOT}</p>
        <p style="color:#94a3b8;font-size:12px">As a beta tester you get special conditions at launch. You're on the list. 💛</p>`),
    }),
    es: (plan: string, end: string) => ({
      subject: "Tu acceso beta a ChainFolioAI termina en 3 días",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Quedan 3 días de ${plan} 🚀</p>
        <p>Tu periodo de beta tester termina el <b>${esc(end)}</b>. Después la cuenta vuelve al plan Free — todos tus datos se conservan.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">🙏 <b>Antes de que acabe, cuéntanos cómo fue:</b> qué te gustó, qué faltó, qué cambiarías. Habla con nosotros en Telegram: ${BOT}</p>
        <p style="color:#94a3b8;font-size:12px">Como beta tester, tienes condiciones especiales en el lanzamiento. Estás en la lista. 💛</p>`),
    }),
    fr: (plan: string, end: string) => ({
      subject: "Votre accès bêta ChainFolioAI se termine dans 3 jours",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Plus que 3 jours de ${plan} 🚀</p>
        <p>Votre période de bêta-testeur se termine le <b>${esc(end)}</b>. Ensuite le compte repasse au plan Free — toutes vos données sont conservées.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">🙏 <b>Avant la fin, dites-nous comment ça s'est passé :</b> ce que vous avez aimé, ce qui manquait, ce que vous changeriez. Parlez-nous sur Telegram : ${BOT}</p>
        <p style="color:#94a3b8;font-size:12px">En tant que bêta-testeur, vous avez des conditions spéciales au lancement. Vous êtes sur la liste. 💛</p>`),
    }),
  },
  offer: {
    pt: (plan: string) => ({
      subject: "O teu preço de fundador ChainFolioAI está reservado",
      html: shell(`<p style="color:#fff;font-size:17px;font-weight:700">Estás connosco desde o início — isso conta. 🏆</p>
        <p>Faltam cerca de 10 dias para o fim do teu período beta (${plan}). Como <b>fundador</b>, garantimos-te para sempre:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0">
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Premium Fundador</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€19/mês</b> <span style="color:#64748b;text-decoration:line-through">€39</span><br><span style="color:#94a3b8;font-size:13px">ou <b style="color:#fb923c">€190/ano</b> <span style="text-decoration:line-through">€390</span></span></td></tr>
          <tr><td colspan="2" style="height:6px"></td></tr>
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Pro Fundador</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€9,99/mês</b> <span style="color:#64748b;text-decoration:line-through">€14,99</span><br><span style="color:#94a3b8;font-size:13px">ou <b style="color:#fb923c">€99/ano</b> <span style="text-decoration:line-through">€149</span></span></td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px">Preço <b>vitalício</b> enquanto mantiveres a subscrição — mesmo quando os preços subirem. O pagamento só abre no lançamento; até lá não pagas nada.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">👉 <b>Para reservar o teu preço de fundador</b>, responde no Telegram: ${BOT} — e aproveita para nos dizeres o que gostaste e o que faltou (o teu balanço vale ouro 🙏).</p>`),
    }),
    en: (plan: string) => ({
      subject: "Your ChainFolioAI founder price is reserved",
      html: shell(`<p style="color:#fff;font-size:17px;font-weight:700">You've been with us from the start — that counts. 🏆</p>
        <p>About 10 days left of your beta period (${plan}). As a <b>founder</b>, we guarantee you for life:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0">
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Founder Premium</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€19/month</b> <span style="color:#64748b;text-decoration:line-through">€39</span><br><span style="color:#94a3b8;font-size:13px">or <b style="color:#fb923c">€190/year</b> <span style="text-decoration:line-through">€390</span></span></td></tr>
          <tr><td colspan="2" style="height:6px"></td></tr>
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Founder Pro</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€9.99/month</b> <span style="color:#64748b;text-decoration:line-through">€14.99</span><br><span style="color:#94a3b8;font-size:13px">or <b style="color:#fb923c">€99/year</b> <span style="text-decoration:line-through">€149</span></span></td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px"><b>Lifetime</b> price as long as you keep the subscription — even when prices go up. Payments only open at launch; until then you pay nothing.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">👉 <b>To reserve your founder price</b>, reply on Telegram: ${BOT} — and tell us what you liked and what was missing (your feedback is gold 🙏).</p>`),
    }),
    es: (plan: string) => ({
      subject: "Tu precio de fundador en ChainFolioAI está reservado",
      html: shell(`<p style="color:#fff;font-size:17px;font-weight:700">Estás con nosotros desde el principio — eso cuenta. 🏆</p>
        <p>Quedan unos 10 días para el fin de tu periodo beta (${plan}). Como <b>fundador</b>, te garantizamos para siempre:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0">
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Premium Fundador</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">19 €/mes</b> <span style="color:#64748b;text-decoration:line-through">39 €</span><br><span style="color:#94a3b8;font-size:13px">o <b style="color:#fb923c">190 €/año</b> <span style="text-decoration:line-through">390 €</span></span></td></tr>
          <tr><td colspan="2" style="height:6px"></td></tr>
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Pro Fundador</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">9,99 €/mes</b> <span style="color:#64748b;text-decoration:line-through">14,99 €</span><br><span style="color:#94a3b8;font-size:13px">o <b style="color:#fb923c">99 €/año</b> <span style="text-decoration:line-through">149 €</span></span></td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px">Precio <b>vitalicio</b> mientras mantengas la suscripción — incluso cuando suban los precios. El pago solo se abre en el lanzamiento; hasta entonces no pagas nada.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">👉 <b>Para reservar tu precio de fundador</b>, responde en Telegram: ${BOT} — y aprovecha para decirnos qué te gustó y qué faltó (tu balance vale oro 🙏).</p>`),
    }),
    fr: (plan: string) => ({
      subject: "Votre prix fondateur ChainFolioAI est réservé",
      html: shell(`<p style="color:#fff;font-size:17px;font-weight:700">Vous êtes avec nous depuis le début — ça compte. 🏆</p>
        <p>Il reste environ 10 jours à votre période bêta (${plan}). En tant que <b>fondateur</b>, nous vous garantissons à vie :</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0">
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Premium Fondateur</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">19 €/mois</b> <span style="color:#64748b;text-decoration:line-through">39 €</span><br><span style="color:#94a3b8;font-size:13px">ou <b style="color:#fb923c">190 €/an</b> <span style="text-decoration:line-through">390 €</span></span></td></tr>
          <tr><td colspan="2" style="height:6px"></td></tr>
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Pro Fondateur</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">9,99 €/mois</b> <span style="color:#64748b;text-decoration:line-through">14,99 €</span><br><span style="color:#94a3b8;font-size:13px">ou <b style="color:#fb923c">99 €/an</b> <span style="text-decoration:line-through">149 €</span></span></td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px">Prix <b>à vie</b> tant que vous gardez l'abonnement — même quand les prix augmenteront. Le paiement n'ouvre qu'au lancement ; d'ici là vous ne payez rien.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">👉 <b>Pour réserver votre prix fondateur</b>, répondez sur Telegram : ${BOT} — et dites-nous ce que vous avez aimé et ce qui manquait (votre bilan vaut de l'or 🙏).</p>`),
    }),
  },
  ended: {
    pt: () => ({
      subject: "Obrigado por testares o ChainFolioAI",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Os teus 60 dias de beta terminaram — obrigado! 🙏</p>
        <p>A tua conta voltou ao plano <b>Free</b>: os teus dados, carteiras e histórico ficam todos guardados e podes continuar a usar o site.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">📝 <b>Último pedido:</b> um balanço final em 2 minutos — o que valeu a pena, o que faltou? Responde no Telegram: ${BOT}</p>
        <p style="background:#3b271433;border:1px solid #f9731655;border-radius:10px;padding:12px 14px">🏆 O teu <b>preço de fundador</b> fica garantido: <b>Premium €19/mês</b> (em vez de €39) ou <b>Pro €9,99/mês</b> (em vez de €14,99) — e, se preferires anual, <b>€190</b> ou <b>€99</b> (em vez de €390 e €149). Vitalício enquanto fores subscritor. Reserva respondendo no Telegram: ${BOT}. Avisamos-te em primeira mão quando o pagamento abrir.</p>`),
    }),
    en: () => ({
      subject: "Thank you for testing ChainFolioAI",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Your 60 beta days are over — thank you! 🙏</p>
        <p>Your account is back on the <b>Free</b> plan: your data, wallets and history are all kept and you can keep using the site.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">📝 <b>One last ask:</b> a 2-minute final review — what was worth it, what was missing? Reply on Telegram: ${BOT}</p>
        <p style="background:#3b271433;border:1px solid #f9731655;border-radius:10px;padding:12px 14px">🏆 Your <b>founder price</b> is guaranteed: <b>Premium €19/month</b> (instead of €39) or <b>Pro €9.99/month</b> (instead of €14.99) — or, on annual billing, <b>€190</b> and <b>€99</b> (instead of €390 and €149). For life while you subscribe. Reserve it by replying on Telegram: ${BOT}. You'll be the first to know when payments open.</p>`),
    }),
    es: () => ({
      subject: "Gracias por probar ChainFolioAI",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Tus 60 días de beta han terminado — ¡gracias! 🙏</p>
        <p>Tu cuenta ha vuelto al plan <b>Free</b>: tus datos, monederos e historial se conservan y puedes seguir usando el sitio.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">📝 <b>Última petición:</b> un balance final en 2 minutos — ¿qué valió la pena, qué faltó? Responde en Telegram: ${BOT}</p>
        <p style="background:#3b271433;border:1px solid #f9731655;border-radius:10px;padding:12px 14px">🏆 Tu <b>precio de fundador</b> queda garantizado: <b>Premium 19 €/mes</b> (en vez de 39 €) o <b>Pro 9,99 €/mes</b> (en vez de 14,99 €) — y, si prefieres anual, <b>190 €</b> o <b>99 €</b> (en vez de 390 € y 149 €). Vitalicio mientras seas suscriptor. Resérvalo respondiendo en Telegram: ${BOT}. Te avisaremos los primeros cuando se abra el pago.</p>`),
    }),
    fr: () => ({
      subject: "Merci d'avoir testé ChainFolioAI",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Vos 60 jours de bêta sont terminés — merci ! 🙏</p>
        <p>Votre compte est repassé au plan <b>Free</b> : vos données, portefeuilles et historique sont conservés et vous pouvez continuer à utiliser le site.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">📝 <b>Dernière demande :</b> un bilan final en 2 minutes — qu'est-ce qui en valait la peine, qu'est-ce qui manquait ? Répondez sur Telegram : ${BOT}</p>
        <p style="background:#3b271433;border:1px solid #f9731655;border-radius:10px;padding:12px 14px">🏆 Votre <b>prix fondateur</b> est garanti : <b>Premium 19 €/mois</b> (au lieu de 39 €) ou <b>Pro 9,99 €/mois</b> (au lieu de 14,99 €) — et, en annuel, <b>190 €</b> ou <b>99 €</b> (au lieu de 390 € et 149 €). À vie tant que vous êtes abonné. Réservez-le en répondant sur Telegram : ${BOT}. Vous serez les premiers prévenus à l'ouverture des paiements.</p>`),
    }),
  },
};

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();

  // ── 0) Expirar testers manuais cujo período terminou → Free ───────────────
  let expired = 0;
  try {
    const { data } = await admin
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("source", "manual")
      .eq("status", "active")
      .lt("current_period_end", nowIso)
      .select("user_id");
    expired = data?.length ?? 0;
  } catch (e) { console.error("[beta-expiry] expirar", e instanceof Error ? e.message : e); }

  // Mapa id → {email, lastSignIn} numa única listagem (antes: 1 pedido por tester, todos os dias).
  const users = new Map<string, { email: string; lastSignIn: string | null; lastSeen: string | null; lang: Lang | null }>();
  try {
    for (let page = 1; page <= 5; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      for (const u of data.users) users.set(u.id, { email: u.email ?? "", lastSignIn: (u.last_sign_in_at as string | undefined) ?? null, lastSeen: (u.user_metadata?.last_seen_at as string | undefined) ?? null, lang: langFromMetadata(u.user_metadata) });
      if (data.users.length < 1000) break;
    }
  } catch (e) { console.error("[beta-expiry] listUsers", e instanceof Error ? e.message : e); }

  // Lingua de cada tester: a da conta, senao a da inscricao no beta, senao pt.
  const langByEmail = await signupLangByEmail(admin);
  const langOf = (uid: string, email: string): Lang => resolveLang(users.get(uid)?.lang, langByEmail.get(email.toLowerCase()));
  const planOf = (priceId: unknown) => (isPremiumPriceId(priceId) ? "Premium" : "Pro");

  // ── 1a) Primeiro passo: dia seguinte à ativação ───────────────────────────
  // Um tester ativado não recebia NADA até ao dia 50. Os dois primeiros entraram
  // uma única vez, no dia da ativação, e nunca mais voltaram. Como o trial é
  // sempre de TRIAL_DAYS a contar da ativação, quem foi ativado há 1-3 dias tem
  // o fim entre now+(TRIAL-3) e now+(TRIAL-1). A janela é de 3 dias de propósito:
  // se o cron falhar um dia, o seguinte ainda o apanha. markSent garante 1 envio.
  let step1 = 0;
  try {
    const { data: novos } = await admin
      .from("subscriptions")
      .select("user_id, price_id, current_period_end")
      .eq("source", "manual")
      .eq("status", "active")
      .gt("current_period_end", new Date(now.getTime() + (TRIAL_DAYS - 3) * DAY).toISOString())
      .lte("current_period_end", new Date(now.getTime() + (TRIAL_DAYS - 1) * DAY).toISOString());
    for (const s of novos ?? []) {
      const uid = s.user_id as string;
      const em = users.get(uid)?.email ?? "";
      // Se o registo de envios falhar, o recurso NAO pode ser "envia": a janela
      // tem 3 dias e o tester levava o mesmo email 3 vezes. Recurso = so no dia
      // em que faltam exatamente TRIAL_DAYS-1 dias (um envio, no pior caso).
      const faltam = Math.ceil((new Date(s.current_period_end as string).getTime() - now.getTime()) / DAY);
      if (!em || !(await markSent(admin, uid, "welcome_step1", faltam === TRIAL_DAYS - 1))) continue;
      const m = COPY.step1[langOf(uid, em)](planOf(s.price_id));
      if (await sendEmail({ to: em, subject: m.subject, html: m.html, tag: "welcome_step1" })) step1++;
    }
  } catch (e) { console.error("[beta-expiry] primeiro passo", e instanceof Error ? e.message : e); }

  // ── 1) Ativos a terminar nos próximos 11 dias ─────────────────────────────
  const horizon = new Date(now.getTime() + (OFFER_DAY + 1) * DAY);
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("user_id, price_id, current_period_end")
    .eq("source", "manual")
    .eq("status", "active")
    .gt("current_period_end", nowIso)
    .lte("current_period_end", horizon.toISOString());
  if (error) return internalError(error);

  const adminRows: string[] = [];
  const tgLines: string[] = [];
  let testerMails = 0;
  let offers = 0;

  for (const s of subs ?? []) {
    const uid = s.user_id as string;
    const end = s.current_period_end ? new Date(s.current_period_end as string) : null;
    if (!end) continue;
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY);
    const u = users.get(uid);
    const em = u?.email ?? "";
    const plan = planOf(s.price_id);
    const lang = langOf(uid, em);
    const endStr = fmtDate(end, lang, { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

    // Oferta de fundador (≤10 dias, uma vez).
    if (daysLeft <= OFFER_DAY && daysLeft > 3 && em && (await markSent(admin, uid, "founder_offer", daysLeft === OFFER_DAY))) {
      const m = COPY.offer[lang](plan);
      if (await sendEmail({ to: em, subject: m.subject, html: m.html, tag: "founder_offer" })) { offers++; testerMails++; }
      await sendTelegram(`🏆 Oferta de fundador enviada a ${tgEsc(em)} (${plan}, faltam ${daysLeft} dias)\nQuando o tester responder no bot a reservar, confirma aqui:`, {
        inline_keyboard: [[{ text: "🏆 Confirmar fundador", callback_data: `f:${uid}` }]],
      }).catch(() => {});
    }

    // Aviso ao tester (≤3 dias, uma vez) + linha para o admin.
    if (daysLeft <= 3) {
      if (em && (await markSent(admin, uid, "beta_3d", daysLeft === 3))) {
        const m = COPY.d3[lang](plan, endStr);
        if (await sendEmail({ to: em, subject: m.subject, html: m.html, tag: "beta_3d" })) testerMails++;
      }
      const kind = daysLeft <= 1 ? "admin_1d" : "admin_3d";
      if (await markSent(admin, uid, kind, daysLeft === (daysLeft <= 1 ? 1 : 3))) {
        const dl = daysLeft <= 1 ? "1 dia" : `${daysLeft} dias`;
        const warn = daysLeft <= 1 ? "color:#f87171;font-weight:700" : "color:#fbbf24";
        adminRows.push(`<tr><td style="padding:6px 10px;color:#fff">${esc(em || uid)}</td><td style="padding:6px 10px;color:#e2e8f0">${plan}</td><td style="padding:6px 10px;${warn}">${dl}</td><td style="padding:6px 10px;color:#94a3b8">${esc(end.toLocaleString("pt-PT", { timeZone: TZ }))}</td></tr>`);
        tgLines.push(`${daysLeft <= 1 ? "🔴" : "🟡"} ${tgEsc(em || uid)} · ${plan} · faltam ${dl}`);
      }
    }
  }

  if (tgLines.length > 0) {
    await sendTelegram(`⏰ <b>Beta — ${tgLines.length} tester(s) a expirar</b>\n(avisos a 3 e 1 dia)\n\n${tgLines.join("\n")}`).catch(() => {});
    const html = shell(`<p style="color:#fff;font-size:16px;font-weight:700">⏰ ${tgLines.length} tester(s) a expirar em breve</p>
      <p>Avisos a 3 e a 1 dia — tens margem para decidires <b>renovar</b> (estender no Supabase) ou deixar voltar ao Free.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        <tr style="background:#1f2937;color:#94a3b8;text-align:left"><th style="padding:6px 10px">Email</th><th style="padding:6px 10px">Plano</th><th style="padding:6px 10px">Faltam</th><th style="padding:6px 10px">Expira</th></tr>
        ${adminRows.join("")}
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:12px">Estender: <code>UPDATE public.subscriptions SET current_period_end = current_period_end + interval '30 days' WHERE source='manual' AND user_id = (SELECT id FROM auth.users WHERE email='...');</code></p>`, { title: "Beta" });
    await sendEmail({ to: TO, subject: `Beta: ${tgLines.length} tester(s) a expirar (3/1 dia)`, html, unsubscribe: false, tag: "admin_expiry" });
  }

  // ── 2) Fim de beta: terminou nas últimas 48 h (já cancelado acima) → obrigado ──
  let ended = 0;
  try {
    const { data: endedSubs } = await admin
      .from("subscriptions")
      .select("user_id, price_id, current_period_end")
      .eq("source", "manual")
      .in("status", ["canceled", "active"])
      .gt("current_period_end", new Date(now.getTime() - 2 * DAY).toISOString())
      .lte("current_period_end", nowIso);
    for (const sub of endedSubs ?? []) {
      const uid = sub.user_id as string;
      const em = users.get(uid)?.email ?? "";
      if (!em) continue;
      if (!(await markSent(admin, uid, "beta_ended", true))) continue;
      const m = COPY.ended[langOf(uid, em)]();
      if (await sendEmail({ to: em, subject: m.subject, html: m.html, tag: "beta_ended" })) { ended++; testerMails++; }
      await sendTelegram(`🏁 <b>Beta terminou</b>: ${tgEsc(em)} — voltou ao Free; email de balanço final enviado.\nSe reservar o preço de fundador, confirma aqui:`, {
        inline_keyboard: [[{ text: "🏆 Confirmar fundador", callback_data: `f:${uid}` }]],
      }).catch(() => {});
    }
  } catch (e) { console.error("[beta-expiry] fim", e instanceof Error ? e.message : e); }

  // ── 3) Inatividade: ≥14 dias sem login → alerta 1x no Telegram ────────────
  let inactive = 0;
  let idleMails = 0;
  try {
    const { data: allManual } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("source", "manual")
      .eq("status", "active")
      .gt("current_period_end", nowIso);
    const lines: string[] = [];
    for (const sub of allManual ?? []) {
      const uid = sub.user_id as string;
      const u = users.get(uid);
      // "Sem entrar" = sem login E sem uso. O last_sign_in_at do Supabase so muda
      // num login novo: quem fica com a sessao guardada no telemovel e usa a app
      // todos os dias parecia "inativo ha 20 dias". O AppShell grava
      // user_metadata.last_seen_at (no maximo 2x/dia) e e esse que manda.
      const carimbos = [u?.lastSignIn, u?.lastSeen].filter((x): x is string => !!x).map((x) => new Date(x).getTime());
      const last = carimbos.length ? new Date(Math.max(...carimbos)) : null;
      const days = last ? Math.floor((now.getTime() - last.getTime()) / DAY) : null;
      if (days == null || days < IDLE_DAYS) continue;
      // Toque ao PRÓPRIO tester (uma vez). Estava a faltar: o alerta abaixo ia
      // só para o dono, e o ciclo acabava aí porque o toque era manual.
      const em = u?.email ?? "";
      // Recurso = so no 14.o dia exato: com "true", uma falha do registo de
      // envios mandava este email TODOS os dias ate o tester voltar.
      if (em && (await markSent(admin, uid, "idle_tester", days === IDLE_DAYS))) {
        const m = COPY.idle[langOf(uid, em)](days);
        if (await sendEmail({ to: em, subject: m.subject, html: m.html, tag: "idle_tester" })) idleMails++;
      }
      if (await markSent(admin, uid, "inactive_14d", days === IDLE_DAYS)) {
        lines.push(`😴 ${tgEsc(u?.email ?? uid)} — ${days} dias sem entrar`);
        inactive++;
      }
    }
    if (lines.length > 0) {
      await sendTelegram(`⚠️ <b>Testers inativos (≥${IDLE_DAYS}d sem login)</b>\n${lines.join("\n")}\nJá lhes foi por email um toque automático. Um teu, pessoal, vale mais.`).catch(() => {});
    }
  } catch (e) { console.error("[beta-expiry] inatividade", e instanceof Error ? e.message : e); }

  return NextResponse.json({ ok: true, expired, notified: tgLines.length, testerMails, offers, ended, step1, idleMails, inactiveAlerts: inactive, at: nowIso });
}
