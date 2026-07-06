import { useEffect, useState } from 'react';
import { authAPI } from '../services/api';

const TITLES = {
  approve: "Approbation d'accès",
  deny: 'Refus de demande',
  revoke: 'Déconnexion de sécurité',
};

/** Page cible des liens d'e-mail (/action?do=approve|deny|revoke&token=…). */
export default function ActionPage() {
  const params = new URLSearchParams(window.location.search);
  const doAction = params.get('do') || '';
  const token = params.get('token') || '';
  const [state, setState] = useState({ status: 'busy', message: '' });

  useEffect(() => {
    if (!TITLES[doAction] || !token) { setState({ status: 'error', message: 'Lien invalide.' }); return; }
    authAPI.doAction(doAction, token)
      .then(({ data }) => setState({ status: 'ok', message: data.message || 'Action effectuée.' }))
      .catch((err) => setState({ status: 'error', message: err.response?.data?.error || "Échec de l'action." }));
    try { window.history.replaceState({}, '', '/action'); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-screen min-h-[100dvh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-view">
        <div className="flex flex-col items-center mb-8 text-center">
          <img src="/moon-icon.svg" alt="MoonViz" className="w-16 h-16 mb-4" />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">{TITLES[doAction] || 'Action'}</h1>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-center space-y-4">
          {state.status === 'busy' && <p className="text-sm text-sage">Traitement en cours…</p>}
          {state.status === 'ok' && (
            <p className="text-sm text-emerald-200 bg-emerald-500/15 border border-emerald-500/25 rounded-xl px-3.5 py-3">{state.message}</p>
          )}
          {state.status === 'error' && (
            <p className="text-sm text-red-200 bg-red-500/15 border border-red-500/25 rounded-xl px-3.5 py-3">{state.message}</p>
          )}
          <a href="/" className="inline-block w-full rounded-xl bg-gold text-white font-semibold px-4 py-3 hover:brightness-95 transition">Aller à MoonViz</a>
        </div>
      </div>
    </div>
  );
}
