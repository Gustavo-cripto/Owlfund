import { NextResponse } from "next/server";

// Taxas de câmbio HISTÓRICAS, com base no euro, para um intervalo de datas.
//
// Porquê: num relatório fiscal, uma compra feita em dólares em 2023 tem de ser
// convertida à taxa DESSA data, não à de hoje. Converter tudo à taxa atual dá
// mais-valias erradas — é a diferença entre um documento que serve para
// declarar e um que não serve.
//
// A fonte (feed do BCE) só publica em dias úteis. Um fim de semana devolve o
// último dia útil anterior, que é o que as autoridades fiscais aceitam; a
// resolução acontece no cliente, que percorre o mapa para trás.
//
// Valores passados não mudam, por isso a cache é longa.
export const revalidate = 21600; // 6 h

const MAX_SYMBOLS = 4;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{3}$/.test(s) && s !== "EUR")
    .slice(0, MAX_SYMBOLS);

  if (!ISO.test(from) || !ISO.test(to) || from > to) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }
  // Só euro envolvido — não é preciso ir buscar nada.
  if (symbols.length === 0) return NextResponse.json({ rates: {} });

  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${from}..${to}?base=EUR&symbols=${symbols.join(",")}`,
      { next: { revalidate } },
    );
    if (!res.ok) return NextResponse.json({ error: "upstream", rates: {} }, { status: 502 });
    const j = (await res.json()) as { rates?: Record<string, Record<string, number>> };
    return NextResponse.json({ rates: j.rates ?? {} });
  } catch {
    return NextResponse.json({ error: "upstream", rates: {} }, { status: 502 });
  }
}
