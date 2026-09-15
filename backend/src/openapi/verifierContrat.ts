// ============================================================================
// Vérification du contrat d'API
//
// Une documentation écrite à la main se périme au premier changement de code,
// et personne ne s'en aperçoit avant qu'un intégrateur ne se plaigne. Cet
// outil compare, à chaque exécution, les routes RÉELLEMENT servies par
// l'application aux chemins DÉCLARÉS dans le document OpenAPI, et échoue à la
// moindre différence.
//
//   npm run verifier:contrat
//
// Il n'ouvre aucun port et ne touche pas à la base : il charge l'application
// en mémoire et lit sa table de routage.
// ============================================================================

import { ROUTEURS, ROUTES_DIRECTES } from '../app.js';
import { genererDocumentOpenApi } from './document.js';

/** « /communes/:id/boundary » → « /communes/{id}/boundary » */
function normaliser(chemin: string): string {
  return chemin.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function routesServies(): Set<string> {
  const routes = new Set<string>(ROUTES_DIRECTES);

  for (const [prefixe, routeur] of ROUTEURS) {
    for (const couche of (routeur as any).stack ?? []) {
      if (!couche.route) continue;
      const suffixe = couche.route.path === '/' ? '' : couche.route.path;
      for (const methode of Object.keys(couche.route.methods)) {
        routes.add(`${methode.toUpperCase()} ${normaliser(prefixe + suffixe)}`);
      }
    }
  }
  return routes;
}

function routesDocumentees(): Set<string> {
  const doc = genererDocumentOpenApi() as any;
  const routes = new Set<string>();
  for (const [chemin, operations] of Object.entries(doc.paths ?? {})) {
    for (const methode of Object.keys(operations as Record<string, unknown>)) {
      routes.add(`${methode.toUpperCase()} ${chemin}`);
    }
  }
  return routes;
}

const servies = routesServies();
const documentees = routesDocumentees();

const nonDocumentees = [...servies].filter((r) => !documentees.has(r)).sort();
const fantomes = [...documentees].filter((r) => !servies.has(r)).sort();

console.log(`[contrat] ${servies.size} routes servies, ${documentees.size} routes documentées.`);

if (nonDocumentees.length > 0) {
  console.error("\n[contrat] Routes servies mais ABSENTES de la documentation :");
  for (const r of nonDocumentees) console.error(`  - ${r}`);
  console.error(
    "\n  Un intégrateur ne peut pas deviner ces points d'entrée. Décrivez-les dans" +
      '\n  src/openapi/document.ts, ou retirez-les de l’application.'
  );
}

if (fantomes.length > 0) {
  console.error('\n[contrat] Routes documentées mais INEXISTANTES :');
  for (const r of fantomes) console.error(`  - ${r}`);
  console.error(
    '\n  La documentation promet des points d’entrée que l’API ne sert pas.' +
      '\n  Corrigez src/openapi/document.ts.'
  );
}

if (nonDocumentees.length === 0 && fantomes.length === 0) {
  console.log('[contrat] Documentation et application concordent exactement.');
  process.exit(0);
}

process.exit(1);
