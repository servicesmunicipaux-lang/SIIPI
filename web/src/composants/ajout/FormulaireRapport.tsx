// Déposer un rapport ou une étude (TDR §3.2.9 ; registre des formulaires
// d'ajout, refonte lot 2b).
//
// LA FICHE, PAS SEULEMENT LE FICHIER : un titre, une catégorie, un auteur
// déclaré — souvent un bureau d'études externe, sans compte sur la
// plateforme. PDF, Word, Excel ou PowerPoint, jusqu'à 50 Mo. Une nouvelle
// version d'un document existant se dépose depuis sa ligne, dans l'écran
// « Rapports et études » : ce formulaire crée un document.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, lireFichierLocal } from '../../lib/api';
import { Erreur } from '../Elements';

export const CATEGORIES_RAPPORT = ['etude_technique', 'rapport_activite', 'audit', 'plan_action', 'autre'] as const;
const CATEGORIES = CATEGORIES_RAPPORT;

export function FormulaireRapport({
  communeId,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
}) {
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={enCours || !fichier || titre.trim().length < 3}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          {enCours ? t('communal.rapportsEtudes.depotEnCours') : t('communal.rapportsEtudes.enregistrer')}
        </button>
        <button type="button" onClick={onAnnuler} className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm text-ardoise-700">
          {t('commun.annuler')}
        </button>
      </div>
    </section>
  );
}
