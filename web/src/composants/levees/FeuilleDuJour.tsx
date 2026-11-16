// La feuille du jour d'un circuit (jalon G, lot G5a) : les établissements desservis
// ce jour-là, et pour chacun les flux des termes en vigueur, à cocher par voyage.
//
// UN SEUL COMPOSANT POUR LA COMMUNE ET POUR LE PRESTATAIRE. La même feuille, lue par
// la même route : la base décide de ce que chacun y voit (le prestataire n'y lit ni
// convention, ni établissement fermé ou sans convention). Seul le sens d'une coche
// change, et l'écran le dit : la commune enregistre des levées validées, le
// prestataire les propose. La FNCT lit, sans case à cocher.
//
// UN ENVOI REJOUÉ NE CRÉE RIEN DEUX FOIS. Chaque ligne cochée reçoit une clé d'envoi,
// gardée tant que l'envoi n'a pas abouti : après une coupure du réseau, « Réessayer »
// renvoie les MÊMES clés, et la base rend « déjà reçue » ce qu'elle avait reçu. Une
// clé nouvelle à chaque essai doublerait les levées d'un envoi parti sans réponse.
//
// LE LOT S'ÉCRIT EN ENTIER OU PAS DU TOUT, et le refus de l'API s'affiche tel quel :
// il nomme la ligne et dit quoi faire.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type FeuilleLevees, type LigneFeuilleLevees } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { Pastille } from '../ui/Pastille';

export type ModeFeuille = 'commune' | 'prestataire' | 'lecture';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';

/** Une clé d'envoi unique ; `randomUUID` manque hors d'un contexte sécurisé (http sur le réseau local). */
function nouvelleCle(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

const cleLigne = (l: LigneFeuilleLevees) => `${l.desserte_id}|${l.flux_code ?? ''}`;

type Groupe = { desserte: LigneFeuilleLevees; lignes: LigneFeuilleLevees[] };

export function FeuilleDuJour({ circuitId, date, mode }: { circuitId: string; date: string; mode: ModeFeuille }) {
  const { t, i18n } = useTranslation();
  const arabe = i18n.language.startsWith('ar');
  const [feuille, setFeuille] = useState<FeuilleLevees | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [voyage, setVoyage] = useState(1);
  const [heure, setHeure] = useState('');
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Les clés d'envoi, par levée (circuit, jour, voyage, desserte, flux) : une même
  // levée garde sa clé d'un essai à l'autre, jusqu'à ce que l'envoi aboutisse.
  const cles = useRef(new Map<string, string>());

  // Seule la dernière lecture demandée s'affiche : un jour changé pendant une lecture
  // lente ne laisse pas l'ancienne feuille s'afficher sous la nouvelle date.
  const derniere = useRef(0);
  const charger = useCallback(async () => {
    const numero = ++derniere.current;
    try {
      const f = await api.feuilleLevees(circuitId, date);
      if (numero !== derniere.current) return;
      setFeuille(f);
      setErreurLecture(null);
    } catch (err) {
      if (numero !== derniere.current) return;
      setFeuille(null);
      setErreurLecture(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [circuitId, date, t]);

  useEffect(() => {
    setFeuille(null);
    setCochees(new Set());
    setMessage(null);
    setErreur(null);
    void charger();
  }, [charger]);

  // Un circuit à une seule rotation ne garde pas le voyage 2 d'un autre circuit.
  useEffect(() => {
    if (feuille && voyage > feuille.circuit.voyages_par_jour) setVoyage(1);
  }, [feuille, voyage]);

  if (erreurLecture) return <Erreur message={erreurLecture} onReessayer={() => void charger()} />;
  if (!feuille) return <Chargement />;

  const ecrit = mode !== 'lecture';
  const leveeDuVoyage = (l: LigneFeuilleLevees) => l.levees.find((x) => x.voyage === voyage && (x.statut === 'proposee' || x.statut === 'validee'));
  const cochable = (l: LigneFeuilleLevees) => ecrit && l.etat_convention === 'convention' && !l.ferme && Boolean(l.flux_code) && !leveeDuVoyage(l);

  const groupes: Groupe[] = [];
  for (const l of feuille.lignes) {
    const g = groupes.find((x) => x.desserte.desserte_id === l.desserte_id);
    if (g) g.lignes.push(l);
    else groupes.push({ desserte: l, lignes: [l] });
  }

  const basculer = (l: LigneFeuilleLevees) =>
    setCochees((s) => {
      const n = new Set(s);
      const c = cleLigne(l);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const cleEnvoi = (l: LigneFeuilleLevees) => {
    const c = `${circuitId}|${date}|${voyage}|${cleLigne(l)}`;
    let k = cles.current.get(c);
    if (!k) {
      k = nouvelleCle();
      cles.current.set(c, k);
    }
    return { c, k };
  };

  const choisies = feuille.lignes.filter((l) => cochees.has(cleLigne(l)) && cochable(l));
  const heureValide = heure === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(heure);

  const envoyer = async () => {
    if (choisies.length === 0 || !heureValide) return;
    setEnvoi(true);
    setErreur(null);
    setMessage(null);
    const paires = choisies.map((l) => ({ l, ...cleEnvoi(l) }));
    try {
      const r = await api.enregistrerLevees({
        circuitId,
        date,
        voyage,
        heure: heure || null,
        levees: paires.map(({ l, k }) => ({ commerceId: l.commerce_id, fluxCode: l.flux_code as string, cle: k })),
      });
      // Arrivées : leurs clés ont servi. Une levée annulée puis saisie de nouveau
      // recevra une clé neuve, sans quoi la base la rendrait « déjà reçue ».
      for (const { c } of paires) cles.current.delete(c);
      const dejaRecues = r.levees.filter((x) => x.deja_recue).length;
      const nouvelles = r.levees.length - dejaRecues;
      setMessage(
        [
          t(mode === 'prestataire' ? 'levees.feuille.proposees' : 'levees.feuille.enregistrees', { count: nouvelles, n: formaterNombre(nouvelles, 0) }),
          dejaRecues > 0 ? t('levees.feuille.dejaRecues', { count: dejaRecues, n: formaterNombre(dejaRecues, 0) }) : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
      setCochees(new Set());
      await charger();
    } catch (err) {
      // Les clés restent : un nouvel essai renvoie les mêmes, et rien ne se double.
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      // Un refus de la base (feuille changée entre-temps) se lit sur la feuille relue.
      if (err instanceof ErreurApi && (err.statut === 409 || err.statut === 404)) await charger();
    } finally {
      setEnvoi(false);
    }
  };

  const libelleFlux = (l: LigneFeuilleLevees) => (arabe ? l.flux_ar : l.flux_fr) ?? l.flux_code ?? '';
  const voyages = Array.from({ length: Math.max(1, feuille.circuit.voyages_par_jour) }, (_, i) => i + 1);

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">{t(`levees.feuille.sens.${mode}`)}</p>
      {!feuille.circuit.passe_ce_jour && <p className="text-xs text-ardoise-600">{t('levees.feuille.sansPassage')}</p>}

      {ecrit && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            {t('levees.feuille.voyage')}
            <select value={voyage} onChange={(e) => setVoyage(Number(e.target.value))} className={champ}>
              {voyages.map((v) => (
                <option key={v} value={v}>{t('levees.feuille.voyageN', { n: v })}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t('levees.feuille.heure')}
            <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={champ} dir="ltr" />
          </label>
        </div>
      )}
      {!ecrit && voyages.length > 1 && (
        <label className="block max-w-xs text-sm">
          {t('levees.feuille.voyage')}
          <select value={voyage} onChange={(e) => setVoyage(Number(e.target.value))} className={champ}>
            {voyages.map((v) => (
              <option key={v} value={v}>{t('levees.feuille.voyageN', { n: v })}</option>
            ))}
          </select>
        </label>
      )}

      {message && <p role="status" className="rounded-lg bg-siipi-50 p-3 text-sm text-siipi-800">{message}</p>}
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      {groupes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ardoise-300 bg-white p-4 text-sm text-ardoise-600">
          {t(mode === 'prestataire' ? 'levees.feuille.videPrestataire' : 'levees.feuille.vide')}
        </p>
      ) : (
        <ul className="space-y-2">
          {groupes.map(({ desserte: d, lignes }) => (
            <li key={d.desserte_id} className={`space-y-2 rounded-xl border border-ardoise-200 p-3 ${d.ferme ? 'bg-ardoise-50 text-ardoise-500' : 'bg-white'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ardoise-900">{d.etablissement}</p>
                  <p className="text-xs text-ardoise-600">
                    {t('levees.feuille.point', { nom: d.point_nom ?? '—', voyage: d.point_voyage, ordre: d.point_ordre })}
                    {d.adresse && ` — ${d.adresse}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.ferme && <Pastille ton="neutre">{t('levees.feuille.ferme')}</Pastille>}
                  {d.point_retire && <Pastille ton="attention">{t('levees.feuille.pointRetire')}</Pastille>}
                </div>
              </div>
              {d.etat_convention === 'registre' && <p className="text-xs text-amber-900">{t('levees.feuille.registre')}</p>}
              {d.etat_convention === 'aucune' && <p className="text-xs text-ardoise-600">{t('levees.feuille.aucuneConvention')}</p>}
              {d.etat_convention === 'convention' && (
                <ul className="divide-y divide-ardoise-100">
                  {lignes.map((l) => {
                    const existante = leveeDuVoyage(l);
                    const id = `levee-${l.desserte_id}-${l.flux_code ?? ''}`;
                    return (
                      <li key={cleLigne(l)} className="flex min-h-11 flex-wrap items-center gap-3 py-1">
                        {existante ? (
                          <Pastille ton={existante.statut === 'validee' ? 'mesure' : 'declare'}>
                            {t(`levees.statuts.${existante.statut}`)}
                            {existante.heure && <bdi dir="ltr"> {existante.heure}</bdi>}
                          </Pastille>
                        ) : cochable(l) ? (
                          <input id={id} type="checkbox" checked={cochees.has(cleLigne(l))} onChange={() => basculer(l)} disabled={envoi} className="h-6 w-6" />
                        ) : null}
                        <label htmlFor={cochable(l) && !existante ? id : undefined} className="flex-1 text-sm text-ardoise-800">
                          {libelleFlux(l)}
                          <span className="ms-2 text-xs text-ardoise-500">
                            {l.levees_par_semaine != null && t('levees.feuille.parSemaine', { n: l.levees_par_semaine })}
                            {l.conteneur_code && <> · <bdi dir="ltr" className="whitespace-nowrap">{l.conteneur_code}</bdi></>}
                          </span>
                        </label>
                        {l.levees.filter((x) => x.voyage !== voyage).map((x) => (
                          <span key={x.id} className="text-xs text-ardoise-500">
                            {t('levees.feuille.autreVoyage', { n: x.voyage, statut: t(`levees.statuts.${x.statut}`) })}
                          </span>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {ecrit && groupes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={bouton} disabled={envoi || choisies.length === 0 || !heureValide} onClick={() => void envoyer()}>
            {t(mode === 'prestataire' ? 'levees.feuille.proposer' : 'levees.feuille.enregistrer', { n: formaterNombre(choisies.length, 0) })}
          </button>
          {!heureValide && <span className="text-xs text-red-800">{t('levees.feuille.heureInvalide')}</span>}
        </div>
      )}
    </div>
  );
}
