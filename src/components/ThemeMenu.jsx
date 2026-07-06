import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Sparkles, Monitor, Contrast } from 'lucide-react';
import { THEMES } from '../lib/theme';
import { cls } from '../lib/format';

const ICONS = { light: Sun, dark: Moon, navy: Sparkles, system: Monitor };

/**
 * Sélecteur de mode de couleurs (façon MOON CRM) : Clair / Sombre / Navy MOON / Système.
 * Pensé pour le bas de la sidebar. `collapsed` : bouton icône seul, popover à droite.
 */
export default function ThemeMenu({ value, onChange, collapsed = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const current = THEMES.find((t) => t.id === value) || THEMES[0];

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        title={`Thème : ${current.label}`}
        className={cls('w-full inline-flex items-center gap-2 rounded-lg text-sm text-sage hover:text-white hover:bg-white/[0.06] transition',
          collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2')}>
        <Contrast size={16} className="shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Thème</span>
            <span className="text-xs opacity-70">{current.label}</span>
          </>
        )}
      </button>

      {open && (
        <div role="menu" aria-label="Sélection du thème"
          className={cls('absolute z-50 min-w-[180px] rounded-xl border border-sage bg-white shadow-lg p-1 animate-pop',
            collapsed ? 'left-full bottom-0 ml-2' : 'left-0 right-0 bottom-full mb-2')}>
          {THEMES.map((t) => {
            const active = t.id === value;
            const Icon = ICONS[t.id];
            return (
              <button key={t.id} role="menuitemradio" aria-checked={active}
                onClick={() => { onChange(t.id); setOpen(false); }}
                className={cls('w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-left',
                  active ? 'bg-cream text-navy font-medium' : 'text-gray-custom hover:bg-cream hover:text-navy')}>
                <Icon size={15} className="shrink-0" />
                <span className="flex-1">{t.label}</span>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
