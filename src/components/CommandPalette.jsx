import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { cls } from '../lib/format';

/**
 * Palette de commandes (Ctrl/⌘+K) avec navigation clavier.
 * @param {{ open, onClose, groups: Array<{title, items: Array<{id,label,hint,icon,keywords,run}>}> }} props
 */
export default function CommandPalette({ open, onClose, groups }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const tokens = term.split(/\s+/).filter(Boolean);
    const match = (it) => {
      if (!tokens.length) return true;
      const hay = `${it.label} ${it.keywords || ''} ${it.hint || ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    };
    return groups
      .map((g) => ({ ...g, items: g.items.filter(match) }))
      .filter((g) => g.items.length);
  }, [groups, q]);

  const flat = useMemo(() => filtered.flatMap((g) => g.items), [filtered]);

  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = flat[active]; if (it) { onClose(); it.run(); } }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  if (!open) return null;

  let idx = -1;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-navy/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-sage overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 border-b border-sage">
          <Search size={18} className="text-gray-custom shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Aller à une société, un exercice, une action…"
            className="flex-1 py-3.5 text-sm bg-transparent focus:outline-none"
          />
          <kbd className="text-[10px] text-gray-custom border border-sage rounded px-1.5 py-0.5 shrink-0">Échap</kbd>
        </div>
        <div ref={scrollRef} className="max-h-[58vh] overflow-y-auto py-2">
          {flat.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-custom">Aucun résultat</p>}
          {filtered.map((g) => (
            <div key={g.title} className="mb-1">
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-custom">{g.title}</p>
              {g.items.map((it) => {
                idx += 1;
                const i = idx;
                const isActive = i === active;
                return (
                  <button
                    key={it.id}
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => { onClose(); it.run(); }}
                    className={cls('w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors', isActive ? 'bg-cream' : 'hover:bg-cream/60')}
                  >
                    <span className={cls('shrink-0', isActive ? 'text-navy' : 'text-gray-custom')}>{it.icon}</span>
                    <span className="flex-1 text-navy truncate">{it.label}</span>
                    {it.hint && <span className="text-xs text-gray-custom shrink-0">{it.hint}</span>}
                    {isActive && <CornerDownLeft size={13} className="text-gray-custom shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-t border-sage bg-cream/50 text-[11px] text-gray-custom">
          <span className="flex items-center gap-1"><kbd className="border border-sage rounded px-1">↑</kbd><kbd className="border border-sage rounded px-1">↓</kbd> naviguer</span>
          <span className="flex items-center gap-1"><kbd className="border border-sage rounded px-1">↵</kbd> ouvrir</span>
          <span className="flex items-center gap-1"><kbd className="border border-sage rounded px-1">Échap</kbd> fermer</span>
        </div>
      </div>
    </div>
  );
}
