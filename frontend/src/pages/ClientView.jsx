import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { clientAPI, multiperiodAPI } from '../services/api';

export default function ClientView() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => { fetchData(); }, [clientId]);

  const fetchData = async () => {
    try {
      const [clientRes, balancesRes] = await Promise.all([
        clientAPI.getClient(clientId),
        multiperiodAPI.getClientBalances(clientId),
      ]);
      setClient(clientRes.data.client);
      setBalances(balancesRes.data.balances || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-5)
    );
  };

  const handleCompare = () => {
    if (selectedIds.length < 2) return;
    navigate(`/compare?ids=${selectedIds.join(',')}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-navy">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <button onClick={() => navigate('/dashboard')} className="text-sage hover:text-white text-sm transition">
            &larr; Tableau de bord
          </button>
          <h1 className="font-display text-xl font-light text-white">{client?.name}</h1>
          <div className="w-32" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="font-display text-3xl font-semibold text-navy">{client?.name}</h2>
            <p className="text-gray-custom text-sm mt-1">{balances.length} exercice(s) importe(s)</p>
          </div>
          <div className="flex gap-3">
            {selectedIds.length >= 2 && (
              <button
                onClick={handleCompare}
                className="px-4 py-2 bg-accent-green text-white rounded-lg font-medium text-sm"
              >
                Comparer {selectedIds.length} exercices
              </button>
            )}
            <button onClick={() => navigate('/upload')} className="btn-navy flex items-center gap-2">
              <span className="text-lg leading-none">+</span> Importer un exercice
            </button>
          </div>
        </div>

        {selectedIds.length >= 2 && (
          <div className="bg-navy/10 border border-navy/20 rounded-lg px-4 py-3 mb-6 text-sm text-navy">
            {selectedIds.length} exercice(s) selectionne(s). Cliquez sur "Comparer" pour voir l'evolution.
          </div>
        )}

        {balances.length === 0 ? (
          <div className="card-moon p-12 text-center">
            <p className="font-display text-xl text-gray-custom mb-2">Aucun exercice importe</p>
            <button onClick={() => navigate('/upload')} className="btn-navy mt-4">
              Importer le premier exercice
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {balances.map((b) => {
              const isSelected = selectedIds.includes(b.id);
              return (
                <div
                  key={b.id}
                  className={`card-moon p-5 flex items-center justify-between transition ${isSelected ? 'ring-2 ring-navy' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(b.id)}
                      className="w-5 h-5 rounded accent-navy cursor-pointer"
                    />
                    <div>
                      <p className="font-display text-lg font-semibold text-navy">
                        {b.fiscal_year ? `Exercice ${b.fiscal_year}` : b.period}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {b.period} &mdash; Importe le {new Date(b.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/analyse/${b.id}`)}
                    className="btn-navy text-sm py-2 px-4"
                  >
                    Voir l'analyse
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
