// Le formulaire du logo d'une commune (jalon D, D1) — le seul : le portail de la
// commune et l'annuaire national de la FNCT ouvrent celui-ci.
//
// L'image choisie est contrôlée avant l'envoi pour sa taille (1 Mo), afin de
// dire tout de suite ce qui ne va pas ; tout le reste — le type réel, un SVG
// avec script ou lien extérieur — est jugé par l'API, dont le message est
// affiché tel quel : il dit quoi faire.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type LogoHistorique } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { CadreAjout } from './CadreAjout';
import { LogoCommune } from '../LogoCommune';

const PLAFOND = 1024 * 1024;

function lireEnBase64(fichier: File): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(String(lecteur.result));
    lecteur.onerror = () => rejeter(lecteur.error);
    lecteur.readAsDataURL(fichier);
  });
}

export function FormulaireLogo({
  communeId,
  nom,
  nomAr,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  nom: string;
  nomAr?: string | null;
  onFait: () => void | Promise<void>;
  onAnnuler?: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [historique, setHistorique] = useState<LogoHistorique[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    void api.historiqueLogos(communeId).then(setHistorique).catch(() => setHistorique([]));
  }, [communeId, version]);
  const enVigueur = historique.some((h) => h.en_vigueur);

  const choisir = (choisi: File | null) => {
    setErreur(null);
    if (choisi && choisi.size > PLAFOND) {
      setFichier(null);
      setErreur(t('logo.tropGros', { taille: formaterNombre(choisi.size / 1024 / 1024, 1) }));
      return;
    }
    setFichier(choisi);
  };

  const enregistrer = async () => {
    if (!fichier) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.deposerLogoCommune(communeId, { nomFichier: fichier.name, contenu: await lireEnBase64(fichier) });
      setFichier(null);
      setVersion((v) => v + 1);
      await onFait();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async () => {
    if (!window.confirm(t('logo.retirerConfirmer'))) return;
    setErreur(null);
    try {
      await api.retirerLogoCommune(communeId);
      setVersion((v) => v + 1);
      await onFait();
    } catch (e) {
      setErreur((e as Error).message);
    }
  };

  return (
    <CadreAjout
      id={`logo-${communeId}`}
      titre={t('logo.titre', { nom })}
      aide={t('logo.aide')}
      erreur={erreur}
      enregistrable={!!fichier}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="flex flex-wrap items-center gap-4">
        <LogoCommune communeId={communeId} nom={nom} nomAr={nomAr} taille="grand" version={version} />
        <p className="text-sm text-ardoise-600">{enVigueur ? t('logo.actuel') : t('logo.aucun')}</p>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-ardoise-700">{t('logo.choisir')}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => {
            choisir(e.target.files?.[0] ?? null);
            // Remis à zéro : rechoisir le même fichier après un refus doit
            // redéclencher le contrôle, sinon l'écran paraît figé.
            e.target.value = '';
          }}
          className="mt-1 block w-full text-sm file:me-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-siipi-100 file:px-4 file:text-siipi-800"
        />
      </label>
      {fichier && <p className="text-sm text-ardoise-700">{t('logo.choisi', { nom: fichier.name })}</p>}
      {historique.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-ardoise-700">{t('logo.historique')}</p>
          <ul className="space-y-1 text-xs text-ardoise-600">
            {historique.map((h) => (
              <li key={h.id}>
                {h.nom_original} — {t('logo.deposeLe', { date: f.date(h.depose_le) })}
                {h.en_vigueur ? ` · ${t('logo.enVigueur')}` : h.retire_le ? ` · ${t('logo.retireLe', { date: f.date(h.retire_le) })}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {enVigueur && (
        <button type="button" onClick={() => void retirer()} className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm text-ardoise-700">
          {t('logo.retirer')}
        </button>
      )}
    </CadreAjout>
  );
}
