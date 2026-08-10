import { Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { usePortfolio } from '@/context/PortfolioContext';
import { useLivePrices } from '@/hooks/useLivePrices';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import PriceTicker from '@/components/PriceTicker';

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);

// CoinGecko devolve percentagens já em base 100 (ex: 2.5 = +2,5%).
const formatPercent = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);

const formatCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);

// Reduz a sparkline real (168 pontos ~7d) a 12 barras normalizadas 0..1.
const normalizeSparkline = (prices: number[], buckets = 12): number[] => {
  if (!prices || prices.length === 0) return [];
  const step = Math.max(1, Math.floor(prices.length / buckets));
  const sampled: number[] = [];
  for (let i = 0; i < prices.length; i += step) {
    sampled.push(prices[i]);
  }
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min;
  if (range === 0) return sampled.map(() => 0.5);
  return sampled.map((p) => 0.1 + ((p - min) / range) * 0.85);
};

export default function SummaryScreen() {
  const { portfolio, isLoading } = usePortfolio();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];

  const flatAssets = portfolio.categories.flatMap((category) =>
    category.assets.map((asset) => ({
      ...asset,
      categoryId: category.id,
      categoryName: category.name,
    }))
  );

  const symbols = flatAssets
    .map((asset) => asset.symbol)
    .filter((s): s is string => Boolean(s));

  const { pricesBySymbol, isLoading: pricesLoading, error } = useLivePrices(symbols);

  const assets = flatAssets.map((asset) => {
    const market = asset.symbol ? pricesBySymbol[asset.symbol.toUpperCase()] : undefined;
    return {
      ...asset,
      market: market ?? null,
      sparkline: market ? normalizeSparkline(market.sparkline) : [],
    };
  });

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: palette.background }]}>
        <Text style={{ color: palette.muted }}>Carregando portfolio...</Text>
      </View>
    );
  }

  const statusLabel = error
    ? 'Falha ao atualizar preços — tente novamente em instantes'
    : pricesLoading
      ? 'Atualizando preços...'
      : 'Preços em tempo real (CoinGecko) · atualiza a cada 60s';

  const changeStyle = (value: number | null) =>
    value == null ? styles.muted : value >= 0 ? styles.positive : styles.negative;

  return (
    <RNView
      key={mode}
      style={[
        styles.screen,
        { backgroundColor: palette.background },
        isWeb ? styles.screenWeb : null,
      ]}>
      <ScrollView
        style={[styles.container, { backgroundColor: palette.background }]}
        contentContainerStyle={[styles.content, { backgroundColor: palette.background }]}>
        <PriceTicker />
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: palette.text }]}>Mercado</Text>
          <Text style={[styles.subtitle, { color: error ? palette.danger : palette.muted }]}>
            {statusLabel}
          </Text>
        </View>

        <LinearGradient
          colors={['rgba(30, 41, 59, 0.9)', 'rgba(30, 41, 59, 0.9)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.gradientBorderLg}>
          <View
            style={[
              styles.tableCard,
              {
                backgroundColor: palette.background,
              },
            ]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View
                style={[
                  styles.tableRow,
                  styles.tableHeader,
                  { backgroundColor: palette.background },
                ]}>
                <Text style={[styles.cell, styles.cellIndex, { color: palette.text }]}>#</Text>
                <Text style={[styles.cell, styles.cellAsset, { color: palette.text }]}>
                  Moeda
                </Text>
                <Text style={[styles.cell, styles.cellPrice, { color: palette.text }]}>
                  Preço
                </Text>
                <Text style={[styles.cell, styles.cellChange, { color: palette.text }]}>1h</Text>
                <Text style={[styles.cell, styles.cellChange, { color: palette.text }]}>
                  24h
                </Text>
                <Text style={[styles.cell, styles.cellChange, { color: palette.text }]}>7d</Text>
                <Text style={[styles.cell, styles.cellVolume, { color: palette.text }]}>
                  Volume 24h
                </Text>
                <Text style={[styles.cell, styles.cellCap, { color: palette.text }]}>
                  Cap. mercado
                </Text>
                <Text style={[styles.cell, styles.cellSpark, { color: palette.text }]}>
                  Últimos 7 dias
                </Text>
              </View>

              {assets.map((asset, index) => {
                const market = asset.market;

                return (
                  <Pressable
                    key={asset.id}
                    onPress={() =>
                      router.push({
                        pathname: '/asset/[assetId]',
                        params: { assetId: asset.id, categoryId: asset.categoryId },
                      })
                    }
                    style={({ pressed }) => [
                      styles.tableRow,
                      pressed ? [styles.rowPressed, { backgroundColor: palette.accentSoft }] : null,
                    ]}>
                    <Text style={[styles.cell, styles.cellIndex, { color: palette.text }]}>
                      {index + 1}
                    </Text>
                    <View style={styles.cellAsset}>
                      <Text style={[styles.assetName, { color: palette.text }]}>
                        {asset.name}
                      </Text>
                      <Text style={[styles.assetSymbol, { color: palette.muted }]}>
                        {asset.symbol ?? asset.categoryName}
                      </Text>
                    </View>
                    <Text style={[styles.cell, styles.cellPrice, { color: palette.text }]}>
                      {market ? formatCurrency(market.priceEur, 'EUR') : '—'}
                    </Text>
                    <Text style={[styles.cell, styles.cellChange, changeStyle(market?.change1h ?? null)]}>
                      {market && market.change1h != null ? formatPercent(market.change1h) : '—'}
                    </Text>
                    <Text style={[styles.cell, styles.cellChange, changeStyle(market?.change24h ?? null)]}>
                      {market && market.change24h != null ? formatPercent(market.change24h) : '—'}
                    </Text>
                    <Text style={[styles.cell, styles.cellChange, changeStyle(market?.change7d ?? null)]}>
                      {market && market.change7d != null ? formatPercent(market.change7d) : '—'}
                    </Text>
                    <Text style={[styles.cell, styles.cellVolume, { color: palette.text }]}>
                      {market ? `€ ${formatCompact(market.volumeEur)}` : '—'}
                    </Text>
                    <Text style={[styles.cell, styles.cellCap, { color: palette.text }]}>
                      {market && market.marketCapEur != null
                        ? `€ ${formatCompact(market.marketCapEur)}`
                        : '—'}
                    </Text>
                    <View style={styles.cellSpark}>
                      {asset.sparkline.length > 0 ? (
                        <View style={styles.sparkline}>
                          {asset.sparkline.map((value, sparkIndex) => (
                            <View
                              key={`${asset.id}-${sparkIndex}`}
                              style={[
                                styles.sparkBar,
                                {
                                  height: `${Math.round(value * 100)}%`,
                                  backgroundColor:
                                    (market?.change7d ?? 0) >= 0 ? '#34d399' : '#fb7185',
                                },
                              ]}
                            />
                          ))}
                        </View>
                      ) : (
                        <Text style={[styles.assetSymbol, { color: palette.muted }]}>—</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          </View>
        </LinearGradient>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenWeb: {
    paddingLeft: 140,
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
  },
  container: {},
  content: {
    padding: 20,
    gap: 20,
  },
  headerRow: {
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  tableCard: {
    borderRadius: 16,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  gradientBorderLg: {
    borderRadius: 18,
    padding: 1,
  },
  table: {
    minWidth: 1100,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30, 41, 59, 0.6)',
  },
  tableHeader: {},
  cell: {
    fontSize: 12,
  },
  cellIndex: {
    width: 40,
    textAlign: 'center',
  },
  cellAsset: {
    width: 200,
  },
  cellPrice: {
    width: 130,
    textAlign: 'right',
  },
  cellChange: {
    width: 90,
    textAlign: 'right',
  },
  cellVolume: {
    width: 150,
    textAlign: 'right',
  },
  cellCap: {
    width: 170,
    textAlign: 'right',
  },
  cellSpark: {
    width: 150,
    alignItems: 'flex-end',
  },
  rowPressed: {},
  assetName: {
    fontSize: 13,
    fontWeight: '600',
  },
  assetSymbol: {
    fontSize: 11,
    marginTop: 2,
  },
  positive: {
    color: '#34d399',
  },
  negative: {
    color: '#fb7185',
  },
  muted: {
    color: '#94a3b8',
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 26,
    width: 120,
  },
  sparkBar: {
    width: 4,
    borderRadius: 4,
  },
});
