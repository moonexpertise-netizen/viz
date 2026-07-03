// Applique le thème de couleurs avant le rendu React (évite le flash).
// Fichier externe : compatible avec la CSP stricte (script-src 'self').
(function () {
  try {
    var valid = ['navy', 'ardoise', 'emeraude', 'bordeaux', 'indigo'];
    var t = localStorage.getItem('mv:theme');
    document.documentElement.setAttribute('data-theme', valid.indexOf(t) >= 0 ? t : 'navy');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'navy');
  }
})();
