import { useState } from 'react';
import { authAPI } from '../services/api';

export default function Login({ onSuccess, sso = {} }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.login(password);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-xl">
        <div className="flex flex-col items-center mb-6">
          <img src="/moon-logo.png" alt="MoonViz" className="w-14 h-14 mb-3" />
          <h1 className="text-2xl font-display text-navy">MoonViz</h1>
          <p className="text-sm text-gray-custom mt-1">Analyse financière · Pennylane</p>
        </div>
        {sso.enabled ? (
          <div className="space-y-3">
            <a href="/api/auth/login"
               className="w-full flex items-center justify-center gap-2.5 border border-sage rounded-lg px-4 py-2.5 font-medium text-navy hover:bg-cream transition">
              <MicrosoftLogo /> Se connecter avec Microsoft
            </a>
            <p className="text-xs text-gray-custom text-center">
              Accès réservé aux comptes {sso.domain ? <strong>@{sso.domain}</strong> : 'de l’organisation'}.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-custom mb-1">Mot de passe</label>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-sage rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy"
                placeholder="••••••••"
              />
            </div>
            {error && <div className="text-sm text-accent-red bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={loading} className="btn-navy w-full disabled:opacity-60">
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        )}
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
