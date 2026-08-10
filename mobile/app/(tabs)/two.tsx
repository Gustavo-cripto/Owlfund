import { Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { usePortfolio } from '@/context/PortfolioContext';
import { useLivePrices } from '@/hooks/useLivePrices';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);

const formatSignedCurrency = (value: number, currency: string) => {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatCurrency(Math.abs(value), currency)}`;
};

// Recebe fração (ex: 0.052 = +5,2%).
const formatPercent = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);

export default function AssetsScreen() {
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

  // Enriquecer cada ativo com valor atual/PNL reais quando há preço + quantidade.
  const assets = flatAssets.map((asset) => {
    const market = asset.symbol ? pricesBySymbol[asset.symbol.toUpperCase()] : undefined;
    const priced = Boolean(market && asset.quantity != null);
    const currentValue = priced ? market!.priceEur * (asset.quantity as number) : asset.invested;
    const pnl = priced ? currentValue - asset.invested : 0;
    return {
      ...asset,
      priced,
      currentValue,
      pnl,
      change24h: market?.change24h ?? null,
    };
  });

  const sorted = [...assets].sort((a, b) => b.currentValue - a.currentValue);

  const totalInvested = assets.reduce((sum, a) => sum + a.invested, 0);
  const totalCurrent = assets.reduce((sum, a) => sum + a.currentValue, 0);

  // PNL % é relativo apenas ao capital dos ativos com preço (senão fica enganoso).
  const investedPriced = assets.reduce((sum, a) => (a.priced ? sum + a.invested : sum), 0);
  const currentPriced = assets.reduce((sum, a) => (a.priced ? sum + a.currentValue : sum), 0);
  const pnlValue = currentPriced - investedPriced;
  const pnlPct = investedPriced > 0 ? pnlValue / investedPriced : null;

  // Variação 24h em euros sobre as posições com preço.
  const pnl24h = assets.reduce((sum, a) => {
    if (!a.priced || a.change24h == null) return sum;
    const prev = a.currentValue / (1 + a.change24h / 100);
    return sum + (a.currentValue - prev);
  }, 0);

  const hasPriced = investedPriced > 0;

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: palette.background }]}>
        <Text style={[styles.subtitle, { color: palette.muted }]}>Carregando portfolio...</Text>
      </View>
    );
  }

  const statusLabel = error
    ? 'Falha ao atualizar preços — mostrando valores investidos'
    : pricesLoading
      ? 'Atualizando preços...'
      : 'PNL real: preço ao vivo × quantidade';

  const pnlCards = [
    { label: 'Valor atual', value: totalCurrent, signed: false, pct: null as number | null },
    { label: 'Total investido', value: totalInvested, signed: false, pct: null as number | null },
    { label: 'PNL', value: hasPriced ? pnlValue : null, signed: true, pct: pnlPct },
    { label: 'Variação 24h', value: hasPriced ? pnl24h : null, signed: true, pct: null as number | null },
  ];

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
        <Text style={[styles.title, { color: palette.text }]}>Ativos</Text>
        <Text style={[styles.subtitle, { color: error ? palette.danger : palette.muted }]}>
          {statusLabel}
        </Text>

        <View style={styles.pnlGrid}>
          {pnlCards.map((item) => {
            const isPositive = (item.value ?? 0) >= 0;
            return (
              <LinearGradient
                key={item.label}
                colors={['rgba(30, 41, 59, 0.9)', 'rgba(30, 41, 59, 0.9)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.gradientBorderLg}>
                <View style={[styles.pnlCard, { backgroundColor: palette.background }]}>
                  <Text style={[styles.pnlLabel, { color: palette.muted }]}>{item.label}</Text>
                  <Text
                    style={[
                      styles.pnlValue,
                      item.value == null
                        ? { color: palette.muted }
                        : item.signed
                          ? isPositive
                            ? styles.positive
                            : styles.negative
                          : { color: palette.text },
                    ]}>
                    {item.value == null
                      ? '—'
                      : item.signed
                        ? formatSignedCurrency(item.value, portfolio.currency)
                        : formatCurrency(item.value, portfolio.currency)}
                  </Text>
                  {item.pct != null ? (
                    <Text style={[styles.pnlMeta, item.pct >= 0 ? styles.positive : styles.negative]}>
                      {item.pct >= 0 ? '+' : ''}
                      {formatPercent(item.pct)}
                    </Text>
                  ) : (
                    <Text style={[styles.pnlMeta, { color: palette.muted }]}>
                      Base: {formatCurrency(totalInvested, portfolio.currency)}
                    </Text>
                  )}
                </View>
              </LinearGradient>
            );
          })}
        </View>

        <LinearGradient
          colors={['rgba(30, 41, 59, 0.9)', 'rgba(30, 41, 59, 0.9)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.gradientBorderLg}>
          <View style={[styles.card, { backgroundColor: palette.background }]}>
          {sorted.map((asset, index) => (
            <Pressable
              key={asset.id}
              onPress={() =>
                router.push({
                  pathname: '/asset/[assetId]',
                  params: { assetId: asset.id, categoryId: asset.categoryId },
                })
              }
              style={({ pressed }) => [
                styles.assetRow,
                index === sorted.length - 1 ? styles.assetRowLast : null,
                pressed ? styles.assetRowPressed : null,
              ]}>
              <View style={styles.assetInfo}>
                <Text style={[styles.assetName, { color: palette.text }]}>{asset.name}</Text>
                <Text style={[styles.assetMeta, { color: palette.muted }]}>
                  {asset.categoryName}
                  {asset.symbol ? ` · ${asset.symbol}` : ''}
                  {asset.priced ? ` · ${asset.quantity} un.` : ''}
                </Text>
              </View>
              <View style={styles.assetValueBlock}>
                <Text style={[styles.assetValue, { color: palette.text }]}>
                  {formatCurrency(asset.currentValue, portfolio.currency)}
                </Text>
                {asset.priced ? (
                  <Text style={[styles.assetPnl, asset.pnl >= 0 ? styles.positive : styles.negative]}>
                    {formatSignedCurrency(asset.pnl, portfolio.currency)}
                  </Text>
                ) : (
                  <Text style={[styles.assetPnl, { color: palette.muted }]}>investido</Text>
                )}
              </View>
            </Pressable>
          ))}
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
  container: {
  },
  content: {
    padding: 20,
    gap: 12,
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
  card: {
    marginTop: 8,
    borderRadius: 16,
    padding: 12,
    overflow: 'hidden',
    gap: 8,
  },
  gradientBorderLg: {
    borderRadius: 18,
    padding: 1,
  },
  pnlGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pnlCard: {
    flexBasis: 200,
    flexGrow: 1,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    gap: 8,
  },
  pnlLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pnlMeta: {
    fontSize: 12,
  },
  pnlValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30, 41, 59, 0.6)',
  },
  assetRowPressed: {
    opacity: 0.7,
  },
  assetRowLast: {
    borderBottomWidth: 0,
  },
  assetInfo: {
    flex: 1,
    marginRight: 12,
  },
  assetName: {
    fontSize: 15,
    fontWeight: '600',
  },
  assetMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  assetValueBlock: {
    alignItems: 'flex-end',
  },
  assetValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  assetPnl: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  positive: {
    color: '#22c55e',
  },
  negative: {
    color: '#ef4444',
  },
});
