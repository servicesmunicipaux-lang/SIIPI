// Le logo d'une commune (jalon D, D1), ou, sans logo, un emblème neutre à ses
// initiales — jamais une image vide ou cassée.
//
// Le logo se lit avec le jeton de l'utilisateur (GET /communes/:id/logo) : une
// balise img n'en transmettrait aucun, on passe donc par un objet-URL, libéré
// quand le composant disparaît ou que le logo change. `version` force une
// nouvelle lecture après un dépôt.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lireLogoCommune } from '../lib/api';

/**
 * Deux initiales tirées du nom : les mots porteurs, sans les articles et
 * particules (« Dar Chaâbane El Fehri » → « DC »). En arabe, l'article « ال »
 * est retiré du début de chaque mot.
 */
export function initialesCommune(nom: string, arabe = false): string {
  const vides = arabe ? new Set<string>() : new Set(['el', 'al', 'de', 'des', 'du', 'la', 'le', 'les', 'ben', 'bou', 'ou', 'et']);
  // Seules les lettres comptent : « Ariana (Ville) » donne « AV », pas « A( ».
  const mots = nom
    .split(/[\s\-'’]+/)
    .map((m) => m.replace(/[^\p{L}]/gu, ''))
    .map((m) => (arabe ? m.replace(/^ال/, '') : m))
    .filter((m) => m.length > 0 && !vides.has(m.toLowerCase()));
  const lettres = (mots.length ? mots : [nom]).slice(0, 2).map((m) => m.charAt(0));
  // En arabe, les lettres seraient liées l'une à l'autre : un espace fin les garde distinctes.
  return arabe ? lettres.join(' ') : lettres.join('').toUpperCase();
}

const TAILLES = {
  petit: 'h-10 w-10 text-sm',
  moyen: 'h-14 w-14 text-lg',
  grand: 'h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl',
} as const;

export function LogoCommune({
  communeId,
  nom,
  nomAr,
  taille = 'moyen',
  version = 0,
}: {
  communeId: string;
  nom: string;
  nomAr?: string | null;
  taille?: keyof typeof TAILLES;
  version?: number;
}) {
  const { t, i18n } = useTranslation();
  const arabe = i18n.language.startsWith('ar') && !!nomAr;
  const nomAffiche = arabe ? (nomAr as string) : nom;
  // undefined : en cours de lecture ; null : aucun logo.
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let annule = false;
    let lu: string | null = null;
    setUrl(undefined);
    void lireLogoCommune(communeId)
      .then((u) => {
        lu = u;
        if (annule) {
          if (u) URL.revokeObjectURL(u);
        } else setUrl(u);
      })
      .catch(() => {
        if (!annule) setUrl(null);
      });
    return () => {
      annule = true;
      if (lu) URL.revokeObjectURL(lu);
    };
  }, [communeId, version]);

  if (url) {
    return (
      <img
        src={url}
        alt={t('logo.alt', { nom: nomAffiche })}
        className={`${TAILLES[taille]} shrink-0 rounded-xl border border-ardoise-200 bg-white object-contain p-1`}
      />
    );
  }
  // Pendant la lecture, l'emblème déjà : pas de saut de mise en page.
  return (
    <span
      role="img"
      aria-label={t('logo.emblemeAlt', { nom: nomAffiche })}
      className={`${TAILLES[taille]} inline-flex shrink-0 items-center justify-center rounded-xl border border-siipi-200 bg-siipi-50 font-bold text-siipi-700`}
    >
      {initialesCommune(nomAffiche, arabe)}
    </span>
  );
}
