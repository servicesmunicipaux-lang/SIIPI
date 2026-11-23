// Une campagne de pesée (jalon G, lot G5b) : celle des établissements assimilés, ou
// celle d'un échantillon de ménages. Le même formulaire pour le catalogue « + Ajouter »
// et l'écran « Campagnes de pesée », où il modifie aussi une campagne existante.
//
// CE QUE L'ÉTAT PERMET, ET RIEN DE PLUS. Un brouillon se modifie en entier (sauf son
// objet : une campagne de ménages ne devient pas une campagne d'établissements, on en
// ouvre une autre). Ouverte, une campagne ne change plus que sa fin prévue et son
// observation — la base refuse le reste, et une fin avancée avant une pesée déjà
// enregistrée. Close, elle est figée : ce formulaire ne s'ouvre pas.
//
// LA RÈGLE SE DIT AVANT LE REFUS : 61 jours au plus, une fin après le début. Aucun
// circuit ni engin : on pèse chez l'établissement ou au ménage, pas à la benne.
//
// LA CAMPAGNE EST FIGÉE À L'OUVERTURE DU FORMULAIRE, version comprise. La carte peut se
// relire pendant la saisie (un lot de pesées, un import, un changement de langue) : si
// le formulaire prenait alors la nouvelle version, il enverrait avec elle les valeurs
// tirées de l'ancienne lecture, et la modification d'un autre directeur serait écrasée
// sans aucun refus. Avec la version de l'ouverture, elle est refusée (409) ; l'écran
// relit la campagne avant d'afficher le refus, et dit de rouvrir le formulaire pour
// repartir de la version à jour. Un 409 qui ne vient pas d'un conflit de version (une
// fin avancée avant une pesée déjà enregistrée) laisse la saisie, à corriger.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type CampagnePesee, type CampagnePeseeDetail, type ObjetCampagnePesee } from '../../lib/api';
import { CadreAjout, champAjout } from './CadreAjout';
import { aujourdhui } from './FormulaireEtablissement';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const DUREE_MAX_CAMPAGNE = 61;
const OBJETS: ObjetCampagnePesee[] = ['etablissements', 'menages'];

/** Le nombre de jours d'une période, bornes comprises, compté sur le calendrier (sans heure). */
export function joursDePeriode(debut: string, fin: string): number {
  const [a1, m1, j1] = debut.split('-').map(Number);
  const [a2, m2, j2] = fin.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, j2) - Date.UTC(a1, m1 - 1, j1)) / 86_400_000) + 1;
}

/** Un jour décalé de `n` jours, sans passer par l'heure du poste. */
export function decalerJour(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

export function FormulaireCampagnePesee({
  communeId,
  campagne,
  onFait,
  onAnnuler,
  onConflit,
  onIntrouvable,
}: {
  communeId: string;
  /** Une campagne à modifier (brouillon, ou fin prévue d'une ouverte) ; absente, le formulaire en crée une. */
  campagne?: CampagnePesee;
  onFait: (enregistree?: CampagnePeseeDetail) => void | Promise<void>;
  onAnnuler?: () => void;
  /** La modification a été refusée (409) : l'écran relit la campagne et la rend (null si la lecture a échoué). */
  onConflit?: () => Promise<CampagnePesee | null>;
  /** La campagne n'existe plus (404, retirée ailleurs) : l'écran la retire de sa liste. */
  onIntrouvable?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  // Figée à l'ouverture : voir l'en-tête.
  const [c] = useState(campagne);
  const ouverte = c?.statut === 'ouverte';
  const [objet, setObjet] = useState<ObjetCampagnePesee>(c?.objet ?? 'etablissements');
  const [intitule, setIntitule] = useState(c?.intitule ?? '');
  const [protocole, setProtocole] = useState(c?.protocole ?? '');
  const [dateDebut, setDateDebut] = useState(c?.date_debut ?? aujourdhui());
  const [dateFin, setDateFin] = useState(c?.date_fin ?? decalerJour(aujourdhui(), 13));
  const [observation, setObservation] = useState(c?.observation ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const problemes: string[] = [];
  const cle = (s: string) => `ajout.campagnePesee.problemes.${s}`;
  if (!ouverte && [...intitule.trim()].length < 3) problemes.push(t(cle('intitule')));
  if (!DATE.test(dateDebut)) problemes.push(t(cle('debut')));
  if (!DATE.test(dateFin)) problemes.push(t(cle('fin')));
  else if (DATE.test(dateDebut)) {
    if (dateFin < dateDebut) problemes.push(t(cle('ordre')));
    else if (joursDePeriode(dateDebut, dateFin) > DUREE_MAX_CAMPAGNE) problemes.push(t(cle('duree'), { n: DUREE_MAX_CAMPAGNE }));
  }
  // Rien n'a changé : un envoi ne ferait que relire la campagne.
  const inchange =
    c !== undefined &&
    (ouverte
      ? dateFin === c.date_fin && observation.trim() === (c.observation ?? '')
      : intitule.trim() === c.intitule &&
        protocole.trim() === (c.protocole ?? '') &&
        dateDebut === c.date_debut &&
        dateFin === c.date_fin &&
        observation.trim() === (c.observation ?? ''));

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = c
        ? await api.modifierCampagnePesee(
            c.id,
            ouverte
              ? { version: c.version, dateFin, observation: observation.trim() || null }
              : {
                  version: c.version,
                  intitule: intitule.trim(),
                  protocole: protocole.trim() || null,
                  dateDebut,
                  dateFin,
                  observation: observation.trim() || null,
                }
          )
        : await api.creerCampagnePesee(communeId, {
            objet,
            intitule: intitule.trim(),
            protocole: protocole.trim() || null,
            dateDebut,
            dateFin,
            observation: observation.trim() || null,
          });
      await onFait(r);
    } catch (err) {
      const refus = err instanceof ErreurApi ? err.message : t('commun.erreur');
      if (c && err instanceof ErreurApi && err.statut === 404 && onIntrouvable) {
        await onIntrouvable();
        return;
      }
      if (c && err instanceof ErreurApi && err.statut === 409 && onConflit) {
        const lue = await onConflit();
        // Version inchangée : le refus est une règle de la base (fin avant une pesée),
        // la saisie reste, à corriger. Version changée : la saisie part d'une lecture
        // périmée ; on la rouvre depuis la campagne relue.
        setErreur(lue && lue.version !== c.version ? `${refus} ${t('ajout.campagnePesee.conflit')}` : refus);
        return;
      }
      setErreur(refus);
    } finally {
      setEnvoi(false);
    }
  };

  const duree = DATE.test(dateDebut) && DATE.test(dateFin) && dateFin >= dateDebut ? joursDePeriode(dateDebut, dateFin) : null;

  return (
    <CadreAjout
      id={c ? `campagne-pesee-${c.id}` : 'campagne-pesee-nouvelle'}
      titre={c ? (ouverte ? t('ajout.campagnePesee.titreFin') : t('ajout.campagnePesee.titreModifier')) : t('ajout.campagnePesee.titre')}
      aide={ouverte ? t('ajout.campagnePesee.aideOuverte') : t('ajout.campagnePesee.aide', { n: DUREE_MAX_CAMPAGNE })}
      erreur={erreur}
      enregistrable={problemes.length === 0 && !inchange}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      {c ? (
        <p className="text-sm text-ardoise-700">
          {t(`campagnesPesee.objets.${c.objet}`)} — <span className="font-medium">{c.intitule}</span>
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm">{t('ajout.campagnePesee.objet')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {OBJETS.map((o) => (
              <label
                key={o}
                className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${objet === o ? 'border-siipi-500 bg-white' : 'border-ardoise-200 bg-white/60'}`}
              >
                <input type="radio" name="objet-campagne" value={o} checked={objet === o} onChange={() => setObjet(o)} className="mt-0.5 h-5 w-5" />
                <span>
                  <span className="block font-medium text-ardoise-900">{t(`campagnesPesee.objets.${o}`)}</span>
                  <span className="block text-xs text-ardoise-600">{t(`ajout.campagnePesee.objetsAide.${o}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {!ouverte && (
        <label className="block text-sm">
          {t('ajout.campagnePesee.intitule')}
          <input value={intitule} onChange={(e) => setIntitule(e.target.value)} maxLength={200} className={champAjout} />
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t('ajout.campagnePesee.dateDebut')}
          <input
            type="date"
            value={dateDebut}
            disabled={ouverte}
            onChange={(e) => setDateDebut(e.target.value)}
            className={`${champAjout} disabled:bg-ardoise-100`}
          />
        </label>
        <label className="text-sm">
          {ouverte ? t('ajout.campagnePesee.dateFinPrevue') : t('ajout.campagnePesee.dateFin')}
          <input
            type="date"
            value={dateFin}
            min={dateDebut || undefined}
            max={DATE.test(dateDebut) ? decalerJour(dateDebut, DUREE_MAX_CAMPAGNE - 1) : undefined}
            onChange={(e) => setDateFin(e.target.value)}
            className={champAjout}
          />
          {duree !== null && <span className="mt-1 block text-xs text-ardoise-500">{t('ajout.campagnePesee.duree', { count: duree })}</span>}
        </label>
      </div>
      {!ouverte && (
        <label className="block text-sm">
          {t('ajout.campagnePesee.protocole')}
          <textarea value={protocole} onChange={(e) => setProtocole(e.target.value)} maxLength={2000} rows={3} className={`${champAjout} py-2`} />
          <span className="mt-1 block text-xs text-ardoise-500">{t('ajout.campagnePesee.protocoleAide')}</span>
        </label>
      )}
      <label className="block text-sm">
        {t('ajout.observation')}
        <textarea value={observation} onChange={(e) => setObservation(e.target.value)} maxLength={1000} rows={2} className={`${champAjout} py-2`} />
      </label>
      {problemes.length > 0 && (
        <div className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">
          <p>{t('ajout.etablissement.pourEnregistrer')}</p>
          <ul className="list-disc ps-5">
            {problemes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </CadreAjout>
  );
}
