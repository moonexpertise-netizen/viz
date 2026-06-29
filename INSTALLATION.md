# Guide d'Installation - Balance Visualizer

## ⚙️ Étape 1 : Installer Node.js

### Windows
1. Télécharger depuis https://nodejs.org/
2. Choisir la version **LTS** (Long Term Support)
3. Lancer l'installateur `.msi`
4. Accepter les conditions et installer (défaut OK)
5. **Redémarrer l'ordinateur**

### Vérifier l'installation
Ouvrir un terminal (cmd ou PowerShell) et taper:
```bash
node --version
npm --version
```

Doit afficher les versions (ex: v18.16.0, 9.6.4)

---

## ⚙️ Étape 2 : Cloner/préparer le projet

```bash
# Aller dans le dossier du projet
cd C:\Users\benp1\Desktop\Projet1
```

---

## ⚙️ Étape 3 : Installer les dépendances Backend

```bash
cd backend
npm install
```

Cela va :
- Créer un dossier `node_modules/`
- Télécharger Express, SQLite, JWT, etc.
- Prendre 2-5 minutes (dépend de la connexion)

---

## ⚙️ Étape 4 : Configurer l'environnement Backend

```bash
# Toujours dans backend/
cp .env.example .env
```

Si le fichier `.env` existe déjà, c'est OK. Sinon, créez-le avec:
```
PORT=3001
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRY=8h
NODE_ENV=development
```

---

## ⚙️ Étape 5 : Installer les dépendances Frontend

```bash
# Retour au dossier racine
cd ..
cd frontend
npm install
```

Même processus que backend, 2-5 minutes.

---

## 🚀 Étape 6 : Démarrer les serveurs

### Terminal 1 - Démarrer le Backend

```bash
cd backend
npm start
```

Vous devez voir:
```
🚀 Server running on http://localhost:3001
```

**Ne fermez pas ce terminal !**

### Terminal 2 - Démarrer le Frontend

Ouvrir un **NOUVEAU terminal**

```bash
cd frontend
npm run dev
```

Vous devez voir:
```
  ➜  Local:   http://localhost:3000/
```

---

## ✅ Vérifier que ça marche

### 1. Accéder au site
- Ouvrir le navigateur
- Aller à **http://localhost:3000**

### 2. Créer un compte
- Cliquez sur "Register"
- Email: `test@example.com`
- Password: `Test123456`
- Cliquez "Register"

### 3. Vérifier l'authentification
- Vous devez arriver au Dashboard
- Cliquez "Logout" en haut à droite
- Vous devez revenir à la page Login

### 4. Tester l'upload
- Réloggez-vous
- Cliquez "Upload Balance"
- Créez un nouveau client ou sélectionnez-en un
- Téléchargez un fichier Excel test (voir `EXAMPLE_BALANCE.md`)

---

## 🐛 Problèmes courants

### 1. "npm: command not found"
**Cause**: Node.js n'est pas installé ou mal configuré
**Solution**: Redémarrer l'ordinateur après installation, ou ajouter Node.js au PATH Windows

### 2. "Port 3001 déjà utilisé"
**Cause**: Un autre process utilise le port
**Solution**: Changer le PORT dans `backend/.env`
```
PORT=3002
```

### 3. "Cannot find module 'express'"
**Cause**: npm install n'a pas fonctionné
**Solution**:
```bash
# Dans le dossier backend/
rm -rf node_modules package-lock.json
npm install
```

### 4. Puppeteer/Chrome erreur
**Cause**: Puppeteer n'arrive pas à télécharger Chrome
**Solution**: Installer Chrome manuellement depuis https://google.com/chrome

### 5. "EADDRINUSE" lors de npm start
**Cause**: Port déjà utilisé
**Solution**:
```bash
# Trouver le process
netstat -ano | findstr :3001

# Tuer le process (Windows)
taskkill /PID <PID> /F
```

---

## 📊 Tester avec un Excel

### Créer un Excel de test
1. Ouvrir Excel
2. Créer 3 colonnes:
   - A: Numéro de compte (101, 201, 401, etc.)
   - B: Libellé (Capital, Constructions, Banque, etc.)
   - C: Montant (50000, 100000, 15000, etc.)
   - D: Type (Débit ou Crédit)
3. Sauvegarder en `.xlsx`

Exemple:
```
101  Capital social        50000   Crédit
201  Constructions         100000  Débit
512  Banque                15000   Débit
601  Achats matières       30000   Débit
701  Ventes produits       80000   Crédit
```

### Tester l'import
1. Dashboard → Upload Balance
2. Créer client "Test Company"
3. Période: "2024-01"
4. Sélectionner fichier Excel
5. Cliquer "Upload & Analyze"
6. Voir le Bilan et P&L générés automatiquement

---

## ✨ Commandes utiles

### Développement
```bash
# Backend (hot-reload)
npm run dev

# Frontend (hot-reload)
npm run dev

# Build frontend pour production
npm run build

# Voir le build
npm run preview
```

### Nettoyage
```bash
# Supprimer données
rm data.db

# Supprimer fichiers uploadés
rm -rf uploads/*
```

---

## 📞 Besoin d'aide ?

- Vérifier les logs dans les terminaux
- Tester http://localhost:3001/api/health (Backend OK?)
- Vérifier que Node.js est à jour: `node --version`
- Vérifier la connexion Internet
- Redémarrer les serveurs

---

**C'est bon, vous pouvez commencer !** 🎉
