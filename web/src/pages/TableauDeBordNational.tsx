import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortail } from '../lib/portail';
import { api, type LigneGouvernorat, type StatutCommune } from '../lib/api';
import { formaterNombre } from '../i18n';
import { DecoupageCommunal } from '../composants/national/DecoupageCommunal';
import {
  BadgeProvenance,
  BadgeStatut,
  BarreAdoption,
  CarteIndicateur,
  Chargement,
  Erreur,
  type Provenance,
  type Statut,
} from '../composants/Elements';

/* ---------------------------------------------------------------------------
   Colonnes triables du tableau par gouvernorat.
   Le tri par défaut porte sur l'adoption CROISSANTE : l'écran doit s'ouvrir sur
   ce qui manque, pas sur ce qui va bien. Un observatoire trié par ordre
   alphabétique oblige à chercher le problème ; trié par écart, il le montre.
   --------------------------------------------------------------------------- */

type Cle = keyof LigneGouvernorat;

const COLONNES: Array<{ cle: Cle; libelle: string; numerique: boolean; decimales?: number }> = [
  { cle: 'gouvernorat', libelle: 'gouvernorat', numerique: false },
  { cle: 'communes_actives', libelle: 'adoption', numerique: true },
  { cle: 'population', libelle: 'population', numerique: true },
  { cle: 'tonnage_jour', libelle: 'tonnage', numerique: true, decimales: 0 },
  { cle: 'production_kg_hab_jour', libelle: 'production', numerique: true, decimales: 2 },
  { cle: 'taux_collecte', libelle: 'collecte', numerique: true, decimales: 1 },
  { cle: 'indice_proprete', libelle: 'proprete', numerique: true, decimales: 1 },
  { cle: 'pcgd_valides', libelle: 'pcgd', numerique: true },
  { cle: 'reclamations_30j', libelle: 'reclamations', numerique: true },
];

function valeurTri(ligne: LigneGouvernorat, cle: Cle): number | string {
  // L'adoption se compare en TAUX et non en nombre de communes : 0 commune
  // active sur 7 et 0 sur 31 sont deux situations différentes, et un tri sur
  // le compte brut les confondrait.
  if (cle === 'communes_actives') {
    return ligne.communes > 0 ? ligne.communes_actives / ligne.communes : 0;
  }
  const v = ligne[cle];
  if (v === null || v === undefined) return -Infinity;
  if (typeof v === 'number') return v;
  return String(v);
}

/**
 * Compare sans tenir compte des accents.
 *
 * Les noms de communes tunisiennes en portent beaucoup — Dar Chaâbane El
 * Fehri, Béja, Kébili, Médenine, Aïn Draham — et personne ne les saisit dans
 * une barre de recherche. « chaabane » ne trouvait rien, et l'écran répondait
 * « aucune commune ne correspond » sur une commune qui existe : la recherche
 * paraissait cassée alors qu'elle était seulement littérale.
 */
function sansAccent(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .trim();
}

export function TableauDeBordNational() {
  const { t } = useTranslation();
  const { ouvrirPortail } = usePortail();
  const [gouvernorats, setGouvernorats] = useState<LigneGouvernorat[] | null>(null);
  const [communes, setCommunes] = useState<StatutCommune[] | null>(null);
  // Le découpage s'ouvre à la place de l'annuaire plutôt que par-dessus : une
  // carte d'édition dans une fenêtre superposée se manipule mal, et l'on y
  // perd le fil de ce qu'on était en train de faire.
  const [communeADecouper, setCommuneADecouper] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [triCle, setTriCle] = useState<Cle>('communes_actives');
  const [triAscendant, setTriAscendant] = useState(true);
  const [recherche, setRecherche] = useState('');

  async function charger() {
    setErreur(null);
    try {
      const [g, c] = await Promise.all([api.gouvernorats(), api.deploiement()]);
      setGouvernorats(g);
      setCommunes(c);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('commun.erreur'));
    }
  }

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totaux = useMemo(() => {
    if (!gouvernorats) return null;
    const somme = (f: (g: LigneGouvernorat) => number | null) =>
      gouvernorats.reduce((acc, g) => acc + (f(g) ?? 0), 0);
    return {
      communes: somme((g) => g.communes),
      actives: somme((g) => g.communes_actives),
      population: somme((g) => g.population),
      populationActive: 0, // renseigné plus bas, à partir du détail par commune
      tonnage: somme((g) => g.tonnage_jour),
      reclamations: somme((g) => g.reclamations_30j),
    };
  }, [gouvernorats]);

  const populationActive = useMemo(
    () =>
      (communes ?? [])
        .filter((c) => c.statut === 'active')
        .reduce((acc, c) => acc + (c.population ?? 0), 0),
    [communes]
  );

  const gouvernoratsTries = useMemo(() => {
    if (!gouvernorats) return [];
    const copie = [...gouvernorats];
    copie.sort((a, b) => {
      const va = valeurTri(a, triCle);
      const vb = valeurTri(b, triCle);
      const comparaison =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'fr');
      if (comparaison !== 0) return triAscendant ? comparaison : -comparaison;
      // À valeur égale — et au départ, 22 gouvernorats sont à zéro — on montre
      // d'abord les territoires les plus peuplés : c'est là que l'absence de
      // données coûte le plus cher.
      return b.population - a.population;
    });
    return copie;
  }, [gouvernorats, triCle, triAscendant]);

  const communesFiltrees = useMemo(() => {
    if (!communes) return [];
    const terme = sansAccent(recherche);
    if (!terme) return communes;
    return communes.filter(
      (c) =>
        sansAccent(c.name).includes(terme) ||
        sansAccent(c.gouvernorat).includes(terme) ||
        (c.name_ar ?? '').includes(recherche.trim())
    );
  }, [communes, recherche]);

  if (erreur) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!gouvernorats || !communes || !totaux) return <Chargement />;

  if (communeADecouper) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <DecoupageCommunal
          communeId={communeADecouper}
          onFermer={() => setCommuneADecouper(null)}
        />
      </div>
    );
  }

  function basculerTri(cle: Cle) {
    if (cle === triCle) {
      setTriAscendant((v) => !v);
    } else {
      setTriCle(cle);
      // Un nom se lit de A à Z ; un indicateur s'ouvre sur le plus faible,
      // c'est-à-dire sur ce qui demande attention.
      setTriAscendant(true);
    }
  }

  const chapeau =
    totaux.actives === 0
      ? t('national.chapeauAucune')
      : t('national.chapeau', {
          count: totaux.actives,
          actives: formaterNombre(totaux.actives),
          total: formaterNombre(totaux.communes),
        });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      {/* -------------------------------------------------------------------
          Une phrase, pas des chiffres. C'est l'indicateur numéro un du
          responsable national : combien de communes utilisent réellement la
          plateforme. Il doit être lisible depuis le couloir.
          ------------------------------------------------------------------- */}
      <section className="mb-8">
        <p className="text-xs font-semibold tracking-wide text-siipi-700 uppercase">
          {t('national.titre')}
        </p>
        <h1 className="mt-2 max-w-3xl text-2xl font-bold text-balance text-ardoise-900 sm:text-3xl">
          {chapeau}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ardoise-500">{t('national.chapeauDetail')}</p>
      </section>

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CarteIndicateur
          accent
          libelle={t('national.cartes.adoption')}
          valeur={`${formaterNombre(totaux.actives)} / ${formaterNombre(totaux.communes)}`}
          detail={t('national.cartes.adoptionDetail')}
        />
        <CarteIndicateur
          libelle={t('national.cartes.population')}
          valeur={formaterNombre(populationActive)}
          detail={t('national.cartes.populationDetail')}
        />
        <CarteIndicateur
          libelle={t('national.cartes.tonnage')}
          valeur={formaterNombre(totaux.tonnage, 0)}
          detail={t('national.cartes.tonnageDetail')}
        />
        <CarteIndicateur
          libelle={t('national.cartes.reclamations')}
          valeur={formaterNombre(totaux.reclamations)}
          detail={t('national.cartes.reclamationsDetail')}
        />
      </section>

      {/* -------------------------------------------------------------------
          Tableau par gouvernorat
          ------------------------------------------------------------------- */}
      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ardoise-900">{t('national.tableau.titre')}</h2>
          <p className="text-xs text-ardoise-500">{t('national.tableau.sousTitre')}</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-ardoise-200 bg-ardoise-50 text-start">
                {COLONNES.map((colonne) => {
                  const actif = colonne.cle === triCle;
                  return (
                    <th
                      key={colonne.cle}
                      scope="col"
                      className={`px-3 py-2.5 font-semibold ${
                        colonne.numerique ? 'text-end' : 'text-start'
                      }`}
                      aria-sort={actif ? (triAscendant ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        onClick={() => basculerTri(colonne.cle)}
                        title={t('national.tableau.trierPar', {
                          colonne: t(`national.tableau.${colonne.libelle}`),
                        })}
                        className={`inline-flex items-center gap-1 rounded hover:text-siipi-700 ${
                          actif ? 'text-siipi-700' : 'text-ardoise-600'
                        }`}
                      >
                        {t(`national.tableau.${colonne.libelle}`)}
                        <span aria-hidden className="text-[10px] opacity-70">
                          {actif ? (triAscendant ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {gouvernoratsTries.map((g) => (
                <tr
                  key={g.gouvernorat}
                  className="border-b border-ardoise-100 last:border-0 hover:bg-ardoise-50"
                >
                  <th scope="row" className="px-3 py-2.5 text-start font-medium text-ardoise-900">
                    {g.gouvernorat}
                    <span className="chiffres ms-2 text-xs font-normal text-ardoise-400">
                      {formaterNombre(g.communes)}
                    </span>
                  </th>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end">
                      <BarreAdoption actives={g.communes_actives} total={g.communes} />
                    </div>
                  </td>
                  <td className="chiffres px-3 py-2.5 text-end text-ardoise-700">
                    {formaterNombre(g.population)}
                  </td>
                  <td className="chiffres px-3 py-2.5 text-end text-ardoise-700">
                    {formaterNombre(g.tonnage_jour, 0)}
                  </td>
                  <td className="chiffres px-3 py-2.5 text-end text-ardoise-700">
                    {formaterNombre(g.production_kg_hab_jour, 2)}
                  </td>
                  <td className="chiffres px-3 py-2.5 text-end text-ardoise-700">
                    {g.taux_collecte === null ? '—' : `${formaterNombre(g.taux_collecte, 1)} %`}
                  </td>
                  <td className="chiffres px-3 py-2.5 text-end text-ardoise-700">
                    {formaterNombre(g.indice_proprete, 1)}
                  </td>
                  <td className="chiffres px-3 py-2.5 text-end text-ardoise-700">
                    {formaterNombre(g.pcgd_valides)}
                    <span className="text-ardoise-400"> / {formaterNombre(g.communes)}</span>
                  </td>
                  <td className="chiffres px-3 py-2.5 text-end text-ardoise-700">
                    {formaterNombre(g.reclamations_30j)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* -------------------------------------------------------------------
          Recherche dans les 350 communes
          ------------------------------------------------------------------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ardoise-900">{t('national.communes.titre')}</h2>
          <p className="chiffres text-xs text-ardoise-500">
            {t('national.communes.resultats', {
              count: communesFiltrees.length,
              n: formaterNombre(communesFiltrees.length),
            })}
          </p>
        </div>

        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t('national.communes.recherche')}
          className="mb-3 w-full rounded-lg border border-ardoise-300 bg-white px-3 py-2.5 placeholder:text-ardoise-400 focus:border-siipi-500 focus:ring-2 focus:ring-siipi-200 sm:max-w-md"
        />

        {communesFiltrees.length === 0 ? (
          <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-center text-sm text-ardoise-500">
            {t('national.communes.aucunResultat')}
          </p>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-ardoise-200 bg-white">
            <ul>
              {communesFiltrees.map((c) => (
                <li
                  key={c.commune_id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ardoise-100 px-4 py-3 last:border-0 hover:bg-siipi-50"
                >
                  {/* Toute la ligne ouvre le portail : c'est le geste attendu
                      quand on vient de trouver une commune dans une liste de
                      350. Un bouton nommé l'accompagne, parce qu'une ligne
                      cliquable sans indice ne se devine pas. */}
                  <button
                    type="button"
                    onClick={() => ouvrirPortail(c.commune_id)}
                    className="min-w-0 flex-1 text-start"
                    title={t('national.communes.ouvrirPortailDe', { nom: c.name })}
                  >
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ardoise-900">
                      {c.name}
                      {c.name_ar && (
                        <span lang="ar" dir="rtl" className="text-sm text-ardoise-500">
                          {c.name_ar}
                        </span>
                      )}
                      {c.is_pilot && (
                        <span className="rounded bg-siipi-100 px-1.5 py-0.5 text-[11px] font-semibold text-siipi-800">
                          {t('national.communes.pilote')}
                        </span>
                      )}
                    </p>
                    <p className="chiffres mt-0.5 text-xs text-ardoise-500">
                      {c.gouvernorat} · {formaterNombre(c.population)} {t('commun.habitants')}
                    </p>
                  </button>
                  <BadgeProvenance provenance={c.donnees_source as Provenance} />
                  <BadgeStatut statut={c.statut as Statut} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => ouvrirPortail(c.commune_id)}
                      className="min-h-11 rounded-lg bg-siipi-600 px-3 text-sm font-semibold text-white hover:bg-siipi-700"
                    >
                      {t('national.communes.ouvrirPortail')}
                    </button>
                    {/* « Modifier » ne concerne que le tracé de la limite
                        communale : le libellé le dit, parce qu'à côté d'un
                        bouton qui ouvre tout le portail, « Modifier » seul
                        laissait croire qu'on allait éditer la commune. */}
                    <button
                      type="button"
                      onClick={() => setCommuneADecouper(c.commune_id)}
                      className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-100"
                    >
                      {t('national.communes.modifierLimite')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
