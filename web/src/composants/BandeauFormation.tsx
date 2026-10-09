import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

/**
 * Le bandeau d'une base de formation (décision FNCT D-FNCT-5).
 *
 * Rouge, en haut de chaque écran — connexion comprise, c'est là qu'on se trompe
 * de serveur — et sans bouton pour le fermer : un stagiaire qui saisit un
 * signalement fictif doit le savoir à chaque instant, et un agent qui croirait
 * travailler sur la vraie plateforme doit le voir avant d'écrire quoi que ce
 * soit. La nature vient de l'API, qui la tient de la base : aucun réglage de
 * l'écran ne peut la masquer.
 */
export function BandeauFormation() {
  const { t } = useTranslation();
  const [formation, setFormation] = useState(false);

  useEffect(() => {
    let actif = true;
    api
      .instance()
      .then((i) => {
        if (actif) setFormation(i.bandeauFormation);
      })
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, []);

  if (!formation) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-red-700 px-4 py-2 text-center text-sm font-bold tracking-wide text-white"
    >
      {t('formation.bandeau')}
    </div>
  );
}
