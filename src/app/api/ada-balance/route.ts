import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";
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
      { error: "Endereço Cardano inválido." },
      { status: 400 }
    );
  }

  if (!projectId) {
    return NextResponse.json(
      { error: "Serviço de saldo por endereço não configurado." },
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
    const st = statusDoErro(e);
    return NextResponse.json(
      { error: e instanceof Error && st && st < 500 ? e.message : "Erro ao consultar saldo." },
      { status: st && st < 500 ? st : 503 }
    );
  }
}
