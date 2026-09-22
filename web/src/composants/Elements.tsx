import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formaterNombre } from '../i18n';
import { ErreurApi, lireOctetsFichier } from '../lib/api';

/* ---------------------------------------------------------------------------
   Badge de statut de déploiement — TDR §3.1.2 A2.5
   La couleur seule ne suffit pas : elle est toujours accompagnée d'un mot et
   d'une infobulle, pour les daltoniens comme pour l'impression en noir et blanc.
   --------------------------------------------------------------------------- */

export type Statut = 'active' | 'incomplete' | 'desactivee';

const STYLES_STATUT: Record<Statut, string> = {
  active: 'bg-siipi-100 text-siipi-800 ring-siipi-300',
  incomplete: 'bg-amber-100 text-amber-900 ring-amber-300',
  desactivee: 'bg-ardoise-200 text-ardoise-700 ring-ardoise-300',
};

export function BadgeStatut({ statut }: { statut: Statut }) {
  const { t } = useTranslation();
  return (
    <span
      title={t(`national.statuts.${statut}Aide`)}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLES_STATUT[statut]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {t(`national.statuts.${statut}`)}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Badge de provenance des données
   Affiché partout où un chiffre est montré : un observatoire national qui ne
   distingue pas l'estimé du mesuré n'est pas défendable devant un bailleur.
   --------------------------------------------------------------------------- */

export type Provenance = 'estime' | 'declare' | 'mesure';

const STYLES_PROVENANCE: Record<Provenance, string> = {
  estime: 'bg-ardoise-100 text-ardoise-600 ring-ardoise-300',
  declare: 'bg-sky-50 text-sky-800 ring-sky-300',
  mesure: 'bg-siipi-50 text-siipi-800 ring-siipi-300',
};

export function BadgeProvenance({ provenance }: { provenance: Provenance }) {
  const { t } = useTranslation();
  return (
    <span
      title={t(`national.provenance.${provenance}Aide`)}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STYLES_PROVENANCE[provenance]}`}
    >
      {t(`national.provenance.${provenance}`)}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Carte d'indicateur
   --------------------------------------------------------------------------- */

export function CarteIndicateur({
  libelle,
  valeur,
  detail,
  accent,
}: {
  libelle: string;
  valeur: ReactNode;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 ${
        accent ? 'border-siipi-300 bg-siipi-50' : 'border-ardoise-200 bg-white'
      }`}
    >
      <p className="text-xs font-semibold tracking-wide text-ardoise-500 uppercase">{libelle}</p>
      <p
        className={`chiffres-titre mt-2 text-3xl font-bold sm:text-4xl ${
          accent ? 'text-siipi-700' : 'text-ardoise-900'
        }`}
      >
        {valeur}
      </p>
      <p className="mt-1 text-sm text-ardoise-500">{detail}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Barre d'adoption
   Une proportion se lit plus vite qu'un pourcentage écrit. La valeur chiffrée
   reste affichée à côté : la barre informe, elle ne remplace pas.
   --------------------------------------------------------------------------- */

export function BarreAdoption({ actives, total }: { actives: number; total: number }) {
  const proportion = total > 0 ? (actives / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ardoise-200"
        role="img"
        aria-label={`${actives}/${total}`}
      >
        <div
          className={`h-full rounded-full ${proportion > 0 ? 'bg-siipi-500' : ''}`}
          style={{ width: `${Math.max(proportion, proportion > 0 ? 6 : 0)}%` }}
        />
      </div>
      <span className="chiffres text-xs text-ardoise-600">
        {formaterNombre(actives)}/{formaterNombre(total)}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   États de chargement et d'erreur
   --------------------------------------------------------------------------- */

export function Chargement() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ardoise-500">
      <span className="size-4 animate-spin rounded-full border-2 border-ardoise-300 border-t-siipi-600" />
      {t('commun.chargement')}
    </div>
  );
}

export function Erreur({ message, onReessayer }: { message: string; onReessayer?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="text-sm font-medium text-red-900">{message}</p>
      {onReessayer && (
        <button
          type="button"
          onClick={onReessayer}
          className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100"
        >
          {t('commun.reessayer')}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Une photo déposée sur la plateforme.

   POURQUOI UN COMPOSANT PLUTÔT QU'UNE BALISE. La lecture d'un fichier exige un
   jeton, et `<img src>` n'en transmet aucun. Glisser le jeton dans l'adresse
   l'inscrirait dans les journaux du serveur, dans l'historique du navigateur
   et dans l'en-tête « Referer » des pages visitées ensuite — pour un jeton qui
   ouvre tout le portail municipal. Les octets sont donc récupérés avec le
   jeton, puis affichés depuis la mémoire.

   L'objet-URL est libéré au démontage : une liste de réclamations parcourue
   pendant une heure retiendrait sinon toutes les photos affichées.

   TROIS ÉTATS, PAS DEUX. En cours de chargement, affichée, ou indisponible —
   et l'indisponible est DIT. Un cadre vide laisserait croire qu'il n'y a pas
   de photo, alors qu'il y en a une que l'on n'a pas le droit de voir, ou dont
   les octets manquent sur le volume.
   --------------------------------------------------------------------------- */

export function PhotoDeposee({
  chemin,
  alt,
  className,
}: {
  /** Le chemin rendu au dépôt, par exemple « /fichiers/<id> ». */
  chemin: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!chemin) return;
    let vivant = true;
    let objet: string | null = null;
    setUrl(null);
    setErreur(null);

    lireOctetsFichier(chemin)
      .then((u) => {
        objet = u;
        // Démonté entre-temps : on libère aussitôt plutôt que de poser un
        // objet-URL que plus personne ne révoquera.
        if (!vivant) { URL.revokeObjectURL(u); return; }
        setUrl(u);
      })
      .catch((err) => {
        if (vivant) setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      });

    return () => {
      vivant = false;
      if (objet) URL.revokeObjectURL(objet);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chemin]);

  if (!chemin) return null;

  if (erreur) {
    return (
      <p className="rounded-lg border border-ardoise-200 bg-ardoise-50 p-3 text-xs text-ardoise-600">
        {erreur}
      </p>
    );
  }
  if (!url) {
    return (
      <div
        className={`animate-pulse rounded-lg bg-ardoise-100 ${className ?? 'h-32 w-full max-w-xs'}`}
        role="status"
        aria-label={t('commun.chargement')}
      />
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-block">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className={className ?? 'max-h-48 w-auto rounded-lg border border-ardoise-200'}
      />
    </a>
  );
}
