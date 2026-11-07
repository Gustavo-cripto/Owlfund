// Saldo EVM lido pelo servidor. A CSP do site só deixa o browser falar com RPCs da
// rede Ethereum, e abrir-lhe as outras 15 redes (cada uma com vários fornecedores)
// alargava muito a lista: no Portefólio, um saldo em Arbitrum ou Base era recusado
// pelo browser e ficava o valor antigo, sem aviso (auditoria 6 nov 2026, CRI-4).
//
// Devolve o valor em bruto, sem arredondar: é o que vai para as fotografias.
// Em série, porque /api/evm-balance limita a 60 pedidos por minuto por pessoa.
// Qualquer erro lança: quem chama mantém o saldo anterior.

let fila: Promise<unknown> = Promise.resolve();

export function lerSaldoEvmNoServidor(address: string, network: string, buscar: typeof fetch = fetch): Promise<string> {
  const pedido = fila.then(async () => {
    const res = await buscar(`/api/evm-balance?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const dados = (await res.json().catch(() => ({}))) as { balance?: unknown };
    if (!res.ok || typeof dados.balance !== "string") throw new Error(`evm-balance ${res.status}`);
    return dados.balance;
  });
  fila = pedido.catch(() => undefined);
  return pedido;
}
