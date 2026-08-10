// Ticker de preços no topo — réplica da barra animada do site (AppShell):
// símbolos em loop contínuo com preço e variação 24h. Dados reais CoinGecko.
//
// O fetch é partilhado a nível de módulo (cache 60s) para o ticker poder viver
// em vários ecrãs sem multiplicar chamadas à API.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { fetchMarketPrices, type MarketRow } from '@/data/coingecko';

const TICKER_SYMBOLS = ['BTC', 'ETH', 'SOL', 'ADA', 'BNB', 'XRP', 'DOGE', 'LINK', 'AVAX', 'DOT', 'LTC'];

// Cache módulo-level: 1 fetch por minuto, partilhado por todas as instâncias.
let cache: { at: number; data: Record<string, MarketRow> } | null = null;
let inflight: Promise<Record<string, MarketRow>> | null = null;

async function getTickerPrices(): Promise<Record<string, MarketRow>> {
  const now = Date.now();
  if (cache && now - cache.at < 55_000) return cache.data;
  if (!inflight) {
    inflight = fetchMarketPrices(TICKER_SYMBOLS)
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

const fmtPrice = (v: number) =>
  new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: v >= 100 ? 0 : v >= 1 ? 2 : 3,
  }).format(v);

const fmtChange = (v: number | null) => {
  if (v == null) return '';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1).replace('.', ',')}%`;
};

export default function PriceTicker() {
  const [rows, setRows] = useState<MarketRow[]>([]);
  const translateX = useRef(new Animated.Value(0)).current;
  const [contentWidth, setContentWidth] = useState(0);

  // Carrega + revalida a cada 60s.
  useEffect(() => {
    let mounted = true;
    const load = () =>
      getTickerPrices()
        .then((data) => {
          if (!mounted) return;
          const list = TICKER_SYMBOLS.map((s) => data[s]).filter((r): r is MarketRow => Boolean(r));
          setRows(list);
        })
        .catch(() => {
          /* sem rede: ticker fica oculto */
        });
    load();
    const t = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  // Marquee: anima até -largura de UMA cópia e recomeça (as 2 cópias são iguais).
  useEffect(() => {
    if (contentWidth <= 0) return;
    translateX.setValue(0);
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -contentWidth,
        duration: contentWidth * 30, // ~33 px/s, próximo do ritmo do site
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [contentWidth, translateX]);

  if (rows.length === 0) return null;

  const renderItems = (measure: boolean) => (
    <View
      style={styles.copy}
      onLayout={measure ? (e) => setContentWidth(e.nativeEvent.layout.width) : undefined}>
      {rows.map((r) => (
        <View key={r.symbol} style={styles.item}>
          <Text style={styles.symbol}>{r.symbol}</Text>
          <Text style={styles.price}>{fmtPrice(r.priceEur)}</Text>
          <Text style={[styles.change, (r.change24h ?? 0) >= 0 ? styles.up : styles.down]}>
            {fmtChange(r.change24h)}
          </Text>
          <Text style={styles.sep}>·</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
        {renderItems(true)}
        {renderItems(false)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // border-b slate-800 + bg slate-900/50, como o site.
  bar: {
    height: 34,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 8,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
  },
  symbol: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#cbd5e1',
  },
  price: {
    fontSize: 11,
    color: '#64748b',
  },
  change: {
    fontSize: 11,
    fontWeight: '600',
  },
  up: {
    color: '#34d399',
  },
  down: {
    color: '#fb7185',
  },
  sep: {
    color: '#334155',
    marginLeft: 12,
  },
});
