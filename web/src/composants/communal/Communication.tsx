// Communication & relation citoyen.
//
// L'ÉCRAN EST ORGANISÉ AUTOUR D'UN SEUL GESTE : choisir un périmètre, voir
// combien de foyers il touche, puis écrire. Pas l'inverse. Un agent qui rédige
// d'abord et découvre ensuite que son message ne part à personne a perdu son
// temps — et, plus souvent, ne le découvre jamais.
//
// LE CHIFFRE QUI COMPTE AUTANT QUE L'AUTRE. À côté du nombre de destinataires,
// l'écran affiche le nombre d'inscrits SANS ADRESSE. Ceux-là sont hors de tout
// ciblage géographique, quoi qu'on fasse. Une commune qui croit toucher tout
// le monde alors qu'un tiers de ses inscrits n'a pas renseigné son adresse
// prend ses décisions sur un chiffre faux.
//
// CE QUE L'ÉCRAN NE MONTRE JAMAIS : qui habite dans le périmètre. L'API n'en
// rend que le nombre, et c'est délibéré (décret-loi n° 2022-54).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type Publication,
  type Destinataires,
  type LigneDepouillement,
  type EnvoiNotification,
} from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

type TypePublication = 'notification' | 'sondage' | 'projet';

type Vue = TypePublication | 'envois';
const VUES: Vue[] = ['notification', 'sondage', 'projet', 'envois'];

const PERIMETRES = ['commune', 'zones', 'circuits'] as const;
type Perimetre = (typeof PERIMETRES)[number];

const COULEUR_STATUT: Record<string, string> = {
  brouillon: 'bg-ardoise-100 text-ardoise-700',
  publiee: 'bg-siipi-100 text-siipi-800',
  close: 'bg-amber-100 text-amber-900',
  archivee: 'bg-ardoise-100 text-ardoise-500',
};

const nombre = (n: unknown) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR');

export function Communication({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [vue, setVue] = useState<Vue>('notification');
  const [publications, setPublications] = useState<Publication[] | null>(null);
  const [envois, setEnvois] = useState<EnvoiNotification[] | null>(null);
  const [zones, setZones] = useState<{ id: string; name: string; code?: string | null }[]>([]);
  const [circuits, setCircuits] = useState<{ id: string; nom: string }[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [redaction, setRedaction] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([api.publications(communeId), api.envois(communeId)]);
      setPublications(p);
      setEnvois(e);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, t]);

  useEffect(() => {
    void charger();
    // Les zones et les circuits ne changent pas pendant qu'on rédige : un seul
    // chargement suffit, et l'écran reste utilisable si l'un des deux manque.
    void api.zones(communeId).then((z) => setZones(z as typeof zones)).catch(() => setZones([]));
    void api.circuits(communeId).then((c) => setCircuits(c as typeof circuits)).catch(() => setCircuits([]));
  }, [communeId, charger]);

  const affichees = useMemo(
    () => (publications ?? []).filter((p) => vue !== 'envois' && p.type === vue),
    [publications, vue]
  );

  if (erreur && !publications) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!publications || !envois) return <Chargement />;

  const changerStatut = async (p: Publication, statut: string) => {
    setErreur(null);
    try {
      await api.publierPublication(p.id, statut);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  const envoyer = async (p: Publication) => {
    setErreur(null);
    try {
      await api.envoyerPublication(p.id);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.communication.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-600">{t('communal.communication.chapeau')}</p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-ardoise-200" aria-label={t('communal.communication.navigation')}>
        {VUES.map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => { setVue(cle); setRedaction(false); }}
            aria-current={vue === cle ? 'page' : undefined}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${
              vue === cle
                ? 'border-siipi-600 text-siipi-700'
                : 'border-transparent text-ardoise-500 hover:text-ardoise-800'
            }`}
          >
            {t(`communal.communication.vues.${cle}`)}
          </button>
        ))}
      </nav>

      {vue !== 'envois' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ardoise-600">
              {t(`communal.communication.aide.${vue}`)}
            </p>
            <button
              type="button"
              onClick={() => setRedaction((v) => !v)}
              className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white"
            >
              {redaction ? t('commun.annuler') : t(`communal.communication.creer.${vue}`)}
            </button>
          </div>

          {redaction && (
            <Redaction
              communeId={communeId}
              type={vue}
              zones={zones}
              circuits={circuits}
              onFait={async () => { setRedaction(false); await charger(); }}
              onErreur={setErreur}
            />
          )}

          {affichees.length === 0 && !redaction && (
            <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">
              {t('communal.communication.aucune')}
            </p>
          )}

          <ul className="space-y-2">
            {affichees.map((p) => (
              <li key={p.id} className="rounded-xl border border-ardoise-200 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div className="min-w-[14rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium text-ardoise-900">{p.titre_fr}</h2>
                      <span className={`rounded px-2 py-0.5 text-xs ${COULEUR_STATUT[p.statut] ?? ''}`}>
                        {t(`communal.communication.statuts.${p.statut}`)}
                      </span>
                      {/* Le marquage « exemple » est en base et refusé à la
                          publication : on le dit ici sans ambiguïté. */}
                      {p.est_exemple && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          {t('communal.communication.exemple')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-ardoise-500">
                      {t(`communal.communication.perimetres.${p.perimetre_type}`)}
                      {' · '}
                      {t('communal.communication.joignables', { n: nombre(p.joignables) })}
                      {Number(p.sans_adresse) > 0 && (
                        <> {' · '}
                          <span className="text-amber-700">
                            {t('communal.communication.sansAdresse', { n: nombre(p.sans_adresse) })}
                          </span>
                        </>
                      )}
                      {p.type === 'sondage' && (
                        <> {' · '}{t('communal.communication.repondants', { n: nombre(p.repondants) })}</>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {p.statut === 'brouillon' && !p.est_exemple && (
                      <button
                        type="button"
                        onClick={() => void changerStatut(p, 'publiee')}
                        className="min-h-11 rounded-lg border border-siipi-600 px-3 text-sm text-siipi-700"
                      >
                        {t('communal.communication.publier')}
                      </button>
                    )}
                    {p.statut === 'publiee' && p.type === 'notification' && (
                      <button
                        type="button"
                        onClick={() => void envoyer(p)}
                        disabled={Number(p.joignables) === 0}
                        title={Number(p.joignables) === 0 ? t('communal.communication.aucunDestinataire') : undefined}
                        className="min-h-11 rounded-lg bg-siipi-600 px-3 text-sm text-white disabled:opacity-40"
                      >
                        {t('communal.communication.envoyer')}
                      </button>
                    )}
                    {p.statut === 'publiee' && (
                      <button
                        type="button"
                        onClick={() => void changerStatut(p, 'close')}
                        className="min-h-11 rounded-lg border border-ardoise-300 px-3 text-sm text-ardoise-700"
                      >
                        {t('communal.communication.clore')}
                      </button>
                    )}
                    {p.type === 'sondage' && (
                      <button
                        type="button"
                        onClick={() => setOuvert(ouvert === p.id ? null : p.id)}
                        className="min-h-11 rounded-lg border border-ardoise-300 px-3 text-sm text-ardoise-700"
                      >
                        {t('communal.communication.resultats')}
                      </button>
                    )}
                  </div>
                </div>

                {ouvert === p.id && p.type === 'sondage' && (
                  <Depouillement publicationId={p.id} onErreur={setErreur} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {vue === 'envois' && (
        <section className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          {envois.length === 0 ? (
            <p className="p-6 text-sm text-ardoise-600">{t('communal.communication.aucunEnvoi')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ardoise-50 text-left text-xs uppercase text-ardoise-600">
                <tr>
                  <th className="p-3">{t('communal.communication.colDate')}</th>
                  <th className="p-3">{t('communal.communication.colMessage')}</th>
                  <th className="p-3">{t('communal.communication.colPerimetre')}</th>
                  <th className="p-3">{t('communal.communication.colDestinataires')}</th>
                  <th className="p-3">{t('communal.communication.colNonJoints')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ardoise-200">
                {envois.map((e) => (
                  <tr key={e.id}>
                    <td className="p-3 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="p-3 font-medium text-ardoise-900">{e.titre_fr}</td>
                    <td className="p-3 text-ardoise-600">
                      {t(`communal.communication.perimetres.${e.perimetre_resume ?? 'commune'}`)}
                    </td>
                    <td className="p-3">{nombre(e.destinataires)}</td>
                    <td className="p-3 text-ardoise-600">
                      {Number(e.sans_adresse) + Number(e.desabonnes) > 0
                        ? t('communal.communication.nonJoints', {
                            sans: nombre(e.sans_adresse),
                            des: nombre(e.desabonnes),
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/* L'historique dit combien, jamais qui. C'est écrit, pour qu'on ne
              vienne pas demander la liste en pensant qu'elle existe. */}
          <p className="border-t border-ardoise-200 p-3 text-xs text-ardoise-500">
            {t('communal.communication.noteHistorique')}
          </p>
        </section>
      )}
    </div>
  );
}

// --- Rédaction ---------------------------------------------------------------

function Redaction({
  communeId,
  type,
  zones,
  circuits,
  onFait,
  onErreur,
}: {
  communeId: string;
  type: TypePublication;
  zones: { id: string; name: string; code?: string | null }[];
  circuits: { id: string; nom: string }[];
  onFait: () => Promise<void>;
  onErreur: (m: string | null) => void;
}) {
  const { t } = useTranslation();
  const [titreFr, setTitreFr] = useState('');
  const [titreAr, setTitreAr] = useState('');
  const [contenuFr, setContenuFr] = useState('');
  const [contenuAr, setContenuAr] = useState('');
  const [perimetre, setPerimetre] = useState<Perimetre>('commune');
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  const [circuitIds, setCircuitIds] = useState<string[]>([]);
  const [apercu, setApercu] = useState<Destinataires | null>(null);
  const [enCours, setEnCours] = useState(false);

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
    onErreur(null);
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
        ...(type === 'projet' ? { projetNature: 'communal', projetEtat: 'en_preparation' } : {}),
      });
      await onFait();
    } catch (err) {
      onErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
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

      <button
        type="button"
        onClick={() => void enregistrer()}
        disabled={enCours || titreFr.trim().length < 2}
        className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
      >
        {t('communal.communication.enregistrerBrouillon')}
      </button>
      <p className="text-xs text-ardoise-500">{t('communal.communication.noteBrouillon')}</p>
    </section>
  );
}

// --- Dépouillement -----------------------------------------------------------

function Depouillement({
  publicationId,
  onErreur,
}: {
  publicationId: string;
  onErreur: (m: string | null) => void;
}) {
  const { t } = useTranslation();
  const [lignes, setLignes] = useState<LigneDepouillement[] | null>(null);

  useEffect(() => {
    void api
      .depouillement(publicationId)
      .then(setLignes)
      .catch((err) => onErreur(err instanceof ErreurApi ? err.message : null));
  }, [publicationId, onErreur]);

  if (!lignes) return <div className="border-t border-ardoise-200 p-3"><Chargement /></div>;
  if (lignes.length === 0) {
    return (
      <p className="border-t border-ardoise-200 p-3 text-sm text-ardoise-600">
        {t('communal.communication.aucuneQuestion')}
      </p>
    );
  }

  // Le maximum sert à dimensionner les barres. Calculé par question, pas sur
  // l'ensemble : deux questions n'ont pas le même nombre de répondants.
  const maxParQuestion = new Map<string, number>();
  for (const l of lignes) {
    maxParQuestion.set(l.question_id, Math.max(maxParQuestion.get(l.question_id) ?? 0, Number(l.reponses)));
  }

  return (
    <div className="space-y-3 border-t border-ardoise-200 p-3">
      {Array.from(new Set(lignes.map((l) => l.question_id))).map((qid) => {
        const bloc = lignes.filter((l) => l.question_id === qid);
        const max = maxParQuestion.get(qid) ?? 0;
        return (
          <div key={qid}>
            <p className="text-sm font-medium text-ardoise-900">{bloc[0].libelle_fr}</p>
            {bloc[0].type === 'note' ? (
              <p className="mt-1 text-sm text-ardoise-700">
                {t('communal.communication.noteMoyenne', {
                  n: bloc[0].note_moyenne ?? '—',
                  r: nombre(bloc[0].reponses),
                })}
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {bloc.map((l) => (
                  <li key={`${qid}-${l.option_rang}`} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 truncate text-ardoise-700">{l.option_fr ?? '—'}</span>
                    <span className="h-3 flex-1 rounded bg-ardoise-100">
                      <span
                        className="block h-3 rounded bg-siipi-500"
                        style={{ width: max > 0 ? `${(Number(l.reponses) / max) * 100}%` : '0%' }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right tabular-nums text-ardoise-600">
                      {nombre(l.reponses)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
