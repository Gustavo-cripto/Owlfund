// Smart Money nativo — movimentos de whales conhecidas (mesmo motor do site:
// /api/smart-money-rt com Bearer; Premium). Auto-refresh 60s.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { SITE_URL, getSupabase } from '@/lib/supabase';

type Movement = {
  address: string;
  label: string;
  chain: string;
  type: 'large_transfer' | 'accumulation' | 'distribution' | 'new_token';
  description: string;
  usdValue: number | null;
  timestamp: number;
};

// Whales conhecidas (subconjunto da lista do site — exchanges + figuras).
const WATCHLIST = [
  { address: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', label: 'Binance Cold Wallet', chain: 'eth' },
  { address: '0xF977814e90dA44bFA03b6295A0616a897441aceC', label: 'Binance Hot Wallet #8', chain: 'eth' },
  { address: '0x28C6c06298d514Db089934071355E5743bf21d60', label: 'Binance Hot Wallet #14', chain: 'eth' },
  { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d', label: 'Coinbase Prime', chain: 'eth' },
  { address: '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3', label: 'Coinbase Cold Wallet', chain: 'eth' },
  { address: '0x503828976D22510aad0201ac7EC88293211D23Da', label: 'Kraken Hot Wallet', chain: 'eth' },
  { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik Buterin', chain: 'eth' },
  { address: '0x220866B1A2219f40e72f5c628B65D54268cA3A9D', label: 'Ethereum Foundation', chain: 'eth' },
];

const TYPE_META: Record<Movement['type'], { label: string; color: string }> = {
  large_transfer: { label: 'Transferência grande', color: '#fb7185' },
  accumulation: { label: 'Acumulação', color: '#34d399' },
  distribution: { label: 'Distribuição', color: '#fbbf24' },
  new_token: { label: 'Novo token', color: '#38bdf8' },
};

const timeAgo = (ts: number) => {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.round(m / 60);
  return h < 24 ? `há ${h}h` : `há ${Math.round(h / 24)}d`;
};

export default function SmartMoneyScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const { session } = useAuth();

  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    if (!session) {
      setError('login');
      setLoading(false);
      return;
    }
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('login');
      const url = `${SITE_URL}/api/smart-money-rt?watchlist=${encodeURIComponent(JSON.stringify(WATCHLIST))}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) throw new Error('login');
      if (res.status === 403) throw new Error('premium');
      if (!res.ok) throw new Error(`O site respondeu ${res.status}.`);
      const json = (await res.json()) as { movements: Movement[]; scanned: number };
      setMovements(json.movements ?? []);
      setScanned(json.scanned ?? 0);
      setError(null);
      lastLoad.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha a carregar.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (Date.now() - lastLoad.current >= 55_000) load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const card = [styles.card, { backgroundColor: palette.card, borderColor: 'rgba(30,41,59,0.9)' }];

  const renderError = () => {
    if (error === 'login')
      return 'Entra na tua conta (tab Conta) para veres o Smart Money.';
    if (error === 'premium')
      return 'O Smart Money em tempo real é exclusivo do plano Premium. Podes ativar no site (Planos).';
    return error;
  };

  return (
    <RNView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}>
        <Text style={[styles.title, { color: palette.text }]}>Smart Money</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          Whales conhecidas · atualiza a cada 60s{scanned ? ` · ${scanned} carteiras` : ''}
        </Text>

        {loading ? (
          <ActivityIndicator color="#f97316" style={{ marginTop: 20 }} />
        ) : error ? (
          <RNView style={card}>
            <Text style={{ color: error === 'premium' ? '#fbbf24' : '#fb7185', fontSize: 14, lineHeight: 20 }}>
              {renderError()}
            </Text>
          </RNView>
        ) : movements && movements.length === 0 ? (
          <RNView style={card}>
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20 }}>
              Sem movimentos relevantes nas últimas horas. 🐋 As whales também dormem —
              puxa para baixo para voltar a verificar.
            </Text>
          </RNView>
        ) : (
          movements?.map((m, i) => {
            const meta = TYPE_META[m.type] ?? TYPE_META.accumulation;
            return (
              <RNView key={`${m.address}-${m.timestamp}-${i}`} style={card}>
                <RNView style={styles.rowTop}>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: '700', flex: 1 }}>
                    {m.label}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 11 }}>
                    {m.chain.toUpperCase()} · {timeAgo(m.timestamp)}
                  </Text>
                </RNView>
                <Text style={{ color: meta.color, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>
                  {meta.label.toUpperCase()}
                  {m.usdValue != null ? ` · ~$${Math.round(m.usdValue).toLocaleString('pt-PT')}` : ''}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>{m.description}</Text>
              </RNView>
            );
          })
        )}
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: -8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
