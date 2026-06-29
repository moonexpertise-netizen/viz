# Format Excel Attendu pour Balance Comptable

## Structure des colonnes

| Colonne | Exemple | Description |
|---------|---------|-------------|
| A | 101 | Numéro de compte (PCG) |
| B | Capital social | Libellé du compte |
| C | 50000 | Montant (toujours positif) |
| D | Crédit | Type: "Débit" ou "Crédit" |

## Exemple de balance

```
Numéro de compte | Libellé du compte            | Montant | Type
101              | Capital social              | 50000   | Crédit
201              | Constructions                | 100000  | Débit
211              | Matériel et outillage       | 25000   | Débit
401              | Fournisseurs                 | 12000   | Crédit
411              | Clients                      | 8000    | Débit
512              | Banque                       | 15000   | Débit
601              | Achat de matières           | 30000   | Débit
701              | Ventes de produits          | 80000   | Crédit
```

## Classification PCG

### Actif (Bilan)
- **Classe 2** : Immobilisations
- **Classe 3** : Stocks
- **Classe 4** : Tiers (Créances)
- **Classe 5** : Trésorerie

### Passif (Bilan)
- **Classe 1** : Capitaux propres
- **Classe 4** : Tiers (Dettes)

### P&L
- **Classe 6** : Charges
- **Classe 7** : Produits/Revenus

## Résultats générés

Le système générera automatiquement :

1. **Bilan (Balance Sheet)**
   - Total Actif (Immobilisations + Stocks + Créances + Trésorerie)
   - Total Passif (Capitaux propres + Dettes)
   - Différence (doit être égale à 0 en théorie)

2. **Compte de Résultat (P&L)**
   - Total Produits (Classe 7)
   - Total Charges (Classe 6)
   - Résultat Net = Produits - Charges
   - Marge bénéficiaire

3. **Ratios**
   - Ratio de liquidité
   - Ratio de solvabilité
   - Rentabilité (ROI, Marge nette)
