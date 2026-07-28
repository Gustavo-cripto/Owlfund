import { NextRequest, NextResponse } from "next/server";
import { generateAiText, hasAnyAiProvider } from "@/lib/ai/groq";

export const runtime = "nodejs";
export const maxDuration = 30;

type NewsItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category?: string;
  image?: string;
};

const FEEDS = [
  { url: "https://feeds.feedburner.com/CoinDesk", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "CoinTelegraph" },
  { url: "https://feeds.reuters.com/reuters/businessNews", source: "Reuters" },
];

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

async function parseFeed(url: string, source: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ChainFolioAI/1.0)" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractAttr(block, "link", "href");
    const description = extractTag(block, "description")
      .replace(/<[^>]+>/g, "")
      .slice(0, 180);
    const pubDate = extractTag(block, "pubDate");
    const image =
      extractAttr(block, "media:content", "url") ||
      extractAttr(block, "enclosure", "url") ||
      "";
    const category = extractTag(block, "category");

    if (title && link) {
      items.push({ title, link, description, pubDate, source, image, category });
    }
  }
  return items;
}

// ── Tradução dos títulos/descrições para a língua da conta (via Groq, grátis) ──
const LANG_NAMES: Record<string, string> = {
  pt: "European Portuguese",
  es: "Spanish",
  fr: "French",
};

// Cache por língua (assinatura dos links → traduções), TTL curto.
const transCache = new Map<string, { sig: string; at: number; items: NewsItem[] }>();
const TRANS_TTL = 10 * 60 * 1000;

async function translateItems(items: NewsItem[], lang: string): Promise<NewsItem[]> {
  const target = LANG_NAMES[lang];
  if (!target || !hasAnyAiProvider() || items.length === 0) return items;

  const sig = items.map((i) => i.link).join("|");
  const cached = transCache.get(lang);
  if (cached && cached.sig === sig && Date.now() - cached.at < TRANS_TTL) return cached.items;

  try {
    const payload = items.map((it, i) => ({ i, title: it.title, description: it.description }));
    const prompt =
      `Translate the "title" and "description" of each crypto/finance news item to ${target}. ` +
      `Keep it faithful and natural; keep proper nouns, tickers and numbers unchanged; do not add commentary. ` +
      `Return ONLY a valid JSON array of {"i": number, "title": string, "description": string} in the same order, nothing else.\n\n` +
      JSON.stringify(payload);

    const raw = await generateAiText({ prompt, maxTokens: 2500, temperature: 0.2 });
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end < 0) return items;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{ i: number; title?: string; description?: string }>;
    const byIdx = new Map(parsed.map((p) => [p.i, p]));

    const out = items.map((it, idx) => {
      const tr = byIdx.get(idx);
      return tr ? { ...it, title: tr.title || it.title, description: tr.description || it.description } : it;
    });
    transCache.set(lang, { sig, at: Date.now(), items: out });
    return out;
  } catch {
    return items; // falha na tradução → devolve o original
  }
}

export async function GET(req: NextRequest) {
  const lang = (req.nextUrl.searchParams.get("lang") ?? "en").toLowerCase().slice(0, 5);

  const results = await Promise.allSettled(
    FEEDS.map((f) => parseFeed(f.url, f.source))
  );

  const all: NewsItem[] = [];
  results.forEach((r) => {
    if (r.status === "fulfilled") all.push(...r.value);
  });

  // Sort by pubDate descending
  all.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  const items = all.slice(0, 20);
  const finalItems = lang === "en" || !LANG_NAMES[lang] ? items : await translateItems(items, lang);

  return NextResponse.json({ items: finalItems });
}
