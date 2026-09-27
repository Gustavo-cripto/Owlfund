import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";
import { apiMsg } from "@/lib/api/apiMessages";
import { eNaoEncontrado, lerCarteiraCardano, statusDoErro } from "@/lib/cardano/blockfrost";


export async function GET(request: Request) {
  // Proxy com custo/quota nossa: so com sessao, e com limite por utilizador.
  const auth = await requireUser(request, { route: "ada-balance", limit: 60 });
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const projectId = process.env.BLOCKFROST_PROJECT_ID;

  if (!address || !/^addr1[a-z0-9]+$/i.test(address)) {
    return NextResponse.json(
      { error: apiMsg(request, "address_invalid_for_chain", { chain: "Cardano" }) },
      { status: 400 }
    );
  }

  if (!projectId) {
    return NextResponse.json(
      { error: apiMsg(request, "server_unconfigured") },
      { status: 503 }
    );
  }

  try {
    // Pela conta (stake), não pelo endereço: o endereço que a carteira nos dá é
    // um entre muitos. Ver src/lib/cardano/blockfrost.ts.
    const carteira = await lerCarteiraCardano(address, projectId);
    const ada = (Number(carteira.lovelace) / 1_000_000).toFixed(6);
    return NextResponse.json({ balance: ada, lovelace: carteira.lovelace, stake: carteira.stake });
  } catch (e) {
    if (eNaoEncontrado(e)) return NextResponse.json({ balance: "0", lovelace: "0" });
    console.error("[ada-balance]", e instanceof Error ? e.message : e);
    // A mensagem do upstream (Blockfrost, em ingles) ja nao vai para o ecra:
    // fica no registo acima e o utilizador ve a frase na lingua dele.
    const st = statusDoErro(e);
    return NextResponse.json(
      { error: apiMsg(request, st === 429 ? "rate_limited" : "balance_unavailable") },
      { status: st && st < 500 ? st : 503 }
    );
  }
}
