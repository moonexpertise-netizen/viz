import { useState } from 'react';
import { authAPI } from '../services/api';

const DOMAIN = 'moonexpertise.fr';

export default function Login({ onSuccess, sso = {} }) {
  const [step, setStep] = useState('login'); // 'login' | 'code'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false); // accès de secours par mot de passe (si SSO actif)
  const domain = sso.domain || DOMAIN;

  const mail = () => email.trim().toLowerCase();
  const guardEmail = () => {
    if (!mail().endsWith(`@${domain}`)) {
      setError(`Seules les adresses @${domain} peuvent se connecter.`);
      return false;
    }
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (!guardEmail()) return;
    setLoading(true);
    try {
      const { data } = await authAPI.login(mail(), password);
      if (data.verify) {
        setStep('code');
        setNotice(data.message || 'Un code de vérification vient d\'être envoyé par e-mail.');
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.verify(mail(), code.trim());
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Code invalide.');
    } finally {
      setLoading(false);
    }
  };

  const forgot = async () => {
    setError(''); setNotice('');
    if (!guardEmail()) { setError(`Saisis d'abord ton adresse @${domain} ci-dessus.`); return; }
    try {
      await authAPI.forgot(mail());
      setNotice('Si un compte existe, un lien de réinitialisation vient d\'être envoyé par e-mail.');
    } catch (err) {
      setError(err.response?.data?.error || 'Réinitialisation indisponible pour le moment.');
    }
  };

  const signup = async () => {
    setError(''); setNotice('');
    if (!guardEmail()) { setError(`Saisis d'abord ton adresse @${domain} ci-dessus.`); return; }
    setLoading(true);
    try {
      const { data } = await authAPI.signup(mail());
      setNotice(data.message || 'Demande envoyée.');
    } catch (err) {
      setError(err.response?.data?.error || 'Demande impossible pour le moment.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full rounded-xl bg-white/[0.05] border border-white/[0.10] px-3.5 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-gold/60 focus:border-transparent transition';

  return (
    <div className="auth-screen min-h-[100dvh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-view">
        {/* Marque */}
        <div className="flex flex-col items-center mb-8 text-center">
          <img src="/moon-icon.svg" alt="MoonViz" className="w-16 h-16 mb-4" />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">MoonViz</h1>
          <p className="text-sm text-sage mt-2">
            {step === 'code' ? 'Vérification de sécurité.' : 'Connexion à l\'analyse financière.'}
          </p>
        </div>

        {/* Carte */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 space-y-4">
          {step === 'login' && sso.enabled && (
            <>
              <button type="button" onClick={() => { window.location.href = '/api/sso'; }}
                className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-white text-navy font-semibold px-4 py-3 hover:bg-white/90 transition">
                <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                Se connecter avec Microsoft
              </button>
              {showPwd && (
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/[0.10]" />
                  <span className="text-xs text-sage">accès de secours</span>
                  <span className="h-px flex-1 bg-white/[0.10]" />
                </div>
              )}
            </>
          )}
          {step === 'code' ? (
            <form onSubmit={submitCode} className="space-y-3">
              <p className="text-sm text-sage">
                Nouvel appareil détecté. Saisis le code envoyé à <strong className="text-white">{mail()}</strong> (valable 10 minutes).
              </p>
              <input
                type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${inputCls} text-center text-2xl tracking-[0.5em] font-semibold`}
                placeholder="······"
              />
              {error && <div className="text-sm text-red-200 bg-red-500/15 border border-red-500/25 rounded-xl px-3.5 py-2.5">{error}</div>}
              {notice && !error && <div className="text-sm text-emerald-200 bg-emerald-500/15 border border-emerald-500/25 rounded-xl px-3.5 py-2.5">{notice}</div>}
              <button type="submit" disabled={loading || code.length < 6}
                className="w-full rounded-xl bg-gold text-white font-semibold px-4 py-3 hover:brightness-95 transition disabled:opacity-60">
                {loading ? 'Vérification…' : 'Valider le code'}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => { setStep('login'); setCode(''); setError(''); setNotice(''); }}
                  className="text-xs text-sage hover:text-white underline underline-offset-2 transition">
                  ← Retour à la connexion
                </button>
              </div>
            </form>
          ) : (!sso.enabled || showPwd) ? (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-sage mb-1.5">Adresse e-mail</label>
                <input type="email" autoFocus autoComplete="username" value={email}
                  onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder={`prenom@${domain}`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-sage mb-1.5">Mot de passe</label>
                <input type="password" autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••••••" />
              </div>

              {error && <div className="text-sm text-red-200 bg-red-500/15 border border-red-500/25 rounded-xl px-3.5 py-2.5">{error}</div>}
              {notice && <div className="text-sm text-emerald-200 bg-emerald-500/15 border border-emerald-500/25 rounded-xl px-3.5 py-2.5">{notice}</div>}

              <button type="submit" disabled={loading}
                className="w-full rounded-xl bg-gold text-white font-semibold px-4 py-3 hover:brightness-95 transition disabled:opacity-60">
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>

              <div className="flex items-center justify-center gap-4">
                <button type="button" onClick={forgot} className="text-xs text-sage hover:text-white underline underline-offset-2 transition">
                  Mot de passe oublié ?
                </button>
                {sso.accountsEnabled && (
                  <button type="button" onClick={signup} disabled={loading}
                    className="text-xs text-sage hover:text-white underline underline-offset-2 transition disabled:opacity-60">
                    Demander l'accès
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="text-center pt-1 pb-0.5">
              <button type="button" onClick={() => setShowPwd(true)}
                className="text-xs text-sage/70 hover:text-white underline underline-offset-2 transition">
                Problème avec Microsoft ? Accès par mot de passe
              </button>
            </div>
          )}

          <p className="text-xs text-sage opacity-70 text-center">
            Accès réservé aux comptes <strong className="text-sage">@{domain}</strong>.
          </p>
        </div>

        <p className="text-center text-xs text-sage opacity-50 mt-6">MoonViz · Analyse financière · Pennylane</p>
      </div>
    </div>
  );
}
