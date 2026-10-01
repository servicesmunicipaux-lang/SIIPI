#!/usr/bin/env node
// =============================================================================
// skill:ui-builder — squelette d'un écran communal conforme à la maison.
//
// POURQUOI UN GÉNÉRATEUR. Les conventions de ce front ne sont pas décoratives :
// une classe `ml-4` au lieu de `ms-4` casse la mise en page en arabe, une clé
// oubliée dans `ar.json` affiche la clé brute à l'écran, et un état de
// chargement absent fait passer « rien » pour « aucune donnée ». Ces trois
// fautes se répètent parce qu'elles sont invisibles à la relecture. Le
// générateur les rend impossibles au départ.
//
// Ce qu'il produit :
//   — un composant React/TypeScript avec ses trois états (chargement, erreur,
//     vide) distingués, jamais confondus ;
//   — des propriétés logiques uniquement (ms/me/ps/pe/start/end) ;
//   — les clés i18n ajoutées AUX DEUX fichiers de langue ;
//   — le rattachement au pôle métier de la barre latérale.
//
//   node scripts/skills/ui-builder.mjs <NomDuComposant> <pôle> [--ecrire]
//   node scripts/skills/ui-builder.mjs Carburant flotte --ecrire
//
// Pôles : cockpit · terrain · citoyens · flotte · pilotage
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [nom, pole = 'cockpit', ...reste] = process.argv.slice(2);
const ecrire = reste.includes('--ecrire');

const POLES = {
  cockpit:  { titre: 'Cockpit & synthèse',        dossier: 'communal' },
  terrain:  { titre: 'Terrain & opérations',      dossier: 'communal' },
  citoyens: { titre: 'Citoyens & cadre de vie',   dossier: 'communal' },
  flotte:   { titre: 'Flotte, GMAO & dépôt',      dossier: 'communal' },
  pilotage: { titre: 'Pilotage & auto-évaluation', dossier: 'kpi' },
};

if (!nom || !/^[A-Z][A-Za-zÀ-ÿ0-9]*$/.test(nom)) {
  console.error('Usage : node scripts/skills/ui-builder.mjs <NomDuComposant> <pôle> [--ecrire]');
  console.error('Pôles :', Object.keys(POLES).join(' · '));
  process.exit(2);
}
if (!POLES[pole]) {
  console.error(`Pôle inconnu : ${pole}. Attendu : ${Object.keys(POLES).join(' · ')}`);
  process.exit(2);
}

const cle = nom.charAt(0).toLowerCase() + nom.slice(1);
const racine = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const chemin = join(racine, 'web', 'src', 'composants', POLES[pole].dossier, `${nom}.tsx`);

const composant = `// ${POLES[pole].titre} — ${nom}.
//
// TROIS ÉTATS, JAMAIS DEUX. En cours de chargement, en erreur, ou chargé — et
// « chargé mais vide » se dit, il ne se devine pas. Un écran vide sans phrase
// laisse croire à une panne ; pire, il laisse croire qu'il n'y a rien à faire.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

export function ${nom}({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [lignes, setLignes] = useState<unknown[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = async () => {
    try {
      // TODO brancher l'appel réel. Le type vient du contrat (api-types.ts),
      // jamais écrit à la main : un champ renommé côté serveur doit casser la
      // compilation, pas produire une colonne vide.
      setLignes([]);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  if (erreur && !lignes) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!lignes) return <Chargement />;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.${cle}.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-500">{t('communal.${cle}.chapeau')}</p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}

      {lignes.length === 0 ? (
        /* « Vide » se dit. Un cadre blanc se prend pour une panne. */
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">
          {t('communal.${cle}.aucun')}
        </p>
      ) : (
        <ul className="space-y-2">
          {/* Marges logiques : ms/me, jamais ml/mr — l'arabe se lit de droite à gauche. */}
          {lignes.map((_, i) => (
            <li key={i} className="rounded-xl border border-ardoise-200 bg-white p-3 ps-4">
              {/* … */}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
`;

const cles = {
  fr: { titre: nom, chapeau: 'À compléter.', aucun: 'Rien à afficher pour le moment.' },
  ar: { titre: nom, chapeau: 'في انتظار الإكمال.', aucun: 'لا يوجد ما يُعرض حاليا.' },
};

function poser(langue) {
  const p = join(racine, 'web', 'src', 'locales', `${langue}.json`);
  const d = JSON.parse(readFileSync(p, 'utf8'));
  d.communal ??= {};
  if (d.communal[cle]) return `  ${langue}.json : « communal.${cle} » existe déjà, laissé tel quel`;
  d.communal[cle] = cles[langue];
  if (ecrire) writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
  return `  ${langue}.json : « communal.${cle} » ${ecrire ? 'ajouté' : 'à ajouter'}`;
}

console.log(`\nComposant : ${nom}   Pôle : ${POLES[pole].titre}`);
console.log(`Fichier   : ${chemin.replace(racine + '/', '')}\n`);

if (ecrire) {
  if (existsSync(chemin)) {
    console.error(`\u001b[31mLe fichier existe déjà. Rien n'a été écrit.\u001b[0m\n`);
    process.exit(1);
  }
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, composant, 'utf8');
  console.log('\u001b[32mComposant écrit.\u001b[0m');
} else {
  console.log(composant);
  console.log('\u001b[90m(relancer avec --ecrire pour poser les fichiers)\u001b[0m');
}

console.log('\nClés de traduction :');
console.log(poser('fr'));
console.log(poser('ar'));

console.log(`
À faire ensuite, à la main — et ces trois points ne se devinent pas :
  1. rattacher le composant au pôle « ${pole} » dans web/src/composants/BarreLaterale.tsx
  2. brancher l'appel d'API, en tirant le type de api-types.ts (jamais écrit à la main)
  3. vérifier la mise en page EN ARABE : basculer la langue, relire de droite à gauche
`);
