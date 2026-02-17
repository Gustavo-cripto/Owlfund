Projeto Next.js para gestão de carteira cripto/multi-chain.

## Configuração de ambiente

Cria um `.env.local` com base em `.env.example` e define as chaves necessárias:

- `SHYFT_API_KEY`: obrigatório para DeFi de Solana (Meteora DLMM).
- `MORALIS_API_KEY`: usado para DeFi/NFTs em EVM.
- `BLOCKFROST_PROJECT_ID`: usado para Cardano.
- `UNISAT_API_KEY`: usado para Ordinals em Bitcoin.

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

