// URL de l'app Pennylane pour ouvrir un dossier (ajuster ici si le format diffère).
// 'moon' = dossier MOON EXPERTISE (compte individuel v2) → app Pennylane racine.
export const pennylaneCompanyUrl = (companyId) =>
  String(companyId) === 'moon'
    ? 'https://app.pennylane.com'
    : `https://app.pennylane.com/companies/${companyId}`;
