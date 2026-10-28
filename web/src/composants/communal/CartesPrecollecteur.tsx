// Les cartes de pré-collecteur (lot I2, 18.2) — dans l'écran des acteurs informels.
//
// LA PLATEFORME VÉRIFIE, LE DIRECTEUR DÉCIDE. L'écran enregistre la demande, ses
// pièces et ses secteurs ; « Accorder » demande à la base d'émettre la carte, et
// c'est elle qui refuse s'il manque une pièce, si l'acteur n'est pas déclaré
// pré-collecteur ou si aucune durée de validité n'est en vigueur. L'écran ne
// recopie pas ces règles : il montre le refus tel qu'elle le dit.
//
// LES PIÈCES SONT CELLES DU JOUR DE LA DEMANDE. La liste vient de l'API, demande
// par demande : une pièce ajoutée par la FNCT après le dépôt n'y figure pas.
//
// AUCUN NOM. La carte et la demande ne portent que le pseudonyme ; le nom
// s'imprime pour le directeur, depuis la table d'identité.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  imprimerDocument,
  type ActeurInformel,
  type CartesPrecollecteur as Donnees,
  type DemandeCarte,
} from '../../lib/api';
import { useFormats } from '../../lib/formats';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton =
  'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret =
  'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';
// Le jour à Tunis : borne des champs de date.
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

type Zone = { id: string; name: string };

// La couleur double le mot, elle ne le remplace pas.
const TEINTE: Record<DemandeCarte['etat'], string> = {
  demandee: 'border-sky-300 bg-sky-50 text-sky-900',
  valide: 'border-siipi-300 bg-siipi-50 text-siipi-900',
  a_venir: 'border-siipi-200 bg-white text-siipi-800',
  expiree: 'border-ardoise-300 bg-ardoise-50 text-ardoise-700',
  retiree: 'border-amber-300 bg-amber-50 text-amber-900',
  refusee: 'border-ardoise-300 bg-ardoise-50 text-ardoise-700',
  annulee: 'border-red-300 bg-red-50 text-red-900',
};

export function CartesPrecollecteur(props: {
  communeId: string;
  acteurs: ActeurInformel[];
  peutEcrire: boolean;
  onErreur: (e: unknown) => void;
}) {
  const { communeId, acteurs, peutEcrire, onErreur } = props;
  const { t } = useTranslation();
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = useCallback(() => {
    api.cartesPrecollecteur(communeId).then(setDonnees).catch(onErreur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);
  useEffect(() => {
    charger();
    void api
      .zones(communeId)
      .then((z) => setZones((z as Zone[]).map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setZones([]));
  }, [charger, communeId]);

  if (!donnees) return null;
  const fait = (m: string) => {
    setInfo(m);
    charger();
  };

  return (
    <section
      aria-labelledby="titre-cartes"
      className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4"
    >
      <header>
        <h3 id="titre-cartes" className="text-lg font-semibold text-ardoise-900">
          {t('communal.cartes.titre')}
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.cartes.intro')}</p>
      </header>
      {info && (
        <p
          role="status"
          className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900"
        >
          {info}
        </p>
      )}

      {donnees.demandes.length === 0 ? (
        <p className="text-sm text-ardoise-600">{t('communal.cartes.aucune')}</p>
      ) : (
        <ul className="divide-y divide-ardoise-100">
          {donnees.demandes.map((d) => (
            <LigneDemande
              key={d.id}
              d={d}
              ouverte={ouverte === d.id}
              onBasculer={() => setOuverte(ouverte === d.id ? null : d.id)}
              peutEcrire={peutEcrire}
              onFait={fait}
              onErreur={onErreur}
            />
          ))}
        </ul>
      )}

      {peutEcrire && (
        <NouvelleDemande
          acteurs={acteurs.filter((a) => a.categorie === 'pre_collecteur')}
          zones={zones}
          onFait={fait}
          onErreur={onErreur}
        />
      )}
    </section>
  );
}

function Etat({ d }: { d: DemandeCarte }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${TEINTE[d.etat]}`}
    >
      {t(`communal.cartes.etats.${d.etat}`)}
    </span>
  );
}

function LigneDemande(props: {
  d: DemandeCarte;
  ouverte: boolean;
  onBasculer: () => void;
  peutEcrire: boolean;
  onFait: (m: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const { d, ouverte, onBasculer, peutEcrire, onFait, onErreur } = props;
  const { t } = useTranslation();
  const f = useFormats();

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm" dir="ltr">
              {d.id_precollecteur}
            </span>
            <Etat d={d} />
            {d.numero_affiche && (
              <span className="font-mono text-xs text-ardoise-600" dir="ltr">
                {d.numero_affiche}
              </span>
            )}
          </div>
          <p className="text-xs text-ardoise-600">
            {d.date_debut && d.date_fin
              ? t('communal.cartes.validite', { du: f.date(d.date_debut), au: f.date(d.date_fin) })
              : t('communal.cartes.demandeeLe', { date: f.date(d.date_demande) })}
            {d.carte_precedente && (
              <> · {t('communal.cartes.renouvelle', { numero: d.carte_precedente })}</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onBasculer}
          aria-expanded={ouverte}
          className={boutonDiscret}
        >
          {t(ouverte ? 'communal.cartes.fermer' : 'communal.cartes.ouvrir')}
        </button>
      </div>
      {ouverte && (
        <DetailDemande d={d} peutEcrire={peutEcrire} onFait={onFait} onErreur={onErreur} />
      )}
    </li>
  );
}

function DetailDemande(props: {
  d: DemandeCarte;
  peutEcrire: boolean;
  onFait: (m: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const { d, peutEcrire, onFait, onErreur } = props;
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const [piece, setPiece] = useState<{ code: string; date: string; reference: string } | null>(
    null
  );
  const [geste, setGeste] = useState<{
    nature: 'accord' | 'refus' | 'retrait';
    date: string;
    motif: string;
  } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const enAttente = d.decision === null;

  async function agir(action: () => Promise<unknown>, message: string) {
    setEnvoi(true);
    try {
      await action();
      setPiece(null);
      setGeste(null);
      onFait(message);
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  const confirmer = () => {
    if (!geste) return;
    if (geste.nature === 'accord')
      void agir(() => api.accorderCarte(d.id, geste.date), t('communal.cartes.accordee'));
    else if (geste.nature === 'refus')
      void agir(
        () => api.refuserCarte(d.id, { dateDecision: geste.date, motif: geste.motif }),
        t('communal.cartes.refusee')
      );
    else
      void agir(
        () => api.retirerCarte(d.id, { dateRetrait: geste.date, motif: geste.motif }),
        t('communal.cartes.retiree')
      );
  };

  return (
    <div className="mt-3 space-y-4 rounded-lg bg-ardoise-50 p-3 text-sm">
      <div>
        <h4 className="font-medium text-ardoise-900">{t('communal.cartes.secteurs')}</h4>
        <p className="text-ardoise-700">{d.zones.map((z) => z.nom).join(' ; ')}</p>
      </div>

      <div>
        <h4 className="font-medium text-ardoise-900">
          {t('communal.cartes.pieces', { date: f.date(d.date_demande) })}
        </h4>
        {d.pieces.length === 0 ? (
          <p className="text-ardoise-600">{t('communal.cartes.aucunePieceExigee')}</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {d.pieces.map((p) => (
              <li key={p.code} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">
                    {i18n.language === 'ar' ? p.libelle_ar : p.libelle_fr}
                  </span>
                  {' — '}
                  {p.piece_id ? (
                    <span className="text-ardoise-700">
                      {t('communal.cartes.recueLe', { date: f.date(p.date_piece ?? '') })}
                      {p.reference && <> · {p.reference}</>}
                    </span>
                  ) : (
                    <span className="text-amber-800">{t('communal.cartes.manquante')}</span>
                  )}
                </span>
                {peutEcrire &&
                  enAttente &&
                  (p.piece_id ? (
                    <button
                      type="button"
                      disabled={envoi}
                      onClick={() =>
                        void agir(
                          () => api.retirerPieceCarte(d.id, p.piece_id ?? ''),
                          t('communal.cartes.pieceRetiree')
                        )
                      }
                      className={boutonDiscret}
                    >
                      {t('communal.cartes.retirerPiece')}
                    </button>
                  ) : piece?.code !== p.code ? (
                    <button
                      type="button"
                      onClick={() => setPiece({ code: p.code, date: '', reference: '' })}
                      className={boutonDiscret}
                    >
                      {t('communal.cartes.enregistrerPiece')}
                    </button>
                  ) : null)}
                {piece?.code === p.code && (
                  <div className="flex w-full flex-wrap items-end gap-2">
                    <label className="text-xs">
                      {t('communal.cartes.datePiece')}
                      <input
                        type="date"
                        max={aujourdhui()}
                        value={piece.date}
                        onChange={(e) => setPiece({ ...piece, date: e.target.value })}
                        className={champ}
                      />
                    </label>
                    <label className="min-w-48 flex-1 text-xs">
                      {t('communal.cartes.referencePiece')}
                      <input
                        value={piece.reference}
                        maxLength={200}
                        onChange={(e) => setPiece({ ...piece, reference: e.target.value })}
                        className={champ}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={envoi || !piece.date}
                      onClick={() =>
                        void agir(
                          () =>
                            api.ajouterPieceCarte(d.id, {
                              pieceCode: p.code,
                              datePiece: piece.date,
                              reference: piece.reference || null,
                            }),
                          t('communal.cartes.pieceEnregistree')
                        )
                      }
                      className={bouton}
                    >
                      {t('communal.cartes.enregistrer')}
                    </button>
                    <button type="button" onClick={() => setPiece(null)} className={boutonDiscret}>
                      {t('commun.annuler')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-ardoise-500">{t('communal.cartes.piecesAide')}</p>
      </div>

      {d.decision === 'refusee' && (
        <p className="text-ardoise-700">
          {t('communal.cartes.motifRefus', {
            date: f.date(d.date_decision ?? ''),
            motif: d.motif_refus ?? '',
          })}
        </p>
      )}
      {d.retrait_le && (
        <p className="text-amber-900">
          {t('communal.cartes.motifRetrait', {
            date: f.date(d.retrait_le),
            motif: d.motif_retrait ?? '',
          })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {d.document_id && (
          <button
            type="button"
            disabled={envoi}
            onClick={() => void agir(() => imprimerDocument(d.document_id ?? ''), '')}
            className={bouton}
          >
            {t('communal.cartes.imprimer')}
          </button>
        )}
        {peutEcrire && enAttente && (
          <>
            <button
              type="button"
              onClick={() => setGeste({ nature: 'accord', date: aujourdhui(), motif: '' })}
              className={bouton}
            >
              {t('communal.cartes.accorder')}
            </button>
            <button
              type="button"
              onClick={() => setGeste({ nature: 'refus', date: aujourdhui(), motif: '' })}
              className={boutonDiscret}
            >
              {t('communal.cartes.refuser')}
            </button>
            <button
              type="button"
              disabled={envoi}
              onClick={() =>
                void agir(() => api.retirerDemandeCarte(d.id), t('communal.cartes.demandeRetiree'))
              }
              className={boutonDiscret}
            >
              {t('communal.cartes.retirerDemande')}
            </button>
          </>
        )}
        {peutEcrire && (d.etat === 'valide' || d.etat === 'a_venir') && (
          <>
            <button
              type="button"
              onClick={() => setGeste({ nature: 'retrait', date: aujourdhui(), motif: '' })}
              className={boutonDiscret}
            >
              {t('communal.cartes.retirerCarte')}
            </button>
            <button
              type="button"
              disabled={envoi}
              onClick={() =>
                void agir(
                  () =>
                    api.demanderCarte({
                      acteurId: d.acteur_id,
                      dateDemande: aujourdhui(),
                      zones: d.zones.map((z) => z.id),
                      cartePrecedenteId: d.document_id,
                    }),
                  t('communal.cartes.renouvellementDemande')
                )
              }
              className={boutonDiscret}
            >
              {t('communal.cartes.renouveler')}
            </button>
          </>
        )}
      </div>

      {geste && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-siipi-200 bg-white p-3">
          <label className="text-xs">
            {t(
              geste.nature === 'retrait'
                ? 'communal.cartes.dateRetrait'
                : 'communal.cartes.dateDecision'
            )}
            <input
              type="date"
              max={aujourdhui()}
              value={geste.date}
              onChange={(e) => setGeste({ ...geste, date: e.target.value })}
              className={champ}
            />
          </label>
          {geste.nature !== 'accord' && (
            <label className="min-w-56 flex-1 text-xs">
              {t('communal.cartes.motif')}
              <input
                value={geste.motif}
                maxLength={1000}
                onChange={(e) => setGeste({ ...geste, motif: e.target.value })}
                className={champ}
              />
            </label>
          )}
          <button
            type="button"
            disabled={
              envoi || !geste.date || (geste.nature !== 'accord' && geste.motif.trim().length < 5)
            }
            onClick={confirmer}
            className={bouton}
          >
            {t(`communal.cartes.confirmer.${geste.nature}`)}
          </button>
          <button type="button" onClick={() => setGeste(null)} className={boutonDiscret}>
            {t('commun.annuler')}
          </button>
          {geste.nature === 'accord' && (
            <p className="w-full text-xs text-ardoise-600">{t('communal.cartes.accordAide')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function NouvelleDemande(props: {
  acteurs: ActeurInformel[];
  zones: Zone[];
  onFait: (m: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const { acteurs, zones, onFait, onErreur } = props;
  const { t } = useTranslation();
  const vide = { acteurId: '', date: aujourdhui(), zones: [] as string[] };
  const [s, setS] = useState(vide);
  const [envoi, setEnvoi] = useState(false);

  async function enregistrer() {
    setEnvoi(true);
    try {
      await api.demanderCarte({ acteurId: s.acteurId, dateDemande: s.date, zones: s.zones });
      setS(vide);
      onFait(t('communal.cartes.demandeEnregistree'));
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-siipi-200 bg-siipi-50/40 p-3">
      <h4 className="font-medium text-ardoise-900">{t('communal.cartes.nouvelle')}</h4>
      {acteurs.length === 0 ? (
        <p className="text-sm text-ardoise-600">{t('communal.cartes.aucunPrecollecteur')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm" htmlFor="carte-acteur">
              {t('communal.cartes.acteur')}
              <select
                id="carte-acteur"
                value={s.acteurId}
                onChange={(e) => setS({ ...s, acteurId: e.target.value })}
                className={champ}
              >
                <option value="">—</option>
                {acteurs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id_precollecteur}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm" htmlFor="carte-date">
              {t('communal.cartes.dateDemande')}
              <input
                id="carte-date"
                type="date"
                max={aujourdhui()}
                value={s.date}
                onChange={(e) => setS({ ...s, date: e.target.value })}
                className={champ}
              />
            </label>
          </div>
          <fieldset className="text-sm">
            <legend>{t('communal.cartes.secteurs')}</legend>
            {zones.length === 0 ? (
              <p className="text-ardoise-600">{t('communal.cartes.aucunSecteur')}</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {zones.map((z) => (
                  <label key={z.id} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={s.zones.includes(z.id)}
                      onChange={(e) =>
                        setS({
                          ...s,
                          zones: e.target.checked
                            ? [...s.zones, z.id]
                            : s.zones.filter((x) => x !== z.id),
                        })
                      }
                    />
                    {z.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <button
            type="button"
            disabled={envoi || !s.acteurId || !s.date || s.zones.length === 0}
            onClick={() => void enregistrer()}
            className={bouton}
          >
            {t('communal.cartes.enregistrerDemande')}
          </button>
        </>
      )}
    </div>
  );
}
