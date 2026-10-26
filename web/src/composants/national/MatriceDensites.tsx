// La matrice des densités (lot 17.2), dans Paramètres nationaux.
//
// La FNCT la révise comme un paramètre national : une valeur ne se réécrit pas, une
// autre s'ajoute, datée, avec sa source ; une valeur saisie à tort se retire avec
// son motif et reste lisible. Elle ne redessine pas les tranches de volume : une
// tranche nouvelle demande une décision écrite, donc une migration. « Réviser »
// reprend donc l'équipement et la tranche de la ligne.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ClasseEngin, type DensiteReference } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const decimalesUtiles = (x: number) =>
  Number.isInteger(x) ? 0 : Math.abs(x * 10 - Math.round(x * 10)) < 1e-9 ? 1 : 2;
const nombre = (x: number) => formaterNombre(x, decimalesUtiles(x));

export function MatriceDensites({ onFait, onErreur }: { onFait: (m: string) => void; onErreur: (e: unknown) => void }) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const [lignes, setLignes] = useState<DensiteReference[] | null>(null);
  const [classes, setClasses] = useState<ClasseEngin[]>([]);
  const [revision, setRevision] = useState<{ reprend: string; min: string; max: string; dateEffet: string; source: string } | null>(null);
  const [retrait, setRetrait] = useState<{ id: string; motif: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = () =>
    api
      .densites()
      .then(setLignes)
      .catch(() => setLignes([]));
  useEffect(() => {
    void charger();
    api.classesEngins().then(setClasses).catch(() => setClasses([]));
  }, []);

  if (!lignes || lignes.length === 0) return null;
  const arabe = i18n.language === 'ar';
  const equipement = (code: string) => {
    if (code === 'poubelles_conteneurs') return t('national.parametres.densites.poubelles');
    const k = classes.find((c) => c.code === code);
    return k ? (arabe ? k.libelle_ar : k.libelle_fr) : code;
  };
  const tranche = (l: DensiteReference) => {
    if (l.tranche_min_m3 == null && l.tranche_max_m3 == null) return t('national.parametres.densites.toutVolume');
    if (l.tranche_max_m3 == null) return t('national.parametres.densites.auDela', { min: nombre(l.tranche_min_m3 ?? 0) });
    return t('national.parametres.densites.entre', { min: nombre(l.tranche_min_m3 ?? 0), max: nombre(l.tranche_max_m3) });
  };
  const densite = (l: DensiteReference) =>
    l.densite_min === l.densite_max ? nombre(l.densite_min) : `${nombre(l.densite_min)} – ${nombre(l.densite_max)}`;
  // Une carte par équipement et tranche : la valeur en vigueur, puis l'historique.
  const groupes = new Map<string, DensiteReference[]>();
  for (const l of lignes) groupes.set(`${l.equipement}|${l.tranche_m3 ?? ''}`, [...(groupes.get(`${l.equipement}|${l.tranche_m3 ?? ''}`) ?? []), l]);

  async function reviser() {
    if (!revision) return;
    setEnvoi(true);
    try {
      await api.ajouterDensite({
        reprend: revision.reprend,
        densiteMin: Number(revision.min.replace(',', '.')),
        densiteMax: Number((revision.max || revision.min).replace(',', '.')),
        dateEffet: revision.dateEffet,
        source: revision.source,
      });
      setRevision(null);
      await charger();
      onFait(t('national.parametres.densites.ajoutee'));
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer() {
    if (!retrait) return;
    try {
      await api.retirerDensite(retrait.id, retrait.motif);
      setRetrait(null);
      await charger();
      onFait(t('national.parametres.densites.retiree'));
    } catch (e) {
      onErreur(e);
    }
  }

  return (
    <article className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
      <h3 className="font-semibold text-ardoise-900">{t('national.parametres.densites.titre')}</h3>
      <p className="text-sm text-ardoise-600">{t('national.parametres.densites.intro')}</p>
      <ul className="space-y-2">
        {[...groupes.values()].map((g) => {
          const enVigueur = g.find((l) => l.en_vigueur) ?? null;
          const base = enVigueur ?? g[0];
          return (
            <li key={base.id} className="space-y-1 rounded-lg bg-ardoise-50 p-3 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ardoise-900">
                  {equipement(base.equipement)} <span className="text-xs font-normal text-ardoise-600">· {tranche(base)}</span>
                </span>
                <span className="tabular-nums font-semibold text-ardoise-900">
                  {enVigueur ? <bdi dir="ltr">{densite(enVigueur)}</bdi> : t('national.parametres.densites.aucuneEnVigueur')}{enVigueur && ` ${t('national.parametres.densites.unite')}`}
                </span>
              </p>
              {enVigueur && (
                <p className="text-xs text-ardoise-600">
                  {/* La référence n'a pas de date : sa valeur d'origine porte la date technique
                      du 01/01/2000, qu'il serait faux d'afficher comme une date réelle. */}
                  {enVigueur.date_effet <= '2000-01-01'
                    ? t('national.parametres.densites.reference', { source: enVigueur.source })
                    : t('national.parametres.densites.depuis', { date: f.date(enVigueur.date_effet), source: enVigueur.source })}
                </p>
              )}
              {g.length > 1 && (
                <details className="text-xs text-ardoise-600">
                  <summary className="cursor-pointer">{t('national.parametres.densites.historique', { count: g.length })}</summary>
                  <ul className="mt-1 space-y-1">
                    {g.map((l) => (
                      <li key={l.id}>
                        {f.date(l.date_effet)} · <bdi dir="ltr">{densite(l)}</bdi> {t('national.parametres.densites.unite')} · {l.source}
                        {l.retire_le && ` · ${t('national.parametres.densites.retireeLe', { date: f.date(l.retire_le), motif: l.motif_retrait ?? '' })}`}
                        {!l.retire_le && (
                          <button
                            type="button"
                            onClick={() => setRetrait({ id: l.id, motif: '' })}
                            className="ms-2 text-red-800 underline"
                          >
                            {t('national.parametres.densites.retirer')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {retrait &&g.some((l) => l.id === retrait.id) && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs">
                    {t('national.parametres.densites.motif')}
                    <input value={retrait.motif} onChange={(e) => setRetrait({ ...retrait, motif: e.target.value })} className={champ} />
                  </label>
                  <button
                    type="button"
                    disabled={retrait.motif.trim().length < 5}
                    onClick={() => void retirer()}
                    className="min-h-11 rounded-lg bg-red-800 px-3 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {t('national.parametres.densites.confirmerRetrait')}
                  </button>
                </div>
              )}
              {revision?.reprend === base.id ? (
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="text-xs">
                    {t('national.parametres.densites.min')}
                    <input inputMode="decimal" dir="ltr" value={revision.min} onChange={(e) => setRevision({ ...revision, min: e.target.value })} className={champ} />
                  </label>
                  <label className="text-xs">
                    {t('national.parametres.densites.max')}
                    <input inputMode="decimal" dir="ltr" value={revision.max} onChange={(e) => setRevision({ ...revision, max: e.target.value })} className={champ} />
                  </label>
                  <label className="text-xs">
                    {t('national.parametres.dateEffet')}
                    <input type="date" value={revision.dateEffet} onChange={(e) => setRevision({ ...revision, dateEffet: e.target.value })} className={champ} />
                  </label>
                  <label className="text-xs sm:col-span-4">
                    {t('national.parametres.densites.source')}
                    <input value={revision.source} onChange={(e) => setRevision({ ...revision, source: e.target.value })} className={champ} />
                  </label>
                  <div className="flex gap-2 sm:col-span-4">
                    <button
                      type="button"
                      disabled={envoi || !revision.min || !revision.dateEffet || revision.source.trim().length < 5}
                      onClick={() => void reviser()}
                      className="min-h-11 rounded-lg bg-ardoise-900 px-3 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {t('national.parametres.densites.enregistrer')}
                    </button>
                    <button type="button" onClick={() => setRevision(null)} className="min-h-11 rounded-lg border border-ardoise-300 px-3 text-sm">
                      {t('commun.annuler')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setRevision({ reprend: base.id, min: '', max: '', dateEffet: '', source: '' })}
                    className="min-h-9 rounded-lg border border-ardoise-300 bg-white px-2.5 text-xs font-medium text-ardoise-700"
                  >
                    {t('national.parametres.densites.reviser')}
                  </button>
                  {/* Une valeur seule se retire ici ; sinon, depuis l'historique, ligne par ligne. */}
                  {g.length === 1 && !base.retire_le && (
                    <button type="button" onClick={() => setRetrait({ id: base.id, motif: '' })} className="text-xs text-red-800 underline">
                      {t('national.parametres.densites.retirer')}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
