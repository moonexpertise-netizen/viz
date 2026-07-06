import { useState } from 'react';
import { authAPI } from '../services/api';

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 10) { setError('Mot de passe trop court (10 caractères minimum).'); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      await authAPI.reset(token, password);
      setDone(true);
      try { window.history.replaceState({}, '', '/reset'); } catch { /* noop */ } // retire le token de l'URL/historique
    } catch (err) {
      setError(err.response?.data?.error || 'Échec de la réinitialisation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen min-h-[100dvh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <img src="/moon-icon.svg" alt="MoonViz" className="w-16 h-16 mb-4" />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Nouveau mot de passe</h1>
          <p className="text-sm text-sage mt-2">Choisis un mot de passe (10 caractères minimum).</p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          {done ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-emerald-200 bg-emerald-500/15 border border-emerald-500/25 rounded-xl px-3.5 py-3">Mot de passe enregistré.</p>
              <a href="/" className="inline-block w-full rounded-xl bg-gold text-white font-semibold px-4 py-3 hover:brightness-95 transition">Aller à la connexion</a>
            </div>
          ) : !token ? (
            <p className="text-sm text-red-200 bg-red-500/15 border border-red-500/25 rounded-xl px-3.5 py-3">Lien invalide. Refais une demande depuis la page de connexion.</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <input type="password" autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-white/[0.05] border border-white/[0.10] px-3.5 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-gold/60 focus:border-transparent transition"
                placeholder="Nouveau mot de passe" />
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-xl bg-white/[0.05] border border-white/[0.10] px-3.5 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-gold/60 focus:border-transparent transition"
                placeholder="Confirmer le mot de passe" />
              {error && <div className="text-sm text-red-200 bg-red-500/15 border border-red-500/25 rounded-xl px-3.5 py-2.5">{error}</div>}
              <button type="submit" disabled={loading} className="w-full rounded-xl bg-gold text-white font-semibold px-4 py-3 hover:brightness-95 transition disabled:opacity-60">
                {loading ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
