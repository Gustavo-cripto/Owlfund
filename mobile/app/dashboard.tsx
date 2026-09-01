// Dashboard nativo — visão geral como no site: resumo do portfólio,
// mercado global (dominância, cap total), Fear & Greed e top movers 24h.
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View as RNView } from 'react-native';
import { useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { usePortfolio } from '@/context/PortfolioContext';
import { useLivePrices } from '@/hooks/useLivePrices';
import PriceTicker from '@/components/PriceTicker';
import { fetchFearGreed, fetchSiteMarkets, type FearGreed, type GlobalMarket, type MarketCoin } from '@/lib/siteMarkets';

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

const fmtTrillion = (usd: number | null) =>
  usd == null ? '—' : `$${(usd / 1_000_000_000_000).toFixed(2)} T`;

const fmtPct = (v: number | null, dec = 1) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dec)}%`;

export default function DashboardScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const router = useRouter();
  const { portfolio, source } = usePortfolio();

  const flat = portfolio.categories.flatMap((c) => c.assets);
  const symbols = flat.map((a) => a.symbol).filter((s): s is string => Boolean(s));
  const { pricesBySymbol, refresh } = useLivePrices(symbols);

  const [global, setGlobal] = useState<GlobalMarket | null>(null);
  const [coins, setCoins] = useState<MarketCoin[]>([]);
  const [fng, setFng] = useState<FearGreed | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    fetchSiteMarkets()
      .then((d) => {
        setGlobal(d.global);
        setCoins(d.coins);
      })
      .catch(() => null);
    fetchFearGreed().then(setFng).catch(() => null);
  };
  useEffect(load, []);

  const onRefresh = () => {
    setRefreshing(true);
    refresh();
    load();
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Totais do portfólio (preço vivo × qty; sem preço usa o investido).
  const totalCurrent = flat.reduce((s, a) => {
    const m = a.symbol ? pricesBySymbol[a.symbol.toUpperCase()] : undefined;
    return s + (m && a.quantity != null ? m.priceEur * a.quantity : a.invested);
  }, 0);
  const totalInvested = flat.reduce((s, a) => s + a.invested, 0);

  // Top movers 24h (só moedas com variação conhecida).
  const movers = coins.filter((c) => c.change24h != null);
  const gainers = [...movers].sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0)).slice(0, 3);
  const losers = [...movers].sort((a, b) => (a.change24h ?? 0) - (b.change24h ?? 0)).slice(0, 3);

  const card = [styles.card, { backgroundColor: palette.card, borderColor: 'rgba(30,41,59,0.9)' }];

  const fngColor =
    fng == null ? palette.muted : fng.value <= 25 ? '#fb7185' : fng.value <= 45 ? '#fbbf24' : fng.value <= 55 ? '#94a3b8' : '#34d399';

  return (
    <RNView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}>
        <PriceTicker />
        <Text style={[styles.title, { color: palette.text }]}>Dashboard</Text>

        {/* Portfólio */}
        <RNView style={card}>
          <Text style={[styles.label, { color: palette.muted }]}>
            O TEU PORTFÓLIO {source === 'cloud' ? '· sincronizado' : '· local'}
          </Text>
          <Text style={[styles.big, { color: palette.text }]}>{fmtEur(totalCurrent)}</Text>
          <Text style={{ color: palette.muted, fontSize: 12 }}>
            Investido: {fmtEur(totalInvested)} · {flat.length} ativos
          </Text>
        </RNView>

        {/* Mercado global */}
        <RNView style={styles.row}>
          <RNView style={[...card, styles.half]}>
            <Text style={[styles.label, { color: palette.muted }]}>CAP. TOTAL</Text>
            <Text style={[styles.mid, { color: palette.text }]}>{fmtTrillion(global?.totalMarketCapUsd ?? null)}</Text>
            <Text style={{ color: (global?.marketCapChange24h ?? 0) >= 0 ? '#34d399' : '#fb7185', fontSize: 12, fontWeight: '600' }}>
              {fmtPct(global?.marketCapChange24h ?? null)} 24h
            </Text>
          </RNView>
          <RNView style={[...card, styles.half]}>
            <Text style={[styles.label, { color: palette.muted }]}>DOMINÂNCIA</Text>
            <Text style={[styles.mid, { color: palette.text }]}>
              BTC {global?.btcDominance != null ? `${global.btcDominance.toFixed(1)}%` : '—'}
            </Text>
            <Text style={{ color: palette.muted, fontSize: 12 }}>
              ETH {global?.ethDominance != null ? `${global.ethDominance.toFixed(1)}%` : '—'}
            </Text>
          </RNView>
        </RNView>

        {/* Fear & Greed */}
        <RNView style={card}>
          <Text style={[styles.label, { color: palette.muted }]}>FEAR & GREED</Text>
          <RNView style={styles.fngRow}>
            <Text style={[styles.big, { color: fngColor }]}>{fng?.value ?? '—'}</Text>
            <RNView style={{ flex: 1 }}>
              <RNView style={styles.fngTrack}>
                <RNView
                  style={[styles.fngFill, { width: `${fng?.value ?? 0}%`, backgroundColor: fngColor }]}
                />
              </RNView>
              <Text style={{ color: fngColor, fontSize: 13, fontWeight: '700', marginTop: 6 }}>
                {fng?.label ?? 'sem dados'}
              </Text>
            </RNView>
          </RNView>
        </RNView>

        {/* Top movers */}
        <RNView style={styles.row}>
          <RNView style={[...card, styles.half]}>
            <Text style={[styles.label, { color: '#34d399' }]}>MAIORES SUBIDAS 24H</Text>
            {gainers.map((c) => (
              <RNView key={c.symbol} style={styles.moverRow}>
                <Text style={[styles.moverSym, { color: palette.text }]}>{c.symbol}</Text>
                <Text style={{ color: '#34d399', fontSize: 13, fontWeight: '700' }}>{fmtPct(c.change24h)}</Text>
              </RNView>
            ))}
          </RNView>
          <RNView style={[...card, styles.half]}>
            <Text style={[styles.label, { color: '#fb7185' }]}>MAIORES DESCIDAS 24H</Text>
            {losers.map((c) => (
              <RNView key={c.symbol} style={styles.moverRow}>
                <Text style={[styles.moverSym, { color: palette.text }]}>{c.symbol}</Text>
                <Text style={{ color: '#fb7185', fontSize: 13, fontWeight: '700' }}>{fmtPct(c.change24h)}</Text>
              </RNView>
            ))}
          </RNView>
        </RNView>

        <Text
          onPress={() => router.back()}
          style={{ color: '#fb923c', fontSize: 13, fontWeight: '600', textAlign: 'center', padding: 8 }}>
          ← Voltar ao menu
        </Text>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  label: { fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  big: { fontSize: 26, fontWeight: '800' },
  mid: { fontSize: 17, fontWeight: '700' },
  fngRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fngTrack: { height: 8, borderRadius: 5, backgroundColor: 'rgba(30,41,59,0.6)', overflow: 'hidden' },
  fngFill: { height: 8, borderRadius: 5 },
  moverRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moverSym: { fontSize: 13, fontWeight: '600' },
});
