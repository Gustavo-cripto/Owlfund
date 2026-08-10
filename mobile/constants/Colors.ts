// Paleta alinhada com o site (chainfolioai.com): fundo slate-950, cartões
// slate-900, bordas slate-800, acento laranja-500, texto slate-100.
const tintColorLight = '#f97316';
const tintColorDark = '#f97316';

export default {
  light: {
    text: '#0f172a',
    background: '#f8fafc',
    card: '#ffffff',
    border: 'rgba(15, 23, 42, 0.12)',
    accent: '#f97316',
    accentAlt: '#fb923c',
    accentSoft: 'rgba(249, 115, 22, 0.15)',
    glow: 'rgba(249, 115, 22, 0.2)',
    muted: 'rgba(100, 116, 139, 0.9)',
    danger: '#dc2626',
    tint: tintColorLight,
    tabIconDefault: '#94a3b8',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#f1f5f9', // slate-100
    background: '#020617', // slate-950 (site bg)
    card: '#0f172a', // slate-900
    border: 'rgba(30, 41, 59, 0.9)', // slate-800
    accent: '#f97316', // orange-500
    accentAlt: '#fb923c', // orange-400
    accentSoft: 'rgba(249, 115, 22, 0.15)',
    glow: 'rgba(249, 115, 22, 0.25)',
    muted: '#94a3b8', // slate-400
    danger: '#fb7185', // rose-400
    tint: tintColorDark,
    tabIconDefault: '#64748b',
    tabIconSelected: tintColorDark,
  },
};
