import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { THEMES } from '../lib/theme';
import { cls } from '../lib/format';

/**
 * Sélecteur de thème de couleurs (popover), pensé pour le bas de la sidebar.
 * `collapsed` : sidebar repliée → bouton icône seul, popover ancré à droite.
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
        title="Thème de couleurs"
        className={cls('w-full inline-flex items-center gap-2 rounded-lg text-sm text-sage hover:text-white hover:bg-white/[0.06] transition',
          collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2')}>
        <Palette size={16} className="shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Thème</span>
            <span className="w-3 h-3 rounded-full ring-1 ring-white/30 shrink-0" style={{ backgroundColor: current.swatch }} />
          </>
        )}
      </button>

      {open && (
        <div role="menu"
          className={cls('absolute z-50 min-w-[180px] rounded-xl border border-sage bg-white shadow-lg p-1 animate-pop',
            collapsed ? 'left-full bottom-0 ml-2' : 'left-0 right-0 bottom-full mb-2')}>
          <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-custom">Thème de couleurs</div>
          {THEMES.map((t) => {
            const active = t.id === value;
            return (
              <button key={t.id} role="menuitemradio" aria-checked={active}
                onClick={() => { onChange(t.id); setOpen(false); }}
                className={cls('w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-left',
                  active ? 'bg-cream text-navy font-medium' : 'text-gray-custom hover:bg-cream hover:text-navy')}>
                <span className="w-3.5 h-3.5 rounded-full ring-1 ring-black/10 shrink-0" style={{ backgroundColor: t.swatch }} />
                <span className="flex-1">{t.label}</span>
                {active && <Check size={14} className="text-navy shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
