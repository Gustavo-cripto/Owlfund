// FIRE nativo — mesma matemática do site (regra dos 4% / Trinity Study):
// património alvo = despesas anuais × 25; projeção com retorno real (ret − inflação).
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';
import { usePortfolio } from '@/context/PortfolioContext';

const FIRE_MULTIPLE = 25;

const fmtEur = (v: number) =>
  v >= 1_000_000
    ? `€ ${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
    : v >= 1_000
      ? `€ ${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`
      : `€ ${Math.round(v)}`;

const toNum = (s: string, fallback: number) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export default function FireScreen() {
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const { portfolio } = usePortfolio();

  // Património atual pré-preenchido com o total investido do portfólio.
  const investedTotal = useMemo(
    () => portfolio.categories.reduce((s, c) => s + c.assets.reduce((a, x) => a + x.invested, 0), 0),
    [portfolio]
  );

  const [expensesStr, setExpensesStr] = useState('2000');
  const [investStr, setInvestStr] = useState('500');
  const [returnStr, setReturnStr] = useState('7');
  const [inflationStr, setInflationStr] = useState('3');
  const [ageStr, setAgeStr] = useState('30');
  const [portfolioStr, setPortfolioStr] = useState(String(Math.round(investedTotal)));

  const monthlyExpenses = toNum(expensesStr, 0);
  const monthlyInvestment = toNum(investStr, 0);
  const annualReturn = toNum(returnStr, 0);
  const inflationRate = toNum(inflationStr, 0);
  const currentAge = toNum(ageStr, 30);
  const portfolioValue = toNum(portfolioStr, 0);

  const fireTarget = monthlyExpenses * 12 * FIRE_MULTIPLE;
  const realReturn = (annualReturn - inflationRate) / 100;
  const monthlyReal = realReturn / 12;

  // Mesma fórmula do site.
  const yearsToFire = useMemo(() => {
    if (realReturn <= 0 || fireTarget <= 0) return null;
    if (portfolioValue >= fireTarget) return 0;
    const months =
      monthlyInvestment > 0
        ? Math.log((fireTarget * monthlyReal + monthlyInvestment) / (portfolioValue * monthlyReal + monthlyInvestment)) /
          Math.log(1 + monthlyReal)
        : Math.log(fireTarget / Math.max(portfolioValue, 1)) / Math.log(1 + monthlyReal);
    if (!Number.isFinite(months) || months < 0) return null;
    return Math.ceil(months / 12);
  }, [portfolioValue, monthlyInvestment, fireTarget, monthlyReal, realReturn]);

  const nowYear = new Date().getFullYear();
  const fireYear = yearsToFire != null ? nowYear + yearsToFire : null;
  const fireAge = yearsToFire != null ? currentAge + yearsToFire : null;

  // Projeção (amostrada de 5 em 5 anos para caber no ecrã).
  const projection = useMemo(() => {
    const rows: { year: number; idade: number; patrimonio: number }[] = [];
    let p = portfolioValue;
    const years = Math.min(yearsToFire ? yearsToFire + 5 : 40, 50);
    for (let i = 0; i <= years; i++) {
      if (i % 5 === 0 || i === years || (yearsToFire != null && i === yearsToFire)) {
        rows.push({ year: nowYear + i, idade: currentAge + i, patrimonio: Math.round(p) });
      }
      p = p * (1 + realReturn) + monthlyInvestment * 12;
    }
    return rows;
  }, [portfolioValue, monthlyInvestment, realReturn, yearsToFire, currentAge, nowYear]);

  const maxProj = Math.max(fireTarget, ...projection.map((r) => r.patrimonio), 1);

  // Plano patrimonial — mesmas categorias/percentagens do site.
  const total = portfolioValue || fireTarget;
  const plan = [
    { label: 'Fundo de emergência', pct: null as number | null, value: monthlyExpenses * 6, color: '#38bdf8' },
    { label: 'Cripto', pct: 25, value: total * 0.25, color: '#f97316' },
    { label: 'Ações / ETFs', pct: 50, value: total * 0.5, color: '#34d399' },
    { label: 'Obrigações', pct: 15, value: total * 0.15, color: '#a78bfa' },
    { label: 'Liquidez', pct: 10, value: total * 0.1, color: '#94a3b8' },
  ];

  const inputStyle = [styles.input, { color: palette.text, borderColor: 'rgba(148,163,184,0.35)' }];
  const cardStyle = [styles.card, { backgroundColor: palette.card, borderColor: 'rgba(30,41,59,0.9)' }];

  const field = (label: string, value: string, set: (s: string) => void, suffix?: string) => (
    <RNView style={styles.field} key={label}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{label}</Text>
      <RNView style={styles.fieldRow}>
        <TextInput
          value={value}
          onChangeText={set}
          keyboardType="decimal-pad"
          style={inputStyle}
          placeholderTextColor={palette.muted}
        />
        {suffix ? <Text style={{ color: palette.muted, fontSize: 13 }}>{suffix}</Text> : null}
      </RNView>
    </RNView>
  );

  return (
    <RNView style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: palette.text }]}>Simulador FIRE</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          Regra dos 4%: precisas de 25× as tuas despesas anuais
        </Text>

        {/* Inputs */}
        <RNView style={cardStyle}>
          <RNView style={styles.fieldsGrid}>
            {field('Despesas mensais', expensesStr, setExpensesStr, '€')}
            {field('Investimento mensal', investStr, setInvestStr, '€')}
            {field('Retorno anual', returnStr, setReturnStr, '%')}
            {field('Inflação', inflationStr, setInflationStr, '%')}
            {field('Idade atual', ageStr, setAgeStr, 'anos')}
            {field('Património atual', portfolioStr, setPortfolioStr, '€')}
          </RNView>
        </RNView>

        {/* Resultados */}
        <RNView style={styles.resultsRow}>
          <RNView style={[cardStyle, styles.resultCard]}>
            <Text style={[styles.resultLabel, { color: palette.muted }]}>NÚMERO FIRE</Text>
            <Text style={[styles.resultValue, { color: '#fb923c' }]}>{fmtEur(fireTarget)}</Text>
          </RNView>
          <RNView style={[cardStyle, styles.resultCard]}>
            <Text style={[styles.resultLabel, { color: palette.muted }]}>ANOS ATÉ FIRE</Text>
            <Text style={[styles.resultValue, { color: palette.text }]}>
              {yearsToFire == null ? '—' : yearsToFire === 0 ? 'Já lá estás! 🎉' : `${yearsToFire}`}
            </Text>
            {fireYear != null && yearsToFire !== 0 && (
              <Text style={{ color: palette.muted, fontSize: 12 }}>
                em {fireYear} · aos {fireAge} anos
              </Text>
            )}
          </RNView>
        </RNView>

        {/* Projeção */}
        <RNView style={cardStyle}>
          <Text style={[styles.sectionLabel, { color: palette.muted }]}>PROJEÇÃO DO PATRIMÓNIO</Text>
          {projection.map((r) => {
            const hit = r.patrimonio >= fireTarget;
            return (
              <RNView key={r.year} style={styles.projRow}>
                <Text style={[styles.projYear, { color: palette.muted }]}>
                  {r.year} · {r.idade}a
                </Text>
                <RNView style={styles.projBarTrack}>
                  <RNView
                    style={[
                      styles.projBar,
                      {
                        width: `${Math.min(100, (r.patrimonio / maxProj) * 100)}%`,
                        backgroundColor: hit ? '#34d399' : '#f97316',
                      },
                    ]}
                  />
                </RNView>
                <Text style={[styles.projValue, { color: hit ? '#34d399' : palette.text }]}>
                  {fmtEur(r.patrimonio)}
                </Text>
              </RNView>
            );
          })}
          <Text style={{ color: palette.muted, fontSize: 11, marginTop: 6 }}>
            Alvo: {fmtEur(fireTarget)} · retorno real {(realReturn * 100).toFixed(1)}%/ano
          </Text>
        </RNView>

        {/* Plano patrimonial */}
        <RNView style={cardStyle}>
          <Text style={[styles.sectionLabel, { color: palette.muted }]}>PLANO PATRIMONIAL SUGERIDO</Text>
          {plan.map((p) => (
            <RNView key={p.label} style={styles.planRow}>
              <RNView style={[styles.planDot, { backgroundColor: p.color }]} />
              <Text style={[styles.planLabel, { color: palette.text }]}>{p.label}</Text>
              <Text style={{ color: palette.muted, fontSize: 12 }}>
                {p.pct != null ? `${p.pct}% · ` : ''}
                {fmtEur(p.value)}
              </Text>
            </RNView>
          ))}
        </RNView>

        <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16 }}>
          Simulação educativa — não constitui aconselhamento financeiro.
        </Text>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: -8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  fieldsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { flexBasis: '46%', flexGrow: 1 },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
  resultsRow: { flexDirection: 'row', gap: 12 },
  resultCard: { flex: 1, alignItems: 'flex-start' },
  resultLabel: { fontSize: 11, letterSpacing: 0.8 },
  resultValue: { fontSize: 22, fontWeight: '800' },
  sectionLabel: { fontSize: 11, letterSpacing: 1.2, fontWeight: '600' },
  projRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  projYear: { width: 74, fontSize: 12 },
  projBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 5,
    backgroundColor: 'rgba(30,41,59,0.6)',
    overflow: 'hidden',
  },
  projBar: { height: 8, borderRadius: 5 },
  projValue: { width: 66, fontSize: 12, textAlign: 'right', fontWeight: '600' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planDot: { width: 8, height: 8, borderRadius: 4 },
  planLabel: { flex: 1, fontSize: 14 },
});
