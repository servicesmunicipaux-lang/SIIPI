import { useTranslation } from 'react-i18next';
import { appliquerLangue, type CodeLangue } from '../i18n';
import { useAuth } from '../lib/auth';

export function SelecteurLangue() {
  const { t } = useTranslation();
  const autre = t('langue.codeAutre') as CodeLangue;
  return (
    <button
      type="button"
      onClick={() => appliquerLangue(autre)}
      lang={autre}
      className="rounded-lg border border-ardoise-300 bg-white px-3 py-1.5 text-sm font-medium text-ardoise-700 hover:bg-ardoise-100"
    >
      {t('langue.basculer')}
    </button>
  );
}

export function Entete() {
  const { t } = useTranslation();
  const { utilisateur, deconnexion } = useAuth();

  return (
    <header className="border-b border-ardoise-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-siipi-600 text-sm font-bold text-white"
          >
            ن
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ardoise-900">{t('app.nomCourt')}</p>
            <p className="truncate text-xs text-ardoise-500">
              {t('app.organisation')} · {t('app.reseau')}
            </p>
          </div>
        </div>

        <div className="ms-auto flex items-center gap-3">
          <SelecteurLangue />
          {utilisateur && (
            <>
              <div className="hidden text-end sm:block">
                <p className="text-sm font-medium text-ardoise-900">{utilisateur.fullName}</p>
                <p className="text-xs text-ardoise-500">{t(`entete.roles.${utilisateur.role}`)}</p>
              </div>
              <button
                type="button"
                onClick={deconnexion}
                className="rounded-lg border border-ardoise-300 bg-white px-3 py-1.5 text-sm font-medium text-ardoise-700 hover:bg-ardoise-100"
              >
                {t('entete.deconnexion')}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
