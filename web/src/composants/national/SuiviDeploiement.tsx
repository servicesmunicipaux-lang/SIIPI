// Le suivi du déploiement, en tête de la synthèse nationale (refonte, lot 4b ;
// SPEC_refonte § 4).
//
// Une question d'abord : combien de communes UTILISENT la plateforme, mois
// après mois ? Une commune « saisit » quand elle-même — son directeur, ou le
// prestataire qui travaille pour elle — enregistre quelque chose dans le mois ;
// une écriture de la FNCT sur sa fiche ne compte pas (migration 072). Une
// commune qui a commencé puis plus rien ce mois-là est « inactive » : c'est elle
// qu'il faut appeler.
//
// Les chiffres du graphique sont aussi dans un tableau, et le tableau par
// gouvernorat ou par district est dans l'ordre alphabétique — c'est un suivi,
// pas un palmarès.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, ErreurApi, type LigneActivite, type NiveauActivite } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { BoutonExport } from '../BoutonExport';
import { Chargement } from '../Elements';
import { ChiffreCle } from '../ui/ChiffreCle';
import { Pastille, type TonPastille } from '../ui/Pastille';
import { bornesFenetre, libelleMois } from '../kpi/temps';

/** Le ton de la pastille de chaque catégorie : le mot et le dessin disent ce que la couleur ne dit pas seule. */
const TON: Record<string, TonPastille> = { saisissent: 'mesure', inactives: 'attention', pas_demarrees: 'neutre', desactivees: 'neutre' };

const CATEGORIES = [
  { cle: 'saisissent', couleur: '#13784f' },
  { cle: 'inactives', couleur: '#d97706' },
  { cle: 'pas_demarrees', couleur: '#cfd5dc' },
  { cle: 'desactivees', couleur: '#4b5563' },
] as const;

export function SuiviDeploiement() {
  const { t, i18n } = useTranslation();
  const [national, setNational] = useState<LigneActivite[] | null>(null);
  const [groupes, setGroupes] = useState<LigneActivite[] | null>(null);
  const [niveau, setNiveau] = useState<Exclude<NiveauActivite, 'national'>>('gouvernorat');
  const [erreur, setErreur] = useState<string | null>(null);
  const b = useMemo(() => bornesFenetre(new Date().getFullYear(), '12m'), []);

  useEffect(() => {
    api
      .activiteCommunes(b.debut, b.fin, 'national')
      .then(setNational)
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [b, t]);

  useEffect(() => {
    setGroupes(null);
    // Le tableau porte sur le dernier mois : le mois en cours.
    api
      .activiteCommunes(`${b.fin.slice(0, 7)}-01`, b.fin, niveau)
      .then(setGroupes)
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [b, niveau, t]);

  if (erreur) return <p role="alert" className="mb-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>;
  if (!national) return <Chargement />;

  const donnees = national.map((l) => ({ ...l, libelle: libelleMois(l.mois.slice(0, 7), i18n.language) }));
  const dernier = national[national.length - 1];
  const parametresExport = (n: NiveauActivite, debut: string) => `/observatoire/activite?${new URLSearchParams({ debut, fin: b.fin, niveau: n }).toString()}`;

  return (
    <section className="mb-10 space-y-4" aria-labelledby="suivi-deploiement">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="suivi-deploiement" className="text-lg font-semibold text-ardoise-900">{t('national.deploiement.titre')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('national.deploiement.aide')}</p>
        </div>
        <BoutonExport chemin={parametresExport('national', b.debut)} />
      </div>

      {dernier && (
        <div className="rounded-lg border border-ardoise-200 bg-white p-4">
          {/* La phrase entière reste pour les lecteurs d'écran ; les chiffres en grand sont pour l'œil. */}
          <p className="sr-only">
            {t('national.deploiement.phrase', {
              mois: libelleMois(dernier.mois.slice(0, 7), i18n.language),
              saisissent: formaterNombre(dernier.saisissent),
              inactives: formaterNombre(dernier.inactives),
              pasDemarrees: formaterNombre(dernier.pas_demarrees),
              desactivees: formaterNombre(dernier.desactivees),
              total: formaterNombre(dernier.communes),
            })}
          </p>
          <p className="text-sm text-ardoise-600" aria-hidden="true">
            {t('national.deploiement.enMois', { mois: libelleMois(dernier.mois.slice(0, 7), i18n.language), total: formaterNombre(dernier.communes) })}
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4" aria-hidden="true">
            {CATEGORIES.map((c) => (
              <li key={c.cle} className="space-y-2">
                <Pastille ton={TON[c.cle]}>{t(`national.deploiement.categories.${c.cle}`)}</Pastille>
                <p><ChiffreCle valeur={formaterNombre(dernier[c.cle])} taille="lg" /></p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Le temps de gauche à droite, en arabe aussi (SPEC § 6). */}
      <div className="h-64 w-full rounded-xl border border-ardoise-200 bg-white p-2" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={donnees} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="libelle" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, direction: i18n.language.startsWith('ar') ? 'rtl' : 'ltr' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {CATEGORIES.map((c) => (
              <Bar key={c.cle} dataKey={c.cle} name={t(`national.deploiement.categories.${c.cle}`)} stackId="communes" fill={c.couleur} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="rounded-xl border border-ardoise-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-medium text-ardoise-800">{t('national.deploiement.chiffres')}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-ardoise-500">
              <tr>
                <th className="px-2 py-1 text-start">{t('national.deploiement.mois')}</th>
                {CATEGORIES.map((c) => (
                  <th key={c.cle} className="px-2 py-1 text-end">{t(`national.deploiement.categories.${c.cle}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {donnees.map((l) => (
                <tr key={l.mois} className="border-t border-ardoise-100">
                  <td className="px-2 py-1">{l.libelle}</td>
                  {CATEGORIES.map((c) => (
                    <td key={c.cle} className="chiffres px-2 py-1 text-end">{formaterNombre(l[c.cle])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ardoise-800">
            {t('national.deploiement.ceMois', { mois: libelleMois(b.fin.slice(0, 7), i18n.language) })}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="group" aria-label={t('national.deploiement.niveau')}>
              {(['gouvernorat', 'district'] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={niveau === n}
                  onClick={() => setNiveau(n)}
                  className={`min-h-9 rounded-full px-3 text-xs font-medium ${niveau === n ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 ring-1 ring-ardoise-300'}`}
                >
                  {t(`kpi.national.niveaux.${n}`)}
                </button>
              ))}
            </div>
            <BoutonExport chemin={parametresExport(niveau, `${b.fin.slice(0, 7)}-01`)} desactive={!groupes?.length} />
          </div>
        </div>
        {!groupes ? (
          <Chargement />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-ardoise-200 bg-ardoise-50 text-xs text-ardoise-500">
                <tr>
                  <th className="px-3 py-2 text-start">{t(`kpi.national.niveaux.${niveau}`)}</th>
                  <th className="px-3 py-2 text-end">{t('national.deploiement.communes')}</th>
                  {CATEGORIES.map((c) => (
                    <th key={c.cle} className="px-3 py-2 text-end">{t(`national.deploiement.categories.${c.cle}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => (
                  <tr key={g.cle} className="border-t border-ardoise-100">
                    <td className="px-3 py-2 font-medium text-ardoise-900">
                      {g.cle === 'non_rattache' ? <span className="text-ardoise-500">{t('kpi.national.nonRattache')}</span> : (g.nom ?? g.cle)}
                    </td>
                    <td className="chiffres px-3 py-2 text-end">{formaterNombre(g.communes)}</td>
                    {CATEGORIES.map((c) => (
                      <td key={c.cle} className={`chiffres px-3 py-2 text-end ${g[c.cle] === 0 ? 'text-ardoise-300' : ''}`}>{formaterNombre(g[c.cle])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
