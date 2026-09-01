// Histórico nativo — transações (compras/vendas) sincronizadas da conta do
// site (blob trade-history-v1, agregando todas as contas). Leitura; edição
// faz-se no site (por agora).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { fetchBlob } from '@/lib/cloudWallets';

type Tx = {
  id: string;
  type: 'compra' | 'venda';
  asset: string;
  assetName: string;
  quantity: number;
  priceEur: number;
  totalEur: number;
  date: string;
  exchange: string;
  notes: string;
};

const TRADES_BASE = 'trade-history-v1';

const fmtEur = (v: number) =>
  v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HistoricoScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const { session } = useAuth();

  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) {
      setTxs(null);
      setLoading(false);
      return;
    }
    const blob = await fetchBlob().catch(() => null);
    if (!blob) {
      setTxs(null);
      setLoading(false);
      return;
    }
    const all: Tx[] = [];
    for (const perAcc of Object.values(blob.data)) {
      const raw = perAcc[TRADES_BASE];
      if (!raw) continue;
      try {
        const list = JSON.parse(raw) as Tx[];
        if (Array.isArray(list)) all.push(...list);
      } catch {
        /* ignora conta com dados corrompidos */
      }
    }
    all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    setTxs(all);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const bought = (txs ?? []).filter((t) => t.type === 'compra').reduce((s, t) => s + (t.totalEur || 0), 0);
  const sold = (txs ?? []).filter((t) => t.type === 'venda').reduce((s, t) => s + (t.totalEur || 0), 0);

  const card = [styles.card, { backgroundColor: palette.card, borderColor: 'rgba(30,41,59,0.9)' }];

  return (
    <RNView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}>
        <Text style={[styles.title, { color: palette.text }]}>Histórico</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          Transações da tua conta · para registar novas usa o site
        </Text>

        {loading ? (
          <ActivityIndicator color="#f97316" style={{ marginTop: 16 }} />
        ) : !session ? (
          <RNView style={card}>
            <Text style={{ color: palette.muted, fontSize: 14 }}>
              Entra na tua conta (tab Conta) para veres o histórico.
            </Text>
          </RNView>
        ) : txs == null ? (
          <RNView style={card}>
            <Text style={{ color: '#fb7185', fontSize: 14 }}>Não foi possível carregar. Puxa para atualizar.</Text>
          </RNView>
        ) : txs.length === 0 ? (
          <RNView style={card}>
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20 }}>
              Ainda sem transações registadas. Regista compras/vendas no site
              (Histórico) — a partir de agora sincronizam para aqui. 📒
            </Text>
          </RNView>
        ) : (
          <>
            <RNView style={styles.row}>
              <RNView style={[...card, styles.half]}>
                <Text style={[styles.label, { color: palette.muted }]}>COMPRADO</Text>
                <Text style={{ color: '#34d399', fontSize: 18, fontWeight: '800' }}>€ {fmtEur(bought)}</Text>
              </RNView>
              <RNView style={[...card, styles.half]}>
                <Text style={[styles.label, { color: palette.muted }]}>VENDIDO</Text>
                <Text style={{ color: '#fb7185', fontSize: 18, fontWeight: '800' }}>€ {fmtEur(sold)}</Text>
              </RNView>
              <RNView style={[...card, styles.half]}>
                <Text style={[styles.label, { color: palette.muted }]}>TRANSAÇÕES</Text>
                <Text style={{ color: palette.text, fontSize: 18, fontWeight: '800' }}>{txs.length}</Text>
              </RNView>
            </RNView>

            {txs.map((t) => (
              <RNView key={t.id} style={[...card, { gap: 4 }]}>
                <RNView style={styles.txTop}>
                  <RNView
                    style={[
                      styles.badge,
                      { backgroundColor: t.type === 'compra' ? 'rgba(52,211,153,0.15)' : 'rgba(251,113,133,0.15)' },
                    ]}>
                    <Text
                      style={{
                        color: t.type === 'compra' ? '#34d399' : '#fb7185',
                        fontSize: 11,
                        fontWeight: '800',
                      }}>
                      {t.type.toUpperCase()}
                    </Text>
                  </RNView>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: '700', flex: 1 }}>
                    {t.assetName} <Text style={{ color: palette.muted, fontWeight: '400' }}>· {t.asset}</Text>
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 12 }}>{t.date}</Text>
                </RNView>
                <Text style={{ color: palette.muted, fontSize: 13 }}>
                  {t.quantity} × € {fmtEur(t.priceEur)} ={' '}
                  <Text style={{ color: palette.text, fontWeight: '700' }}>€ {fmtEur(t.totalEur)}</Text>
                  {t.exchange ? `  ·  ${t.exchange}` : ''}
                </Text>
                {t.notes ? <Text style={{ color: palette.muted, fontSize: 12 }}>{t.notes}</Text> : null}
              </RNView>
            ))}
          </>
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
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, gap: 4 },
  label: { fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  txTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
});
