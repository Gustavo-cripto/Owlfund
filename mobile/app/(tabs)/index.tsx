import { Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { usePortfolio } from '@/context/PortfolioContext';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);

const formatPercent = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
  }).format(value);

const formatCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);

const hashSeed = (value: string) =>
  value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

const buildSparkline = (seed: number) =>
  Array.from({ length: 12 }).map((_, index) => {
    const wave = Math.sin((seed + index) / 2);
    const jitter = (seed % 7) * 0.03;
    return Math.max(0.1, Math.min(0.95, 0.5 + wave * 0.2 + jitter));
  });

export default function SummaryScreen() {
  const { portfolio, isLoading } = usePortfolio();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];

  const assets = portfolio.categories
    .flatMap((category) =>
      category.assets.map((asset) => ({
        ...asset,
        categoryId: category.id,
        categoryName: category.name,
      }))
    )
    .map((asset, index) => {
      const seed = hashSeed(asset.name + (asset.symbol ?? ''));
      const price = Math.max(0.1, (seed % 9000) + 100 + index * 3.2);
      const change1h = ((seed % 10) - 5) / 100;
      const change24h = ((seed % 14) - 7) / 100;
      const change7d = ((seed % 20) - 10) / 100;
      const volume24h = price * (500000 + (seed % 900000));
      const marketCap = price * (20000000 + (seed % 15000000));

      return {
        ...asset,
        price,
        change1h,
        change24h,
        change7d,
        volume24h,
        marketCap,
        sparkline: buildSparkline(seed),
      };
    });

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: palette.background }]}>
        <Text style={{ color: palette.muted }}>Carregando portfolio...</Text>
      </View>
    );
  }

  return (
    <RNView
      key={mode}
      style={[
        styles.screen,
        { backgroundColor: palette.background },
        isWeb ? styles.screenWeb : null,
      ]}>
      {/* visual limpo: sem glow */}
      <ScrollView
        style={[styles.container, { backgroundColor: palette.background }]}
        contentContainerStyle={[styles.content, { backgroundColor: palette.background }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: palette.text }]}>Mercado</Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            Clique em um ativo para abrir o gráfico
          </Text>
        </View>

        <LinearGradient
          colors={['rgba(249, 115, 22, 0.45)', '#030712']}
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
                const changeColor = (value: number) =>
                  value >= 0 ? styles.positive : styles.negative;

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
                    <View style={[styles.cell, styles.cellAsset]}>
                      <Text style={[styles.assetName, { color: palette.text }]}>
                        {asset.name}
                      </Text>
                      <Text style={[styles.assetSymbol, { color: palette.muted }]}>
                        {asset.symbol ?? asset.categoryName}
                      </Text>
                    </View>
                    <Text style={[styles.cell, styles.cellPrice, { color: palette.text }]}>
                      {formatCurrency(asset.price, 'EUR')}
                    </Text>
                    <Text style={[styles.cell, styles.cellChange, changeColor(asset.change1h)]}>
                      {formatPercent(asset.change1h)}
                    </Text>
                    <Text style={[styles.cell, styles.cellChange, changeColor(asset.change24h)]}>
                      {formatPercent(asset.change24h)}
                    </Text>
                    <Text style={[styles.cell, styles.cellChange, changeColor(asset.change7d)]}>
                      {formatPercent(asset.change7d)}
                    </Text>
                    <Text style={[styles.cell, styles.cellVolume, { color: palette.text }]}>
                      € {formatCompact(asset.volume24h)}
                    </Text>
                    <Text style={[styles.cell, styles.cellCap, { color: palette.text }]}>
                      € {formatCompact(asset.marketCap)}
                    </Text>
                    <View style={[styles.cell, styles.cellSpark]}>
                      <View style={styles.sparkline}>
                        {asset.sparkline.map((value, sparkIndex) => (
                      <View
                            key={`${asset.id}-${sparkIndex}`}
                            style={[
                              styles.sparkBar,
                              {
                                height: `${Math.round(value * 100)}%`,
                                backgroundColor:
                                  asset.change7d >= 0 ? '#22c55e' : '#ef4444',
                              },
                            ]}
                          />
                        ))}
                      </View>
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
    padding: 3,
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
    borderBottomColor: 'rgba(125, 211, 252, 0.35)',
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
    color: '#22c55e',
  },
  negative: {
    color: '#ef4444',
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
