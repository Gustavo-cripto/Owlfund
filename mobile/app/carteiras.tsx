// Carteiras nativo — vê, adiciona, atualiza e remove carteiras on-chain da
// conta do site, diretamente na app (sincroniza nos dois sentidos).
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { usePortfolio } from '@/context/PortfolioContext';
import {
  addWallet,
  CHAIN_LABEL,
  CHAIN_SYMBOL,
  fetchLiveBalance,
  listWallets,
  removeWallet,
  validAddress,
  type AccountWallets,
  type Chain,
} from '@/lib/cloudWallets';

const CHAINS: Chain[] = ['eth', 'btc', 'sol', 'ada'];

const shortAddr = (a?: string) => (a && a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a ?? '—');

export default function CarteirasScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const { session } = useAuth();
  const { refreshCloud } = usePortfolio();

  const [accounts, setAccounts] = useState<AccountWallets[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [chain, setChain] = useState<Chain>('eth');
  const [address, setAddress] = useState('');
  // Saldos ao vivo por chave `chain:address` (só os que o utilizador atualizou).
  const [live, setLive] = useState<Record<string, number | 'loading' | 'err'>>({});

  const load = useCallback(async () => {
    if (!session) {
      setAccounts(null);
      setLoading(false);
      return;
    }
    const res = await listWallets().catch(() => null);
    setAccounts(res);
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

  const doAdd = async () => {
    const addr = address.trim();
    if (busy || !addr) return;
    if (!validAddress(chain, addr)) {
      setMsg({ ok: false, text: `Endereço ${CHAIN_LABEL[chain]} inválido.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    // Busca o saldo primeiro para guardar já um valor real no site/app.
    const bal = await fetchLiveBalance(chain, addr);
    const err = await addWallet(chain, addr, bal);
    if (err) {
      setMsg({ ok: false, text: err });
    } else {
      setMsg({ ok: true, text: `Carteira ${CHAIN_SYMBOL[chain]} adicionada${bal != null ? ` · saldo ${bal}` : ''}.` });
      setAddress('');
      await load();
      refreshCloud().catch(() => null);
    }
    setBusy(false);
  };

  const doRemove = (accountId: string, c: Chain, index: number, addr?: string) => {
    const run = async () => {
      setBusy(true);
      const err = await removeWallet(accountId, c, index);
      setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Carteira removida.' });
      await load();
      refreshCloud().catch(() => null);
      setBusy(false);
    };
    if (Platform.OS === 'web') {
      run();
      return;
    }
    Alert.alert('Remover carteira', `Remover ${shortAddr(addr)} (${CHAIN_SYMBOL[c]})?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: run },
    ]);
  };

  const doLive = async (c: Chain, addr: string) => {
    const key = `${c}:${addr}`;
    setLive((p) => ({ ...p, [key]: 'loading' }));
    const bal = await fetchLiveBalance(c, addr);
    setLive((p) => ({ ...p, [key]: bal == null ? 'err' : bal }));
  };

  const card = [styles.card, { backgroundColor: palette.card, borderColor: 'rgba(30,41,59,0.9)' }];

  if (!session) {
    return (
      <RNView style={[styles.center, { backgroundColor: palette.background }]}>
        <Text style={{ color: palette.muted, textAlign: 'center', padding: 24 }}>
          Entra na tua conta (tab Conta) para veres e geriras as carteiras.
        </Text>
      </RNView>
    );
  }

  return (
    <RNView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}>
        <Text style={[styles.title, { color: palette.text }]}>Carteiras</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          Só-leitura · sincronizadas com o site
        </Text>

        {/* Adicionar */}
        <RNView style={card}>
          <Text style={[styles.label, { color: palette.muted }]}>ADICIONAR CARTEIRA</Text>
          <RNView style={styles.chipsRow}>
            {CHAINS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setChain(c)}
                style={[
                  styles.chip,
                  chain === c
                    ? { backgroundColor: 'rgba(249,115,22,0.2)', borderColor: 'rgba(249,115,22,0.6)' }
                    : { borderColor: 'rgba(148,163,184,0.3)' },
                ]}>
                <Text style={{ color: chain === c ? '#fb923c' : palette.muted, fontSize: 13, fontWeight: '700' }}>
                  {CHAIN_SYMBOL[c]}
                </Text>
              </Pressable>
            ))}
          </RNView>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder={chain === 'eth' ? '0x…' : chain === 'ada' ? 'addr1…' : 'endereço…'}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: palette.text, borderColor: 'rgba(148,163,184,0.35)' }]}
          />
          <Pressable
            onPress={doAdd}
            disabled={busy || !address.trim()}
            style={({ pressed }) => [
              styles.btn,
              { opacity: busy || pressed || !address.trim() ? 0.6 : 1 },
            ]}>
            <Text style={styles.btnText}>{busy ? 'A guardar…' : 'Adicionar'}</Text>
          </Pressable>
          {msg && (
            <Text style={{ color: msg.ok ? '#34d399' : '#fb7185', fontSize: 13 }}>{msg.text}</Text>
          )}
        </RNView>

        {/* Lista */}
        {loading ? (
          <ActivityIndicator color="#f97316" style={{ marginTop: 12 }} />
        ) : accounts == null ? (
          <Text style={{ color: '#fb7185', fontSize: 13 }}>Não foi possível carregar. Puxa para atualizar.</Text>
        ) : (
          accounts.map((acc) => (
            <RNView key={acc.accountId} style={card}>
              <Text style={[styles.label, { color: palette.muted }]}>
                {acc.accountName.toUpperCase()} {acc.isActive ? '· ATIVA' : ''}
              </Text>
              {acc.wallets.length === 0 ? (
                <Text style={{ color: palette.muted, fontSize: 13 }}>Sem carteiras nesta conta.</Text>
              ) : (
                acc.wallets.map(({ chain: c, entry, index }) => {
                  const key = `${c}:${entry.address}`;
                  const lv = live[key];
                  const balText =
                    lv === 'loading'
                      ? '…'
                      : lv === 'err'
                        ? 'erro'
                        : typeof lv === 'number'
                          ? `${lv} ${CHAIN_SYMBOL[c]} (ao vivo)`
                          : entry.balance
                            ? `${entry.balance} ${CHAIN_SYMBOL[c]}`
                            : '—';
                  return (
                    <RNView key={key + index} style={styles.walletRow}>
                      <RNView style={styles.walletChainBadge}>
                        <Text style={{ color: '#fb923c', fontSize: 11, fontWeight: '800' }}>{CHAIN_SYMBOL[c]}</Text>
                      </RNView>
                      <RNView style={{ flex: 1 }}>
                        <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>
                          {shortAddr(entry.address)}
                        </Text>
                        <Text style={{ color: palette.muted, fontSize: 12 }}>{balText}</Text>
                      </RNView>
                      <Pressable onPress={() => doLive(c, entry.address!)} style={styles.iconBtn}>
                        <Text style={{ color: '#38bdf8', fontSize: 12, fontWeight: '700' }}>↻</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => doRemove(acc.accountId, c, index, entry.address)}
                        style={styles.iconBtn}>
                        <Text style={{ color: '#fb7185', fontSize: 12, fontWeight: '700' }}>✕</Text>
                      </Pressable>
                    </RNView>
                  );
                })
              )}
            </RNView>
          ))
        )}

        <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16 }}>
          Endereços 100% só-leitura — nunca pedimos chaves privadas. Alterações aqui
          aparecem no site (e vice-versa) após sincronizar.
        </Text>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: -8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  label: { fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  btn: { backgroundColor: '#f97316', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: '#020617', fontWeight: '800', fontSize: 14 },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletChainBadge: {
    width: 44,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  iconBtn: { padding: 8 },
});
