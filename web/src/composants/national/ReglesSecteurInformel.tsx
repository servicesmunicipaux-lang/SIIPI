// Les règles du secteur informel (lot I1) — ce que le projet de décret fixe,
// tenu par la FNCT en données datées plutôt qu'écrit dans le code.
//
// LA PÉRIODE TRANSITOIRE NE S'INVENTE PAS. Sans date de départ, l'écran dit
// qu'elle n'est pas fixée et n'affiche aucune échéance : une date posée « pour
// voir » serait lue comme la règle par une commune.
//
// FERMER N'EST PAS RETIRER. Une pièce qui cesse d'être exigée se ferme à une
// date, avec le texte qui en décide : les demandes d'avant restent jugées sur la
// liste de leur jour. Une ligne saisie à tort se retire, avec un motif ; elle
// n'a jamais été la règle.

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type ElementListeNationale,
  type ParametreNational,
  type ReglesInformel,
} from '../../lib/api';
import { useFormats } from '../../lib/formats';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton =
  'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret =
  'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

type Liste = ElementListeNationale['liste'];

export function ReglesSecteurInformel(props: {
  parametres: ParametreNational[];
  version: number;
  onFait: (m: string) => void;
  onErreur: (e: unknown) => void;
  // Les fiches des durées et de la date de départ, réglées entre la période
  // qu'elles définissent et les listes.
  children: ReactNode;
}) {
  const { parametres, version, onFait, onErreur, children } = props;
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const [regles, setRegles] = useState<ReglesInformel | null>(null);

  useEffect(() => {
    api.reglesInformel().then(setRegles).catch(onErreur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (!regles) return null;
  const p = regles.periode;
  const libelleParametre = (code: string) => {
    const d = parametres.find((x) => x.code === code);
    return d ? (i18n.language === 'ar' ? d.libelle_ar : d.libelle_fr) : code;
  };

  return (
    <>
      <article className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
        <h3 className="font-semibold text-ardoise-900">
          {t('national.parametres.informel.periode.titre')}
        </h3>
        <div className="rounded-lg bg-ardoise-50 p-3 text-sm">
          {p.fin ? (
            <>
              <span className="block text-ardoise-900">
                {t('national.parametres.informel.periode.du', {
                  debut: f.date(p.debut ?? ''),
                  fin: f.date(p.fin),
                  mois: p.duree_mois,
                })}
              </span>
              {p.fin_etalonnage && (
                <span className="block text-ardoise-700">
                  {t('national.parametres.informel.periode.etalonnage', {
                    date: f.date(p.fin_etalonnage),
                  })}
                </span>
              )}
            </>
          ) : (
            <span className="block font-medium text-amber-900">
              {t('national.parametres.informel.periode.nonFixee')}
            </span>
          )}
          {p.manque.length > 0 && (
            <span className="mt-1 block text-ardoise-600">
              {t('national.parametres.informel.periode.manque', {
                liste: p.manque.map(libelleParametre).join(' ; '),
              })}
            </span>
          )}
          {p.provisoire && (
            <span className="mt-1 inline-block rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
              {t('national.parametres.informel.projet')}
            </span>
          )}
        </div>
      </article>
      {children}
      {regles.listes.map((l) => (
        <ListeNationale
          key={l.liste}
          liste={l.liste}
          elements={l.elements}
          onFait={onFait}
          onErreur={onErreur}
        />
      ))}
    </>
  );
}

function ListeNationale(props: {
  liste: Liste;
  elements: ReglesInformel['listes'][number]['elements'];
  onFait: (m: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const { liste, elements, onFait, onErreur } = props;
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const vide = {
    code: '',
    fr: '',
    ar: '',
    ordre: '',
    dateEffet: '',
    provisoire: true,
    reference: '',
  };
  const [s, setS] = useState(vide);
  const [geste, setGeste] = useState<{
    id: string;
    nature: 'fin' | 'retrait';
    date: string;
    texte: string;
  } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function ajouter() {
    setEnvoi(true);
    try {
      await api.ajouterElementListe(liste, {
        code: s.code.trim(),
        libelleFr: s.fr,
        libelleAr: s.ar,
        ordre: s.ordre === '' ? 0 : Number(s.ordre),
        dateEffet: s.dateEffet,
        provisoire: s.provisoire,
        reference: s.reference || null,
      });
      setS(vide);
      onFait(t('national.parametres.informel.elementAjoute'));
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  async function confirmer() {
    if (!geste) return;
    setEnvoi(true);
    try {
      if (geste.nature === 'fin') {
        await api.fermerElementListe(geste.id, { dateFin: geste.date, reference: geste.texte });
        onFait(t('national.parametres.informel.elementFerme'));
      } else {
        await api.retirerElementListe(geste.id, geste.texte);
        onFait(t('national.parametres.informel.elementRetire'));
      }
      setGeste(null);
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  const etat = (e: (typeof elements)[number]) => {
    switch (e.etat) {
      case 'a_venir':
        return t('national.parametres.informel.etats.a_venir', { date: f.date(e.date_effet) });
      case 'ferme':
        return t('national.parametres.informel.etats.ferme', { date: f.date(e.date_fin ?? '') });
      case 'retire':
        return t('national.parametres.informel.etats.retire', { motif: e.motif_retrait ?? '' });
      default:
        return t('national.parametres.informel.etats.en_vigueur', { date: f.date(e.date_effet) });
    }
  };

  return (
    <article className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
      <div>
        <h3 className="font-semibold text-ardoise-900">
          {t(`national.parametres.informel.listes.${liste}.titre`)}
        </h3>
        <p className="text-xs text-ardoise-600">
          {t(`national.parametres.informel.listes.${liste}.description`)}
        </p>
      </div>
      <ul className="divide-y divide-ardoise-100 text-sm">
        {elements.map((e) => (
          <li
            key={e.id}
            className={`space-y-1 py-2 ${e.etat === 'retire' ? 'text-ardoise-400' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={`font-medium ${e.etat === 'retire' ? 'line-through' : 'text-ardoise-900'}`}
                  >
                    {i18n.language === 'ar' ? e.libelle_ar : e.libelle_fr}
                  </span>
                  <code className="text-xs text-ardoise-500" dir="ltr">
                    {e.code}
                  </code>
                  <span className="text-xs text-ardoise-600">{etat(e)}</span>
                  {e.provisoire && e.etat !== 'retire' && (
                    <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                      {t('national.parametres.provisoire')}
                    </span>
                  )}
                </div>
                {e.reference && <p className="text-xs text-ardoise-500">{e.reference}</p>}
                {e.reference_fin && (
                  <p className="text-xs text-ardoise-500">
                    {t('national.parametres.informel.finPar', { texte: e.reference_fin })}
                  </p>
                )}
              </div>
              {(e.etat === 'en_vigueur' || e.etat === 'a_venir') && geste?.id !== e.id && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setGeste({ id: e.id, nature: 'fin', date: '', texte: '' })}
                    className={boutonDiscret}
                  >
                    {t('national.parametres.informel.fermer')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGeste({ id: e.id, nature: 'retrait', date: '', texte: '' })}
                    className={boutonDiscret}
                  >
                    {t('national.parametres.retirer')}
                  </button>
                </div>
              )}
            </div>
            {geste?.id === e.id && (
              <div className="flex flex-wrap items-end gap-2">
                {geste.nature === 'fin' && (
                  <label className="text-xs">
                    {t('national.parametres.informel.dateFin')}
                    <input
                      type="date"
                      value={geste.date}
                      onChange={(ev) => setGeste({ ...geste, date: ev.target.value })}
                      className={champ}
                    />
                  </label>
                )}
                <label className="min-w-56 flex-1 text-xs">
                  {geste.nature === 'fin'
                    ? t('national.parametres.informel.texteFin')
                    : t('national.parametres.motifRetrait')}
                  <input
                    value={geste.texte}
                    onChange={(ev) => setGeste({ ...geste, texte: ev.target.value })}
                    className={champ}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void confirmer()}
                  disabled={
                    envoi ||
                    geste.texte.trim().length < 5 ||
                    (geste.nature === 'fin' && !geste.date)
                  }
                  className={bouton}
                >
                  {geste.nature === 'fin'
                    ? t('national.parametres.informel.confirmerFin')
                    : t('national.parametres.confirmerRetrait')}
                </button>
                <button type="button" onClick={() => setGeste(null)} className={boutonDiscret}>
                  {t('commun.annuler')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="grid gap-3 rounded-lg border border-siipi-200 bg-siipi-50/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="font-medium">{t('national.parametres.informel.libelleFr')}</span>
          <input
            value={s.fr}
            onChange={(e) => setS({ ...s, fr: e.target.value })}
            className={champ}
            lang="fr"
            dir="ltr"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('national.parametres.informel.libelleAr')}</span>
          <input
            value={s.ar}
            onChange={(e) => setS({ ...s, ar: e.target.value })}
            className={champ}
            lang="ar"
            dir="rtl"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('national.parametres.informel.code')}</span>
          <input
            value={s.code}
            onChange={(e) => setS({ ...s, code: e.target.value })}
            placeholder="photo_identite"
            className={champ}
            dir="ltr"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('national.parametres.informel.ordre')}</span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={s.ordre}
            onChange={(e) => setS({ ...s, ordre: e.target.value })}
            className={champ}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">{t('national.parametres.dateEffet')}</span>
          <input
            type="date"
            min="2000-01-01"
            value={s.dateEffet}
            onChange={(e) => setS({ ...s, dateEffet: e.target.value })}
            className={champ}
          />
        </label>
        <label className="text-sm lg:col-span-2">
          <span className="font-medium">{t('national.parametres.informel.texte')}</span>
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
          {t('national.parametres.provisoire')}
        </label>
        <div className="flex items-end lg:col-span-4">
          <button
            type="button"
            onClick={() => void ajouter()}
            disabled={
              envoi ||
              !s.code.trim() ||
              !s.fr.trim() ||
              !s.ar.trim() ||
              !s.dateEffet ||
              (!s.provisoire && !s.reference.trim())
            }
            className={bouton}
          >
            {t('national.parametres.informel.ajouter')}
          </button>
        </div>
      </div>
    </article>
  );
}
