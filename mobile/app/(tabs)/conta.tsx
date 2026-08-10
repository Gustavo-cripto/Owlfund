// Tab Conta — login com a MESMA conta do site (chainfolioai.com).
// Logado: mostra o email, estado do sync e ações (sincronizar, sair).
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { usePortfolio } from '@/context/PortfolioContext';
import { SITE_URL } from '@/lib/supabase';

export default function ContaScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const { session, isLoading, signIn, signOut } = useAuth();
  const { source, refreshCloud, portfolio } = usePortfolio();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const doLogin = async () => {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setMsg(null);
    const { error } = await signIn(email, password);
    if (error) setMsg({ ok: false, text: error });
    else {
      setMsg({ ok: true, text: 'Sessão iniciada — a sincronizar o portfólio…' });
      setPassword('');
    }
    setBusy(false);
  };

  const doSync = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const error = await refreshCloud();
    setMsg(error ? { ok: false, text: error } : { ok: true, text: 'Portfólio sincronizado com o site.' });
    setBusy(false);
  };

  const doLogout = async () => {
    if (busy) return;
    setBusy(true);
    await signOut();
    setMsg({ ok: true, text: 'Sessão terminada. A app voltou aos dados locais.' });
    setBusy(false);
  };

  const nAssets = portfolio.categories.reduce((acc, c) => acc + c.assets.length, 0);

  if (isLoading) {
    return (
      <RNView style={[styles.loading, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.accent} />
      </RNView>
    );
  }

  return (
    <RNView key={mode} style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: palette.text }]}>Conta</Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            {session
              ? 'Ligada à tua conta ChainFolioAI'
              : 'Entra com a conta do site para veres o teu portfólio real'}
          </Text>
        </View>

        <LinearGradient
          colors={['rgba(30, 41, 59, 0.9)', 'rgba(30, 41, 59, 0.9)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.gradientBorder}>
          <View style={[styles.card, { backgroundColor: palette.background }]}>
            {session ? (
              <>
                <Text style={[styles.label, { color: palette.muted }]}>Sessão</Text>
                <Text style={[styles.email, { color: palette.text }]}>{session.user.email}</Text>

                <RNView style={styles.statusRow}>
                  <RNView
                    style={[
                      styles.dot,
                      { backgroundColor: source === 'cloud' ? '#22c55e' : '#f97316' },
                    ]}
                  />
                  <Text style={{ color: palette.muted, fontSize: 13 }}>
                    {source === 'cloud'
                      ? `A mostrar o portfólio do site (${nAssets} ativos)`
                      : 'Ainda sem dados do site — toca em Sincronizar'}
                  </Text>
                </RNView>

                <Pressable
                  onPress={doSync}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.btn,
                    { backgroundColor: '#f97316', opacity: busy || pressed ? 0.7 : 1 },
                  ]}>
                  <Text style={styles.btnTextDark}>{busy ? 'A sincronizar…' : 'Sincronizar agora'}</Text>
                </Pressable>

                <Pressable
                  onPress={() => Linking.openURL(SITE_URL)}
                  style={({ pressed }) => [
                    styles.btnOutline,
                    { borderColor: palette.muted, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <Text style={[styles.btnText, { color: palette.text }]}>Abrir o site (editar portfólio)</Text>
                </Pressable>

                <Pressable
                  onPress={doLogout}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.btnOutline,
                    { borderColor: '#ef4444', opacity: busy || pressed ? 0.7 : 1 },
                  ]}>
                  <Text style={[styles.btnText, { color: '#ef4444' }]}>Terminar sessão</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.label, { color: palette.muted }]}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="o-teu@email.com"
                  placeholderTextColor={palette.muted}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={[styles.input, { color: palette.text, borderColor: 'rgba(148,163,184,0.35)' }]}
                />
                <Text style={[styles.label, { color: palette.muted, marginTop: 12 }]}>Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={palette.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  onSubmitEditing={doLogin}
                  style={[styles.input, { color: palette.text, borderColor: 'rgba(148,163,184,0.35)' }]}
                />

                <Pressable
                  onPress={doLogin}
                  disabled={busy || !email.trim() || !password}
                  style={({ pressed }) => [
                    styles.btn,
                    {
                      backgroundColor: '#f97316',
                      opacity: busy || pressed || !email.trim() || !password ? 0.6 : 1,
                    },
                  ]}>
                  <Text style={styles.btnTextDark}>{busy ? 'A entrar…' : 'Entrar'}</Text>
                </Pressable>

                <Pressable onPress={() => Linking.openURL(`${SITE_URL}/login`)}>
                  <Text style={[styles.link, { color: palette.muted }]}>
                    Ainda não tens conta? Cria no site →
                  </Text>
                </Pressable>
              </>
            )}

            {msg && (
              <Text style={[styles.msg, { color: msg.ok ? '#22c55e' : '#ef4444' }]}>{msg.text}</Text>
            )}
          </View>
        </LinearGradient>

        <Text style={[styles.note, { color: palette.muted }]}>
          A app lê o portfólio guardado na tua conta do site (ativos manuais cripto +
          tradicionais). Para adicionares ou editares ativos da conta, usa o site — as
          carteiras on-chain chegam numa próxima versão.
        </Text>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' },
  headerRow: { gap: 6 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13 },
  gradientBorder: { borderRadius: 18, padding: 1 },
  card: { borderRadius: 16, padding: 18, gap: 4 },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  email: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: 'transparent',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 4,
  },
  btn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnOutline: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { fontSize: 14, fontWeight: '700' },
  btnTextDark: { fontSize: 14, fontWeight: '800', color: '#0b0f1a' },
  link: { fontSize: 13, marginTop: 14, textAlign: 'center' },
  msg: { fontSize: 13, marginTop: 12 },
  note: { fontSize: 12, lineHeight: 18 },
});
