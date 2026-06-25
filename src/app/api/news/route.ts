import { NextResponse } from "next/server";

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

export async function GET() {
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

  return NextResponse.json({ items: all.slice(0, 20) });
}
