import { useEffect, useState, useCallback, Component } from 'react';
import { authAPI } from './services/api';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import ActionPage from './pages/ActionPage';
import Workspace from './pages/Workspace';

// Garde-fou : un crash de composant affiche un message au lieu d'un écran blanc.
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error('MoonViz error:', err); } catch { /* noop */ } }
  render() {
    if (this.state.err) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-cream px-4 text-center">
          <div className="card-moon p-8 max-w-md">
            <p className="text-navy font-semibold mb-2">Une erreur est survenue</p>
            <p className="text-sm text-gray-custom mb-4">Recharge la page. Si le problème persiste, préviens l'administrateur.</p>
            <button onClick={() => window.location.reload()} className="btn-navy">Recharger</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [authed, setAuthed] = useState(null); // null = inconnu, false, true
  const [sso, setSso] = useState({ enabled: false, domain: null, resetEnabled: false, accountsEnabled: false });
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isReset = path === '/reset';
  const isAction = path === '/action';

  const refresh = useCallback(async () => {
    try {
      const { data } = await authAPI.session();
      setAuthed(Boolean(data.authenticated));
      setSso({ enabled: Boolean(data.sso), domain: data.domain, resetEnabled: Boolean(data.resetEnabled), accountsEnabled: Boolean(data.accountsEnabled) });
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

  let content;
  if (isAction) content = <ActionPage />;
  else if (isReset) content = <ResetPassword />;
  else if (authed === null) content = (
    <div className="min-h-[100dvh] flex items-center justify-center bg-cream text-gray-custom">Chargement…</div>
  );
  else if (!authed) content = <Login onSuccess={() => setAuthed(true)} sso={sso} />;
  else content = <Workspace onLogout={logout} />;

  return <ErrorBoundary>{content}</ErrorBoundary>;
}
