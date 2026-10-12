// Les valeurs que la commune déclare pour les indicateurs que SIIPI ne mesure
// pas (refonte, lot 1 ; décision D3). Elles valent dès qu'elles sont
// enregistrées : plus de brouillon, de soumission ni de validation. La FNCT les
// lit et peut les commenter ; elle ne les saisit pas à la place de la commune.
//
// Une case vide n'est pas un zéro : elle reste « non renseignée ». Pour dire
// « aucun accident », on saisit 0.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type DeclarationsKpi } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement } from '../Elements';

type ClefProfil = 'a_abattoir' | 'decharge_controlee_anged';
const PROFIL: ClefProfil[] = ['a_abattoir', 'decharge_controlee_anged'];

interface Ligne {
  valeur: string;
  cible: string;
  commentaire: string;
}

const champ = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm disabled:bg-ardoise-50';
const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-50';

/** « 12,5 » ou « 12.5 » → 12.5 ; vide → null. */
const nombre = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(/\s/g, '').replace(',', '.')));

export function DeclarationsIndicateurs({
  communeId,
  annee,
  fnct,
  sources = {},
  onModifiee,
}: {
  communeId: string;
  annee: number;
  /** La FNCT lit et commente ; la commune déclare. */
  fnct: boolean;
  /** La source retenue pour chaque indicateur (tableau de bord) : « mesure » signale une déclaration inutile. */
  sources?: Record<string, string | null>;
  onModifiee: () => void;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const [catalogue, setCatalogue] = useState<Record<string, any>[] | null>(null);
  const [donnees, setDonnees] = useState<DeclarationsKpi | null>(null);
  const [lignes, setLignes] = useState<Record<string, Ligne>>({});
  const [profil, setProfil] = useState<Record<ClefProfil, boolean | null>>({ a_abattoir: null, decharge_controlee_anged: null });
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    const [cat, d] = await Promise.all([api.kpiCatalogue(), api.declarationsKpi(communeId, annee)]);
    setCatalogue(cat.indicateurs.filter((i) => i.mode === 'saisi'));
    setDonnees(d);
    setLignes(
      Object.fromEntries(
        d.declarations.map((v) => [v.code, { valeur: String(v.valeur ?? ''), cible: v.cible == null ? '' : String(v.cible), commentaire: v.commentaire ?? '' }])
      )
    );
    setCommentaires(Object.fromEntries(d.declarations.map((v) => [v.code, v.commentaire_fnct ?? ''])));
    setProfil({ a_abattoir: d.profil.a_abattoir ?? null, decharge_controlee_anged: d.profil.decharge_controlee_anged ?? null });
  };

  useEffect(() => {
    void charger().catch((err) => setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, annee]);

  // Les indicateurs se lisent par axe : le regroupement par modules du barème
  // d'origine ne s'affiche plus.
  const groupes = useMemo(() => {
    if (!catalogue) return [];
    return [
      ...[1, 2, 3, 4, 5].map((axe) => ({ cle: `axe${axe}`, titre: t('kpi.axeNomme', { n: axe, nom: t(`kpi.axes.${axe}`) }), liste: catalogue.filter((i) => i.famille === 'indicateur' && i.axe === axe) })),
      { cle: 'dma', titre: t('kpi.dma.titre'), liste: catalogue.filter((i) => i.famille === 'dma') },
      { cle: 'donnee', titre: t('kpi.declarations.donnees'), liste: catalogue.filter((i) => i.famille === 'donnee') },
    ].filter((g) => g.liste.length > 0);
  }, [catalogue, t]);

  if (!catalogue || !donnees) return etat ? <p className="text-sm text-red-700">{etat.texte}</p> : <Chargement />;

  const ar = i18n.language.startsWith('ar');
  const parCode = new Map(donnees.declarations.map((d) => [d.code as string, d]));
  const indications = (donnees.indications ?? {}) as Record<string, number | null>;
  // Ce que SIIPI sait déjà, proposé comme cible — jamais posé d'office.
  const suggestion: Record<string, number | null | undefined> = {
    'M1-6': indications.effectif_ouvriers,
    'DMA-1': indications.conteneurs || null,
    'DMA-2': indications.secteurs || null,
  };

  const executer = async (tache: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setEtat(null);
    try {
      await tache();
      await charger();
      onModifiee();
      setEtat({ type: 'ok', texte });
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnCours(false);
    }
  };

  const enregistrer = () =>
    executer(
      () =>
        api.enregistrerDeclarations(communeId, annee, {
          profil,
          valeurs: Object.fromEntries(
            catalogue.map((i) => {
              const l = lignes[i.code];
              const v = l ? nombre(l.valeur) : null;
              // Une case vidée retire la déclaration : l'indicateur redevient
              // « non renseigné » — il ne devient pas zéro.
              return [
                i.code,
                v == null ? null : { valeur: v, cible: l && nombre(l.cible) != null ? nombre(l.cible) : null, commentaire: l?.commentaire.trim() || null },
              ];
            })
          ),
        }),
      t('kpi.declarations.enregistrees')
    );

  const maj = (code: string, champs: Partial<Ligne>) =>
    setLignes((x) => ({ ...x, [code]: { ...(x[code] ?? { valeur: '', cible: '', commentaire: '' }), ...champs } }));

  return (
    <section className="space-y-4">
      <p className="rounded-xl border border-ardoise-200 bg-white p-3 text-sm text-ardoise-700">
        {fnct ? t('kpi.declarations.aideFnct') : t('kpi.declarations.aide')}
      </p>
      {etat && (
        <p role={etat.type === 'ok' ? 'status' : 'alert'} className={`rounded-lg p-3 text-sm ${etat.type === 'ok' ? 'bg-siipi-50 text-siipi-800' : 'bg-red-50 text-red-800'}`}>
          {etat.texte}
        </p>
      )}

      {/* --- Ce que la commune dit d'elle-même : seul effet, « sans objet » --- */}
      <div className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
        <h2 className="font-semibold text-ardoise-900">{t('kpi.declarations.profil')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROFIL.map((d) => (
            <fieldset key={d} className="text-sm">
              <legend className="font-medium text-ardoise-700">{t(`kpi.declarations.questions.${d}`)}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {[
                  [true, 'oui'],
                  [false, 'non'],
                  [null, 'nonDit'],
                ].map(([v, cle]) => (
                  <label key={String(cle)} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-ardoise-200 px-2">
                    <input
                      type="radio"
                      name={d}
                      disabled={fnct || enCours}
                      checked={profil[d] === v}
                      onChange={() => setProfil((x) => ({ ...x, [d]: v as boolean | null }))}
                    />
                    {t(`kpi.declarations.${cle}`)}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ardoise-500">{t(`kpi.declarations.effets.${d}`)}</p>
            </fieldset>
          ))}
        </div>
      </div>

      {/* --- Les valeurs, par axe ---------------------------------------------- */}
      {groupes.map((g) => (
        <div key={g.cle} className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
          <h2 className="font-semibold text-ardoise-900">{g.titre}</h2>
          {g.cle === 'dma' && <p className="rounded bg-blue-50 p-2 text-xs text-blue-900">{t('kpi.dma.anticipation')}</p>}
          <ul className="divide-y divide-ardoise-100">
            {g.liste.map((i) => {
              const l = lignes[i.code] ?? { valeur: '', cible: '', commentaire: '' };
              const declaree = parCode.get(i.code);
              const sug = suggestion[i.code];
              return (
                <li key={i.code} className="grid gap-2 py-3 lg:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm font-medium text-ardoise-900">{ar ? i.libelle_ar : i.libelle_fr}</p>
                    <p className="text-xs text-ardoise-500">{i.description}</p>
                    {declaree && (
                      <p className="mt-1 text-xs text-blue-800">
                        {t('kpi.declaration.par', { qui: declaree.saisi_par ?? '—', date: f.date(declaree.saisi_le, { heure: true }) })}
                      </p>
                    )}
                    {declaree?.commentaire_fnct && !fnct && (
                      <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        {t('kpi.declaration.commentaireFnct', { texte: declaree.commentaire_fnct })}
                      </p>
                    )}
                    {sources[i.code] === 'mesure' && (
                      <p className="mt-1 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{t('kpi.declarations.supplanteeParMesure')}</p>
                    )}
                  </div>
                  {fnct ? (
                    <div className="space-y-2 text-sm">
                      <p className="chiffres text-ardoise-900">
                        {declaree ? (
                          <>
                            {declaree.valeur}
                            {declaree.cible != null && <span className="text-ardoise-500"> / {declaree.cible}</span>}
                            {i.unite && <span className="ms-1 text-xs text-ardoise-500">{i.unite}</span>}
                          </>
                        ) : (
                          <span className="text-ardoise-400">{t('kpi.statuts.non_renseigne')}</span>
                        )}
                      </p>
                      {declaree && (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-xs text-ardoise-600">
                            <span className="block">{t('kpi.declaration.commentaireFnctChamp')}</span>
                            <input
                              value={commentaires[i.code] ?? ''}
                              onChange={(e) => setCommentaires((c) => ({ ...c, [i.code]: e.target.value }))}
                              maxLength={2000}
                              className={`${champ} w-56`}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={enCours}
                            className={bouton}
                            onClick={() =>
                              void executer(
                                () => api.commenterDeclaration(String(declaree.id), (commentaires[i.code] ?? '').trim()),
                                t('kpi.declaration.commentaireEnregistre')
                              )
                            }
                          >
                            {t('kpi.declaration.commenter')}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-xs text-ardoise-600">
                        <span className="block">
                          {i.saisie === 'taux' ? t('kpi.declarations.taux') : i.libelle_valeur}
                          {i.unite && i.saisie !== 'taux' ? ` (${i.unite})` : i.saisie === 'taux' ? ' (%)' : ''}
                        </span>
                        <input
                          inputMode="decimal"
                          value={l.valeur}
                          disabled={enCours}
                          onChange={(e) => maj(i.code, { valeur: e.target.value })}
                          placeholder={t('kpi.statuts.non_renseigne')}
                          aria-label={`${ar ? i.libelle_ar : i.libelle_fr} — ${i.libelle_valeur ?? t('kpi.declarations.taux')}`}
                          className={`${champ} w-36`}
                        />
                      </label>
                      {i.saisie === 'ratio' && (
                        <label className="text-xs text-ardoise-600">
                          <span className="block">{i.libelle_cible}</span>
                          <input
                            inputMode="decimal"
                            value={l.cible}
                            disabled={enCours}
                            onChange={(e) => maj(i.code, { cible: e.target.value })}
                            aria-label={`${ar ? i.libelle_ar : i.libelle_fr} — ${i.libelle_cible}`}
                            className={`${champ} w-36`}
                          />
                          {sug != null && l.cible === '' && (
                            <button type="button" className="block text-siipi-700 underline" onClick={() => maj(i.code, { cible: String(sug) })}>
                              {t('kpi.declarations.suggestion', { n: sug })}
                            </button>
                          )}
                        </label>
                      )}
                      <input
                        value={l.commentaire}
                        disabled={enCours}
                        onChange={(e) => maj(i.code, { commentaire: e.target.value })}
                        placeholder={t('kpi.declarations.commentaire')}
                        aria-label={`${ar ? i.libelle_ar : i.libelle_fr} — ${t('kpi.declarations.commentaire')}`}
                        maxLength={2000}
                        className={`${champ} w-48`}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {!fnct && (
        <button type="button" disabled={enCours} className={boutonPrincipal} onClick={() => void enregistrer()}>
          {t('kpi.declarations.enregistrer')}
        </button>
      )}
    </section>
  );
}
