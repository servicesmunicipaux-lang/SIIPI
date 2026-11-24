// Les périodes de fermeture d'un établissement (jalon G, lot G7a), sur sa fiche.
//
// UNE PÉRIODE NE S'EFFACE PAS. Saisie à tort, elle se RETIRE avec son motif : elle reste
// lisible, grisée, et ne couvre plus aucun jour. Mal datée, elle se CORRIGE avec son
// motif : la correction et sa date restent dites. C'est d'elles que la base juge si un
// constat de manquement visait un établissement fermé le jour des faits — un constat
// « à revoir » renvoie ici.
//
// La fermeture en cours n'a pas de réouverture : la corriger ne change que sa date de
// début, et elle ne se retire pas (on rouvre l'établissement par son geste de statut).
//
// Chaque geste envoie la version lue à l'ouverture de son panneau : changée depuis, il
// est refusé (409), la liste se relit et le panneau se ferme ; disparue (404), la liste
// se relit sans elle. Les refus de l'API s'affichent tels quels.
//
// La commune écrit ; la FNCT lit.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type FermetureEtablissement } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { aujourdhui } from '../ajout/FormulaireEtablissement';
import { porteUnIdentifiant } from '../constats/regles';
import { Chargement, Erreur } from '../Elements';
import { Pastille } from '../ui/Pastille';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Geste =
  | { nature: 'retirer'; id: string; version: string; motif: string }
  | { nature: 'corriger'; id: string; version: string; enCours: boolean; fermeLe: string; rouvertLe: string; motif: string };

export function FermeturesEtablissement({
  commerceId,
  peutEcrire,
  onEtablissementChange,
}: {
  commerceId: string;
  peutEcrire: boolean;
  /** Un geste a pu changer le statut ou la date de fermeture de l'établissement : sa fiche se relit. */
  onEtablissementChange: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [liste, setListe] = useState<FermetureEtablissement[] | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [geste, setGeste] = useState<Geste | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      const lue = await api.fermeturesEtablissement(commerceId);
      if (numero !== derniere.current) return null;
      setListe(lue);
      setErreurLecture(null);
      return lue;
    } catch (err) {
      if (numero !== derniere.current) return null;
      setErreurLecture(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      return null;
    }
  }, [commerceId, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  if (erreurLecture && !liste) return <Erreur message={erreurLecture} onReessayer={() => void charger()} />;
  if (!liste) return <Chargement />;

  const jour = aujourdhui();
  const problemes: string[] = [];
  const cle = (s: string) => `communal.etablissements.fermetures.problemes.${s}`;
  if (geste) {
    const n = [...geste.motif.trim()].length;
    if (n < 5 || n > 300) problemes.push(t(cle('motif')));
    if (porteUnIdentifiant(geste.motif)) problemes.push(t(cle('identifiant')));
  }
  if (geste?.nature === 'corriger') {
    if (!DATE.test(geste.fermeLe) || geste.fermeLe > jour) problemes.push(t(cle('fermeLe')));
    else if (!geste.enCours && (!DATE.test(geste.rouvertLe) || geste.rouvertLe < geste.fermeLe || geste.rouvertLe > jour)) {
      problemes.push(t(cle('rouvertLe')));
    }
  }

  const envoyer = async () => {
    if (!geste || problemes.length > 0) return;
    setEnvoi(true);
    setRefus(null);
    setMessage(null);
    try {
      const r =
        geste.nature === 'retirer'
          ? await api.retirerFermeture(commerceId, geste.id, { version: geste.version, motif: geste.motif.trim() })
          : await api.corrigerFermeture(commerceId, geste.id, {
              version: geste.version,
              fermeLe: geste.fermeLe,
              // La fermeture en cours n'a pas de réouverture : l'API l'exige nulle.
              rouvertLe: geste.enCours ? null : geste.rouvertLe,
              motif: geste.motif.trim(),
            });
      setListe(r.fermetures);
      setGeste(null);
      setMessage(t(`communal.etablissements.fermetures.messages.${geste.nature}`));
      await onEtablissementChange();
    } catch (err) {
      const texte = err instanceof ErreurApi ? err.message : t('commun.erreur');
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) {
        const lue = await charger();
        // Changée ou disparue : le panneau partait d'une lecture périmée. Un refus de règle,
        // version intacte, laisse le panneau ouvert à corriger.
        const relue = lue?.find((x) => x.id === geste.id);
        if (!relue || relue.version !== geste.version) setGeste(null);
        await onEtablissementChange();
      }
      setRefus(texte);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-ardoise-100 p-3 text-sm">
      <p className="font-medium text-ardoise-800">{t('communal.etablissements.fermetures.titre')}</p>
      {liste.length === 0 ? (
        <p className="text-ardoise-600">{t('communal.etablissements.fermetures.aucune')}</p>
      ) : (
        <ul className="space-y-2">
          {liste.map((p) => {
            const retiree = p.retiree_le !== null;
            const enCours = p.rouvert_le === null;
            return (
              <li key={p.id} className={`space-y-1 rounded-lg bg-ardoise-50 p-2 ${retiree ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ardoise-800">
                    {/* La base tient la réouverture pour un jour ouvert (borne exclue) :
                        « du X au Y » ferait lire le jour Y comme fermé. */}
                    {enCours
                      ? t('communal.etablissements.fermetures.depuis', { debut: f.date(p.ferme_le) })
                      : p.rouvert_le === p.ferme_le
                        ? t('communal.etablissements.fermetures.memeJour', { debut: f.date(p.ferme_le) })
                        : t('communal.etablissements.fermetures.periode', { debut: f.date(p.ferme_le), fin: f.date(p.rouvert_le) })}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {retiree ? (
                      <Pastille ton="neutre">{t('communal.etablissements.fermetures.retiree')}</Pastille>
                    ) : (
                      enCours && <Pastille ton="attention">{t('communal.etablissements.fermetures.enCours')}</Pastille>
                    )}
                    <Pastille ton="neutre">{t(`communal.etablissements.fermetures.origines.${p.origine}`)}</Pastille>
                  </div>
                </div>
                {p.corrigee_le && (
                  <p className="text-xs text-ardoise-600">
                    {t('communal.etablissements.fermetures.corrigeeLe', { date: f.date(p.corrigee_le), motif: p.motif_correction ?? '' })}
                  </p>
                )}
                {retiree && (
                  <p className="text-xs text-ardoise-600">
                    {t('communal.etablissements.fermetures.retireeLe', { date: f.date(p.retiree_le), motif: p.motif_retrait ?? '' })}
                  </p>
                )}
                {peutEcrire && !retiree && geste?.id !== p.id && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={boutonDiscret}
                      disabled={envoi}
                      onClick={() => {
                        setRefus(null);
                        setGeste({ nature: 'corriger', id: p.id, version: p.version, enCours, fermeLe: p.ferme_le, rouvertLe: p.rouvert_le ?? '', motif: '' });
                      }}
                    >
                      {t('communal.etablissements.fermetures.corriger')}
                    </button>
                    {!enCours && (
                      <button
                        type="button"
                        className={boutonDiscret}
                        disabled={envoi}
                        onClick={() => {
                          setRefus(null);
                          setGeste({ nature: 'retirer', id: p.id, version: p.version, motif: '' });
                        }}
                      >
                        {t('communal.etablissements.fermetures.retirer')}
                      </button>
                    )}
                  </div>
                )}
                {geste?.id === p.id && (
                  <div className="space-y-2 rounded-lg border border-siipi-200 bg-white p-2">
                    <p className="text-ardoise-700">{t(`communal.etablissements.fermetures.aides.${geste.nature === 'corriger' && geste.enCours ? 'corrigerEnCours' : geste.nature}`)}</p>
                    {geste.nature === 'corriger' && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label>
                          {t('communal.etablissements.fermetures.champs.fermeLe')}
                          <input type="date" value={geste.fermeLe} max={jour} onChange={(e) => setGeste({ ...geste, fermeLe: e.target.value })} className={champ} />
                        </label>
                        {!geste.enCours && (
                          <label>
                            {t('communal.etablissements.fermetures.champs.rouvertLe')}
                            <input
                              type="date"
                              value={geste.rouvertLe}
                              min={geste.fermeLe || undefined}
                              max={jour}
                              onChange={(e) => setGeste({ ...geste, rouvertLe: e.target.value })}
                              className={champ}
                            />
                          </label>
                        )}
                      </div>
                    )}
                    <label className="block">
                      {t('communal.etablissements.fermetures.champs.motif')}
                      <input value={geste.motif} onChange={(e) => setGeste({ ...geste, motif: e.target.value })} maxLength={300} className={champ} />
                    </label>
                    {/* Un avertissement, pas un refus : la base produit elle-même ce cas, légitime. */}
                    {geste.nature === 'corriger' && !geste.enCours && DATE.test(geste.fermeLe) && geste.rouvertLe === geste.fermeLe && (
                      <p role="status" className="text-amber-900">{t('communal.etablissements.fermetures.memeJourAvis')}</p>
                    )}
                    {problemes.length > 0 && (
                      <ul className="list-disc ps-5 text-ardoise-700">
                        {problemes.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={bouton} disabled={envoi || problemes.length > 0} onClick={() => void envoyer()}>
                        {t(`communal.etablissements.fermetures.confirmer.${geste.nature}`)}
                      </button>
                      <button type="button" className={boutonDiscret} onClick={() => setGeste(null)}>
                        {t('commun.annuler')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {message && <p role="status" className="rounded-lg bg-siipi-50 p-2 text-siipi-800">{message}</p>}
      {refus && <p role="alert" className="rounded-lg bg-red-50 p-2 text-red-800">{refus}</p>}
    </div>
  );
}
