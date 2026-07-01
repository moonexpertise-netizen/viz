import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { cls } from '../lib/format';

/**
 * Menu déroulant avec recherche (combobox).
 * @param {{ items: Array<{id,name,registrationNumber?}>, value, onChange, placeholder, loading }} props
 */
export default function Combobox({ items = [], value, onChange, placeholder = 'Sélectionner…', loading }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = items.find((i) => String(i.id) === String(value));

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, []);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((i) => String(i.name).toLowerCase().includes(q) || String(i.registrationNumber || '').includes(q))
    : items;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className="w-full flex items-center justify-between gap-2 border border-sage rounded-lg px-3 py-2 bg-white text-left focus:outline-none focus:ring-2 focus:ring-navy disabled:opacity-60"
      >
        <span className={cls('truncate', !selected && 'text-gray-custom')}>
          {loading ? 'Chargement…' : selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={16} className={cls('shrink-0 text-gray-custom transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-sage rounded-lg shadow-lg overflow-hidden">
          <div className="relative border-b border-sage">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="w-full pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy rounded-lg"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-gray-custom">Aucun résultat</li>}
            {filtered.map((i) => {
              const active = String(i.id) === String(value);
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(String(i.id)); setOpen(false); setQuery(''); }}
                    className={cls('w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-cream', active && 'bg-cream')}
                  >
                    <span className="truncate">
                      <span className="font-medium text-navy">{i.name}</span>
                      {i.registrationNumber && <span className="text-gray-custom ml-2">{i.registrationNumber}</span>}
                    </span>
                    {active && <Check size={15} className="shrink-0 text-accent-green" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
