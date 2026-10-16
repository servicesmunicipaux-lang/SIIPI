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
// rend que le nombre, et c'est délibéré (loi organique n° 2004-63).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  lireFichierLocal,
  type Publication,
  type LigneDepouillement,
  type PublicationDocument,
  type EnvoiNotification,
} from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement, Erreur } from '../Elements';
import { BoutonExport } from '../BoutonExport';
import { FormulairePublication, type TypePublication } from '../ajout/FormulairePublication';
import { IndicateursCommunication } from './IndicateursCommunication';


type Vue = TypePublication | 'envois' | 'indicateurs';
const VUES: Vue[] = ['notification', 'sondage', 'projet', 'envois', 'indicateurs'];

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
  const f = useFormats();
  const [vue, setVue] = useState<Vue>('notification');
  const [publications, setPublications] = useState<Publication[] | null>(null);
  const [envois, setEnvois] = useState<EnvoiNotification[] | null>(null);
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
  }, [communeId, charger]);

  const affichees = useMemo(
    () => (publications ?? []).filter((p) => p.type === vue),
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

      {vue !== 'envois' && vue !== 'indicateurs' && (
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
            <FormulairePublication
              communeId={communeId}
              type={vue}
              onAnnuler={() => setRedaction(false)}
              onFait={async () => { setRedaction(false); await charger(); }}
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
                      {p.type === 'projet' && p.projet_porteur && (
                        <>
                          {t(`communal.communication.porteurs.${p.projet_porteur}`)}
                          {p.projet_porteur_nom ? ` — ${p.projet_porteur_nom}` : ''}
                          {' · '}
                        </>
                      )}
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
                    {p.type === 'projet' && (
                      <button
                        type="button"
                        onClick={() => setOuvert(ouvert === p.id ? null : p.id)}
                        className="min-h-11 rounded-lg border border-ardoise-300 px-3 text-sm text-ardoise-700"
                      >
                        {t('communal.communication.documents', { n: p.documents ?? 0 })}
                      </button>
                    )}
                  </div>
                </div>

                {ouvert === p.id && p.type === 'sondage' && (
                  <Depouillement publicationId={p.id} titre={p.titre_fr} onErreur={setErreur} />
                )}
                {ouvert === p.id && p.type === 'projet' && (
                  <DocumentsProjet communeId={communeId} publicationId={p.id} onErreur={setErreur} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {vue === 'indicateurs' && <IndicateursCommunication communeId={communeId} />}

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
                      {f.date(e.created_at)}
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

// --- Dépouillement -----------------------------------------------------------

function Depouillement({
  publicationId,
  titre,
  onErreur,
}: {
  publicationId: string;
  titre: string;
  onErreur: (m: string | null) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const resultatsRef = useRef<HTMLDivElement>(null);
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
      <div className="flex justify-end">
        <BoutonExport
          chemin={`/communication/${encodeURIComponent(publicationId)}/depouillement`}
          impression={{
            cible: resultatsRef,
            titre: `${t('communal.communication.resultatsDe')} — ${titre}`,
            details: [f.date(new Date(), { heure: true })],
          }}
        />
      </div>
      <div ref={resultatsRef} className="space-y-3">
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
    </div>
  );
}

// --- Documents d'un projet (B5.3.3) ------------------------------------------

function DocumentsProjet({
  communeId,
  publicationId,
  onErreur,
}: {
  communeId: string;
  publicationId: string;
  onErreur: (m: string | null) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [documents, setDocuments] = useState<PublicationDocument[] | null>(null);
  const [depotEnCours, setDepotEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      setDocuments(await api.documentsProjet(publicationId));
    } catch (err) {
      onErreur(err instanceof ErreurApi ? err.message : null);
    }
  }, [publicationId, onErreur]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const deposer = async (fichier: File) => {
    setDepotEnCours(true);
    onErreur(null);
    try {
      const depose = await api.deposerFichier(communeId, {
        ...(await lireFichierLocal(fichier)),
        usage: 'document_projet',
      });
      await api.ajouterDocumentProjet(publicationId, {
        nom: fichier.name,
        url: depose.url,
        typeMime: depose.type_mime,
        tailleOctets: depose.taille_octets,
      });
      await charger();
    } catch (err) {
      onErreur(err instanceof ErreurApi ? err.message : null);
    } finally {
      setDepotEnCours(false);
    }
  };

  if (!documents) return <div className="border-t border-ardoise-200 p-3"><Chargement /></div>;

  return (
    <div className="space-y-2 border-t border-ardoise-200 p-3">
      {documents.length === 0 ? (
        <p className="text-sm text-ardoise-600">{t('communal.communication.aucunDocument')}</p>
      ) : (
        <ul className="space-y-1">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-ardoise-800">{d.nom}</span>
              <span className="shrink-0 text-xs text-ardoise-500">
                {f.date(d.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <label
        className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 ${
          depotEnCours ? 'opacity-50' : ''
        }`}
      >
        {depotEnCours ? t('communal.communication.depotEnCours') : t('communal.communication.joindreDocument')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          disabled={depotEnCours}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void deposer(f);
          }}
        />
      </label>
    </div>
  );
}
