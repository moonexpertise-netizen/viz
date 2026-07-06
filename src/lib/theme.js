// Modes de couleurs (alignés sur MOON CRM) : Clair / Sombre / Navy MOON / Système.
// Le choix est persisté (mv:theme2) ; « système » suit prefers-color-scheme.
// Le mode résolu est appliqué via l'attribut data-theme sur <html>
// (light = pas de surcharge, dark / navy = jeux de variables dans index.css).

export const THEMES = [
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
  { id: 'navy', label: 'Navy MOON' },
  { id: 'system', label: 'Système' },
];

const KEY = 'mv:theme2';
const DEFAULT = 'light';
const VALID = ['light', 'dark', 'navy', 'system'];

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return VALID.includes(t) ? t : DEFAULT;
  } catch { return DEFAULT; }
}

function systemPref() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}

export function resolveTheme(choice) {
  const c = VALID.includes(choice) ? choice : DEFAULT;
  return c === 'system' ? systemPref() : c;
}

export function applyTheme(choice) {
  const theme = VALID.includes(choice) ? choice : DEFAULT;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolveTheme(theme));
  }
  try { localStorage.setItem(KEY, theme); } catch { /* noop */ }
  return theme;
}

/** Suit les changements du thème système quand le choix est « système ». */
export function watchSystemTheme(getChoice) {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => { if (getChoice() === 'system') applyTheme('system'); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  } catch { return () => {}; }
}
