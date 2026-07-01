import { useEffect, useState, useCallback } from 'react';
import { authAPI } from './services/api';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Workspace from './pages/Workspace';

export default function App() {
  const [authed, setAuthed] = useState(null); // null = inconnu, false, true
  const [sso, setSso] = useState({ enabled: false, domain: null, resetEnabled: false });
  const isReset = typeof window !== 'undefined' && window.location.pathname === '/reset';

  const refresh = useCallback(async () => {
    try {
      const { data } = await authAPI.session();
      setAuthed(Boolean(data.authenticated));
      setSso({ enabled: Boolean(data.sso), domain: data.domain, resetEnabled: Boolean(data.resetEnabled) });
    } catch (e) {
      // 401 => non authentifié ; erreur réseau transitoire => ne pas déconnecter un utilisateur déjà connecté.
      if (e?.response?.status === 401) setAuthed(false);
      else setAuthed((a) => (a === null ? false : a));
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauth = () => setAuthed(false);
    window.addEventListener('mv:unauthorized', onUnauth);
    return () => window.removeEventListener('mv:unauthorized', onUnauth);
  }, [refresh]);

  const logout = async () => {
    try { await authAPI.logout(); } catch { /* noop */ }
    setAuthed(false);
  };

  if (isReset) return <ResetPassword />;

  if (authed === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-cream text-gray-custom">
        Chargement…
      </div>
    );
  }

  if (!authed) return <Login onSuccess={() => setAuthed(true)} sso={sso} />;
  return <Workspace onLogout={logout} />;
}
