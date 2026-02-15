import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';

import { Text } from '@/components/Themed';
import { usePortfolio } from '@/context/PortfolioContext';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';

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

  const chartTheme = palette.background === '#0b0f1a' ? 'dark' : 'light';
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
