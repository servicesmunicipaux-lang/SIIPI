// L'accompagnement d'un acteur pendant la période transitoire (lot I3, 18.3) —
// dans la ligne ouverte d'un acteur de l'écran des acteurs informels.
//
// LA LISTE DES ÉTAPES EST NATIONALE ET DATÉE. L'écran propose celle en vigueur à
// la date saisie pour l'étape (aujourd'hui tant qu'aucune date n'est choisie) :
// c'est sur elle que la base jugera, et un refus s'affiche tel qu'elle le rend.
//
// SIIPI N'AGRÉE PAS. Pour un intermédiaire, l'écran enregistre l'agrément qu'un
// organisme a délivré, échéance de la pièce comprise ; à côté, l'échéance que la
// durée nationale en vigueur à la délivrance donnerait — montrée, jamais
// substituée. Un acteur requalifié pré-collecteur garde ses agréments à l'écran,
// pour qu'on puisse les lire ou retirer une saisie fausse ; il n'en reçoit plus.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AccompagnementActeur as Donnees } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement } from '../Elements';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton =
  'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
// Le jour à Tunis : borne des champs de date, aucune étape ne se franchit demain.
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

export function AccompagnementActeur(props: {
  acteurId: string;
  categorie: string | null;
  peutEcrire: boolean;
  onFait: () => void;
  onErreur: (e: unknown) => void;
}) {
  const { acteurId, categorie, peutEcrire, onFait, onErreur } = props;
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const ar = i18n.language.startsWith('ar');
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const videJalon = { code: '', date: '', reference: '' };
  const [jalon, setJalon] = useState(videJalon);
  const videAgrement = { organisme: '', reference: '', delivrance: '', echeance: '' };
  const [agrement, setAgrement] = useState(videAgrement);
  const [envoi, setEnvoi] = useState(false);
  // La liste en vigueur à la date choisie pour l'étape ; null : celle du jour. Pendant
  // le chargement, ou si elle n'a pu se lire, aucune étape n'est proposée : la liste
  // d'une autre date ne doit pas passer pour la bonne.
  const [possibles, setPossibles] = useState<Donnees['jalons_possibles'] | null>(null);

  useEffect(() => {
    if (!jalon.date) {
      setPossibles(null);
      return;
    }
    setPossibles([]);
    let annule = false;
    api
      .accompagnementActeur(acteurId, jalon.date)
      .then((d) => {
        if (annule) return;
        setPossibles(d.jalons_possibles);
        // Une étape choisie qui n'existait pas à cette date ne reste pas choisie.
        setJalon((j) =>
          j.code && !d.jalons_possibles.some((x) => x.code === j.code) ? { ...j, code: '' } : j
        );
      })
      .catch((e) => {
        if (!annule) onErreur(e);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acteurId, jalon.date]);

  // Chargé une fois à l'ouverture : onErreur change à chaque rendu du parent,
  // et le suivre rechargerait en boucle.
  useEffect(() => {
    api.accompagnementActeur(acteurId).then(setDonnees).catch(onErreur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acteurId]);

  async function agir(appel: () => Promise<Donnees>, apres: () => void) {
    setEnvoi(true);
    try {
      setDonnees(await appel());
      apres();
      onFait();
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  if (!donnees) return <Chargement />;
  const libelle = (x: {
    libelle_fr: string | null;
    libelle_ar: string | null;
    code?: string;
    jalon_code?: string;
  }) => (ar ? x.libelle_ar : x.libelle_fr) ?? x.jalon_code ?? x.code ?? '';
  const franchis = new Set(donnees.jalons.map((j) => j.jalon_code));
  const intermediaire = categorie === 'intermediaire';
  const proposees = possibles ?? donnees.jalons_possibles;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-ardoise-800">
          {t('communal.transition.accompagnement')}
        </h4>
        {donnees.jalons.length === 0 ? (
          <p className="text-sm text-ardoise-500">{t('communal.transition.aucuneEtape')}</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {donnees.jalons.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums text-ardoise-600">{f.date(j.date_jalon)}</span>
                <span className="font-medium">{libelle(j)}</span>
                {j.reference && <span className="text-xs text-ardoise-600">{j.reference}</span>}
                {peutEcrire && (
                  <button
                    type="button"
                    disabled={envoi}
                    onClick={() =>
                      void agir(
                        () => api.retirerJalon(acteurId, j.id),
                        () => undefined
                      )
                    }
                    className="ms-auto text-xs text-red-700 underline"
                  >
                    {t('communal.transition.retirer')}
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        {peutEcrire && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="font-medium">{t('communal.transition.etape')}</span>
              <select
                value={jalon.code}
                onChange={(e) => setJalon({ ...jalon, code: e.target.value })}
                className={champ}
              >
                <option value="">—</option>
                {proposees
                  .filter((x) => !franchis.has(x.code))
                  .map((x) => (
                    <option key={x.code} value={x.code}>
                      {ar ? x.libelle_ar : x.libelle_fr}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium">{t('communal.transition.dateEtape')}</span>
              <input
                type="date"
                max={aujourdhui()}
                value={jalon.date}
                onChange={(e) => setJalon({ ...jalon, date: e.target.value })}
                className={champ}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">{t('communal.transition.piece')}</span>
              <input
                value={jalon.reference}
                onChange={(e) => setJalon({ ...jalon, reference: e.target.value })}
                className={champ}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={envoi || !jalon.code || !jalon.date}
                onClick={() =>
                  void agir(
                    () =>
                      api.inscrireJalon(acteurId, {
                        jalonCode: jalon.code,
                        dateJalon: jalon.date,
                        reference: jalon.reference.trim() || null,
                      }),
                    () => setJalon(videJalon)
                  )
                }
                className={bouton}
              >
                {t('communal.transition.inscrireEtape')}
              </button>
            </div>
            <p className="text-xs text-ardoise-600 sm:col-span-2 lg:col-span-4">
              {t('communal.transition.aideEtape')}
            </p>
          </div>
        )}
      </div>

      {(intermediaire || donnees.agrements.length > 0) && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-ardoise-800">
            {t('communal.transition.agrement')}
          </h4>
          <p className="max-w-3xl text-xs text-ardoise-600">
            {t(
              intermediaire
                ? 'communal.transition.agrementIntro'
                : 'communal.transition.agrementHorsCategorie'
            )}
          </p>
          {donnees.agrements.length === 0 ? (
            <p className="text-sm text-ardoise-500">{t('communal.transition.aucunAgrement')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {donnees.agrements.map((g) => {
                // Les bornes de « À vérifier », calculées par l'API : l'écran ne les refait pas.
                const ecart = g.ecart_duree === true;
                return (
                  <li key={g.id} className="rounded-lg border border-ardoise-200 bg-white p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{g.organisme}</span>
                      <span className="text-xs text-ardoise-600">{g.reference}</span>
                      {peutEcrire && (
                        <button
                          type="button"
                          disabled={envoi}
                          onClick={() =>
                            void agir(
                              () => api.retirerAgrement(acteurId, g.id),
                              () => undefined
                            )
                          }
                          className="ms-auto text-xs text-red-700 underline"
                        >
                          {t('communal.transition.retirer')}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-ardoise-700">
                      {t('communal.transition.periodeAgrement', {
                        debut: f.date(g.date_delivrance),
                        fin: f.date(g.date_echeance),
                      })}
                    </p>
                    {g.echeance_selon_duree !== null && (
                      <p className={`text-xs ${ecart ? 'text-amber-800' : 'text-ardoise-500'}`}>
                        {t(
                          ecart
                            ? 'communal.transition.ecartDuree'
                            : 'communal.transition.conformeDuree',
                          {
                            mois: g.duree_mois_en_vigueur,
                            date: f.date(g.echeance_selon_duree),
                          }
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {peutEcrire && intermediaire && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-sm">
                <span className="font-medium">{t('communal.transition.organisme')}</span>
                <input
                  value={agrement.organisme}
                  onChange={(e) => setAgrement({ ...agrement, organisme: e.target.value })}
                  className={champ}
                />
              </label>
              <label className="text-sm">
                <span className="font-medium">{t('communal.transition.referenceAgrement')}</span>
                <input
                  value={agrement.reference}
                  onChange={(e) => setAgrement({ ...agrement, reference: e.target.value })}
                  className={champ}
                />
              </label>
              <label className="text-sm">
                <span className="font-medium">{t('communal.transition.delivrance')}</span>
                <input
                  type="date"
                  max={aujourdhui()}
                  value={agrement.delivrance}
                  onChange={(e) => setAgrement({ ...agrement, delivrance: e.target.value })}
                  className={champ}
                />
              </label>
              <label className="text-sm">
                <span className="font-medium">{t('communal.transition.echeance')}</span>
                <input
                  type="date"
                  min={agrement.delivrance || undefined}
                  value={agrement.echeance}
                  onChange={(e) => setAgrement({ ...agrement, echeance: e.target.value })}
                  className={champ}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={
                    envoi ||
                    agrement.organisme.trim().length < 3 ||
                    !agrement.reference.trim() ||
                    !agrement.delivrance ||
                    !agrement.echeance
                  }
                  onClick={() =>
                    void agir(
                      () =>
                        api.enregistrerAgrement(acteurId, {
                          organisme: agrement.organisme.trim(),
                          reference: agrement.reference.trim(),
                          dateDelivrance: agrement.delivrance,
                          dateEcheance: agrement.echeance,
                        }),
                      () => setAgrement(videAgrement)
                    )
                  }
                  className={bouton}
                >
                  {t('communal.transition.enregistrerAgrement')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
