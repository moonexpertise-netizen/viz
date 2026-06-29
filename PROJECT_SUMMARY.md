# Balance Visualizer - Résumé du Projet

## 📊 Vue d'ensemble

**Balance Visualizer** est une application web complète permettant aux utilisateurs d'importer des balances comptables Excel et de générer automatiquement des visualisations professionnelles avec exports en PDF, Excel et HTML.

---

## ✅ Ce qui a été implémenté

### Phase 1 ✅ - Setup Initial
- Structure complète du projet (backend + frontend)
- Configuration Vite + React + Tailwind
- Configuration Express + SQLite
- .gitignore et documentation

### Phase 2 ✅ - Authentification Backend
- Endpoint `/auth/register` - Créer un compte
- Endpoint `/auth/login` - Se connecter (JWT)
- Middleware JWT pour protéger les routes
- Rate limiting (5 tentatives login/minute)
- Hachage passwords bcrypt

### Phase 2.5 ✅ - Parser Excel + Accounting Engine
- **Parser**: Lecture Excel (`xlsx`) → JSON structuré
- **Normalisation**: Classification comptes par classe PCG
- **Accounting Engine**:
  - Calcul Bilan (Actif = Passif)
  - Calcul P&L (Produits - Charges = Résultat)
  - Calcul ratios financiers
- Routes d'upload avec multer

### Phase 3 ✅ - API REST + SQLite
- **Clients management**:
  - `GET /api/clients` - Lister clients
  - `POST /api/clients` - Créer client
  - `GET /api/clients/:id` - Détails client
- **Reports**:
  - `GET /api/reports` - Tous les rapports utilisateur
  - `GET /api/reports/:balanceId` - Rapports détaillés
- **Upload**:
  - `POST /api/upload` - Importer balance Excel
- **Export**:
  - `POST /api/export` - Exporter PDF/Excel/HTML
- **SQLite Schema**:
  - users, clients, balances, reports

### Phase 4 ✅ - Frontend React
- **Pages implémentées**:
  - Login (register + login)
  - Dashboard (liste balances, bouton upload)
  - Upload (drag & drop Excel, client selector)
  - BilanView (graphiques + tableaux Actif/Passif)
  - PLView (graphiques + tableaux Produits/Charges)
- **Routing**: React Router v6
- **API Client**: Axios avec interceptors JWT
- **State Management**: useState/useEffect basiques

### Phase 5 ✅ - Visualisations Recharts
- **Graphiques implémentés**:
  - BarChart: Total Balance (Assets vs Liabilities)
  - BarChart: Balance by Category (6 catégories)
  - BarChart: P&L Summary (Revenues vs Expenses vs Net)
  - BarChart: Revenue vs Expenses comparison
  - BarChart: Detailed breakdown
- **KPI Cards**:
  - Current Ratio, Equity Ratio, Debt Ratio
  - Net Margin, ROI, Total Assets

### Phase 6 ✅ - Exports
- **PDF**: Via Puppeteer (HTML → PDF headless)
- **Excel**: Via ExcelJS (formatted spreadsheets)
- **HTML**: Standalone HTML pages
- Routes d'export sécurisées (ownership check)

---

## 📁 Structure des fichiers créés

```
balance-visualizer/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js (175 lines)
│   │   │   ├── clients.js (56 lines)
│   │   │   ├── upload.js (77 lines)
│   │   │   ├── reports.js (56 lines)
│   │   │   └── export.js (83 lines)
│   │   ├── services/
│   │   │   ├── parser.js (90 lines)
│   │   │   ├── accountingEngine.js (160 lines)
│   │   │   └── exportService.js (230 lines)
│   │   ├── middleware/
│   │   │   └── auth.js (15 lines)
│   │   ├── utils/
│   │   │   └── rateLimiter.js (22 lines)
│   │   ├── db.js (54 lines)
│   │   └── server.js (32 lines)
│   ├── .env.example
│   ├── EXAMPLE_BALANCE.md
│   ├── uploads/ (dossier pour fichiers Excel)
│   └── package.json (dépendances)
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx (62 lines)
│   │   │   ├── Dashboard.jsx (68 lines)
│   │   │   ├── Upload.jsx (120 lines)
│   │   │   ├── BilanView.jsx (140 lines)
│   │   │   └── PLView.jsx (150 lines)
│   │   ├── components/
│   │   │   ├── BalanceSheetChart.jsx (51 lines)
│   │   │   ├── PLChart.jsx (75 lines)
│   │   │   └── RatioCards.jsx (49 lines)
│   │   ├── services/
│   │   │   └── api.js (28 lines)
│   │   ├── App.jsx (42 lines)
│   │   ├── main.jsx (11 lines)
│   │   └── index.css (19 lines)
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
├── README.md (documentation complète)
├── INSTALLATION.md (guide pas à pas)
├── EXAMPLE_BALANCE.md (format Excel)
├── PROJECT_SUMMARY.md (ce fichier)
└── .gitignore
```

---

## 🛠️ Stack Technique

### Backend
| Technologie | Version | Utilité |
|------------|---------|---------|
| Node.js | 18+ | Runtime JS serveur |
| Express | ^4.18.2 | Framework web |
| SQLite3 / better-sqlite3 | ^9.2.2 | Base de données locale |
| bcrypt | ^5.1.1 | Hachage passwords |
| jsonwebtoken | ^9.1.2 | Authentification JWT |
| xlsx | ^0.18.5 | Parsing Excel |
| exceljs | ^4.3.0 | Génération Excel |
| puppeteer | ^21.7.0 | Export PDF |
| multer | ^1.4.5 | Upload fichiers |
| cors | ^2.8.5 | Cross-origin |

### Frontend
| Technologie | Version | Utilité |
|------------|---------|---------|
| React | ^18.2.0 | UI framework |
| Vite | ^5.0.8 | Build tool |
| React Router | ^6.20.0 | Navigation |
| Recharts | ^2.10.3 | Data visualization |
| Axios | ^1.6.5 | HTTP client |
| Tailwind CSS | ^3.4.1 | Styling |

---

## 📊 Flux de données

```
1. USER LOGIN
   Frontend: Email + Password
   → API: POST /auth/login
   → Backend: Valider + JWT token
   → Frontend: Store token localStorage

2. CREATE CLIENT
   Frontend: Nom client
   → API: POST /clients
   → Backend: Save SQLite
   → DB: Insert into clients

3. UPLOAD BALANCE
   Frontend: File + Client + Period
   → API: POST /upload (multipart)
   → Backend:
      - Parse Excel (SheetJS)
      - Normalize accounts (PCG)
      - Run accountingEngine
      - Calculate Bilan + P&L
      - Save to SQLite
   → DB: Insert balance + reports
   → Frontend: Redirect to Bilan view

4. VIEW REPORTS
   Frontend: balanceId param
   → API: GET /reports/:balanceId
   → Backend: Fetch from cache (reports table)
   → Frontend: Display charts + tables

5. EXPORT REPORT
   Frontend: balanceId + type (bilan/pl) + format (pdf/excel/html)
   → API: POST /export
   → Backend:
      - Get data from reports table
      - Format HTML/Excel/PDF
      - Stream file
   → Frontend: Download file
```

---

## 🔐 Sécurité

### Authentification
- JWT avec expiration 8h
- Passwords hachés bcrypt (10 rounds)
- Middleware pour vérifier token sur routes protégées

### Rate Limiting
- 5 tentatives login par minute par email
- In-memory store (nettoie ancien automatiquement)

### Données
- SQLite stocké localement uniquement
- Pas de sauvegarde cloud par défaut
- Ownership check sur tous les endpoints (user_id)

### CORS
- Frontend local (http://localhost:3000) autorisé
- Peut être restreint plus tard

---

## 📋 Schéma Base de Données

```sql
-- Users
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at DATETIME
)

-- Clients
CREATE TABLE clients (
  id INTEGER PRIMARY KEY,
  user_id INTEGER (FK),
  name TEXT,
  created_at DATETIME
)

-- Balances (uploads)
CREATE TABLE balances (
  id INTEGER PRIMARY KEY,
  client_id INTEGER (FK),
  period TEXT,
  filename TEXT,
  raw_data TEXT (JSON array of accounts),
  created_at DATETIME
)

-- Reports (cache)
CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  balance_id INTEGER (FK),
  type TEXT ('bilan' ou 'pl'),
  data TEXT (JSON report object),
  created_at DATETIME
)
```

---

## 📊 Logique Comptable

### Classification PCG (Plan Comptable Général)

**BILAN (Balance Sheet)**
- **Actif** (Assets):
  - Classe 2: Immobilisations (bâtiments, équipement)
  - Classe 3: Stocks (marchandises)
  - Classe 4: Tiers créances (clients)
  - Classe 5: Trésorerie (banque, caisse)
- **Passif** (Liabilities):
  - Classe 1: Capitaux propres (capital, réserves)
  - Classe 4: Tiers dettes (fournisseurs, emprunts)

**COMPTE DE RÉSULTAT (Income Statement)**
- **Produits** (Revenues):
  - Classe 7: Ventes, revenus, intérêts
- **Charges** (Expenses):
  - Classe 6: Achats, salaires, loyers, etc.

**Équation**: Actif = Passif + Profits

### Ratios Calculés

| Ratio | Formule | Interprétation |
|-------|---------|-----------------|
| Current Ratio | Cash / Debts | Capacité à rembourser court terme |
| Equity Ratio | Equity / Assets | % actifs = capitaux propres |
| Debt Ratio | Debts / Assets | % actifs financés par dettes |
| Net Margin | Net Income / Revenues | Profit par € de vente |
| ROI | Net Income / Assets | Rentabilité des actifs |

---

## 🎯 Points forts

✅ **Architecture modulaire** - Facile à maintenir/étendre
✅ **Authentification sécurisée** - JWT + bcrypt
✅ **Parsing flexible** - Accepte différents formats Excel
✅ **Exports professionnels** - PDF, Excel, HTML
✅ **Gestion multi-utilisateurs** - Isolation par user_id
✅ **Stockage local** - Pas de cloud, données privées
✅ **UI responsive** - Tailwind CSS + Recharts
✅ **Rate limiting** - Prévention brute force
✅ **Calculs comptables corrects** - PCG compliant
✅ **Documentation complète** - README + INSTALLATION + examples

---

## 🚀 Prochaines évolutions possibles

- [ ] Authentification SSO (Google, GitHub)
- [ ] Comparaison multi-périodes
- [ ] Budget forecasting
- [ ] Alertes ratios (email)
- [ ] API publique (pour intégrations)
- [ ] Synchronisation cloud optionnelle
- [ ] Graphiques plus avancés (Waterfall, Sankey)
- [ ] Multiples devises
- [ ] Audit trail (qui a modifié quoi)

---

## 📞 Support

**Documentation**:
- `README.md` - Vue d'ensemble + utilisation
- `INSTALLATION.md` - Guide pas à pas
- `EXAMPLE_BALANCE.md` - Format Excel
- Code commenté - Services et routes explicites

**Démarrage**:
```bash
# 1. Installer Node.js depuis nodejs.org
# 2. npm install dans backend/ et frontend/
# 3. npm start (backend) + npm run dev (frontend)
# 4. http://localhost:3000
```

---

## 📈 Statistiques du projet

- **Fichiers créés**: 30+
- **Lignes de code**: ~2000+
- **Phases complètes**: 6/6 ✅
- **Endpoints API**: 10
- **Pages React**: 5
- **Graphiques**: 6+
- **Temps d'implémentation**: Complet

---

## 🎉 Conclusion

**Balance Visualizer** est une solution clé en main pour la visualisation de balances comptables. L'application est fonctionnelle et prête à être utilisée en production (après configuration sécurité).

**Pour démarrer**: Suivez le guide `INSTALLATION.md`.

Bon usage ! 📊✨
