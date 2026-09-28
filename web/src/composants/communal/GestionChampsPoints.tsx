// Les colonnes libres et les étiquettes du tableau des points — ce que la
// commune définit elle-même, sans développeur (Jalon 6, B3.4 et B3.5).
//
// Le type d'un champ ne se change pas une fois créé : les valeurs déjà
// saisies ne le suivraient pas. On le dit à l'écran plutôt que de laisser
// découvrir le refus de l'API.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ChampPoint, type EtiquettePoint } from '../../lib/api';
import { COULEURS, PastilleEtiquette } from './valeursChamps';

const TYPES = ['oui_non', 'texte', 'nombre', 'liste', 'date'] as const;
const champSaisie = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm';
const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-10 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white hover:bg-siipi-700 disabled:opacity-50';

/** « bon, abîmé , absent » → ['bon', 'abîmé', 'absent'] */
const lireOptions = (texte: string) => texte.split(/[,;\n]/).map((o) => o.trim()).filter(Boolean);

export function GestionChampsPoints({
  communeId,
  champs,
  etiquettes,
  onModifie,
}: {
  communeId: string;
  champs: ChampPoint[];
  etiquettes: EtiquettePoint[];
  onModifie: () => void;
}) {
  const { t } = useTranslation();
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState({ libelle: '', libelleAr: '', type: 'oui_non' as (typeof TYPES)[number], options: '' });
  const [nouvelle, setNouvelle] = useState({ nom: '', couleur: 'vert' });
  const [edition, setEdition] = useState<{ id: string; libelle: string; libelleAr: string; options: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const executer = async (tache: () => Promise<unknown>, apres?: () => void) => {
    setEnCours(true);
    setErreur(null);
    try {
      await tache();
      apres?.();
      onModifie();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="grid gap-4 rounded-xl border border-ardoise-200 bg-white p-4 lg:grid-cols-2">
      {erreur && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 lg:col-span-2">
          {erreur}
        </p>
      )}

      {/* --- Champs --------------------------------------------------------- */}
      <div className="space-y-3">
        <h2 className="font-semibold text-ardoise-900">{t('communal.points.champs.titre')}</h2>
        {champs.length === 0 ? (
          <p className="text-sm text-ardoise-500">{t('communal.points.champs.aucun')}</p>
        ) : (
          <ul className="divide-y divide-ardoise-100 rounded-lg border border-ardoise-200">
            {champs.map((c) =>
              edition?.id === c.id ? (
                <li key={c.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={edition.libelle}
                      onChange={(e) => setEdition({ ...edition, libelle: e.target.value })}
                      aria-label={t('communal.points.champs.libelle')}
                      className={champSaisie}
                    />
                    <input
                      dir="rtl"
                      value={edition.libelleAr}
                      onChange={(e) => setEdition({ ...edition, libelleAr: e.target.value })}
                      aria-label={t('communal.points.champs.libelleAr')}
                      placeholder={t('communal.points.champs.libelleAr')}
                      className={champSaisie}
                    />
                  </div>
                  {c.type === 'liste' && (
                    <input
                      value={edition.options}
                      onChange={(e) => setEdition({ ...edition, options: e.target.value })}
                      aria-label={t('communal.points.champs.options')}
                      className={`${champSaisie} w-full`}
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={enCours || !edition.libelle.trim()}
                      className={boutonPrincipal}
                      onClick={() =>
                        void executer(
                          () =>
                            api.modifierChampPoint(c.id, {
                              libelle: edition.libelle.trim(),
                              libelleAr: edition.libelleAr.trim() || null,
                              ...(c.type === 'liste' ? { options: lireOptions(edition.options) } : {}),
                            }),
                          () => setEdition(null)
                        )
                      }
                    >
                      {t('communal.points.enregistrer')}
                    </button>
                    <button type="button" className={bouton} onClick={() => setEdition(null)}>
                      {t('commun.annuler')}
                    </button>
                  </div>
                </li>
              ) : (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <p className="font-medium text-ardoise-900">
                      {c.libelle}
                      {c.libelle_ar && <span className="ms-2 text-ardoise-500" dir="rtl">{c.libelle_ar}</span>}
                    </p>
                    <p className="text-xs text-ardoise-500">
                      {t(`communal.points.champs.types.${c.type}`)}
                      {c.type === 'liste' && ` : ${c.options.join(', ')}`}
                      {' · '}
                      {t('communal.points.champs.renseignes', { count: c.nb_renseignes ?? 0 })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={bouton}
                      onClick={() =>
                        setEdition({ id: c.id, libelle: c.libelle, libelleAr: c.libelle_ar ?? '', options: c.options.join(', ') })
                      }
                    >
                      {t('communal.points.modifier')}
                    </button>
                    <button
                      type="button"
                      className={bouton}
                      disabled={enCours}
                      onClick={() => {
                        if (window.confirm(t('communal.points.champs.confirmerRetrait', { nom: c.libelle, count: c.nb_renseignes ?? 0 })))
                          void executer(() => api.retirerChampPoint(c.id));
                      }}
                    >
                      {t('communal.points.retirer')}
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}

        <form
          className="space-y-2 rounded-lg bg-ardoise-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void executer(
              () =>
                api.creerChampPoint(communeId, {
                  libelle: nouveau.libelle.trim(),
                  libelleAr: nouveau.libelleAr.trim() || null,
                  type: nouveau.type,
                  ...(nouveau.type === 'liste' ? { options: lireOptions(nouveau.options) } : {}),
                }),
              () => setNouveau({ libelle: '', libelleAr: '', type: 'oui_non', options: '' })
            );
          }}
        >
          <p className="text-sm font-medium text-ardoise-800">{t('communal.points.champs.ajouter')}</p>
          <div className="flex flex-wrap gap-2">
            <input
              required
              maxLength={80}
              value={nouveau.libelle}
              onChange={(e) => setNouveau({ ...nouveau, libelle: e.target.value })}
              placeholder={t('communal.points.champs.exemple')}
              aria-label={t('communal.points.champs.libelle')}
              className={`${champSaisie} min-w-48 flex-1`}
            />
            <input
              dir="rtl"
              maxLength={80}
              value={nouveau.libelleAr}
              onChange={(e) => setNouveau({ ...nouveau, libelleAr: e.target.value })}
              placeholder={t('communal.points.champs.libelleAr')}
              aria-label={t('communal.points.champs.libelleAr')}
              className={`${champSaisie} min-w-40`}
            />
            <select
              value={nouveau.type}
              onChange={(e) => setNouveau({ ...nouveau, type: e.target.value as (typeof TYPES)[number] })}
              aria-label={t('communal.points.champs.type')}
              className={champSaisie}
            >
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`communal.points.champs.types.${ty}`)}
                </option>
              ))}
            </select>
          </div>
          {nouveau.type === 'liste' && (
            <input
              required
              value={nouveau.options}
              onChange={(e) => setNouveau({ ...nouveau, options: e.target.value })}
              placeholder={t('communal.points.champs.optionsAide')}
              aria-label={t('communal.points.champs.options')}
              className={`${champSaisie} w-full`}
            />
          )}
          <p className="text-xs text-ardoise-500">{t('communal.points.champs.typeFixe')}</p>
          <button type="submit" disabled={enCours} className={boutonPrincipal}>
            {t('communal.points.champs.creer')}
          </button>
        </form>
      </div>

      {/* --- Étiquettes ----------------------------------------------------- */}
      <div className="space-y-3">
        <h2 className="font-semibold text-ardoise-900">{t('communal.points.etiquettes.titre')}</h2>
        {etiquettes.length === 0 ? (
          <p className="text-sm text-ardoise-500">{t('communal.points.etiquettes.aucune')}</p>
        ) : (
          <ul className="divide-y divide-ardoise-100 rounded-lg border border-ardoise-200">
            {etiquettes.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="flex items-center gap-2">
                  <PastilleEtiquette etiquette={e} />
                  <span className="text-xs text-ardoise-500">{t('communal.points.etiquettes.nbPoints', { count: e.nb_points ?? 0 })}</span>
                </span>
                <span className="flex gap-2">
                  <select
                    value={e.couleur}
                    onChange={(ev) => void executer(() => api.modifierEtiquette(e.id, { couleur: ev.target.value as EtiquettePoint['couleur'] }))}
                    aria-label={t('communal.points.etiquettes.couleur')}
                    className={champSaisie}
                  >
                    {COULEURS.map((c) => (
                      <option key={c} value={c}>
                        {t(`communal.points.couleurs.${c}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={bouton}
                    onClick={() => {
                      const nom = window.prompt(t('communal.points.etiquettes.renommer'), e.nom);
                      if (nom && nom.trim() && nom.trim() !== e.nom) void executer(() => api.modifierEtiquette(e.id, { nom: nom.trim() }));
                    }}
                  >
                    {t('communal.points.modifier')}
                  </button>
                  <button
                    type="button"
                    className={bouton}
                    disabled={enCours}
                    onClick={() => {
                      if (window.confirm(t('communal.points.etiquettes.confirmerRetrait', { nom: e.nom, count: e.nb_points ?? 0 })))
                        void executer(() => api.retirerEtiquette(e.id));
                    }}
                  >
                    {t('communal.points.retirer')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg bg-ardoise-50 p-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            void executer(
              () => api.creerEtiquette(communeId, { nom: nouvelle.nom.trim(), couleur: nouvelle.couleur as EtiquettePoint['couleur'] }),
              () => setNouvelle({ nom: '', couleur: nouvelle.couleur })
            );
          }}
        >
          <label className="flex-1 text-sm">
            <span className="block text-xs text-ardoise-600">{t('communal.points.etiquettes.ajouter')}</span>
            <input
              required
              maxLength={60}
              value={nouvelle.nom}
              onChange={(e) => setNouvelle({ ...nouvelle, nom: e.target.value })}
              placeholder={t('communal.points.etiquettes.exemple')}
              className={`${champSaisie} w-full`}
            />
          </label>
          <select
            value={nouvelle.couleur}
            onChange={(e) => setNouvelle({ ...nouvelle, couleur: e.target.value })}
            aria-label={t('communal.points.etiquettes.couleur')}
            className={champSaisie}
          >
            {COULEURS.map((c) => (
              <option key={c} value={c}>
                {t(`communal.points.couleurs.${c}`)}
              </option>
            ))}
          </select>
          <button type="submit" disabled={enCours} className={boutonPrincipal}>
            {t('communal.points.etiquettes.creer')}
          </button>
        </form>
      </div>
    </section>
  );
}
