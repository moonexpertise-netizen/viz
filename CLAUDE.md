# CLAUDE.md — MoonViz

Guide pour travailler efficacement sur ce dépôt. À lire avant toute modification.

## Qu'est-ce que MoonViz
Outil d'analyse financière pour le cabinet **MOON Expertise**. Il récupère les données comptables **directement via l'API Pennylane** (plus aucun upload de balance/FEC) et produit une analyse façon Finthesis : tableau de bord du portefeuille, puis par dossier (Synthèse, SIG, Compte de résultat, Bilan, Ratios, Vision périodique mensuelle/trésorerie). Déployé sur Vercel (prod : `viz.moonexpertise.fr`).

## Stack & commandes
- **Front** : React 18 + Vite + Tailwind + Recharts (SPA, pas de framework de routage — routing manuel dans `src/App.jsx`).
- **Back** : fonctions serverless Vercel (`api/**.js`, ESM, `export default function handler(req, res)`).
- `npm run dev` — Vite (proxy `/api` → `localhost:3000`). `npm run vercel-dev` — front + fonctions ensemble.
- `npm run build` — build de prod (obligatoire avant de conclure : Vite ne fait PAS de vérif de types, un identifiant non importé ne casse qu'à l'exécution).
- **Pas de tests** ni de linter configuré. Valider en buildant + en testant à la main.

## Déploiement
- **`git push origin main` → Vercel déploie automatiquement.** (Ne PAS commit/push sans demande explicite de l'utilisateur.)
- Vérifier l'état : `vercel ls moonviz` (ligne la plus récente). Un `● Error` après build OK = souvent un souci de config/limite.
- Auteur des commits : `moonexpertise@gmail.com` (compte GitHub lié).

## ⚠️ Contraintes critiques (à ne jamais oublier)
- **Limite de 12 fonctions serverless (plan Hobby).** Chaque `.js` sous `api/` = 1 fonction. On est proche de la limite : pour ajouter un endpoint, **en fusionner/supprimer un autre** (ex. `api/login.js` regroupe login+forgot+reset via `body.action`).
- **Tokens Pennylane strictement côté serveur.** Lus via `process.env` uniquement, jamais exposés au client, jamais commités. `TOKEN_*.txt` et `.env*.local` sont gitignorés (`*token*.txt`). Avant tout push : vérifier `git status` ne stage aucun secret.
- **`REPORT_VERSION`** (`src/lib/syncStore.js`) : version du moteur comptable. La monter invalide **tous les caches** (local + serveur) → l'utilisateur doit resynchroniser. Ne l'incrémenter QUE si un calcul change réellement (ça agace l'utilisateur).
- **CSP stricte** (`vercel.json`) : `script-src 'self'` → pas de scripts inline avec handlers (`onload=…`), `connect-src 'self'`.
- **Fichiers Windows (CRLF)** : les warnings « LF will be replaced by CRLF » au commit sont normaux.

## Architecture des données (flux)
1. **`api/companies.js`** → liste des sociétés (Firm API) + ajoute **MOON EXPERTISE** si `PENNYLANE_MOON_TOKEN` présent.
2. **`api/fiscal-years.js`** → exercices d'une société (statuts Pennylane : `closed` / `frozen` / `open`).
3. **`api/report.js`** → `getTrialBalance` (N et N-1) → `buildAccounts` (`api/_lib/normalize.js`) → `generateFullReport` (`api/_lib/accountingEngine.js`) = { bilan, pl, sig, ratios, accounts }.
4. **`api/monthly.js`** → journaux + balances + **`ledgerCache.getNormalizedLines`** (cache KV incrémental, cf. § Performance) → `monthlyEngine.js` = P&L mensuel + cashflow + détail des écritures.
5. **`api/dashboard-row.js`** → indicateurs de santé par société (exercice en cours).
6. **`api/store.js`** → stockage serveur des exercices synchronisés (Vercel KV).

### Deux clients Pennylane
- **`api/_lib/pennylane.js`** — API **Firm** (cabinet) : `https://app.pennylane.com/api/external/firm/v1`, endpoints `/companies/{id}/…`, pagination page **ET** cursor, retry/backoff sur 429/5xx. C'est le **routeur central** : si `companyId === 'moon'`, il délègue au client v2.
- **`api/_lib/pennylaneMoon.js`** — API **individuelle v2** (`/api/external/v2`, sans préfixe société), pour le seul dossier **MOON EXPERTISE** (token dédié). Pagination **cursor/limit uniquement** (`per_page` interdit en v2). Formats de réponse identiques à l'API Firm → les moteurs marchent tels quels.

### Performance de synchro (mesuré en conditions réelles, ne pas « simplifier »)
- **Contraintes API Pennylane** : `limit` max **100** sur `ledger_entry_lines`/`ledger_entries` (400 au-delà) ; rate limit **25 req/fenêtre ~10 s par token**, MAIS réparti sur plusieurs backends → une **concurrence élevée (12) + retry court sur 429** donne ~20 req/s effectifs, là où un budget-gating strict plafonne à 2,5 req/s (testé : le gating est PIRE). Pas de filtre `updated_at` (champs autorisés : id, date, journal_id, ledger_account_id) ni d'endpoint d'export en masse.
- **`api/_lib/plimiter.js`** : sémaphore de concurrence partagé (1 par token) + `monthSlices`/`dateFilter`. Les lignes/écritures sont téléchargées par **tranches mensuelles en parallèle** (chaque tranche = sa chaîne de curseurs ; sonde 1 page pleine période d'abord ; garde-fous : 1 seul mois ou > 24 mois → pagination classique).
- **`api/_lib/ledgerCache.js`** : cache serveur **incrémental** (Vercel KV, gzip+base64, TTL 120 j) des lignes **normalisées** (`allLines` : libellés/pièces des écritures fusionnés) par tranche mensuelle. Validation par **empreintes de balance** (`tbDigest`) : balance complète inchangée → tout du cache (0 appel lignes) ; sinon balances mensuelles (légères, parallèles) → seuls les mois modifiés sont re-téléchargés. Toute modif comptable change les totaux débits/crédits d'un compte du mois → détectée. Limite assumée : une modif de libellé seul n'invalide pas l'empreinte. Clés `mvled:v1:*`.
- **Consommateurs** : `monthly.js`, `entries.js`, `cashflow-entries.js` passent par `getNormalizedLines` ; `linesToMonthly` et `accountEntriesNorm`/`cashflowEntriesNorm` consomment les lignes normalisées (`{account, journalCode, entryId}` à plat — `linesToMonthly` accepte aussi les lignes brutes). Ordres de grandeur : 1re synchro d'un dossier ~2 200 lignes ≈ 12 s, resynchro inchangée ≈ 2 s, 1 mois modifié ≈ 2-3 s ; le cache est partagé entre utilisateurs/appareils.

### Moteur comptable (`api/_lib/`)
- `normalize.js` : trial_balance → comptes `{accountNumber, accountLabel, soldeN, soldeN1, accountClass}`. **Les libellés de comptes sont mis en MAJUSCULES** ici et dans `monthly.js` (labelMap).
- `accountingEngine.js` : `calculateBilan` (capitaux propres = classe 1 préfixes 10-14 + résultat à date ; emprunts 16-18 → dettes), `calculatePL`, `calculateSIG` (avec `SIG_DETAIL` = comptes contributeurs par solde), `calculateRatios`, `computeDisponibilites` (trésorerie = classe 5 hors 511/58/59).
- `monthlyEngine.js`, `entriesEngine.js` : mensuel + drill-down écritures.
- `anSimulation.js` : **à-nouveaux simulés** — quand l'exercice précédent n'est pas clôturé (statut Pennylane `open`, donc aucune écriture AN), les soldes de bilan (classes 1-5) du précédent sont reportés automatiquement + résultat antérieur en 110000 (récursif sur une chaîne d'exercices ouverts). Branché dans report.js, monthly.js (trésorerie d'ouverture) et dashboard-row.js. Un statut `frozen` génère de vrais AN (vérifié) → pas de simulation.

## Authentification (`api/_lib/auth.js`, `api/login.js`)
- **Login e-mail `@moonexpertise.fr` + mot de passe.** Garde de domaine côté serveur. Mot de passe : hash KV si défini, sinon `APP_PASSWORD` (env). Cookie de session HMAC HttpOnly SameSite=Lax.
- **Reset par e-mail** : `api/login.js` (`action:'forgot'/'reset'`) + `api/_lib/account.js` (jeton HMAC signé, Vercel KV pour le hash, Resend pour l'envoi). Page SPA `/reset`.
- Le **SSO Microsoft/Azure a été retiré** (l'utilisateur n'a pas Azure). Des variables `AZURE_*` peuvent rester documentées mais les endpoints n'existent plus.

## Synchronisation & cache (par exercice, façon Finthesis)
Sync à la demande, jamais automatique à la navigation. Chaîne de persistance :
- **`src/lib/syncStore.js`** — cache localStorage (`mv:sync:<companyId>`) des agrégats (report+monthly **sans** les lignes), versionné par `REPORT_VERSION`. `saveEntry` écrit **aussi côté serveur** (`storeAPI`). `pullServer` fusionne le serveur dans le local à l'ouverture d'un dossier. `removeEntry` supprime local + serveur.
- **`src/lib/linesStore.js`** + **`src/lib/idb.js`** — IndexedDB (`moonviz` v2, stores `lines` + `syncjobs`) pour le **détail des écritures** (gros → jamais côté serveur).
- **`public/sw.js`** + **`src/lib/syncJobs.js`** — Service Worker : synchro **persistante** (continue même page fermée/rechargée), notifie la page via `postMessage`.
- **`api/store.js`** — stockage serveur durable (Vercel KV), multi-appareils. Repli `enabled:false` si KV non configuré → comportement 100 % local inchangé.

## UI (`src/`)
- `pages/Workspace.jsx` — coquille : bandeau latéral (repliable desktop / tiroir mobile), topbar sélecteur société, `SyncPanel` (synchro/consulter/supprimer par exercice), onglets (vues **lazy-loaded**), palette ⌘K. État de nav persistant (`mv:ui`).
- `pages/Login.jsx`, `pages/ResetPassword.jsx`.
- `components/` : `PortfolioDashboard` (tableau de bord, colonnes masquables/déplaçables), `FinTable` (tableau financier avec lignes dépliables `row.accounts`), `Combobox`, `CommandPalette`, `ThemeMenu`, `ChartBits` (StatCard/ChartCard/tooltips/Skeleton), `EntryDetailModal`, `ui.jsx`.
- `views/` : `SyntheseView`, `SIGView`, `ResultatView`, `BilanView`, `RatiosView`, `MonthlyView` (2000+ lignes, la vue périodique — la plus lourde).
- **Thèmes** : 5 palettes (`navy`/`ardoise`/`emeraude`/`bordeaux`/`indigo`) via `data-theme` sur `<html>` + variables CSS (`src/index.css`), appliquées avant le rendu (script inline dans `index.html`). `src/lib/theme.js` + `ThemeMenu`. Les graphes lisent les couleurs du thème via `src/lib/chartColors.js`.
- **Préférences UX de l'utilisateur** : visuels **sobres**, pas de gadgets (jauges radiales, fioritures) ; police **Inter** partout (`.font-display` = Inter, Funnel Display retiré) ; encre navy `#01071B` ; accent doré `#a88962` ; responsive impeccable mobile/desktop.
- **Garde-fou** : `ErrorBoundary` dans `App.jsx` (un crash de composant affiche « Recharger » au lieu d'un écran blanc).

## Variables d'environnement (Vercel)
`PENNYLANE_FIRM_TOKEN` (obligatoire), `PENNYLANE_MOON_TOKEN` (dossier MOON), `AUTH_SECRET` (signature session), `APP_PASSWORD` (mdp de secours), `ALLOWED_EMAIL_DOMAIN` (=moonexpertise.fr), `APP_URL` (base des liens e-mail). Pour le reset e-mail + stockage serveur : `RESEND_API_KEY`, `RESET_FROM`, et `KV_REST_API_URL` + `KV_REST_API_TOKEN` (auto-injectés en créant un store Vercel KV / Upstash). Voir `.env.example`.

## Notes / dette technique connue
- `exceljs` et `react-router-dom` sont dans les dépendances mais **non utilisés** (candidats à retrait). L'export Excel se fait en HTML/CSV natif.
- Bundle : code-splitting actif (`vite.config.js` manualChunks react/recharts ; vues en `React.lazy`). Bundle initial ~117 Ko.
