import { useEffect, useRef } from 'react';
import { cls } from '../lib/format';

/**
 * Fenêtre de confirmation interne (remplace window.confirm), thémée.
 * Contrôlée : rendue seulement si `open`.
 *   open, title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel
 */
export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler',
  danger = false, onConfirm, onCancel,
}) {
  const btnRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    btnRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
      if (e.key === 'Enter') onConfirm?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl border border-sage w-full max-w-md animate-pop" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-base font-semibold text-navy">{title}</h3>
          {message && <p className="text-sm text-gray-custom mt-2 whitespace-pre-line leading-relaxed">{message}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-sage bg-cream/50 rounded-b-xl">
          <button onClick={onCancel} className="text-sm text-gray-custom hover:text-navy px-3 py-1.5 rounded-lg hover:bg-cream transition">{cancelLabel}</button>
          <button ref={btnRef} onClick={onConfirm}
            className={cls('text-sm px-4 py-1.5 rounded-lg transition font-medium', danger ? 'bg-accent-red text-white hover:brightness-95' : 'btn-navy')}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
