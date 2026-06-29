import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { reportAPI, clientAPI, uploadAPI } from '../services/api';

const fmt = (n) => {
  if (!n && n !== 0) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [balances, setBalances] = useState([]);
  const [clientGroups, setClientGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchBalances(); }, []);

  const fetchBalances = async () => {
    try {
      const response = await reportAPI.getAllReports();
      const balanceList = response.data.balances || [];
      setBalances(balanceList);
      groupByClient(balanceList);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupByClient = (balanceList) => {
    const grouped = {};
    balanceList.forEach((b) => {
      const key = b.clientName;
      if (!grouped[key]) {
        grouped[key] = { clientName: b.clientName, clientId: b.client_id, balances: [] };
      }
      grouped[key].balances.push(b);
    });
    setClientGroups(Object.values(grouped));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handleDeleteBalance = async (e, balanceId) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer cet exercice ?')) return;
    try {
      await uploadAPI.deleteBalance(balanceId);
      fetchBalances();
    } catch (error) { console.error(error); }
  };

  const handleReplaceFEC = async (e, balanceId) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAPI.deleteBalance(balanceId);
      fetchBalances();
      alert('FEC supprime. Reimportez le nouveau FEC dans ce dossier.');
    } catch (error) { console.error(error); }
  };

  const handleDeleteClient = async (e, clientId) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer le client et tous ses exercices ?')) return;
    try {
      await clientAPI.deleteClient(clientId);
      fetchBalances();
    } catch (error) {
      console.error('Erreur suppression:', error);
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-navy">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src="/moon-logo.png" alt="MOON" className="h-10 w-10 rounded-lg" />
            <div>
              <h1 className="font-display text-xl font-semibold tracking-wide text-white">MOON Insight</h1>
              <p className="text-sage text-xs font-display">Analyse financiere intelligente</p>
            </div>
          </div>
          <button onClick={handleLogout} className="text-sage hover:text-white text-sm transition">
            Deconnexion
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="font-display text-3xl font-semibold text-navy">Mes dossiers</h2>
          <button onClick={() => navigate('/upload')} className="btn-navy flex items-center gap-2">
            <span className="text-lg leading-none">+</span>
            Nouveau dossier
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-navy border-t-transparent rounded-full animate-spin" />
          </div>
        ) : clientGroups.length === 0 ? (
          <div className="card-moon p-12 text-center">
            <p className="font-display text-xl text-gray-custom mb-2">Aucun dossier. Importez votre premier FEC pour commencer.</p>
            <p className="text-sm text-gray-400 mb-6"></p>
            <button onClick={() => navigate('/upload')} className="btn-navy">
              Importer votre premier FEC
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {clientGroups.map((group) => {
              const latest = group.balances[0];
              return (
                <div
                  key={group.clientName}
                  className="card-moon p-6 cursor-pointer hover:shadow-md transition"
                  onClick={() => group.clientId
                    ? navigate(`/monthly/client/${group.clientId}`)
                    : navigate(`/analyse/${latest.id}`)
                  }
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-display text-lg font-semibold text-navy">{group.clientName}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-sage/30 text-navy px-2 py-0.5 rounded-full font-medium">
                        {group.balances.length} exercice{group.balances.length > 1 ? 's' : ''}
                      </span>
                      {group.clientId && (
                        <button
                          onClick={(e) => handleDeleteClient(e, group.clientId)}
                          className="text-gray-400 hover:text-red-500 transition p-1"
                          title="Supprimer le client"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-gray-400 mb-2">
                    Dernier : {latest.fiscal_year ? `Exercice ${latest.fiscal_year}` : latest.period} &mdash; {new Date(latest.created_at).toLocaleDateString('fr-FR')}
                  </p>

                  <div className="mb-5">
                    {group.balances.map(b => (
                      <div key={b.id} className="flex items-center justify-between text-xs text-gray-500 mt-1">
                        <span>{b.fiscal_year ? `Exercice ${b.fiscal_year}` : b.period}</span>
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer text-navy hover:underline">
                            Remplacer
                            <input type="file" className="hidden" accept=".txt" onChange={(e) => handleReplaceFEC(e, b.id)} />
                          </label>
                          <button onClick={(e) => handleDeleteBalance(e, b.id)} className="text-red-400 hover:text-red-600">&times;</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(group.clientId ? `/monthly/client/${group.clientId}` : `/analyse/${latest.id}`); }}
                      className="flex-1 btn-navy text-sm py-2"
                    >
                      Ouvrir l'analyse
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
