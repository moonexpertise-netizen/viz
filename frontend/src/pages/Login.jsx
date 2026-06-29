import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function Login({ setIsAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = isRegister
        ? await authAPI.register(email, password)
        : await authAPI.login(email, password);

      localStorage.setItem('token', response.data.token);
      setIsAuthenticated(true);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Logo / Titre */}
        <div className="text-center mb-10">
          <img src="/moon-logo.png" alt="MOON" className="h-16 w-16 rounded-xl mx-auto mb-4" />
          <h1 className="font-display text-4xl font-semibold tracking-wide text-navy">MOON Insight</h1>
          <p className="text-gray-custom mt-2 font-display font-light">Analyse financiere intelligente</p>
        </div>

        <div className="card-moon p-8">
          <h2 className="font-display text-xl font-semibold text-navy mb-6">
            {isRegister ? 'Creer un compte' : 'Connexion'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-custom mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-sage rounded-lg focus:outline-none focus:ring-2 focus:ring-navy bg-cream"
                placeholder="votre@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-custom mb-2">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-sage rounded-lg focus:outline-none focus:ring-2 focus:ring-navy bg-cream"
                placeholder="Minimum 6 caracteres"
                required
              />
            </div>

            {error && <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-navy py-3 text-base font-semibold disabled:opacity-50"
            >
              {loading ? 'Chargement...' : isRegister ? 'Creer mon compte' : 'Se connecter'}
            </button>
          </form>

          <div className="text-center mt-6 pt-6 border-t border-sage-light">
            <p className="text-sm text-gray-custom">
              {isRegister ? 'Deja un compte ?' : 'Pas encore de compte ?'}{' '}
              <button
                onClick={() => { setIsRegister(!isRegister); setError(''); }}
                className="text-navy font-semibold hover:underline"
              >
                {isRegister ? 'Se connecter' : 'Creer un compte'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
