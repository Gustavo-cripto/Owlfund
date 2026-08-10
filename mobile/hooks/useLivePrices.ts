import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMarketPrices, MarketRow } from '@/data/coingecko';

type LivePricesState = {
  pricesBySymbol: Record<string, MarketRow>;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

const REFRESH_MS = 60_000;

// Busca preços reais para a lista de símbolos e revalida a cada 60s.
// A chave de dependência é a lista ordenada de símbolos, então só refaz
// o fetch quando o conjunto de ativos muda de facto.
export function useLivePrices(symbols: string[]): LivePricesState {
  const key = Array.from(new Set(symbols.map((s) => s.toUpperCase())))
    .sort()
    .join(',');

  const [pricesBySymbol, setPricesBySymbol] = useState<Record<string, MarketRow>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const isMountedRef = useRef(true);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (list.length === 0) {
      setPricesBySymbol({});
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchMarketPrices(list)
      .then((data) => {
        if (cancelled || !isMountedRef.current) return;
        setPricesBySymbol(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled || !isMountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar preços.');
      })
      .finally(() => {
        if (cancelled || !isMountedRef.current) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  // Auto-refresh periódico enquanto houver símbolos.
  useEffect(() => {
    if (!key) return;
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [key, refresh]);

  return { pricesBySymbol, isLoading, error, refresh };
}
