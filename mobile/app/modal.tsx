// Sobre a app — marca, o que faz, ligação ao site e disclaimer.
import { StatusBar } from 'expo-status-bar';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { SITE_URL } from '@/lib/supabase';

const APP_VERSION = '1.0.0';

export default function ModalScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];

  const rows: { icon: string; text: string }[] = [
    { icon: '📊', text: 'Portfólio cripto + tradicional com PNL em tempo real' },
    { icon: '🔗', text: 'Liga-te à tua conta do site e vê o teu portfólio real' },
    { icon: '📈', text: 'Preços ao vivo (CoinGecko) e gráficos TradingView' },
    { icon: '🔒', text: '100% só-leitura e sem custódia — nunca pedimos chaves privadas' },
  ];

  return (
    <RNView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <RNView style={styles.brandRow}>
          <RNView style={styles.logoWrap}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.logo}
              resizeMode="cover"
            />
          </RNView>
          <RNView>
            <Text style={styles.brandTitle}>CHAINFOLIOAI</Text>
            <Text style={[styles.brandSub, { color: palette.muted }]}>
              Portfolio Analytics · v{APP_VERSION}
            </Text>
          </RNView>
        </RNView>

        <RNView style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {rows.map((r) => (
            <RNView key={r.text} style={styles.row}>
              <Text style={styles.rowIcon}>{r.icon}</Text>
              <Text style={[styles.rowText, { color: palette.text }]}>{r.text}</Text>
            </RNView>
          ))}
        </RNView>

        <Pressable
          onPress={() => Linking.openURL(SITE_URL)}
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.btnText}>Abrir chainfolioai.com →</Text>
        </Pressable>

        <Text style={[styles.disclaimer, { color: palette.muted }]}>
          A informação apresentada é apenas educativa e informativa — não constitui
          aconselhamento financeiro. Investir em criptoativos envolve risco elevado.
        </Text>
      </ScrollView>

      {/* Use a light status bar on iOS to account for the black space above the modal */}
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 24, gap: 20, maxWidth: 560, width: '100%', alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  logo: { width: '100%', height: '100%' },
  brandTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 1.6, color: '#fb923c' },
  brandSub: { fontSize: 12, marginTop: 3 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowIcon: { fontSize: 16 },
  rowText: { fontSize: 14, lineHeight: 20, flex: 1 },
  btn: {
    backgroundColor: '#f97316',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnText: { color: '#020617', fontWeight: '800', fontSize: 14 },
  disclaimer: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
