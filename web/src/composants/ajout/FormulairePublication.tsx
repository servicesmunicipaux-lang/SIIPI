// Rédiger une publication — notification, sondage ou projet (registre des
// formulaires d'ajout, refonte lot 2b). Le catalogue « + Ajouter » l'ouvre en
// projet ; l'écran Communication, dans le type de l'onglet ouvert.
//
// LE PÉRIMÈTRE AVANT LE TEXTE. On choisit à qui l'on écrit, on voit combien de
// foyers cela touche — et combien d'inscrits, sans adresse, restent hors de
// tout ciblage —, puis on rédige. Pas l'inverse : un agent qui rédige d'abord
// et découvre ensuite que son message ne part à personne a perdu son temps.
// L'API ne rend que des nombres, jamais qui habite où (loi organique
// n° 2004-63).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Destinataires } from '../../lib/api';

export type TypePublication = 'notification' | 'sondage' | 'projet';
const PORTEURS = ['commune', 'association', 'autre'] as const;
type Porteur = (typeof PORTEURS)[number];

const PERIMETRES = ['commune', 'zones', 'circuits'] as const;
type Perimetre = (typeof PERIMETRES)[number];

const nombre = (n: unknown) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR');

export function FormulairePublication({
  communeId,
  type,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  type: TypePublication;
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const { t } = useTranslation();
  const [zones, setZones] = useState<{ id: string; name: string; code?: string | null }[]>([]);
  const [circuits, setCircuits] = useState<{ id: string; nom: string }[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [titreFr, setTitreFr] = useState('');
  const [titreAr, setTitreAr] = useState('');
  const [contenuFr, setContenuFr] = useState('');
  const [contenuAr, setContenuAr] = useState('');
  const [perimetre, setPerimetre] = useState<Perimetre>('commune');
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  const [circuitIds, setCircuitIds] = useState<string[]>([]);
  const [apercu, setApercu] = useState<Destinataires | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Les zones et les circuits ne changent pas pendant qu'on rédige : un seul
  // chargement suffit, et le formulaire reste utilisable si l'un des deux manque.
  useEffect(() => {
    void api.zones(communeId).then((z) => setZones(z as typeof zones)).catch(() => setZones([]));
    void api.circuits(communeId).then((c) => setCircuits(c as typeof circuits)).catch(() => setCircuits([]));
  }, [communeId]);
  // Le porteur d'un projet (D5) : un projet associatif n'est qu'un projet
  // porté par une association, et il se nomme — la base refuse sinon.
  const [porteur, setPorteur] = useState<Porteur>('commune');
  const [porteurNom, setPorteurNom] = useState('');
  const manqueNomPorteur = type === 'projet' && porteur !== 'commune' && porteurNom.trim() === '';

  // L'aperçu se recalcule à chaque changement de périmètre, avant d'écrire
  // quoi que ce soit. C'est tout l'intérêt : savoir AVANT de rédiger.
  useEffect(() => {
    let annule = false;
    const incomplet =
      (perimetre === 'zones' && zoneIds.length === 0) ||
      (perimetre === 'circuits' && circuitIds.length === 0);
    if (incomplet) { setApercu(null); return; }

    void api
      .apercuDestinataires(communeId, { perimetreType: perimetre, zoneIds, circuitIds })
      .then((d) => { if (!annule) setApercu(d); })
      .catch(() => { if (!annule) setApercu(null); });
    return () => { annule = true; };
  }, [communeId, perimetre, zoneIds, circuitIds]);

  const bascule = (liste: string[], id: string) =>
    liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await api.creerPublication(communeId, {
        type,
        titreFr,
        titreAr: titreAr || null,
        contenuFr: contenuFr || null,
        contenuAr: contenuAr || null,
        perimetreType: perimetre,
        zoneIds: perimetre === 'zones' ? zoneIds : null,
        circuitIds: perimetre === 'circuits' ? circuitIds : null,
        ...(type === 'projet'
          ? { projetPorteur: porteur, projetPorteurNom: porteur === 'commune' ? '' : porteurNom.trim(), projetEtat: 'en_preparation' }
          : {}),
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4">
      {/* Le périmètre AVANT le texte : c'est l'ordre dans lequel la question
          se pose réellement. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ardoise-900">
          {t('communal.communication.aQui')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {PERIMETRES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPerimetre(p)}
              aria-pressed={perimetre === p}
              className={`min-h-11 rounded-lg px-3 text-sm ${
                perimetre === p ? 'bg-siipi-600 text-white' : 'border border-ardoise-300 text-ardoise-700'
              }`}
            >
              {t(`communal.communication.perimetres.${p}`)}
            </button>
          ))}
        </div>

        {perimetre === 'zones' && (
          <div className="flex flex-wrap gap-2 pt-1">
            {zones.length === 0 && (
              <p className="text-sm text-amber-800">{t('communal.communication.aucunSecteur')}</p>
            )}
            {zones.map((z) => (
              <label key={z.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-ardoise-300 bg-white px-3 text-sm">
                <input
                  type="checkbox"
                  checked={zoneIds.includes(z.id)}
                  onChange={() => setZoneIds((l) => bascule(l, z.id))}
                />
                {z.code ? `${z.code} — ${z.name}` : z.name}
              </label>
            ))}
          </div>
        )}

        {perimetre === 'circuits' && (
          <div className="flex flex-wrap gap-2 pt-1">
            {circuits.length === 0 && (
              <p className="text-sm text-amber-800">{t('communal.communication.aucunCircuit')}</p>
            )}
            {circuits.map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-ardoise-300 bg-white px-3 text-sm">
                <input
                  type="checkbox"
                  checked={circuitIds.includes(c.id)}
                  onChange={() => setCircuitIds((l) => bascule(l, c.id))}
                />
                {c.nom}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {/* Le décompte, avant la rédaction. */}
      <div
        className={`rounded-lg border p-3 text-sm ${
          apercu && apercu.joignables === 0
            ? 'border-red-300 bg-red-50 text-red-900'
            : 'border-ardoise-200 bg-white text-ardoise-800'
        }`}
        aria-live="polite"
      >
        {apercu === null ? (
          t('communal.communication.choisirPerimetre')
        ) : (
          <>
            <p className="font-medium">
              {t('communal.communication.toucheN', { n: nombre(apercu.joignables) })}
            </p>
            {apercu.sans_adresse > 0 && (
              <p className="mt-1 text-amber-800">
                {t('communal.communication.horsCiblage', { n: nombre(apercu.sans_adresse) })}
              </p>
            )}
            {apercu.desabonnes > 0 && (
              <p className="mt-1 text-ardoise-600">
                {t('communal.communication.desabonnes', { n: nombre(apercu.desabonnes) })}
              </p>
            )}
          </>
        )}
      </div>

      {type === 'projet' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm" htmlFor="projet-porteur">
            {t('communal.communication.porteur')}
            <select
              id="projet-porteur"
              value={porteur}
              onChange={(e) => setPorteur(e.target.value as Porteur)}
              className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3"
            >
              {PORTEURS.map((x) => (
                <option key={x} value={x}>{t(`communal.communication.porteurs.${x}`)}</option>
              ))}
            </select>
          </label>
          {porteur !== 'commune' && (
            <label className="text-sm" htmlFor="projet-porteur-nom">
              {t('communal.communication.porteurNom')}
              <input
                id="projet-porteur-nom"
                value={porteurNom}
                onChange={(e) => setPorteurNom(e.target.value)}
                maxLength={200}
                aria-invalid={manqueNomPorteur}
                className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 px-3"
              />
            </label>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t('communal.communication.titreFr')}
          <input
            value={titreFr}
            onChange={(e) => setTitreFr(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 px-3"
          />
        </label>
        <label className="text-sm" dir="rtl">
          {t('communal.communication.titreAr')}
          <input
            value={titreAr}
            onChange={(e) => setTitreAr(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 px-3"
          />
        </label>
        <label className="text-sm">
          {t('communal.communication.contenuFr')}
          <textarea
            value={contenuFr}
            onChange={(e) => setContenuFr(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2"
          />
        </label>
        <label className="text-sm" dir="rtl">
          {t('communal.communication.contenuAr')}
          <textarea
            value={contenuAr}
            onChange={(e) => setContenuAr(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2"
          />
        </label>
      </div>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={enCours || titreFr.trim().length < 2 || manqueNomPorteur}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('communal.communication.enregistrerBrouillon')}
        </button>
        <button type="button" onClick={onAnnuler} className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm text-ardoise-700">
          {t('commun.annuler')}
        </button>
      </div>
      <p className="text-xs text-ardoise-500">{t('communal.communication.noteBrouillon')}</p>
    </section>
  );
}
