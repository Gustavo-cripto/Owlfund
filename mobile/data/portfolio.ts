export type Asset = {
  id: string;
  name: string;
  symbol?: string;
  invested: number;
};

export type Category = {
  id: string;
  name: string;
  assets: Asset[];
};

export const portfolio = {
  currency: 'EUR',
  categories: [
    {
      id: 'traditional',
      name: 'Mercado Tradicional',
      assets: [
        { id: 'selic', name: 'Tesouro Selic', invested: 12500 },
        { id: 'cdb', name: 'CDB Banco XP', invested: 8400 },
        { id: 'b3', name: 'Acoes B3', symbol: 'B3SA3', invested: 5600 },
      ],
    },
    {
      id: 'crypto',
      name: 'Cripto',
      assets: [
        { id: 'btc', name: 'Bitcoin', symbol: 'BTC', invested: 9200 },
        { id: 'eth', name: 'Ethereum', symbol: 'ETH', invested: 4100 },
        { id: 'sol', name: 'Solana', symbol: 'SOL', invested: 1800 },
      ],
    },
  ],
};
