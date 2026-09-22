import { useTranslation } from 'react-i18next';
import { Entete } from './composants/Entete';
import { Chargement } from './composants/Elements';
import { Connexion } from './pages/Connexion';
import { ChangerMotDePasse } from './pages/ChangerMotDePasse';
import { TableauDeBordNational } from './pages/TableauDeBordNational';
import { EspaceCitoyen } from './pages/EspaceCitoyen';
import { EspaceCommunal } from './pages/EspaceCommunal';
import { EspacePrestataire } from './pages/EspacePrestataire';
import { useAuth } from './lib/auth';
import { FournisseurPortail, usePortail } from './lib/portail';

export function App() {
  const { utilisateur, chargement } = useAuth();

  if (chargement) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Chargement />
      </div>
    );
  }

  if (!utilisateur) return <Connexion />;

  // Un mot de passe fixé par un tiers barre l'accès au reste tant qu'il n'a
  // pas été remplacé : sans cela, le cadre qui l'a dicté resterait en mesure
  // d'agir au nom de son agent, et une saisie n'engagerait plus personne.
  if (utilisateur.motDePasseProvisoire) {
    return (
      <div className="min-h-dvh">
        <Entete />
        <main>
          <ChangerMotDePasse />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <Entete />
      <main>
        {utilisateur.role === 'super_admin_fnct' && (
          <FournisseurPortail>
            <VueFnct />
          </FournisseurPortail>
        )}
        {utilisateur.role === 'citoyen' && <EspaceCitoyen />}
        {utilisateur.role === 'admin_commune' && <EspaceCommunal />}
        {utilisateur.role === 'gestionnaire_prestataire' && <EspacePrestataire />}
      </main>
    </div>
  );
}

/**
 * La FNCT voit deux choses : l'observatoire des 350 communes, et le portail
 * d'une commune qu'elle ouvre depuis l'annuaire.
 *
 * La base lui accordait déjà l'accès à tout ; c'est l'interface qui le lui
 * refusait, en ne connaissant qu'un écran national. Ouvrir un compte par
 * commune pour contourner cela aurait été la mauvaise réponse — ingérable à
 * 350, et faux dès le premier changement d'affectation.
 */
function VueFnct() {
  const { t } = useTranslation();
  const { vue, revenirObservatoire, communeOuverte, ouvrirPortail } = usePortail();

  if (vue === 'observatoire') return <TableauDeBordNational />;

  return (
    <>
      <div className="mx-auto max-w-[1100px] px-4 pt-6 sm:px-6">
        <button
          type="button"
          onClick={revenirObservatoire}
          className="text-sm font-medium text-siipi-700 hover:underline"
        >
          ← {t('national.retourObservatoire')}
        </button>
      </div>
      <EspaceCommunal
        communeImposee={communeOuverte}
        onChangerCommune={(id) => ouvrirPortail(id)}
      />
    </>
  );
}
