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

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, lireFichierLocal, lireOctetsFichier, type RapportEtude } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const CATEGORIES = ['etude_technique', 'rapport_activite', 'audit', 'plan_action', 'autre'] as const;

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

  const telecharger = async (r: RapportEtude) => {
    try {
      const url = await lireOctetsFichier(r.fichier_url);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  const retirer = async (r: RapportEtude) => {
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
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ardoise-200 bg-white p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-ardoise-900">{r.titre}</p>
                <p className="text-xs text-ardoise-500">
                  {t(`communal.rapportsEtudes.categories.${r.categorie}`)}
                  {r.auteur ? ` · ${r.auteur}` : ''}
                  {r.date_document ? ` · ${new Date(r.date_document).toLocaleDateString('fr-FR')}` : ''}
                  {r.taille_octets ? ` · ${tailleLisible(r.taille_octets)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void telecharger(r)}
                  className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700"
                >
                  {t('communal.rapportsEtudes.ouvrir')}
                </button>
                <button
                  type="button"
                  onClick={() => void retirer(r)}
                  className="min-h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800"
                >
                  {t('communal.rapportsEtudes.retirer')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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
