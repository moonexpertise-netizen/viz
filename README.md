# Balance Visualizer

Un outil web complet pour importer des balances comptables Excel et générer des visualisations professionnelles avec **Bilan**, **Compte de Résultat (P&L)**, **Ratios financiers** et exports **PDF/Excel/HTML**.

## ✨ Fonctionnalités

- ✅ Authentification JWT sécurisée
- ✅ Import Excel (format PCG - Plan Comptable Général)
- ✅ Calcul automatique Bilan (Actif/Passif)
- ✅ Calcul automatique P&L (Produits/Charges)
- ✅ Ratios financiers (Liquidité, Solvabilité, Rentabilité)
- ✅ Graphiques Recharts (Barres, P&L détaillé)
- ✅ Exports PDF, Excel, HTML
- ✅ Gestion multi-clients
- ✅ Stockage local SQLite (données privées)

## 📋 Prérequis

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Chrome/Chromium** (pour export PDF via Puppeteer)

## 🚀 Installation & Démarrage

### 1. Installer les dépendances

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configurer l'environnement

```bash
# Dans backend/
cp .env.example .env
# Éditer .env si nécessaire (JWT_SECRET, PORT, etc.)
```

### 3. Démarrer les serveurs

**Terminal 1 - Backend:**
```bash
cd backend
npm start
# Ou en développement avec hot-reload:
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## 📊 Guide d'utilisation

### 1. Créer un compte
- Accédez à `http://localhost:3000/login`
- Cliquez sur "Register"
- Entrez email + password (min 6 caractères)

### 2. Créer un client
- Depuis le Dashboard, cliquez "Upload Balance"
- Cliquez "+ Create new client"
- Entrez le nom de l'entreprise

### 3. Importer une balance Excel
- Format attendu (voir `EXAMPLE_BALANCE.md`):
  - Colonne A: Numéro de compte (ex: 101, 401)
  - Colonne B: Libellé du compte
  - Colonne C: Montant (positif)
  - Colonne D: Type ("Débit" ou "Crédit")
- Sélectionnez le client et la période
- Uploadez votre fichier .xlsx

### 4. Visualiser les rapports
- **Bilan**: Actif vs Passif (Immobilisations, Stocks, Trésorerie)
- **P&L**: Revenues vs Expenses avec détails par catégorie
- **Ratios**: Liquidité, Solvabilité, Rentabilité

### 5. Exporter les résultats
- Boutons PDF, Excel, HTML en haut de chaque rapport
- Télécharge automatiquement le fichier

## 🏗️ Architecture

```
balance-visualizer/
├── backend/                    # Node.js + Express
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js        # Register, Login, JWT
│   │   │   ├── clients.js     # Gestion clients
│   │   │   ├── upload.js      # Import Excel + Parsing
│   │   │   ├── reports.js     # Récupération rapports
│   │   │   └── export.js      # PDF/Excel/HTML
│   │   ├── services/
│   │   │   ├── parser.js      # Parsing Excel (SheetJS)
│   │   │   ├── accountingEngine.js # Calcul Bilan + P&L
│   │   │   └── exportService.js    # Exports (Puppeteer, ExcelJS)
│   │   ├── middleware/
│   │   │   └── auth.js        # JWT verification
│   │   ├── utils/
│   │   │   └── rateLimiter.js # Login rate limiting
│   │   ├── db.js              # SQLite schema
│   │   └── server.js          # Express app
│   ├── uploads/               # Fichiers Excel uploadés
│   ├── data.db               # Database SQLite
│   └── package.json
│
└── frontend/                   # React + Vite
    ├── src/
    │   ├── pages/
    │   │   ├── Login.jsx      # Authentification
    │   │   ├── Dashboard.jsx  # Liste des balances
    │   │   ├── Upload.jsx     # Import Excel
    │   │   ├── BilanView.jsx  # Actif/Passif + Charts
    │   │   └── PLView.jsx     # P&L + Charts
    │   ├── components/
    │   │   ├── BalanceSheetChart.jsx # Graphiques Bilan
    │   │   ├── PLChart.jsx           # Graphiques P&L
    │   │   └── RatioCards.jsx        # KPI Cards
    │   ├── services/
    │   │   └── api.js         # Axios client
    │   ├── App.jsx            # React Router
    │   ├── main.jsx
    │   └── index.css
    └── package.json
```

## 🔐 Sécurité

- **Authentification**: JWT avec expiration 8h
- **Passwords**: Hachés bcrypt (10 rounds)
- **Rate Limiting**: 5 tentatives login/minute par email
- **Données**: Stockées localement, jamais envoyées au cloud
- **CORS**: Configuré pour frontend local uniquement

## 💾 Base de données

SQLite avec 4 tables:
- `users` - Utilisateurs (email, password_hash)
- `clients` - Clients par utilisateur
- `balances` - Imports de balances (raw_data JSON)
- `reports` - Rapports calculés (bilan, pl JSON)

## 🛠️ Stack Technique

### Backend
- **Express.js** - Web framework
- **better-sqlite3** - Base de données locale
- **bcrypt** - Hachage passwords
- **jsonwebtoken** - JWT auth
- **xlsx** - Parsing Excel
- **exceljs** - Génération Excel
- **puppeteer** - Export PDF
- **multer** - Upload fichiers
- **cors** - Cross-origin

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool (fast HMR)
- **React Router v6** - Navigation
- **Recharts** - Data visualization
- **Axios** - HTTP client
- **Tailwind CSS** - Styling

## 📈 Logique Comptable

### PCG (Plan Comptable Général)
- **Classe 1**: Capitaux propres → Passif
- **Classe 2**: Immobilisations → Actif
- **Classe 3**: Stocks → Actif
- **Classe 4**: Tiers (Créances/Dettes) → Actif ou Passif
- **Classe 5**: Trésorerie → Actif
- **Classe 6**: Charges → P&L
- **Classe 7**: Produits → P&L

### Équation Comptable
```
Actif = Passif
Produits - Charges = Résultat Net
```

## 📝 Format Excel Attendu

Voir `EXAMPLE_BALANCE.md` pour les détails du format et un exemple complet.

Résumé:
```
Numéro | Libellé                 | Montant | Type
101    | Capital social          | 50000   | Crédit
201    | Constructions           | 100000  | Débit
512    | Banque                  | 15000   | Débit
601    | Achat matières          | 30000   | Débit
701    | Ventes produits         | 80000   | Crédit
```

## 🧪 Tester l'application

### Créer un compte de test
```
Email: test@example.com
Password: Test123456
```

### Tester avec un Excel
1. Préparez un Excel avec au moins 5-10 comptes
2. Uploadez via Dashboard → Upload Balance
3. Visualisez les graphiques Bilan et P&L

## 🚨 Troubleshooting

### Port déjà utilisé
```bash
# Changer dans backend/.env
PORT=3002
```

### Chrome/Puppeteer non trouvé
- Installer Chrome/Chromium système
- Ou ajouter le chemin à `~/.puppeteerrc.cjs`

### Fichier Excel non lu
- Vérifier format: .xlsx ou .xls
- Vérifier colonnes: A (numéro), B (libellé), C (montant), D (type)
- Pas d'en-têtes vides

## 📄 Licence

Utilise les meilleures pratiques open source.
Crédits: Express, React, Recharts, SheetJS, Puppeteer, ExcelJS

---

**Prêt à utiliser !** Installe Node.js et lance `npm install` dans backend/ et frontend/.
