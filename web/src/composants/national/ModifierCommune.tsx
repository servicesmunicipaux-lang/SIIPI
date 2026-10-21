// « Modifier » une commune, depuis l'annuaire national : un seul bouton par
// commune, et derrière lui tout ce que la FNCT peut corriger à sa place — ses
// contacts, ses limites, son logo.
//
// Trois sections d'un même écran plutôt que trois boutons dans la ligne : une
// ligne de l'annuaire qui porte « Ouvrir le portail », « Indicateurs », « Limite »
// et « Logo » côte à côte se lit mal, surtout sur téléphone. Chaque section est
// le composant que la commune a déjà sur son portail (Contacts, FormulaireLogo)
// ou que la FNCT avait déjà ici (DecoupageCommunal) : une seule façon de faire
// chaque chose, et les mêmes refus de l'API.
import { useTranslation } from 'react-i18next';
import { Contacts } from '../communal/Contacts';
import { FormulaireLogo } from '../ajout/FormulaireLogo';
import { LogoCommune } from '../LogoCommune';
import { DecoupageCommunal } from './DecoupageCommunal';

export type SectionCommune = 'contacts' | 'limites' | 'logo';
const SECTIONS: SectionCommune[] = ['contacts', 'limites', 'logo'];

export function ModifierCommune({
  communeId,
  nom,
  nomAr,
  section,
  onSection,
  onFermer,
}: {
  communeId: string;
  nom: string;
  nomAr?: string | null;
  section: SectionCommune;
  onSection: (s: SectionCommune) => void;
  /** Retour à l'annuaire. */
  onFermer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const nomAffiche = i18n.language.startsWith('ar') && nomAr ? nomAr : nom;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onFermer} className="text-sm font-medium text-siipi-700 hover:underline">
        ← {t('national.communes.retourAnnuaire')}
      </button>

      <header className="flex flex-wrap items-center gap-4 rounded-xl border border-ardoise-200 bg-white p-3 sm:p-4">
        <LogoCommune communeId={communeId} nom={nom} nomAr={nomAr} taille="moyen" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-ardoise-900">{t('national.communes.modifierTitre', { nom: nomAffiche })}</h1>
          <p className="text-sm text-ardoise-600">{t('national.communes.modifierAide')}</p>
        </div>
      </header>

      <div role="tablist" aria-label={t('national.communes.modifierSections')} className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            id={`modifier-onglet-${s}`}
            aria-selected={section === s}
            aria-controls="modifier-panneau"
            onClick={() => onSection(s)}
            className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
              section === s
                ? 'border-siipi-600 bg-siipi-600 text-white'
                : 'border-ardoise-300 bg-white text-ardoise-700 hover:bg-ardoise-100'
            }`}
          >
            {t(`national.communes.sections.${s}`)}
          </button>
        ))}
      </div>

      <div id="modifier-panneau" role="tabpanel" aria-labelledby={`modifier-onglet-${section}`}>
        {section === 'contacts' && <Contacts communeId={communeId} />}
        {section === 'limites' && <DecoupageCommunal communeId={communeId} onFermer={onFermer} />}
        {section === 'logo' && <FormulaireLogo communeId={communeId} nom={nom} nomAr={nomAr} onFait={() => undefined} />}
      </div>
    </div>
  );
}
