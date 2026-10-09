// Feeds RSS de notícias (auditoria 8 out 2026, mercado-03/12). Antes viviam em
// src/app/api/news/route.ts e o briefing de notícias recebia os itens do browser,
// sem os confirmar. Agora a lista de notícias, a análise IA e o email do
// contexto macro leem TODOS daqui, do lado do servidor.
//
// O parse é puro (parseRss, testado em scripts/testes/promptsMercado.test.ts);
// o fetch tem teto de 6 s por feed: um feed pendurado já não segura a lista.

export type NewsItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category?: string;
  image?: string;
};

/** "cripto" = notícias de cripto; "macro" = economia e mercados tradicionais. */
export type TipoFeed = "cripto" | "macro";

// A Reuters (feeds.reuters.com) acabou com os RSS públicos em 2020: o feed não
// trazia nada e o prompt dizia na mesma "fontes: … Reuters". Trocada pela BBC
// Business e pela CNBC (economia), que publicam RSS abertos.
export const FEEDS: ReadonlyArray<{ url: string; source: string; tipo: TipoFeed }> = [
  { url: "https://feeds.feedburner.com/CoinDesk", source: "CoinDesk", tipo: "cripto" },
  { url: "https://cointelegraph.com/rss", source: "CoinTelegraph", tipo: "cripto" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC Business", tipo: "macro" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC Economy", tipo: "macro" },
];

const TIMEOUT_FEED_MS = 6000;
const MAX_POR_FEED = 8;

const extractCdata = (str: string) =>
  str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();

const extractTag = (xml: string, tag: string) => {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return extractCdata(xml.match(re)?.[1] ?? "");
};

const extractAttr = (xml: string, tag: string, attr: string) => {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, "i");
  return xml.match(re)?.[1] ?? "";
};

/** Itens de um XML RSS (puro). Títulos a 300 caracteres, descrições a 180, só http(s). */
export function parseRss(xml: string, source: string, max = MAX_POR_FEED): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null && items.length < max) {
    const block = match[1];
    const title = extractTag(block, "title").replace(/<[^>]+>/g, "").slice(0, 300);
    const link = extractTag(block, "link") || extractAttr(block, "link", "href");
    const description = extractTag(block, "description")
      .replace(/<[^>]+>/g, "")
      .slice(0, 180);
    const pubDate = extractTag(block, "pubDate");
    const image =
      extractAttr(block, "media:content", "url") ||
      extractAttr(block, "media:thumbnail", "url") ||
      extractAttr(block, "enclosure", "url") ||
      "";
    const category = extractTag(block, "category").slice(0, 60);
    if (title && /^https?:\/\//i.test(link)) {
      items.push({ title, link, description, pubDate, source, image: /^https?:\/\//i.test(image) ? image : "", category });
    }
  }
  return items;
}

/** Um feed; [] em erro, em resposta não-OK ou ao fim de 6 s. Nunca lança. */
export async function parseFeed(url: string, source: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ChainFolioAI/1.0)" },
      signal: AbortSignal.timeout(TIMEOUT_FEED_MS),
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return parseRss(await res.text(), source);
  } catch {
    return [];
  }
}

const quando = (it: NewsItem) => {
  const t = it.pubDate ? new Date(it.pubDate).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

/** Notícias de todos os feeds (ou só de um tipo), das mais recentes para as mais antigas. */
export async function lerNoticias(opts: { tipo?: TipoFeed; max?: number } = {}): Promise<NewsItem[]> {
  const feeds = FEEDS.filter((f) => !opts.tipo || f.tipo === opts.tipo);
  const resultados = await Promise.allSettled(feeds.map((f) => parseFeed(f.url, f.source)));
  const todos: NewsItem[] = [];
  for (const r of resultados) if (r.status === "fulfilled") todos.push(...r.value);
  todos.sort((a, b) => quando(b) - quando(a));
  return todos.slice(0, opts.max ?? 20);
}
