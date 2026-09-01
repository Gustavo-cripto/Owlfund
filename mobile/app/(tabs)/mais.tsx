// Tab "Mais" — todas as opções do site, como no menu do site. As core são
// nativas (tabs de baixo); as restantes abrem a página do site DENTRO da app.
import { Platform, Linking, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import PriceTicker from '@/components/PriceTicker';
import { SITE_URL } from '@/lib/supabase';

type Item = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  desc: string;
};

// Mesmo menu do site (Dashboard…API & MCP). Portfolio/Mercado/Conta já são
// tabs nativas, por isso não se repetem aqui.
const ITEMS: Item[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'th-large', desc: 'Nativo · portfólio + mercado global' },
  { key: 'carteiras', label: 'Carteiras', icon: 'credit-card', desc: 'On-chain, CEX e cold wallets' },
  { key: 'smart-money', label: 'Smart Money', icon: 'eye', desc: 'Movimentos de whales em tempo real' },
  { key: 'gestor', label: 'Gestor IA', icon: 'android', desc: 'Block · análise IA do teu portfólio' },
  { key: 'historico', label: 'Histórico', icon: 'clock-o', desc: 'Evolução e registos' },
  { key: 'impostos', label: 'Impostos', icon: 'file-text-o', desc: 'Fiscalidade FIFO · 14 países' },
  { key: 'fire', label: 'FIRE', icon: 'fire', desc: 'Simulador nativo · regra dos 4%' },
  { key: 'planos', label: 'Planos', icon: 'star-o', desc: 'Free · Pro · Premium' },
  { key: 'api', label: 'API & MCP', icon: 'code', desc: 'Chaves de API e assistentes IA' },
];

export default function MaisScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const router = useRouter();

  const open = (key: string) => {
    // Secções já NATIVAS abrem o ecrã da app (não o site embutido).
    if (key === 'fire') {
      router.push('/fire' as never);
      return;
    }
    if (key === 'dashboard') {
      router.push('/dashboard' as never);
      return;
    }
    if (Platform.OS === 'web') {
      // No web, cada item abre o próprio site (não se embute por CSP).
      const paths: Record<string, string> = {
        dashboard: '/dashboard', carteiras: '/wallets', 'smart-money': '/smart-money',
        gestor: '/gestor', historico: '/historico', impostos: '/fiscalidade',
        fire: '/fire', planos: '/pricing', api: '/account?section=api',
      };
      Linking.openURL(`${SITE_URL}${paths[key] ?? '/dashboard'}`);
      return;
    }
    // Cast: os tipos gerados do expo-router só apanham a rota nova após o
    // próximo arranque completo do dev server.
    router.push({ pathname: '/site/[page]', params: { page: key } } as never);
  };

  return (
    <RNView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <PriceTicker />
        <Text style={[styles.title, { color: palette.text }]}>Mais</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          Tudo o que tens no site, dentro da app
        </Text>

        <RNView style={styles.grid}>
          {ITEMS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => open(item.key)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : palette.card,
                  borderColor: 'rgba(30, 41, 59, 0.9)',
                },
              ]}>
              <RNView style={styles.cardIconWrap}>
                <FontAwesome name={item.icon} size={18} color="#fb923c" />
              </RNView>
              <RNView style={styles.cardTextWrap}>
                <Text style={[styles.cardLabel, { color: palette.text }]}>{item.label}</Text>
                <Text style={[styles.cardDesc, { color: palette.muted }]} numberOfLines={1}>
                  {item.desc}
                </Text>
              </RNView>
              <FontAwesome name="angle-right" size={18} color="#475569" />
            </Pressable>
          ))}
        </RNView>

        <Text style={[styles.note, { color: palette.muted }]}>
          Estas secções abrem o site dentro da app — na primeira vez pode pedir para
          entrares com a tua conta (fica memorizado).
        </Text>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: -6 },
  grid: { gap: 10, marginTop: 6 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
  },
  cardTextWrap: { flex: 1 },
  cardLabel: { fontSize: 15, fontWeight: '600' },
  cardDesc: { fontSize: 12, marginTop: 1 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
