// Applique le mode de couleurs avant le rendu React (évite le flash).
// Fichier externe : compatible avec la CSP stricte (script-src 'self').
// Choix persisté : mv:theme2 = light | dark | navy | system.
(function () {
  var resolved = 'light';
  try {
    var choice = localStorage.getItem('mv:theme2') || 'light';
    if (choice === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else if (choice === 'dark' || choice === 'navy') {
      resolved = choice;
    }
  } catch (e) { /* défaut clair */ }
  document.documentElement.setAttribute('data-theme', resolved);
})();
