import { useEffect, useState, useCallback } from 'react';
import { authAPI } from './services/api';
import Login from './pages/Login';
import Workspace from './pages/Workspace';

export default function App() {
  const [authed, setAuthed] = useState(null); // null = inconnu, false, true

  const refresh = useCallback(async () => {
    try {
      const { data } = await authAPI.session();
      setAuthed(Boolean(data.authenticated));
    } catch {
      setAuthed(false);
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

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream text-gray-custom">
        Chargement…
      </div>
    );
  }

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;
  return <Workspace onLogout={logout} />;
}
