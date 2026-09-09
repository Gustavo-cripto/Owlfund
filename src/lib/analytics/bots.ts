// Deteção de rastreadores automáticos pelo User-Agent.
//
// Porquê: o contador de páginas conta TODOS os pedidos. Nos primeiros dias do
// beta o site registou centenas de visitas com zero cliques em qualquer CTA —
// um padrão que não existe em tráfego humano. Sem separar bots de pessoas, as
// estatísticas não servem para decidir nada.
//
// Só marcamos como bot; não bloqueamos nada (crawlers legítimos, como o do
// Google ou os que geram as pré-visualizações de links, são bem-vindos).

const BOT_PATTERNS = [
  // Genéricos (apanham a maioria dos crawlers, que se identificam)
  "bot", "crawler", "spider", "crawling",
  // Motores de busca e IA
  "googlebot", "bingbot", "slurp", "duckduckbot", "baiduspider", "yandex",
  "applebot", "petalbot", "bytespider", "gptbot", "ccbot", "claudebot",
  "anthropic-ai", "perplexitybot", "google-extended", "oai-searchbot",
  // Pré-visualizações de links em redes sociais e mensageiros
  "facebookexternalhit", "twitterbot", "linkedinbot", "slackbot", "discordbot",
  "telegrambot", "whatsapp", "skypeuripreview", "embedly", "pinterest",
  "redditbot", "quora link preview", "vkshare", "tumblr",
  // SEO / monitorização / segurança
  "ahrefs", "semrush", "mj12bot", "dotbot", "dataforseo", "screaming frog",
  "pingdom", "uptimerobot", "statuscake", "site24x7", "newrelic", "datadog",
  "lighthouse", "pagespeed", "gtmetrix", "censys", "shodan", "expanse",
  // Clientes automáticos (scripts, não navegadores)
  "python-requests", "python-urllib", "curl/", "wget", "libwww-perl", "httpclient",
  "go-http-client", "java/", "okhttp", "axios/", "node-fetch", "got/", "scrapy",
  "headlesschrome", "phantomjs", "puppeteer", "playwright", "selenium",
];

/**
 * True quando o User-Agent é (ou parece) um agente automático.
 * Um UA vazio também conta como bot: qualquer navegador real envia um.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim().toLowerCase();
  if (ua.length === 0) return true;
  return BOT_PATTERNS.some((p) => ua.includes(p));
}
