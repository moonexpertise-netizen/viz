// Couleurs des graphiques alignées sur le thème actif (lues depuis les
// variables CSS). Recalculé à chaque rendu → suit le changement de thème.
const FALLBACK = {
  navy: '#01071B', navyLight: '#121a33', gold: '#a88962',
  green: '#1f7a45', red: '#c0392b', blue: '#2563eb',
};

export function chartColors() {
  if (typeof window === 'undefined' || !document?.documentElement) return FALLBACK;
  const s = getComputedStyle(document.documentElement);
  const v = (name, fb) => {
    const raw = (s.getPropertyValue(name) || '').trim();
    return raw || fb;
  };
  const dark = document.documentElement.getAttribute('data-theme') !== 'light'
    && document.documentElement.hasAttribute('data-theme');
  return {
    navy: v('--navy', FALLBACK.navy),
    navyLight: v('--navy-light', FALLBACK.navyLight),
    gold: v('--gold', FALLBACK.gold),
    green: v('--accent-green', FALLBACK.green),
    red: v('--accent-red', FALLBACK.red),
    blue: v('--accent-blue', FALLBACK.blue),
    ink: v('--ink', FALLBACK.navy),
    primary: v('--chart-primary', FALLBACK.navy),
    grid: v('--chart-grid', '#ececf0'),
    axis: v('--chart-axis', '#71717a'),
    muted: v('--chart-muted', '#d4d8df'),
    cursor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
  };
}

// Palette catégorielle (donut charges) : élégante, adaptée au mode clair/sombre.
export const CATEGORICAL = ['#01071B', '#a88962', '#2563eb', '#1f7a45', '#c0392b', '#7c6f9c', '#0e7490', '#b45309'];
export function categoricalColors() {
  const t = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : 'light';
  if (t === 'dark' || t === 'navy') {
    return ['#9db1ff', '#d3b88a', '#60a5fa', '#34d399', '#f87171', '#b3a6d9', '#22d3ee', '#fbbf24'];
  }
  return CATEGORICAL;
}

// € compact pour axes / labels (1 234 k, 2,3 M…)
export const fmtCompact = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`;
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString('fr-FR')} k€`;
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
};
