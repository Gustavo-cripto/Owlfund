// Gestor IA (Block) nativo — chat com o mesmo cérebro do site (/api/gestor,
// Bearer; Premium). Envia um resumo do portfólio da app para contexto real.
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { SITE_URL, getSupabase } from '@/lib/supabase';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function GestorScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const { session } = useAuth();
  const { portfolio } = usePortfolio();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const portfolioSummary = () =>
    portfolio.categories
      .map(
        (c) =>
          `${c.name}: ` +
          c.assets
            .map((a) => `${a.name}${a.quantity ? ` ${a.quantity} un` : ''} (€${Math.round(a.invested)} investido)`)
            .join(', ')
      )
      .join(' | ');

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!session) {
      setError('login');
      return;
    }
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('login');
      const res = await fetch(`${SITE_URL}/api/gestor`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.slice(-12),
          lang: 'pt',
          portfolio: portfolioSummary(),
          accountName: 'App móvel',
        }),
      });
      if (res.status === 401) throw new Error('login');
      if (res.status === 403) throw new Error('premium');
      const json = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !json.reply) throw new Error(json.error || `O site respondeu ${res.status}.`);
      setMessages((p) => [...p, { role: 'assistant', content: json.reply! }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falhou. Tenta novamente.');
    } finally {
      setBusy(false);
    }
  };

  const errText =
    error === 'login'
      ? 'Entra na tua conta (tab Conta) para falares com o Block.'
      : error === 'premium'
        ? 'O Gestor IA é exclusivo do plano Premium — ativa no site (Planos).'
        : error;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: palette.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        <RNView style={[styles.intro, { borderColor: 'rgba(249,115,22,0.4)' }]}>
          <Text style={{ color: '#fb923c', fontWeight: '800', fontSize: 14 }}>🤖 Block · Gestor IA</Text>
          <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
            Analisa o teu portfólio, whales e mercado. Educativo — não é aconselhamento
            financeiro.
          </Text>
        </RNView>

        {messages.map((m, i) => (
          <RNView
            key={i}
            style={[
              styles.bubble,
              m.role === 'user'
                ? { alignSelf: 'flex-end', backgroundColor: '#f97316' }
                : { alignSelf: 'flex-start', backgroundColor: palette.card, borderWidth: 1, borderColor: 'rgba(30,41,59,0.9)' },
            ]}>
            <Text style={{ color: m.role === 'user' ? '#020617' : palette.text, fontSize: 14, lineHeight: 20 }}>
              {m.content}
            </Text>
          </RNView>
        ))}

        {busy && <ActivityIndicator color="#f97316" style={{ alignSelf: 'flex-start', margin: 8 }} />}
        {errText && <Text style={{ color: error === 'premium' ? '#fbbf24' : '#fb7185', fontSize: 13 }}>{errText}</Text>}
      </ScrollView>

      <RNView style={[styles.inputRow, { borderTopColor: 'rgba(30,41,59,0.9)', backgroundColor: palette.background }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Pergunta ao Block…"
          placeholderTextColor={palette.muted}
          multiline
          style={[styles.input, { color: palette.text, borderColor: 'rgba(148,163,184,0.35)' }]}
        />
        <Pressable
          onPress={send}
          disabled={busy || !input.trim()}
          style={({ pressed }) => [styles.sendBtn, { opacity: busy || pressed || !input.trim() ? 0.5 : 1 }]}>
          <Text style={{ color: '#020617', fontWeight: '800' }}>➤</Text>
        </Pressable>
      </RNView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 10, maxWidth: 640, width: '100%', alignSelf: 'center' },
  intro: { borderWidth: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(249,115,22,0.06)' },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    maxHeight: 110,
  },
  sendBtn: {
    backgroundColor: '#f97316',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
});
