// Le secteur informel vu par la FNCT (lot I3, 18.3) : par gouvernorat, dans
// l'ordre alphabétique, « N communes sur M ».
//
// AUCUN COMPTE DE MOINS DE 5 ACTEURS (décision du 28/10/2026). Dans un gouvernorat
// de trois acteurs, « 1 formalisé » désigne quelqu'un : la base rend ce compte
// vide et le nomme masqué ; l'écran l'écrit « moins de 5 », distinct de « non
// renseigné » (aucun acteur inscrit). Aucun rang, aucune ligne par commune.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type SecteurInformelNational as Donnees } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement, Erreur } from '../Elements';

type Ligne = Donnees['gouvernorats'][number];
const COMPTES = [
  'acteurs',
  'cartes_valables',
  'demarches_en_cours',
  'formalises',
  'agrements_valables',
] as const;

export function SecteurInformelNational() {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const ar = i18n.language.startsWith('ar');
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () => {
    setErreur(null);
    api
      .secteurInformelNational()
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof Error ? e.message : t('commun.erreur')));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(charger, []);

  if (erreur) return <Erreur message={erreur} onReessayer={charger} />;
  if (!donnees) return <Chargement />;
  const nom = (l: Ligne) => (ar && l.gouvernorat_ar ? l.gouvernorat_ar : l.gouvernorat);
  // L'ordre alphabétique de la langue affichée : un ordre, jamais un rang.
  const lignes = [...donnees.gouvernorats].sort((x, y) =>
    nom(x).localeCompare(nom(y), ar ? 'ar' : 'fr')
  );

  const cellule = (l: Ligne, cle: (typeof COMPTES)[number]) => {
    if (l.masques.includes(cle))
      return <span className="text-ardoise-500">{t('national.informel.moinsDe5')}</span>;
    const v = l[cle];
    if (v === null)
      return <span className="text-ardoise-400">{t('national.informel.nonRenseigne')}</span>;
    return v;
  };
  // Les tonnes : « moins de 5 » s'y lirait « moins de 5 tonnes » ; un masque y dit
  // donc « acteurs », et une somme partielle dit combien de mois elle écarte.
  const tonnes = (l: Ligne) => {
    if (l.tonnes_detournees === null)
      return l.masques.includes('tonnes_detournees') ? (
        <span className="text-ardoise-500">{t('national.informel.tonnesMasquees')}</span>
      ) : (
        <span className="text-ardoise-400">{t('national.informel.nonRenseigne')}</span>
      );
    return (
      <>
        {f.masse(l.tonnes_detournees, 3)}
        {l.mois_masques > 0 && (
          <span className="block text-xs text-ardoise-500">
            {t('national.informel.moisEcartes', { n: l.mois_masques })}
          </span>
        )}
      </>
    );
  };
  // Les tonnes portent sur les mois clos : la même période pour tous les gouvernorats.
  const periodeTonnes = donnees.gouvernorats[0];

  return (
    <section aria-labelledby="titre-informel-national" className="space-y-4">
      <header>
        <h2 id="titre-informel-national" className="text-lg font-semibold text-ardoise-900">
          {t('national.informel.titre')}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('national.informel.intro')}</p>
      </header>
      {!donnees.cadre_actif && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {t('national.informel.cadreInactif')}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ardoise-50 text-xs text-ardoise-600">
            <tr>
              <th className="px-3 py-2 text-start">{t('national.informel.gouvernorat')}</th>
              <th className="px-3 py-2 text-end">{t('national.informel.communes')}</th>
              {COMPTES.map((c) => (
                <th key={c} className="px-3 py-2 text-end">
                  {t(`national.informel.colonnes.${c}`)}
                </th>
              ))}
              <th className="px-3 py-2 text-end">
                {t('national.informel.colonnes.tonnes_detournees')}
                {periodeTonnes && (
                  <span className="block font-normal">
                    {t('national.informel.periodeTonnes', {
                      du: f.date(periodeTonnes.tonnes_du),
                      au: f.date(periodeTonnes.tonnes_au),
                    })}
                  </span>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.gouvernorat} className="border-t border-ardoise-100">
                <td className="px-3 py-2">{nom(l)}</td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {t('national.informel.nSurM', { n: l.communes_avec_acteurs, m: l.communes })}
                </td>
                {/* Un gouvernorat sans acteur inscrit : une seule mention, pas six
                    cases « non renseigné » qui noieraient les lignes renseignées. */}
                {l.communes_avec_acteurs === 0 ? (
                  <td colSpan={COMPTES.length + 1} className="px-3 py-2 text-ardoise-400">
                    {t('national.informel.aucunActeur')}
                  </td>
                ) : (
                  <>
                    {COMPTES.map((c) => (
                      <td key={c} className="px-3 py-2 text-end tabular-nums">
                        {cellule(l, c)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-end tabular-nums">{tonnes(l)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ardoise-500">{t('national.informel.note')}</p>
    </section>
  );
}
