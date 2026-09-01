import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';

import { Text } from '@/components/Themed';
import { usePortfolio } from '@/context/PortfolioContext';
import { useLivePrices } from '@/hooks/useLivePrices';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

const resolveSymbol = (symbol: string | undefined, categoryName: string) => {
  if (!symbol) return null;
  if (symbol.includes(':')) return symbol.toUpperCase();
  const upper = symbol.toUpperCase();
  if (categoryName.toLowerCase().includes('cripto')) {
    return `BINANCE:${upper}USDT`;
  }
  return `BVMF:${upper}`;
};

export default function AssetChartScreen() {
  const { assetId, categoryId } = useLocalSearchParams<{
    assetId: string;
    categoryId?: string;
  }>();
  const { portfolio } = usePortfolio();
  const isWeb = Platform.OS === 'web';
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const styles = createStyles(palette);

  const { asset, categoryName, chartSymbol } = useMemo(() => {
    const category = portfolio.categories.find((item) => item.id === categoryId);
    const assetFound = category?.assets.find((item) => item.id === assetId);
    const resolvedCategoryName = category?.name ?? 'Ativo';
    return {
      asset: assetFound,
      categoryName: resolvedCategoryName,
      chartSymbol: resolveSymbol(assetFound?.symbol, resolvedCategoryName),
    };
  }, [assetId, categoryId, portfolio.categories]);

  // Posição em tempo real (preço vivo × quantidade) para o cabeçalho.
  const { pricesBySymbol } = useLivePrices(asset?.symbol ? [asset.symbol] : []);
  const market = asset?.symbol ? pricesBySymbol[asset.symbol.toUpperCase()] : undefined;
  const hasQty = asset?.quantity != null && asset.quantity > 0;
  const currentValue = market && hasQty ? market.priceEur * (asset!.quantity as number) : null;
  const pnl = currentValue != null && (asset?.invested ?? 0) > 0 ? currentValue - asset!.invested : null;

  if (!asset) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Ativo não encontrado</Text>
        <Text style={styles.subtitle}>Volte e selecione outro ativo.</Text>
      </View>
    );
  }

  if (!chartSymbol) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{asset.name}</Text>
        <Text style={styles.subtitle}>
          Informe um ticker para visualizar o gráfico.
        </Text>
      </View>
    );
  }

  const chartTheme = mode === 'light' ? 'light' : 'dark';
  const toolbarBg = encodeURIComponent(palette.background);
  const chartUrl = `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
    chartSymbol
  )}&interval=60&theme=${chartTheme}&style=1&locale=br&toolbarbg=${toolbarBg}&hideideas=1&allow_symbol_change=false`;

  return (
    <View key={mode} style={[styles.container, isWeb ? styles.containerWeb : null]}>
      <View style={styles.header}>
        <Text style={styles.title}>{asset.name}</Text>
        <Text style={styles.subtitle}>
          {categoryName} · {chartSymbol}
        </Text>
      </View>

      {/* Posição — preço vivo, valor, PNL */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>PREÇO</Text>
          <Text style={styles.statValue}>{market ? fmtEur(market.priceEur) : '—'}</Text>
          {market?.change24h != null && (
            <Text style={{ color: market.change24h >= 0 ? '#34d399' : '#fb7185', fontSize: 11, fontWeight: '700' }}>
              {market.change24h >= 0 ? '+' : ''}
              {market.change24h.toFixed(1)}% 24h
            </Text>
          )}
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>POSIÇÃO</Text>
          <Text style={styles.statValue}>
            {currentValue != null ? fmtEur(currentValue) : fmtEur(asset.invested)}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 11 }}>
            {hasQty ? `${asset.quantity} un.` : 'investido'}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>PNL</Text>
          <Text
            style={[
              styles.statValue,
              { color: pnl == null ? palette.muted : pnl >= 0 ? '#34d399' : '#fb7185' },
            ]}>
            {pnl == null ? '—' : `${pnl >= 0 ? '+' : ''}${fmtEur(pnl)}`}
          </Text>
          {pnl != null && asset.invested > 0 && (
            <Text style={{ color: pnl >= 0 ? '#34d399' : '#fb7185', fontSize: 11, fontWeight: '700' }}>
              {((pnl / asset.invested) * 100).toFixed(1)}%
            </Text>
          )}
        </View>
      </View>
      <View style={styles.chartCard}>
        <WebView
          source={{ uri: chartUrl }}
          style={styles.webview}
          originWhitelist={['*']}
          startInLoadingState
        />
      </View>
    </View>
  );
}

const createStyles = (palette: typeof Colors.dark) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    padding: 16,
    gap: 12,
  },
  containerWeb: {
    paddingLeft: 140,
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
  },
  header: {
    gap: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  statLabel: {
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: '700',
    color: palette.muted,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: palette.text,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
  },
  subtitle: {
    fontSize: 13,
    color: palette.muted,
  },
  chartCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
    backgroundColor: palette.card,
  },
  webview: {
    flex: 1,
    backgroundColor: palette.card,
  },
  });
