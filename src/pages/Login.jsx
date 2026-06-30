import { useState } from 'react';
import { authAPI } from '../services/api';

const DOMAIN = 'moonexpertise.fr';

export default function Login({ onSuccess, sso = {} }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const domain = sso.domain || DOMAIN;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const mail = email.trim().toLowerCase();
    if (!mail.endsWith(`@${domain}`)) {
      setError(`Seules les adresses @${domain} peuvent se connecter.`);
      return;
    }
    setLoading(true);
    try {
      await authAPI.login(mail, password);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-md">
        {/* Marque */}
        <div className="flex flex-col items-center mb-8 text-center">
          <img src="/moon-icon.svg" alt="MoonViz" className="w-16 h-16 mb-4" />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">MoonViz</h1>
          <p className="text-sm text-sage mt-2">Connexion à l'analyse financière.</p>
        </div>

        {/* Carte */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 space-y-4">
          {sso.enabled && (
            <>
              <a href="/api/auth/login"
                className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-white text-navy font-medium px-4 py-3 hover:bg-white/90 transition">
                <MicrosoftLogo /> Se connecter avec Microsoft
              </a>
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-sage/60">
                <span className="flex-1 h-px bg-white/10" /> ou mot de passe <span className="flex-1 h-px bg-white/10" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-sage mb-1.5">Adresse e-mail</label>
              <input
                type="email"
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl bg-white/[0.05] border border-white/[0.10] px-3.5 py-2.5 text-white placeholder:text-sage/50 focus:outline-none focus:ring-2 focus:ring-gold/60 focus:border-transparent transition"
                placeholder={`prenom@${domain}`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-sage mb-1.5">Mot de passe</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-white/[0.05] border border-white/[0.10] px-3.5 py-2.5 text-white placeholder:text-sage/50 focus:outline-none focus:ring-2 focus:ring-gold/60 focus:border-transparent transition"
                placeholder="••••••••••••"
              />
            </div>

            {error && (
              <div className="text-sm text-red-200 bg-red-500/15 border border-red-500/25 rounded-xl px-3.5 py-2.5">{error}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-gold text-white font-semibold px-4 py-3 hover:brightness-95 transition disabled:opacity-60">
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <p className="text-xs text-sage/70 text-center">
            Accès réservé aux comptes <strong className="text-sage">@{domain}</strong>.
          </p>
        </div>

        <p className="text-center text-xs text-sage/50 mt-6">MoonViz · Analyse financière · Pennylane</p>
      </div>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
