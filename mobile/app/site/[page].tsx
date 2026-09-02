// Página do SITE embutida na app (WebView). Dá acesso a 100% das
// funcionalidades do site dentro da app; as mais usadas vão sendo
// nativizadas com o tempo. A sessão do WebView persiste (cookies) —
// na primeira vez o utilizador entra com a conta dele no próprio site.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View as RNView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Stack, useLocalSearchParams } from 'expo-router';

import { Text } from '@/components/Themed';
import { SITE_URL } from '@/lib/supabase';

// Páginas permitidas (mapeadas do menu do site) + título do header.
const PAGES: Record<string, { path: string; title: string }> = {
  dashboard: { path: '/dashboard', title: 'Dashboard' },
  carteiras: { path: '/wallets', title: 'Carteiras' },
  'smart-money': { path: '/smart-money', title: 'Smart Money' },
  gestor: { path: '/gestor', title: 'Gestor IA' },
  historico: { path: '/historico', title: 'Histórico' },
  impostos: { path: '/fiscalidade', title: 'Impostos' },
  fire: { path: '/fire', title: 'FIRE' },
  planos: { path: '/pricing', title: 'Planos' },
  api: { path: '/account?section=api', title: 'API & MCP' },
  conta_site: { path: '/account', title: 'Conta (site)' },
  beta_admin: { path: '/admin/beta', title: 'Beta' },
};

export default function SitePageScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const [loading, setLoading] = useState(true);
  const entry = PAGES[page ?? ''] ?? { path: '/dashboard', title: 'ChainFolioAI' };
  const url = useMemo(() => `${SITE_URL}${entry.path}`, [entry.path]);

  if (Platform.OS === 'web') {
    // No build web da app não faz sentido embutir o site (CSP bloqueia iframes
    // externos) — o utilizador usa o próprio site.
    return (
      <RNView style={[styles.center, { backgroundColor: '#020617' }]}>
        <Text style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>
          Esta secção abre no site: {url}
        </Text>
      </RNView>
    );
  }

  return (
    <RNView style={styles.screen}>
      <Stack.Screen options={{ title: entry.title }} />
      <WebView
        source={{ uri: url }}
        style={styles.web}
        // Sessão persiste entre visitas e ecrãs (login 1x no site chega).
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        originWhitelist={['*']}
        startInLoadingState
        pullToRefreshEnabled
        onLoadEnd={() => setLoading(false)}
        renderLoading={() => (
          <RNView style={[styles.center, StyleSheet.absoluteFill]}>
            <ActivityIndicator color="#f97316" size="large" />
          </RNView>
        )}
      />
      {loading && (
        <RNView style={[styles.center, StyleSheet.absoluteFill, { backgroundColor: '#020617' }]}>
          <ActivityIndicator color="#f97316" size="large" />
        </RNView>
      )}
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020617' },
  web: { flex: 1, backgroundColor: '#020617' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617' },
});
