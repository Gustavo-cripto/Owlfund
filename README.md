Projeto Next.js para gestão de carteira cripto/multi-chain.

## Configuração de ambiente

Cria um `.env.local` com base em `.env.example` e define as chaves necessárias:

- `SHYFT_API_KEY`: obrigatório para DeFi de Solana (Meteora DLMM).
- `MORALIS_API_KEY`: usado para DeFi/NFTs em EVM.
- `BLOCKFROST_PROJECT_ID`: usado para Cardano.
- `UNISAT_API_KEY`: usado para Ordinals em Bitcoin.

**Acesso (login):**

- Define `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (projeto em [supabase.com](https://supabase.com)).
- O middleware renova a sessão em cada pedido; as rotas `/dashboard`, `/wallets`, `/portfolio` e `/market` exigem login e redirecionam para `/login?next=...`.
- Após login (email/senha ou Google), o utilizador é redirecionado para a página indicada em `next` ou para o dashboard.

Notas:

- O DeFi de Solana está configurado em modo **SHYFT-only**.
- NFTs Solana têm fallback por RPC quando Moralis não está disponível.

## Desenvolvimento local

Executa o servidor de desenvolvimento:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Deploy

Deploy recomendado: Vercel.

No Vercel, configura as mesmas variáveis de ambiente definidas no `.env.local`.

