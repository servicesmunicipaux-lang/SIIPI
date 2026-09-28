// La fiche d'évaluation annuelle d'une commune (Jalon 8) : ce que SIIPI ne
// voit pas, déclaré par la commune et validé par la FNCT.
//
// Une case vide n'est pas un zéro : elle reste « non renseignée », et sort du
// calcul de la note. Pour dire « aucun accident », on saisit 0.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement } from '../Elements';

type Drapeau = 'a_abattoir' | 'decharge_controlee_anged' | 'experience_innovante' | 'agent_reclamations';
const DRAPEAUX: Drapeau[] = ['a_abattoir', 'decharge_controlee_anged', 'experience_innovante', 'agent_reclamations'];

interface Ligne {
  valeur: string;
  cible: string;
  commentaire: string;
}

const champ = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm disabled:bg-ardoise-50';
const bouton = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-50';

/** « 12,5 » ou « 12.5 » → 12.5 ; vide → null. */
const nombre = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(/\s/g, '').replace(',', '.')));

export function FicheEvaluation({
  communeId,
  annee,
  fnct,
  onModifiee,
}: {
  communeId: string;
  annee: number;
  fnct: boolean;
  onModifiee: () => void;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const [catalogue, setCatalogue] = useState<Record<string, any>[] | null>(null);
  const [fiche, setFiche] = useState<Record<string, any> | null>(null);
  const [indications, setIndications] = useState<Record<string, any>>({});
  const [lignes, setLignes] = useState<Record<string, Ligne>>({});
  const [drapeaux, setDrapeaux] = useState<Record<Drapeau, boolean | null>>({
    a_abattoir: null,
    decharge_controlee_anged: null,
    experience_innovante: null,
    agent_reclamations: null,
  });
  const [motif, setMotif] = useState('');
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    const [cat, fe] = await Promise.all([api.kpiCatalogue(), api.ficheEvaluation(communeId, annee)]);
    setCatalogue(cat.indicateurs.filter((i) => i.mode === 'saisi'));
    setFiche(fe.fiche);
    setIndications(fe.indications ?? {});
    setLignes(
      Object.fromEntries(
        fe.valeurs.map((v) => [v.code, { valeur: String(v.valeur ?? ''), cible: v.cible == null ? '' : String(v.cible), commentaire: v.commentaire ?? '' }])
      )
    );
    setDrapeaux(Object.fromEntries(DRAPEAUX.map((d) => [d, fe.fiche?.[d] ?? null])) as Record<Drapeau, boolean | null>);
  };

  useEffect(() => {
    void charger().catch((err) => setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, annee]);

  const groupes = useMemo(() => {
    if (!catalogue) return [];
    return [
      { cle: 'M1', liste: catalogue.filter((i) => i.module === 'M1') },
      { cle: 'M2', liste: catalogue.filter((i) => i.module === 'M2') },
      { cle: 'M3', liste: catalogue.filter((i) => i.module === 'M3') },
      { cle: 'dma', liste: catalogue.filter((i) => i.famille === 'dma') },
      { cle: 'donnee', liste: catalogue.filter((i) => i.famille === 'donnee') },
    ].filter((g) => g.liste.length > 0);
  }, [catalogue]);

  if (!catalogue) return etat ? <p className="text-sm text-red-700">{etat.texte}</p> : <Chargement />;

  const statut: string = fiche?.statut ?? 'aucune';
  const verrouillee = statut === 'validee';
  const ar = i18n.language.startsWith('ar');

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
        api.enregistrerFiche(communeId, annee, {
          ...drapeaux,
          valeurs: Object.fromEntries(
            catalogue.map((i) => {
              const l = lignes[i.code];
              const v = l ? nombre(l.valeur) : null;
              // Une case vidée retire la valeur : l'indicateur redevient
              // « non renseigné » — il ne devient pas zéro.
              return [
                i.code,
                v == null ? null : { valeur: v, cible: l && nombre(l.cible) != null ? nombre(l.cible) : null, commentaire: l?.commentaire.trim() || null },
              ];
            })
          ),
        }),
      t('kpi.fiche.enregistree')
    );

  const maj = (code: string, champs: Partial<Ligne>) =>
    setLignes((x) => ({ ...x, [code]: { ...(x[code] ?? { valeur: '', cible: '', commentaire: '' }), ...champs } }));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ardoise-200 bg-white p-3">
        <p className="text-sm text-ardoise-700">
          <span className="font-medium">{t(`kpi.fiche.statuts.${statut}`)}</span>
          {fiche?.soumise_le && ` · ${t('kpi.fiche.soumiseLe', { date: f.date(fiche.soumise_le, { heure: true }) })}`}
          {fiche?.validee_le && ` · ${t('kpi.fiche.valideeLe', { date: f.date(fiche.validee_le, { heure: true }) })}`}
        </p>
        <p className="text-xs text-ardoise-500">{t('kpi.fiche.aide')}</p>
      </div>
      {fiche?.motif_renvoi && statut === 'brouillon' && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t('kpi.fiche.renvoi', { motif: fiche.motif_renvoi })}</p>
      )}
      {etat && (
        <p role={etat.type === 'ok' ? 'status' : 'alert'} className={`rounded-lg p-3 text-sm ${etat.type === 'ok' ? 'bg-siipi-50 text-siipi-800' : 'bg-red-50 text-red-800'}`}>
          {etat.texte}
        </p>
      )}

      {/* --- Ce qui décide des règles de reventilation ---------------------- */}
      <div className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
        <h2 className="font-semibold text-ardoise-900">{t('kpi.fiche.situation')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {DRAPEAUX.map((d) => (
            <fieldset key={d} className="text-sm">
              <legend className="font-medium text-ardoise-700">{t(`kpi.fiche.drapeaux.${d}`)}</legend>
              <div className="mt-1 flex gap-2">
                {[
                  [true, 'oui'],
                  [false, 'non'],
                  [null, 'nonDit'],
                ].map(([v, cle]) => (
                  <label key={String(cle)} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-ardoise-200 px-2">
                    <input
                      type="radio"
                      name={d}
                      disabled={verrouillee || enCours}
                      checked={drapeaux[d] === v}
                      onChange={() => setDrapeaux((x) => ({ ...x, [d]: v as boolean | null }))}
                    />
                    {t(`kpi.fiche.${cle}`)}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ardoise-500">{t(`kpi.fiche.effets.${d}`)}</p>
            </fieldset>
          ))}
        </div>
      </div>

      {/* --- Les valeurs --------------------------------------------------- */}
      {groupes.map((g) => (
        <div key={g.cle} className="space-y-2 rounded-xl border border-ardoise-200 bg-white p-4">
          <h2 className="font-semibold text-ardoise-900">{t(`kpi.fiche.groupes.${g.cle}`)}</h2>
          {g.cle === 'dma' && <p className="rounded bg-blue-50 p-2 text-xs text-blue-900">{t('kpi.dma.anticipation')}</p>}
          <ul className="divide-y divide-ardoise-100">
            {g.liste.map((i) => {
              const l = lignes[i.code] ?? { valeur: '', cible: '', commentaire: '' };
              const sug = suggestion[i.code];
              return (
                <li key={i.code} className="grid gap-2 py-3 lg:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm font-medium text-ardoise-900">
                      {i.module && <span className="me-2 font-mono text-xs text-ardoise-500">{i.code}</span>}
                      {ar ? i.libelle_ar : i.libelle_fr}
                      {i.points != null && <span className="ms-2 text-xs text-ardoise-500">{t('kpi.fiche.points', { n: i.points })}</span>}
                    </p>
                    <p className="text-xs text-ardoise-500">{i.description}</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-ardoise-600">
                      <span className="block">
                        {i.saisie === 'taux' ? t('kpi.fiche.taux') : i.libelle_valeur}
                        {i.unite && i.saisie !== 'taux' ? ` (${i.unite})` : i.saisie === 'taux' ? ' (%)' : ''}
                      </span>
                      <input
                        inputMode="decimal"
                        value={l.valeur}
                        disabled={verrouillee || enCours}
                        onChange={(e) => maj(i.code, { valeur: e.target.value })}
                        placeholder={t('kpi.statuts.non_renseigne')}
                        aria-label={`${i.code} — ${i.libelle_valeur ?? t('kpi.fiche.taux')}`}
                        className={`${champ} w-36`}
                      />
                    </label>
                    {i.saisie === 'ratio' && (
                      <label className="text-xs text-ardoise-600">
                        <span className="block">{i.libelle_cible}</span>
                        <input
                          inputMode="decimal"
                          value={l.cible}
                          disabled={verrouillee || enCours}
                          onChange={(e) => maj(i.code, { cible: e.target.value })}
                          aria-label={`${i.code} — ${i.libelle_cible}`}
                          className={`${champ} w-36`}
                        />
                        {sug != null && l.cible === '' && !verrouillee && (
                          <button type="button" className="block text-siipi-700 underline" onClick={() => maj(i.code, { cible: String(sug) })}>
                            {t('kpi.fiche.suggestion', { n: sug })}
                          </button>
                        )}
                      </label>
                    )}
                    <input
                      value={l.commentaire}
                      disabled={verrouillee || enCours}
                      onChange={(e) => maj(i.code, { commentaire: e.target.value })}
                      placeholder={t('kpi.fiche.commentaire')}
                      aria-label={`${i.code} — ${t('kpi.fiche.commentaire')}`}
                      maxLength={2000}
                      className={`${champ} w-48`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* --- Les étapes ------------------------------------------------------ */}
      <div className="flex flex-wrap gap-2">
        {!verrouillee && (
          <button type="button" disabled={enCours} className={boutonPrincipal} onClick={() => void enregistrer()}>
            {t('kpi.fiche.enregistrer')}
          </button>
        )}
        {(statut === 'brouillon') && (
          <button
            type="button"
            disabled={enCours}
            className={bouton}
            onClick={() => void executer(() => api.etapeFiche(communeId, annee, 'soumettre'), t('kpi.fiche.soumise'))}
          >
            {t('kpi.fiche.soumettre')}
          </button>
        )}
        {fnct && statut === 'soumise' && (
          <button
            type="button"
            disabled={enCours}
            className={boutonPrincipal}
            onClick={() => void executer(() => api.etapeFiche(communeId, annee, 'valider'), t('kpi.fiche.validee'))}
          >
            {t('kpi.fiche.valider')}
          </button>
        )}
      </div>
      {fnct && (statut === 'soumise' || statut === 'validee') && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void executer(() => api.etapeFiche(communeId, annee, 'rouvrir', motif.trim()), t('kpi.fiche.rouverte'));
          }}
        >
          <label className="min-w-64 flex-1 text-sm">
            <span className="block font-medium text-ardoise-700">{t('kpi.fiche.motifRenvoi')}</span>
            <input required minLength={5} value={motif} onChange={(e) => setMotif(e.target.value)} className={`${champ} w-full`} />
          </label>
          <button type="submit" disabled={enCours} className={bouton}>
            {t('kpi.fiche.rouvrir')}
          </button>
        </form>
      )}
    </section>
  );
}
