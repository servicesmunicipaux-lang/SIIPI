// L'identité de la commune en tête de son portail (jalon D, D1) : son logo, ou
// l'emblème à ses initiales, son nom et son gouvernorat. Sans lui, rien à
// l'écran ne disait au directeur dans quelle commune il travaillait.
//
// Le directeur de la commune et la FNCT y déposent ou changent le logo ; le
// formulaire s'ouvre sous le bandeau, comme tout formulaire du registre.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Commune } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { LogoCommune } from '../LogoCommune';
import { FormulaireLogo } from '../ajout/FormulaireLogo';

export function BandeauCommune({ communeId }: { communeId: string }) {
  const { t, i18n } = useTranslation();
  const { utilisateur } = useAuth();
  const [commune, setCommune] = useState<Commune | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [version, setVersion] = useState(0);
  const peutDeposer = utilisateur?.role === 'admin_commune' || utilisateur?.role === 'super_admin_fnct';

  useEffect(() => {
    setOuvert(false);
    void api.commune(communeId).then(setCommune).catch(() => setCommune(null));
  }, [communeId]);

  if (!commune) return null;
  const arabe = i18n.language.startsWith('ar');
  const nom = arabe && commune.name_ar ? commune.name_ar : commune.name;
  const gouvernorat = arabe && commune.gouvernorat_ar ? commune.gouvernorat_ar : commune.gouvernorat;

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ardoise-200 bg-white p-3 sm:p-4">
        <LogoCommune communeId={communeId} nom={commune.name} nomAr={commune.name_ar} taille="grand" version={version} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-ardoise-500">{t('logo.portailDe')}</p>
          <h1 className="text-xl font-bold text-ardoise-900 sm:text-2xl">{nom}</h1>
          {gouvernorat && <p className="text-sm text-ardoise-600">{t('logo.gouvernorat', { nom: gouvernorat })}</p>}
        </div>
        {peutDeposer && (
          <button
            type="button"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
            className="min-h-11 rounded-lg border border-siipi-300 bg-siipi-50 px-4 text-sm font-medium text-siipi-800"
          >
            {ouvert ? t('commun.annuler') : t('logo.gerer')}
          </button>
        )}
      </div>
      {peutDeposer && ouvert && (
        <FormulaireLogo
          communeId={communeId}
          nom={commune.name}
          nomAr={commune.name_ar}
          onFait={() => setVersion((v) => v + 1)}
          onAnnuler={() => setOuvert(false)}
        />
      )}
    </div>
  );
}
