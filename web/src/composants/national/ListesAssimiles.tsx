// Les listes nationales des déchets assimilés (jalon G, lot G1), dans
// Paramètres nationaux : les catégories d'activité des établissements, les flux
// assimilés et la base légale des conventions. Même discipline que les listes du
// secteur informel : un élément ne se réécrit pas, il se ferme à une date avec
// le texte qui en décide, ou se retire s'il avait été saisi à tort.
//
// UN TEXTE SANS DATE D'APPLICATION N'EST PAS EN VIGUEUR. Le décret-loi publié
// dont l'application attend la proclamation des élections s'inscrit « en
// attente » : l'écran le dit en mots, et ne propose ni de le fermer (la base le
// refuserait : rien ne finit avant d'avoir commencé) ni de le compter comme la
// règle. La date d'application se fixe une fois, en citant la pièce qui la fixe.
//
// CHAQUE LISTE A SON ATTRIBUT, ET SEULEMENT LE SIEN. Les unités d'échelle ne
// partent que pour une catégorie, « dangereux » que pour un flux, la date de
// publication que pour un texte : l'API refuse un attribut d'une autre liste,
// et l'écran ne lui en offre pas l'occasion.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ElementListeAssimiles, type ListesAssimiles as Listes } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Pastille, type TonPastille } from '../ui/Pastille';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton =
  'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret =
  'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

// Le jour à Tunis (UTC+1, sans heure d'été) : une publication au JORT n'est
// jamais postérieure à aujourd'hui.
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

type Liste = ElementListeAssimiles['liste'];
type Element = Listes['listes'][number]['elements'][number];
type Unite = NonNullable<ElementListeAssimiles['unites_echelle']>[number];

// L'ordre de la liste des unités suit celui de l'API : un ordre propre à
// l'écran ferait diverger les deux le jour où une unité s'ajoute.
const UNITES: Unite[] = ['chambre', 'lit', 'chaise', 'table', 'etal', 'm2', 'eleve', 'employe'];

const TON_ETAT: Record<Element['etat'], TonPastille> = {
  en_vigueur: 'mesure',
  a_venir: 'neutre',
  en_attente: 'attention',
  ferme: 'neutre',
  retire: 'neutre',
};

// Le format d'un code, celui que l'API et la base exigent : dit sous le champ
// avant l'envoi, plutôt qu'en « Requête invalide » après.
const CODE_VALIDE = /^[a-z][a-z0-9_]{2,60}$/;

// Un texte de la base légale peut dater de 1956 (le Journal officiel paraît
// depuis) ; une catégorie, un flux, depuis 2000 — comme la base l'exige.
const PREMIER_JOUR = (legale: boolean) => (legale ? '1956-01-01' : '2000-01-01');

// Un exemple de code par liste : le format attendu se montre mieux qu'il ne se décrit.
const EXEMPLE_CODE: Record<Liste, string> = {
  categories_activite_assimiles: 'hotel',
  flux_assimiles: 'huiles_alimentaires_usagees',
  base_legale_assimiles: 'decret_loi_2026_4',
};

export function ListesAssimiles(props: {
  version: number;
  onFait: (m: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const { version, onFait, onErreur } = props;
  const [listes, setListes] = useState<Listes | null>(null);

  // Rechargées avec les paramètres : chaque geste passe par onFait, qui les
  // relit ; un état tenu ici à la main pourrait diverger de celui de la base.
  useEffect(() => {
    api.listesAssimiles().then(setListes).catch(onErreur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (!listes) return null;
  return (
    <>
      {listes.listes.map((l) => (
        <CarteListe key={l.liste} liste={l.liste} elements={l.elements} onFait={onFait} />
      ))}
    </>
  );
}

type Geste =
  | { id: string; nature: 'fin'; date: string; texte: string }
  | { id: string; nature: 'retrait'; texte: string }
  | { id: string; nature: 'application'; date: string; texte: string };

function CarteListe(props: { liste: Liste; elements: Element[]; onFait: (m: string) => void }) {
  const { liste, elements, onFait } = props;
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const categorie = liste === 'categories_activite_assimiles';
  const flux = liste === 'flux_assimiles';
  const legale = liste === 'base_legale_assimiles';
  const vide = {
    code: '',
    fr: '',
    ar: '',
    ordre: '',
    dateEffet: '',
    sansDate: false,
    provisoire: true,
    reference: '',
    unites: [] as Unite[],
    dangereux: false,
    datePublication: '',
  };
  const [s, setS] = useState(vide);
  const [geste, setGeste] = useState<Geste | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Le refus d'un geste se dit dans la carte qui l'a fait : en haut de la page
  // des paramètres nationaux, loin du formulaire, on ne le voyait pas.
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = (suite: string) => `national.parametres.assimiles.${suite}`;
  const messageErreur = (e: unknown) => (e instanceof ErreurApi ? e.message : t('commun.erreur'));

  async function ajouter() {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.ajouterElementAssimiles(liste, {
        code: s.code.trim(),
        libelleFr: s.fr,
        libelleAr: s.ar,
        ordre: s.ordre === '' ? 0 : Number(s.ordre),
        dateEffet: legale && s.sansDate ? null : s.dateEffet,
        provisoire: s.provisoire,
        reference: s.reference.trim() || null,
        ...(categorie ? { unitesEchelle: UNITES.filter((u) => s.unites.includes(u)) } : {}),
        ...(flux ? { dangereux: s.dangereux } : {}),
        ...(legale ? { datePublication: s.datePublication || null } : {}),
      });
      setS(vide);
      onFait(t(cle('messages.ajoute')));
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  }

  async function confirmer() {
    if (!geste) return;
    setEnvoi(true);
    setErreur(null);
    try {
      if (geste.nature === 'fin') {
        await api.fermerElementAssimiles(geste.id, { dateFin: geste.date, reference: geste.texte.trim() });
        onFait(t(cle('messages.ferme')));
      } else if (geste.nature === 'application') {
        await api.fixerApplicationElement(geste.id, { dateEffet: geste.date, reference: geste.texte.trim() });
        onFait(t(cle('messages.applicationFixee')));
      } else {
        await api.retirerElementAssimiles(geste.id, geste.texte.trim());
        onFait(t(cle('messages.retire')));
      }
      setGeste(null);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  }

  const etat = (e: Element) => {
    switch (e.etat) {
      case 'en_vigueur':
        return t(cle('etats.en_vigueur'), { date: f.date(e.date_effet ?? '') });
      case 'a_venir':
        return t(cle('etats.a_venir'), { date: f.date(e.date_effet ?? '') });
      case 'ferme':
        return t(cle('etats.ferme'), { date: f.date(e.date_fin ?? '') });
      case 'retire':
        return t(cle('etats.retire'));
      default:
        return t(cle('etats.en_attente'));
    }
  };

  const basculerUnite = (u: Unite) =>
    setS({ ...s, unites: s.unites.includes(u) ? s.unites.filter((x) => x !== u) : [...s.unites, u] });

  const codeInvalide = s.code.trim() !== '' && !CODE_VALIDE.test(s.code.trim());
  const ordreInvalide =
    s.ordre.trim() !== '' && !(Number.isInteger(Number(s.ordre)) && Number(s.ordre) >= 0 && Number(s.ordre) <= 10_000);
  const saisieIncomplete =
    !s.code.trim() ||
    codeInvalide ||
    ordreInvalide ||
    !s.fr.trim() ||
    !s.ar.trim() ||
    (!s.dateEffet && !(legale && s.sansDate)) ||
    (!s.provisoire && !s.reference.trim()) ||
    (categorie && s.unites.length === 0);

  const gesteIncomplet = (g: Geste) => g.texte.trim().length < 5 || (g.nature !== 'retrait' && !g.date);

  return (
    <article className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
      <div>
        <h4 className="font-semibold text-ardoise-900">{t(cle(`listes.${liste}.titre`))}</h4>
        <p className="text-xs text-ardoise-600">{t(cle(`listes.${liste}.aide`))}</p>
      </div>

      {elements.length === 0 ? (
        <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-600">{t(cle('vide'))}</p>
      ) : (
        <ul className="divide-y divide-ardoise-100 text-sm">
          {elements.map((e) => {
            const retire = e.etat === 'retire';
            return (
              <li key={e.id} className={`space-y-1 py-2 ${retire ? 'text-ardoise-400' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className={`font-medium ${retire ? 'line-through' : 'text-ardoise-900'}`}>
                        {i18n.language.startsWith('ar') ? e.libelle_ar : e.libelle_fr}
                      </span>
                      <code className="text-xs text-ardoise-500" dir="ltr">
                        {e.code}
                      </code>
                      <Pastille ton={TON_ETAT[e.etat]}>{etat(e)}</Pastille>
                      {e.provisoire && !retire && <Pastille ton="attention">{t(cle('provisoire'))}</Pastille>}
                      {flux && e.dangereux === true && !retire && (
                        <Pastille ton="attention">{t(cle('dangereux'))}</Pastille>
                      )}
                      {flux && e.dangereux === false && (
                        <span className="text-xs text-ardoise-600">{t(cle('nonDangereux'))}</span>
                      )}
                    </div>
                    {/* La fin annoncée d'un élément encore appliqué : la lire ici
                        évite de la découvrir le jour où il cesse de l'être. */}
                    {(e.etat === 'en_vigueur' || e.etat === 'a_venir') && e.date_fin && (
                      <p className="text-xs text-ardoise-600">{t(cle('cesseLe'), { date: f.date(e.date_fin) })}</p>
                    )}
                    {categorie && e.unites_echelle && e.unites_echelle.length > 0 && (
                      <p className="text-xs text-ardoise-600">
                        {t(cle('unitesEchelle'), {
                          liste: e.unites_echelle.map((u) => t(cle(`unites.${u}`))).join(' · '),
                        })}
                      </p>
                    )}
                    {legale && (
                      <p className="text-xs text-ardoise-600">
                        {e.date_publication
                          ? t(cle('publieLe'), { date: f.date(e.date_publication) })
                          : t(cle('publicationNonRenseignee'))}
                      </p>
                    )}
                    {e.reference && <p className="text-xs text-ardoise-500">{e.reference}</p>}
                    {e.reference_effet && (
                      <p className="text-xs text-ardoise-500">
                        {t(cle('applicationFixeePar'), { texte: e.reference_effet })}
                      </p>
                    )}
                    {e.reference_fin && (
                      <p className="text-xs text-ardoise-500">{t(cle('finPar'), { texte: e.reference_fin })}</p>
                    )}
                    {retire && e.motif_retrait && (
                      <p className="text-xs">{t(cle('motifRetrait'), { motif: e.motif_retrait })}</p>
                    )}
                  </div>
                  {!retire && geste?.id !== e.id && (
                    <div className="flex max-w-full flex-wrap gap-2">
                      {e.etat === 'en_attente' && (
                        <button
                          type="button"
                          onClick={() => setGeste({ id: e.id, nature: 'application', date: '', texte: '' })}
                          className={boutonDiscret}
                        >
                          {t(cle('gestes.fixer'))}
                        </button>
                      )}
                      {/* Une fin se fixe une fois : un élément qui a déjà la sienne ne propose plus de la fixer. */}
                      {(e.etat === 'en_vigueur' || e.etat === 'a_venir') && !e.date_fin && (
                        <button
                          type="button"
                          onClick={() => setGeste({ id: e.id, nature: 'fin', date: '', texte: '' })}
                          className={boutonDiscret}
                        >
                          {t(cle('gestes.fermer'))}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setGeste({ id: e.id, nature: 'retrait', texte: '' })}
                        className={boutonDiscret}
                      >
                        {t(cle('gestes.retirer'))}
                      </button>
                    </div>
                  )}
                </div>
                {geste?.id === e.id && (
                  <div className="flex flex-wrap items-end gap-2">
                    {geste.nature !== 'retrait' && (
                      <label className="text-xs">
                        {geste.nature === 'fin' ? t(cle('champs.dateFin')) : t(cle('champs.dateApplication'))}
                        <input
                          type="date"
                          min={
                            (geste.nature === 'fin' ? e.date_effet : e.date_publication) ?? PREMIER_JOUR(legale)
                          }
                          value={geste.date}
                          onChange={(ev) => setGeste({ ...geste, date: ev.target.value })}
                          className={champ}
                        />
                      </label>
                    )}
                    <label className="min-w-56 flex-1 text-xs">
                      {geste.nature === 'fin'
                        ? t(cle('champs.texteFin'))
                        : geste.nature === 'application'
                          ? t(cle('champs.pieceApplication'))
                          : t(cle('champs.motif'))}
                      <input
                        value={geste.texte}
                        onChange={(ev) => setGeste({ ...geste, texte: ev.target.value })}
                        className={champ}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void confirmer()}
                      disabled={envoi || gesteIncomplet(geste)}
                      className={bouton}
                    >
                      {geste.nature === 'fin'
                        ? t(cle('gestes.confirmerFin'))
                        : geste.nature === 'application'
                          ? t(cle('gestes.confirmerApplication'))
                          : t(cle('gestes.confirmerRetrait'))}
                    </button>
                    <button type="button" onClick={() => setGeste(null)} className={boutonDiscret}>
                      {t(cle('gestes.annuler'))}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {erreur && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erreur}
        </p>
      )}

      <div className="grid gap-3 rounded-lg border border-siipi-200 bg-siipi-50/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="font-medium">{t(cle('champs.libelleFr'))}</span>
          <input
            value={s.fr}
            onChange={(e) => setS({ ...s, fr: e.target.value })}
            className={champ}
            lang="fr"
            dir="ltr"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t(cle('champs.libelleAr'))}</span>
          <input
            value={s.ar}
            onChange={(e) => setS({ ...s, ar: e.target.value })}
            className={champ}
            lang="ar"
            dir="rtl"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t(cle('champs.code'))}</span>
          <input
            value={s.code}
            onChange={(e) => setS({ ...s, code: e.target.value })}
            placeholder={EXEMPLE_CODE[liste]}
            className={champ}
            dir="ltr"
            aria-invalid={codeInvalide || undefined}
          />
          {codeInvalide && <span className="mt-1 block text-xs text-red-800">{t(cle('champs.codeFormat'))}</span>}
        </label>
        <label className="text-sm">
          <span className="font-medium">{t(cle('champs.ordre'))}</span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            max="10000"
            value={s.ordre}
            onChange={(e) => setS({ ...s, ordre: e.target.value })}
            className={champ}
            aria-invalid={ordreInvalide || undefined}
          />
          {ordreInvalide && <span className="mt-1 block text-xs text-red-800">{t(cle('champs.ordreFormat'))}</span>}
        </label>

        {legale && (
          <label className="text-sm">
            <span className="font-medium">{t(cle('champs.datePublication'))}</span>
            <input
              type="date"
              min={PREMIER_JOUR(true)}
              max={aujourdhui()}
              value={s.datePublication}
              onChange={(e) => setS({ ...s, datePublication: e.target.value })}
              className={champ}
            />
          </label>
        )}
        <label className="text-sm">
          <span className="font-medium">
            {legale ? t(cle('champs.dateApplication')) : t(cle('champs.dateEffet'))}
          </span>
          <input
            type="date"
            min={s.datePublication || PREMIER_JOUR(legale)}
            value={legale && s.sansDate ? '' : s.dateEffet}
            disabled={legale && s.sansDate}
            onChange={(e) => setS({ ...s, dateEffet: e.target.value })}
            className={`${champ} disabled:bg-ardoise-100`}
          />
        </label>
        {legale && (
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={s.sansDate}
              onChange={(e) => setS({ ...s, sansDate: e.target.checked, dateEffet: '' })}
              className="h-5 w-5 shrink-0"
            />
            {t(cle('champs.sansDate'))}
          </label>
        )}

        {categorie && (
          <fieldset className="text-sm sm:col-span-2 lg:col-span-4">
            <legend className="font-medium">{t(cle('champs.unites'))}</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {UNITES.map((u) => (
                <label key={u} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.unites.includes(u)}
                    onChange={() => basculerUnite(u)}
                    className="h-5 w-5"
                  />
                  {t(cle(`unites.${u}`))}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {flux && (
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
            <input
              type="checkbox"
              checked={s.dangereux}
              onChange={(e) => setS({ ...s, dangereux: e.target.checked })}
              className="h-5 w-5 shrink-0"
            />
            {t(cle('champs.dangereux'))}
          </label>
        )}

        <label className="text-sm lg:col-span-2">
          <span className="font-medium">
            {legale ? t(cle('champs.referenceJort')) : t(cle('champs.reference'))}
          </span>
          <input
            value={s.reference}
            onChange={(e) => setS({ ...s, reference: e.target.value })}
            className={champ}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.provisoire}
            onChange={(e) => setS({ ...s, provisoire: e.target.checked })}
            className="h-5 w-5"
          />
          {t(cle('provisoire'))}
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void ajouter()}
            disabled={envoi || saisieIncomplete}
            className={bouton}
          >
            {t(cle('gestes.ajouter'))}
          </button>
        </div>
        <p className="text-xs text-ardoise-600 sm:col-span-2 lg:col-span-4">{t(cle('aideAjout'))}</p>
      </div>
    </article>
  );
}
