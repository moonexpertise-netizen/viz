// Thèmes de couleurs (façon MOON CRM). Chaque thème ne fait que surcharger
// quelques variables CSS (voir index.css : :root[data-theme="…"]). On bascule
// l'attribut data-theme sur <html> et on persiste le choix dans localStorage.

export const THEMES = [
  { id: 'navy', label: 'Navy MOON', swatch: '#01071B' },
  { id: 'ardoise', label: 'Ardoise', swatch: '#1e293b' },
  { id: 'emeraude', label: 'Émeraude', swatch: '#052e22' },
  { id: 'bordeaux', label: 'Bordeaux', swatch: '#2e0a16' },
  { id: 'indigo', label: 'Indigo', swatch: '#1a1438' },
];

const KEY = 'mv:theme';
const DEFAULT = 'navy';

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return THEMES.some((x) => x.id === t) ? t : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function applyTheme(id) {
  const theme = THEMES.some((x) => x.id === id) ? id : DEFAULT;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
  try { localStorage.setItem(KEY, theme); } catch { /* noop */ }
  return theme;
}
