// Déclarer la valeur d'UN indicateur (refonte, lot 3b) — depuis le panneau
// « il manque » de l'écran Indicateurs.
//
// La valeur déclarée vaut dès son enregistrement (D3) : badge « déclaré », qui
// l'a saisie et quand. Un ratio se déclare avec sa cible ; un taux ne dépasse
// pas 100 — la base le refuse sinon, et son message s'affiche tel quel. Un
// indicateur CALCULÉ ne se déclare jamais : on complète ses données sources.
//
// La feuille annuelle de toutes les déclarations reste dans l'onglet
// « Déclarations » ; ici, une seule valeur, sur place.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type IndicateurCatalogue } from '../../lib/api';
import { CadreAjout, champAjout } from './CadreAjout';

/** « 12,5 » ou « 12.5 » → 12.5 ; vide → null. */
const nombre = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(/\s/g, '').replace(',', '.')));

export function FormulaireDeclaration({
  communeId,
  annee,
  indicateur,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  annee: number;
  indicateur: IndicateurCatalogue;
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [valeur, setValeur] = useState('');
  const [cible, setCible] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const ratio = indicateur.saisie === 'ratio';
  const v = nombre(valeur);
  const c = nombre(cible);
  const valide =
    v !== null && Number.isFinite(v) && v >= 0 &&
    (indicateur.saisie !== 'taux' || v <= 100) &&
    (!ratio || (c !== null && Number.isFinite(c) && c > 0));
  const libelle = i18n.language.startsWith('ar') ? indicateur.libelle_ar : indicateur.libelle_fr;

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.enregistrerDeclarations(communeId, annee, {
        valeurs: { [indicateur.code]: { valeur: v as number, cible: ratio ? c : null, commentaire: commentaire.trim() || null } },
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <CadreAjout
      id={`declaration-${indicateur.code}`}
      titre={t('ajout.declaration.titre', { indicateur: libelle, annee })}
      aide={t('ajout.declaration.aide')}
      erreur={erreur}
      enregistrable={valide}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor={`decl-valeur-${indicateur.code}`}>
          {indicateur.libelle_valeur ?? t('ajout.declaration.valeur')}
          {indicateur.unite && <span className="text-ardoise-500"> ({indicateur.unite})</span>}
          <input
            id={`decl-valeur-${indicateur.code}`}
            inputMode="decimal"
            dir="ltr"
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            className={champAjout}
          />
          {indicateur.saisie === 'taux' && <span className="mt-1 block text-xs text-ardoise-500">{t('ajout.declaration.taux')}</span>}
        </label>
        {ratio && (
          <label className="text-sm" htmlFor={`decl-cible-${indicateur.code}`}>
            {indicateur.libelle_cible ?? t('ajout.declaration.cible')}
            <input
              id={`decl-cible-${indicateur.code}`}
              inputMode="decimal"
              dir="ltr"
              value={cible}
              onChange={(e) => setCible(e.target.value)}
              className={champAjout}
            />
            <span className="mt-1 block text-xs text-ardoise-500">{t('ajout.declaration.cibleAide')}</span>
          </label>
        )}
        <label className="text-sm sm:col-span-2" htmlFor={`decl-commentaire-${indicateur.code}`}>
          {t('ajout.declaration.commentaire')}
          <input
            id={`decl-commentaire-${indicateur.code}`}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            maxLength={500}
            className={champAjout}
          />
        </label>
      </div>
    </CadreAjout>
  );
}
