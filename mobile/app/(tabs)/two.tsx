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

const hashSeed = (value: string) =>
  value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

const formatSignedCurrency = (value: number, currency: string) => {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatCurrency(Math.abs(value), currency)}`;
};

export default function AssetsScreen() {
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
    .sort((a, b) => b.invested - a.invested);
  const totalInvested = assets.reduce((sum, asset) => sum + asset.invested, 0);
  const totalCurrent = assets.reduce((sum, asset) => {
    const seed = hashSeed(`${asset.name}-${asset.symbol ?? asset.categoryName}`);
    const change = ((seed % 20) - 10) / 100;
    return sum + asset.invested * (1 + change);
  }, 0);
  const pnlValue = totalCurrent - totalInvested;
  const todaySeed = hashSeed(`today-${portfolio.currency}-${assets.length}`);
  const weekSeed = hashSeed(`week-${portfolio.currency}-${assets.length}`);
  const todayPnl = totalInvested * (((todaySeed % 20) - 10) / 1000);
  const weekDailyPnl = totalInvested * (((weekSeed % 24) - 12) / 1000);
  const pnlCards = [
    { label: 'PNL da posição', value: pnlValue },
    { label: 'PNL de hoje', value: todayPnl },
    { label: 'PNL diário (7 dias)', value: weekDailyPnl },
  ];

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: palette.background }]}>
        <Text style={[styles.subtitle, { color: palette.muted }]}>Carregando portfolio...</Text>
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
        <Text style={[styles.title, { color: palette.text }]}>Ativos</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          Lista ordenada por valor investido
        </Text>

        <View style={styles.pnlGrid}>
          {pnlCards.map((item) => {
            const isPositive = item.value >= 0;
            return (
              <LinearGradient
                key={item.label}
                colors={['rgba(249, 115, 22, 0.45)', '#030712']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.gradientBorderLg}>
                <View style={[styles.pnlCard, { backgroundColor: palette.background }]}>
                  <Text style={[styles.pnlLabel, { color: palette.muted }]}>{item.label}</Text>
                  <Text style={[styles.pnlValue, isPositive ? styles.positive : styles.negative]}>
                    {formatSignedCurrency(item.value, portfolio.currency)}
                  </Text>
                  <Text style={[styles.pnlMeta, { color: palette.muted }]}>
                    Base: {formatCurrency(totalInvested, portfolio.currency)}
                  </Text>
                </View>
              </LinearGradient>
            );
          })}
        </View>

        <LinearGradient
          colors={['rgba(249, 115, 22, 0.45)', '#030712']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.gradientBorderLg}>
          <View style={[styles.card, { backgroundColor: palette.background }]}>
          {assets.map((asset, index) => (
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
                index === assets.length - 1 ? styles.assetRowLast : null,
                pressed ? styles.assetRowPressed : null,
              ]}>
              <View style={styles.assetInfo}>
                <Text style={[styles.assetName, { color: palette.text }]}>{asset.name}</Text>
                <Text style={[styles.assetMeta, { color: palette.muted }]}>
                  {asset.categoryName}
                  {asset.symbol ? ` · ${asset.symbol}` : ''}
                </Text>
              </View>
              <Text style={[styles.assetValue, { color: palette.text }]}>
                {formatCurrency(asset.invested, portfolio.currency)}
              </Text>
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
    padding: 3,
  },
  pnlGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pnlCard: {
    flexBasis: 260,
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
    borderBottomColor: 'rgba(125, 211, 252, 0.35)',
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
  assetValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  positive: {
    color: '#22c55e',
  },
  negative: {
    color: '#ef4444',
  },
});
