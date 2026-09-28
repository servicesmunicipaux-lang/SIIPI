// Rapports et études (TDR §3.2.9).
//
// LA FICHE, PAS SEULEMENT LE FICHIER. Le stockage (migration 041) savait déjà
// recevoir des octets ; ce qui manquait, c'est ce qui permet de s'y retrouver
// un an plus tard : un titre, une catégorie, un auteur déclaré — souvent un
// bureau d'études externe, sans compte sur la plateforme.
//
// PDF, Word, Excel ou PowerPoint, jusqu'à 50 Mo : le seul usage de la
// plateforme à accepter les documents Office, parce que c'est le seul où ça a
// un sens.
//
// VERSIONS (C3.6) : déposer une nouvelle version ne remplace jamais la
// précédente — la liste montre la dernière, l'historique garde les autres,
// datées. Un PDF se lit dans la page (C3.5) ; un document Office, qu'aucun
// navigateur n'affiche nativement, s'ouvre à part.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  lireFichierLocal,
  lireOctetsFichier,
  type RapportEtude,
  type VersionRapport,
} from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const CATEGORIES = ['etude_technique', 'rapport_activite', 'audit', 'plan_action', 'autre'] as const;

const PDF = 'application/pdf';

function tailleLisible(octets: number | null): string {
  if (!octets) return '';
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${Math.round((octets / 1024 / 1024) * 10) / 10} Mo`;
}

export function RapportsEtudes({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [rapports, setRapports] = useState<RapportEtude[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<string>('tous');
  const [redaction, setRedaction] = useState(false);
  const [historique, setHistorique] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ url: string; titre: string } | null>(null);
  const [versionEnCours, setVersionEnCours] = useState<string | null>(null);

  const charger = async () => {
    try {
      setRapports(await api.rapportsEtudes(communeId));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  if (erreur && !rapports) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!rapports) return <Chargement />;

  const affiches = filtre === 'tous' ? rapports : rapports.filter((r) => r.categorie === filtre);

  const telecharger = async (r: Pick<RapportEtude, 'fichier_url'>) => {
    try {
      const url = await lireOctetsFichier(r.fichier_url);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  const afficher = async (r: Pick<RapportEtude, 'fichier_url' | 'titre' | 'version'>) => {
    try {
      if (apercu) URL.revokeObjectURL(apercu.url);
      const url = await lireOctetsFichier(r.fichier_url);
      setApercu({ url, titre: `${r.titre} — v${r.version}` });
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  const fermerApercu = () => {
    if (apercu) URL.revokeObjectURL(apercu.url);
    setApercu(null);
  };

  const nouvelleVersion = async (r: RapportEtude, fichier: File) => {
    setVersionEnCours(r.id);
    setErreur(null);
    try {
      const depose = await api.deposerFichier(communeId, {
        ...(await lireFichierLocal(fichier)),
        usage: 'rapport_etude',
      });
      await api.deposerVersionRapport(r.id, {
        fichierUrl: depose.url,
        nomFichier: fichier.name,
        typeMime: depose.type_mime,
        tailleOctets: depose.taille_octets,
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setVersionEnCours(null);
    }
  };

  const retirer = async (r: RapportEtude) => {
    // Retirer un document, c'est retirer toutes ses versions : on le dit
    // avant, puisque ce n'est pas ce qu'un « Retirer » laisse deviner.
    if (r.nb_versions > 1 && !window.confirm(t('communal.rapportsEtudes.confirmerRetrait', { n: r.nb_versions }))) {
      return;
    }
    try {
      await api.retirerRapportEtude(r.id);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.rapportsEtudes.titre')}</h1>
          <p className="mt-1 text-sm text-ardoise-500">{t('communal.rapportsEtudes.chapeau')}</p>
        </div>
        <button
          type="button"
          onClick={() => setRedaction((v) => !v)}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white"
        >
          {redaction ? t('commun.annuler') : t('communal.rapportsEtudes.deposer')}
        </button>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}

      {redaction && (
        <Depot
          communeId={communeId}
          onFait={async () => {
            setRedaction(false);
            await charger();
          }}
        />
      )}

      {apercu && (
        <section className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-ardoise-900">{apercu.titre}</p>
            <button
              type="button"
              onClick={fermerApercu}
              className="min-h-11 shrink-0 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700"
            >
              {t('communal.rapportsEtudes.fermerApercu')}
            </button>
          </div>
          <iframe src={apercu.url} title={apercu.titre} className="h-[70vh] w-full rounded-lg border border-ardoise-200" />
        </section>
      )}

      <div className="flex flex-wrap gap-1.5">
        {['tous', ...CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFiltre(c)}
            className={`min-h-11 rounded-full px-3 text-sm font-medium ${
              filtre === c
                ? 'bg-ardoise-900 text-white'
                : 'border border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.rapportsEtudes.categories.${c}`)}
          </button>
        ))}
      </div>

      {affiches.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {t('communal.rapportsEtudes.aucun')}
        </p>
      ) : (
        <ul className="space-y-2">
          {affiches.map((r) => (
            <li key={r.id} className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ardoise-900">
                    {r.titre}
                    <span className="ms-2 rounded bg-ardoise-100 px-1.5 py-0.5 text-xs font-semibold text-ardoise-700">
                      v{r.version}
                    </span>
                  </p>
                  <p className="text-xs text-ardoise-500">
                    {t(`communal.rapportsEtudes.categories.${r.categorie}`)}
                    {r.auteur ? ` · ${r.auteur}` : ''}
                    {r.date_document ? ` · ${new Date(r.date_document).toLocaleDateString('fr-FR')}` : ''}
                    {r.taille_octets ? ` · ${tailleLisible(r.taille_octets)}` : ''}
                    {r.nb_versions > 1 ? ` · ${t('communal.rapportsEtudes.nbVersions', { n: r.nb_versions })}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {r.type_mime === PDF && (
                    <button
                      type="button"
                      onClick={() => void afficher(r)}
                      className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700"
                    >
                      {t('communal.rapportsEtudes.apercu')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void telecharger(r)}
                    className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700"
                  >
                    {t('communal.rapportsEtudes.ouvrir')}
                  </button>
                  <label
                    className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-siipi-300 bg-white px-3 text-sm font-medium text-siipi-800 ${
                      versionEnCours === r.id ? 'opacity-50' : ''
                    }`}
                  >
                    {versionEnCours === r.id
                      ? t('communal.rapportsEtudes.depotEnCours')
                      : t('communal.rapportsEtudes.nouvelleVersion')}
                    <input
                      type="file"
                      accept=".pdf,.docx,.xlsx,.pptx,image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      disabled={versionEnCours !== null}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void nouvelleVersion(r, f);
                      }}
                    />
                  </label>
                  {r.nb_versions > 1 && (
                    <button
                      type="button"
                      onClick={() => setHistorique((h) => (h === r.document_id ? null : r.document_id))}
                      aria-expanded={historique === r.document_id}
                      className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700"
                    >
                      {t('communal.rapportsEtudes.historique')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void retirer(r)}
                    className="min-h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800"
                  >
                    {t('communal.rapportsEtudes.retirer')}
                  </button>
                </div>
              </div>
              {historique === r.document_id && (
                <Historique
                  rapportId={r.id}
                  onOuvrir={(v) => void telecharger(v)}
                  onApercu={(v) => void afficher(v)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Historique({
  rapportId,
  onOuvrir,
  onApercu,
}: {
  rapportId: string;
  onOuvrir: (v: VersionRapport) => void;
  onApercu: (v: VersionRapport) => void;
}) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<VersionRapport[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api
      .versionsRapport(rapportId)
      .then(setVersions)
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [rapportId, t]);

  if (erreur) return <Erreur message={erreur} />;
  if (!versions) return <Chargement />;

  return (
    <ol className="space-y-1 border-s-2 border-ardoise-200 ps-3">
      {versions.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="min-w-0">
            <span className="font-semibold text-ardoise-800">v{v.version}</span>
            <span className="text-ardoise-500">
              {' · '}
              {t('communal.rapportsEtudes.deposeLe', {
                date: new Date(v.created_at).toLocaleString(document.documentElement.lang || 'fr'),
              })}
              {' · '}
              {v.nom_fichier}
            </span>
          </span>
          <span className="flex gap-2">
            {v.type_mime === PDF && (
              <button
                type="button"
                onClick={() => onApercu(v)}
                className="min-h-9 rounded-lg border border-ardoise-300 bg-white px-2 text-xs font-medium text-ardoise-700"
              >
                {t('communal.rapportsEtudes.apercu')}
              </button>
            )}
            <button
              type="button"
              onClick={() => onOuvrir(v)}
              className="min-h-9 rounded-lg border border-ardoise-300 bg-white px-2 text-xs font-medium text-ardoise-700"
            >
              {t('communal.rapportsEtudes.ouvrir')}
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Depot({ communeId, onFait }: { communeId: string; onFait: () => Promise<void> }) {
  const { t } = useTranslation();
  const [titre, setTitre] = useState('');
  const [categorie, setCategorie] = useState<(typeof CATEGORIES)[number]>('autre');
  const [auteur, setAuteur] = useState('');
  const [dateDocument, setDateDocument] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const enregistrer = async () => {
    if (!fichier || titre.trim().length < 3) return;
    setEnCours(true);
    setErreur(null);
    try {
      const depose = await api.deposerFichier(communeId, {
        ...(await lireFichierLocal(fichier)),
        usage: 'rapport_etude',
      });
      await api.enregistrerRapportEtude(communeId, {
        titre: titre.trim(),
        categorie,
        auteur: auteur || undefined,
        dateDocument: dateDocument || undefined,
        fichierUrl: depose.url,
        nomFichier: fichier.name,
        typeMime: depose.type_mime,
        tailleOctets: depose.taille_octets,
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t('communal.rapportsEtudes.champTitre')}
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 px-3"
          />
        </label>
        <label className="text-sm">
          {t('communal.rapportsEtudes.champCategorie')}
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as (typeof CATEGORIES)[number])}
            className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`communal.rapportsEtudes.categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('communal.rapportsEtudes.champAuteur')}
          <input
            value={auteur}
            onChange={(e) => setAuteur(e.target.value)}
            placeholder={t('communal.rapportsEtudes.champAuteurExemple')}
            className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 px-3"
          />
        </label>
        <label className="text-sm">
          {t('communal.rapportsEtudes.champDate')}
          <input
            type="date"
            value={dateDocument}
            onChange={(e) => setDateDocument(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 px-3"
          />
        </label>
      </div>

      <label className="block text-sm">
        {t('communal.rapportsEtudes.champFichier')}
        <input
          type="file"
          accept=".pdf,.docx,.xlsx,.pptx,image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
        <span className="mt-1 block text-xs text-ardoise-500">{t('communal.rapportsEtudes.champFichierAide')}</span>
      </label>

      {erreur && <Erreur message={erreur} />}

      <button
        type="button"
        onClick={() => void enregistrer()}
        disabled={enCours || !fichier || titre.trim().length < 3}
        className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
      >
        {enCours ? t('communal.rapportsEtudes.depotEnCours') : t('communal.rapportsEtudes.enregistrer')}
      </button>
    </section>
  );
}
