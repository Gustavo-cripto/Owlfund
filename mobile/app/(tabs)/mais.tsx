// Tab "Mais" — CÓPIA do menu do site: mesma ordem e itens (Dashboard,
// Portfolio, Carteiras, Smart Money, Gestor IA, Mercado, Histórico, Impostos,
// FIRE, Planos, Conta, API & MCP, Beta) + idiomas PT/EN/ES/FR + Sair.
// Nativo abre ecrãs da app; os restantes abrem o site dentro da app.
import { Platform, Linking, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage, type Lang, type TKey } from '@/context/LanguageContext';
import PriceTicker from '@/components/PriceTicker';
import { SITE_URL } from '@/lib/supabase';

type Item = {
  key: string;
  labelKey: TKey;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  kind: 'native' | 'tab' | 'site';
  target: string; // rota nativa, tab, ou path do site
  adminOnly?: boolean;
};

// Mesma ordem do menu do site (Sidebar.tsx).
const ITEMS: Item[] = [
  { key: 'dashboard', labelKey: 'menu_dashboard', icon: 'th-large', kind: 'native', target: '/dashboard' },
  { key: 'portfolio', labelKey: 'menu_portfolio', icon: 'pie-chart', kind: 'tab', target: '/(tabs)/two' },
  { key: 'carteiras', labelKey: 'menu_carteiras', icon: 'credit-card', kind: 'native', target: '/carteiras' },
  { key: 'smart', labelKey: 'menu_smart', icon: 'eye', kind: 'native', target: '/smart-money' },
  { key: 'gestor', labelKey: 'menu_gestor', icon: 'android', kind: 'native', target: '/gestor' },
  { key: 'mercado', labelKey: 'menu_mercado', icon: 'line-chart', kind: 'tab', target: '/(tabs)' },
  { key: 'historico', labelKey: 'menu_historico', icon: 'clock-o', kind: 'native', target: '/historico' },
  { key: 'impostos', labelKey: 'menu_impostos', icon: 'file-text-o', kind: 'site', target: 'impostos' },
  { key: 'fire', labelKey: 'menu_fire', icon: 'fire', kind: 'native', target: '/fire' },
  { key: 'planos', labelKey: 'menu_planos', icon: 'star-o', kind: 'site', target: 'planos' },
  { key: 'conta', labelKey: 'menu_conta', icon: 'user-circle', kind: 'tab', target: '/(tabs)/conta' },
  { key: 'api', labelKey: 'menu_api', icon: 'code', kind: 'site', target: 'api' },
  { key: 'beta', labelKey: 'menu_beta', icon: 'shield', kind: 'site', target: 'beta_admin', adminOnly: true },
];

const SITE_PATHS: Record<string, string> = {
  impostos: '/fiscalidade',
  planos: '/pricing',
  api: '/account?section=api',
  beta_admin: '/admin/beta',
};

const LANGS: { code: Lang; flag: string }[] = [
  { code: 'pt', flag: '🇵🇹' },
  { code: 'en', flag: '🇬🇧' },
  { code: 'es', flag: '🇪🇸' },
  { code: 'fr', flag: '🇫🇷' },
];

export default function MaisScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const open = (item: Item) => {
    if (item.kind === 'native' || item.kind === 'tab') {
      router.push(item.target as never);
      return;
    }
    const path = SITE_PATHS[item.target] ?? '/dashboard';
    if (Platform.OS === 'web') {
      Linking.openURL(`${SITE_URL}${path}`);
      return;
    }
    router.push({ pathname: '/site/[page]', params: { page: item.target } } as never);
  };

  const visible = ITEMS.filter((i) => !i.adminOnly || session);

  return (
    <RNView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <PriceTicker />
        <Text style={[styles.title, { color: palette.text }]}>{t('mais_title')}</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>{t('mais_sub')}</Text>

        <RNView style={styles.grid}>
          {visible.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => open(item)}
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
                <Text style={[styles.cardLabel, { color: palette.text }]}>{t(item.labelKey)}</Text>
                <Text style={[styles.cardDesc, { color: palette.muted }]} numberOfLines={1}>
                  {item.kind === 'site' ? t('site_embutido') : t('nativo')}
                </Text>
              </RNView>
              <FontAwesome name="angle-right" size={18} color="#475569" />
            </Pressable>
          ))}
        </RNView>

        {/* Idiomas + Sair — como no rodapé do menu do site */}
        <RNView style={[styles.footerRow, { borderTopColor: 'rgba(30,41,59,0.9)' }]}>
          <RNView style={styles.langsRow}>
            {LANGS.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => setLang(l.code)}
                style={[
                  styles.langChip,
                  lang === l.code
                    ? { backgroundColor: 'rgba(249,115,22,0.2)', borderColor: 'rgba(249,115,22,0.6)' }
                    : { borderColor: 'rgba(148,163,184,0.25)' },
                ]}>
                <Text style={{ fontSize: 15 }}>{l.flag}</Text>
                <Text
                  style={{
                    color: lang === l.code ? '#fb923c' : palette.muted,
                    fontSize: 12,
                    fontWeight: '800',
                  }}>
                  {l.code.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </RNView>
          {session && (
            <Pressable onPress={() => signOut()}>
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: '600' }}>{t('sair')}</Text>
            </Pressable>
          )}
        </RNView>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: -8 },
  grid: { gap: 10, marginTop: 6 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 6,
  },
  langsRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
