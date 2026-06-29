import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadAPI, clientAPI } from '../services/api';

const COLUMN_ROLES = [
  { key: 'compte', label: 'N° de compte', required: true },
  { key: 'libelle', label: 'Libelle', required: true },
  { key: 'soldeN', label: 'Solde N (exercice courant)', required: false },
  { key: 'soldeN1', label: 'Solde N-1 (exercice precedent)', required: false },
  { key: 'debit', label: 'Debit', required: false },
  { key: 'credit', label: 'Credit', required: false },
];

const months = [
  { value: '01', label: 'Janvier' }, { value: '02', label: 'Fevrier' },
  { value: '03', label: 'Mars' }, { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' }, { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' }, { value: '08', label: 'Aout' },
  { value: '09', label: 'Septembre' }, { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' }, { value: '12', label: 'Decembre' },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

// Statuts possibles pour chaque fichier
const STATUS = {
  QUEUED: 'queued',
  PREVIEWING: 'previewing',
  FEC_READY: 'fec_ready',
  BALANCE_MAPPING: 'balance_mapping',
  UPLOADING: 'uploading',
  DONE: 'done',
  ERROR: 'error',
};

const statusLabel = {
  [STATUS.QUEUED]: 'En attente',
  [STATUS.PREVIEWING]: 'Analyse...',
  [STATUS.FEC_READY]: 'FEC détecté',
  [STATUS.BALANCE_MAPPING]: 'Mapping requis',
  [STATUS.UPLOADING]: 'Import...',
  [STATUS.DONE]: 'Importé',
  [STATUS.ERROR]: 'Erreur',
};

const statusColor = {
  [STATUS.QUEUED]: 'text-gray-400',
  [STATUS.PREVIEWING]: 'text-blue-500',
  [STATUS.FEC_READY]: 'text-green-600',
  [STATUS.BALANCE_MAPPING]: 'text-amber-600',
  [STATUS.UPLOADING]: 'text-blue-500',
  [STATUS.DONE]: 'text-green-600',
  [STATUS.ERROR]: 'text-red-500',
};

export default function Upload() {
  const navigate = useNavigate();
  const dropRef = useRef(null);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Liste des fichiers avec leur etat
  const [fileItems, setFileItems] = useState([]);
  // Index du fichier en cours de mapping (editeur de mapping ouvert)
  const [mappingTarget, setMappingTarget] = useState(null);

  // Phase globale
  const [phase, setPhase] = useState('setup'); // 'setup' | 'review' | 'importing' | 'done'
  const [importResults, setImportResults] = useState([]);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await clientAPI.getClients();
      setClients(response.data.clients || []);
    } catch (e) { console.error(e); }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) { setGlobalError('Le nom du client est obligatoire'); return; }
    try {
      const response = await clientAPI.createClient(newClientName);
      setClients([...clients, response.data.client]);
      setSelectedClient(response.data.client.id.toString());
      setNewClientName('');
      setShowNewClient(false);
      setGlobalError('');
    } catch (e) {
      setGlobalError(e.response?.data?.error || 'Erreur');
    }
  };

  const updateFileItem = (id, updates) => {
    setFileItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const addFiles = async (rawFiles) => {
    if (!selectedClient) {
      setGlobalError('Veuillez selectionner un client avant d\'ajouter des fichiers');
      return;
    }
    setGlobalError('');

    const newItems = Array.from(rawFiles).map((f, i) => ({
      id: `${Date.now()}-${i}`,
      file: f,
      status: STATUS.QUEUED,
      previewData: null,
      exercice: null,
      mapping: {},
      period: null, // { month, year } pour les balances
      error: null,
    }));

    setFileItems(prev => [...prev, ...newItems]);
    setPhase('review');

    // Preview automatique de chaque fichier
    for (const item of newItems) {
      await previewFile(item);
    }
  };

  const previewFile = async (item) => {
    updateFileItem(item.id, { status: STATUS.PREVIEWING });
    try {
      const formData = new FormData();
      formData.append('file', item.file);
      const response = await uploadAPI.preview(formData);
      const data = response.data;

      if (data.autoMapping.type === 'fec') {
        updateFileItem(item.id, {
          status: STATUS.FEC_READY,
          previewData: data,
          exercice: data.exercice,
          mapping: data.autoMapping,
        });
      } else {
        const now = new Date();
        updateFileItem(item.id, {
          status: STATUS.BALANCE_MAPPING,
          previewData: data,
          mapping: { ...data.autoMapping },
          period: { month: String(now.getMonth() + 1).padStart(2, '0'), year: String(now.getFullYear()) },
        });
      }
    } catch (e) {
      updateFileItem(item.id, {
        status: STATUS.ERROR,
        error: e.response?.data?.error || 'Erreur lors de l\'analyse',
      });
    }
  };

  // Drag & drop handlers
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) addFiles(files);
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  // Verifier que tous les fichiers sont prets
  const allReady = fileItems.length > 0 && fileItems.every(
    item => item.status === STATUS.FEC_READY || item.status === STATUS.BALANCE_MAPPING || item.status === STATUS.DONE || item.status === STATUS.ERROR
  );

  // Trier par annee fiscale (les plus anciens d'abord) pour que le N-1 soit disponible
  const importableItems = fileItems
    .filter(item => item.status === STATUS.FEC_READY || item.status === STATUS.BALANCE_MAPPING)
    .sort((a, b) => {
      const yearA = a.exercice?.annee || parseInt(a.period?.year) || 9999;
      const yearB = b.exercice?.annee || parseInt(b.period?.year) || 9999;
      return yearA - yearB;
    });

  // Verifier que les balances ont une periode assignee
  const balancesWithoutPeriod = importableItems.filter(
    item => item.status === STATUS.BALANCE_MAPPING && (!item.period?.month || !item.period?.year)
  );

  const handleImportAll = async () => {
    if (balancesWithoutPeriod.length > 0) {
      setGlobalError('Certains FEC n\'ont pas de periode assignee');
      return;
    }
    setGlobalError('');
    setPhase('importing');

    const results = [];
    for (const item of importableItems) {
      updateFileItem(item.id, { status: STATUS.UPLOADING });
      try {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('clientId', selectedClient);
        formData.append('existingFile', item.previewData.filename);

        if (item.mapping?.type !== 'fec') {
          // Balance : inclure la periode et le mapping
          const period = `${item.period.month}-${item.period.year}`;
          formData.append('period', period);
          formData.append('selectedYear', item.period.year);
          formData.append('mapping', JSON.stringify(item.mapping));
        }
        // Pour FEC : pas de periode (auto-detectee cote serveur)

        const response = await uploadAPI.uploadBalance(formData);
        updateFileItem(item.id, { status: STATUS.DONE });
        results.push({ id: item.id, balanceId: response.data.balanceId, name: item.file.name, period: response.data.period });
      } catch (e) {
        updateFileItem(item.id, {
          status: STATUS.ERROR,
          error: e.response?.data?.error || 'Erreur lors de l\'import',
        });
        results.push({ id: item.id, error: e.response?.data?.error, name: item.file.name });
      }
    }

    setImportResults(results);
    setPhase('done');
  };

  const removeFile = (id) => {
    setFileItems(prev => prev.filter(item => item.id !== id));
    if (fileItems.length <= 1) setPhase('setup');
  };

  const inputClass = "w-full px-4 py-3 border border-sage rounded-lg focus:outline-none focus:ring-2 focus:ring-navy bg-cream text-sm";
  const selectClass = "flex-1 px-4 py-3 border border-sage rounded-lg focus:outline-none focus:ring-2 focus:ring-navy bg-cream text-sm";

  const successResults = importResults.filter(r => r.balanceId);
  const lastBalanceId = successResults.length > 0 ? successResults[successResults.length - 1].balanceId : null;

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-navy">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <button onClick={() => navigate('/dashboard')} className="text-sage hover:text-white text-sm transition">
            &larr; Retour au tableau de bord
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* DONE */}
        {phase === 'done' && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">✓</div>
            <h1 className="font-display text-3xl font-semibold text-navy mb-2">Import terminé</h1>
            <p className="text-gray-custom mb-2">
              {successResults.length} exercice{successResults.length > 1 ? 's' : ''} importé{successResults.length > 1 ? 's' : ''} avec succès
            </p>
            {importResults.filter(r => r.error).length > 0 && (
              <p className="text-red-500 text-sm mb-4">{importResults.filter(r => r.error).length} erreur(s)</p>
            )}
            <div className="space-y-2 mb-8 max-w-md mx-auto">
              {importResults.map(r => (
                <div key={r.id} className={`flex items-center justify-between p-3 rounded-lg ${r.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'} text-sm`}>
                  <span className="font-medium truncate">{r.name}</span>
                  {r.error ? <span className="ml-2 text-xs">{r.error}</span> : <span className="ml-2 text-xs">{r.period}</span>}
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-center">
              {lastBalanceId && (
                <button onClick={() => navigate(`/analyse/${lastBalanceId}`)} className="btn-navy px-6 py-2">
                  Voir la dernière analyse
                </button>
              )}
              <button onClick={() => navigate('/dashboard')} className="px-6 py-2 border border-sage rounded-lg text-gray-custom hover:bg-cream-dark text-sm">
                Tableau de bord
              </button>
            </div>
          </div>
        )}

        {/* SETUP + REVIEW */}
        {phase !== 'done' && (
          <>
            <h1 className="font-display text-3xl font-semibold text-navy mb-2">Importer des FEC</h1>
            <p className="text-gray-custom mb-8 text-sm">
              Déposez un ou plusieurs FEC — la période est détectée automatiquement.
            </p>

            {/* Client */}
            <div className="card-moon p-6 mb-6">
              <label className="block text-xs uppercase tracking-wider text-gray-custom mb-3">Client / Dossier</label>
              {!showNewClient ? (
                <div className="space-y-2">
                  <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className={inputClass}>
                    <option value="">Selectionner un client...</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowNewClient(true)} className="text-navy hover:underline text-sm font-medium">
                    + Nouveau client
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input type="text" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Nom du client" className={inputClass} />
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCreateClient} className="flex-1 btn-navy py-2 text-sm">Creer</button>
                    <button type="button" onClick={() => setShowNewClient(false)} className="flex-1 py-2 text-sm border border-sage rounded-lg text-gray-custom hover:bg-cream-dark">Annuler</button>
                  </div>
                </div>
              )}
            </div>

            {/* Zone de dépôt */}
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => document.getElementById('file-input-multi').click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition mb-6 ${
                dragOver ? 'border-navy bg-blue-50' : 'border-sage hover:border-navy'
              }`}
            >
              <input
                type="file"
                id="file-input-multi"
                multiple
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={(e) => e.target.files?.length && addFiles(e.target.files)}
              />
              <div className="text-4xl mb-3">📂</div>
              <p className="text-navy font-medium">Déposez vos fichiers ici</p>
              <p className="text-gray-custom text-sm mt-1">FEC (.txt), Excel (.xlsx), CSV — plusieurs fichiers acceptés</p>
              <p className="text-xs text-gray-400 mt-2">La période est détectée automatiquement pour les FEC</p>
            </div>

            {/* Liste des fichiers */}
            {fileItems.length > 0 && (
              <div className="space-y-4 mb-6">
                {fileItems.map(item => (
                  <FileCard
                    key={item.id}
                    item={item}
                    onRemove={() => removeFile(item.id)}
                    onUpdatePeriod={(period) => updateFileItem(item.id, { period })}
                    onUpdateMapping={(mapping) => updateFileItem(item.id, { mapping })}
                    onOpenMapping={() => setMappingTarget(item.id)}
                    isMappingOpen={mappingTarget === item.id}
                    onClosMapping={() => setMappingTarget(null)}
                  />
                ))}
              </div>
            )}

            {globalError && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm mb-4">{globalError}</div>
            )}

            {/* Boutons d'action */}
            {importableItems.length > 0 && phase !== 'importing' && (
              <div className="flex gap-3">
                <button
                  onClick={() => { setFileItems([]); setPhase('setup'); }}
                  className="px-6 py-3 border border-sage rounded-lg text-gray-custom hover:bg-cream-dark text-sm"
                >
                  Tout effacer
                </button>
                <button
                  onClick={handleImportAll}
                  disabled={!allReady || balancesWithoutPeriod.length > 0}
                  className="flex-1 btn-navy py-3 text-base font-semibold disabled:opacity-50"
                >
                  {importableItems.length === 1
                    ? 'Importer l\'exercice'
                    : `Importer les ${importableItems.length} exercices`}
                </button>
              </div>
            )}

            {phase === 'importing' && (
              <div className="flex items-center justify-center gap-3 py-6">
                <div className="w-6 h-6 border-2 border-navy border-t-transparent rounded-full animate-spin" />
                <span className="text-navy font-medium">Import en cours...</span>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function FileCard({ item, onRemove, onUpdatePeriod, onUpdateMapping, onOpenMapping, isMappingOpen, onClosMapping }) {
  const isFEC = item.mapping?.type === 'fec';
  const isBalance = item.status === STATUS.BALANCE_MAPPING;

  return (
    <div className={`card-moon p-5 border-l-4 ${
      item.status === STATUS.ERROR ? 'border-red-400' :
      item.status === STATUS.DONE ? 'border-green-400' :
      item.status === STATUS.FEC_READY ? 'border-green-300' :
      item.status === STATUS.BALANCE_MAPPING ? 'border-amber-300' :
      'border-sage'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-medium text-navy text-sm truncate">{item.file.name}</span>
            <span className={`text-xs font-medium ${statusColor[item.status]}`}>
              {item.status === STATUS.PREVIEWING && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  {statusLabel[item.status]}
                </span>
              )}
              {item.status !== STATUS.PREVIEWING && statusLabel[item.status]}
            </span>
          </div>
          <p className="text-xs text-gray-400">{(item.file.size / 1024).toFixed(0)} Ko</p>

          {/* FEC : afficher la periode detectee */}
          {isFEC && item.exercice && (
            <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-medium text-green-700 mb-0.5">Période détectée automatiquement</p>
              <p className="text-sm text-green-800 font-semibold">{item.exercice.label}</p>
              {item.exercice.dateDebut && (
                <p className="text-xs text-green-600 mt-0.5">
                  {new Date(item.exercice.dateDebut).toLocaleDateString('fr-FR')} → {new Date(item.exercice.dateFin).toLocaleDateString('fr-FR')}
                  {!item.exercice.isNormal && (
                    <span className="ml-2 text-amber-600">
                      ({item.exercice.durationMonths} mois)
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* FEC sans exercice detecte */}
          {isFEC && !item.exercice && item.status === STATUS.FEC_READY && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700">Période non détectée (aucune date d'écriture trouvée)</p>
            </div>
          )}

          {/* Balance : sélection de la période */}
          {isBalance && item.previewData && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-2">Période du FEC :</p>
                <div className="flex gap-2">
                  <select
                    value={item.period?.month || ''}
                    onChange={(e) => onUpdatePeriod({ ...item.period, month: e.target.value })}
                    className="flex-1 px-3 py-2 border border-sage rounded-lg text-sm bg-cream focus:ring-2 focus:ring-navy focus:outline-none"
                  >
                    <option value="">Mois...</option>
                    {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select
                    value={item.period?.year || ''}
                    onChange={(e) => onUpdatePeriod({ ...item.period, year: e.target.value })}
                    className="flex-1 px-3 py-2 border border-sage rounded-lg text-sm bg-cream focus:ring-2 focus:ring-navy focus:outline-none"
                  >
                    <option value="">Année...</option>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <button
                onClick={() => isMappingOpen ? onClosMapping() : onOpenMapping()}
                className="text-sm text-navy hover:underline"
              >
                {isMappingOpen ? '▲ Masquer le mapping des colonnes' : '▼ Vérifier le mapping des colonnes'}
              </button>
            </div>
          )}

          {/* Mapping éditeur inline */}
          {isMappingOpen && item.previewData && (
            <MappingEditor
              previewData={item.previewData}
              mapping={item.mapping}
              onUpdateMapping={onUpdateMapping}
            />
          )}

          {item.error && (
            <p className="text-red-600 text-xs mt-2">{item.error}</p>
          )}
        </div>

        {/* Bouton supprimer */}
        {item.status !== STATUS.UPLOADING && item.status !== STATUS.DONE && (
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500 text-lg leading-none flex-shrink-0"
            title="Retirer ce fichier"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function MappingEditor({ previewData, mapping, onUpdateMapping }) {
  const updateMapping = (role, colIndex) => {
    onUpdateMapping({ ...mapping, [role]: parseInt(colIndex) });
  };

  return (
    <div className="mt-3 bg-gray-50 rounded-lg p-4 space-y-3">
      <p className="text-xs font-medium text-gray-600 mb-2">Mapping des colonnes</p>
      {COLUMN_ROLES.map((role) => (
        <div key={role.key} className="flex items-center gap-3">
          <label className="w-44 text-xs text-gray-600 flex-shrink-0">
            {role.label}{role.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <select
            value={mapping[role.key] !== undefined ? mapping[role.key] : -1}
            onChange={(e) => updateMapping(role.key, e.target.value)}
            className="flex-1 px-2 py-1.5 border border-sage rounded text-xs bg-cream focus:ring-1 focus:ring-navy focus:outline-none"
          >
            <option value={-1}>-- Non assigné --</option>
            {previewData.headers.map((h) => (
              <option key={h.index} value={h.index}>{h.name}</option>
            ))}
          </select>
        </div>
      ))}
      <p className="text-xs text-gray-400 pt-1">
        Assignez soit "Solde N" (+ "Solde N-1" pour le comparatif), soit "Debit + Credit".
      </p>
    </div>
  );
}
