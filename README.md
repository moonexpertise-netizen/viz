# MoonViz — Analyse financière des données Pennylane

Outil web qui récupère **directement la donnée comptable via l'API Pennylane** (Firm API,
multi-clients) et produit une analyse financière façon Finthesis : **Synthèse, SIG, Compte de
résultat, Bilan et Ratios**, en comparatif N / N-1. Pensé pour un déploiement **Vercel**.

## Architecture

```
api/                      Fonctions serverless Vercel (Node, ESM)
  _lib/pennylane.js       Client Pennylane Firm API (Bearer, pagination cursor)
  _lib/normalize.js       trial_balance Pennylane → comptes N / N-1
  _lib/accountingEngine.js Bilan · Résultat · SIG · Ratios
  _lib/auth.js            Mot de passe partagé → cookie de session signé (HMAC)
  login.js · logout.js · session.js
  companies.js            Liste des sociétés du cabinet
  fiscal-years.js         Exercices d'une société
  report.js               Balance N (+N-1) → rapport complet
src/                      Front React (Vite + Tailwind + Recharts)
  pages/   Login · Workspace (sélecteur société/exercice + onglets)
  views/   SyntheseView · SIGView · ResultatView · BilanView · RatiosView
```

Le token Pennylane reste **exclusivement côté serveur** (variable d'environnement) ; le
navigateur ne le voit jamais et n'appelle que les fonctions `/api/*` de MoonViz.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `PENNYLANE_FIRM_TOKEN` | Token cabinet Pennylane (Réglages › Tokens du cabinet). Scopes : `companies:readonly`, `fiscal_years:readonly`, `trial_balance:readonly`. |
| `APP_PASSWORD` | Mot de passe d'accès à l'application. |
| `AUTH_SECRET` | Chaîne aléatoire longue pour signer le cookie de session. |

Copier `.env.example` → `.env.local` et renseigner les valeurs pour le dev local.

## Développement local

```bash
npm install
npm i -g vercel        # une fois
vercel dev             # front + fonctions /api sur http://localhost:3000
```

> `npm run dev` (Vite seul) sert le front sur `:5173` et proxifie `/api` vers `localhost:3000`
> (donc à lancer en parallèle de `vercel dev`). Le plus simple est d'utiliser `vercel dev` seul.

## Déploiement Vercel

1. Pousser ce dossier sur un dépôt Git (GitHub/GitLab).
2. Importer le projet sur Vercel — framework détecté : **Vite**.
3. Renseigner les 3 variables d'environnement ci-dessus (Settings › Environment Variables).
4. Déployer. Les fichiers de `api/` deviennent des fonctions serverless automatiquement.

## Logique comptable

- `solde = débit − crédit` par compte (convention débiteur positif).
- Normalisation PCG : classe 1 (capitaux), 2/3/5 (actif), 4 (mixte selon signe),
  6 (charges), 7 (produits).
- SIG : marge commerciale → production → valeur ajoutée → EBE → résultat d'exploitation →
  résultat courant → résultat net.

## Feuille de route

- [ ] Vue **mensuelle** + **trésorerie** (via `ledger_entries` Pennylane).
- [ ] **Exports** PDF / Excel.
- [ ] Mémorisation des sociétés favorites.
