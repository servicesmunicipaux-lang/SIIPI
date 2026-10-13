// La répartition d'un indicateur sur le territoire (refonte, lot 4b ;
// SPEC_refonte § 4) : une carte des gouvernorats, un graphique de répartition,
// et, pour la FNCT qui a un accès complet, la valeur de chaque commune dans un
// tableau triable.
//
// AUCUN CLASSEMENT PUBLIÉ. Les groupes du graphique sont dans l'ordre
// alphabétique, jamais rangés par valeur ; le tableau des communes ne porte pas
// de rang, et ne se trie par valeur que si la FNCT le demande, d'un clic.
//
// CHAQUE MOYENNE DIT SUR COMBIEN DE COMMUNES ELLE PORTE (« 12 communes sur
// 31 ») et combien de ces valeurs sont mesurées ou déclarées. Un gouvernorat
// sans aucune valeur reste gris sur la carte : non renseigné, pas zéro.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  api,
  ErreurApi,
  type ContoursGouvernorats,
  type IndicateurCatalogue,
  type LigneRepartition,
} from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { BoutonExport } from '../BoutonExport';
import { Chargement, Erreur } from '../Elements';

type Groupe = Extract<LigneRepartition, { cle: string }>;
type ValeurCommune = Extract<LigneRepartition, { commune_id: string }>;
type Tri = { cle: 'nom' | 'gouvernorat' | 'valeur'; sens: 1 | -1 };

// Du plus clair au plus foncé : une couleur de plus n'est pas un rang, c'est
// une valeur plus haute — la légende le dit.
const TEINTES = ['#e6f4ec', '#b7e0c6', '#7cc59b', '#3f9e6c', '#13784f'];
const GRIS = '#d1d5db';

export function RepartitionIndicateur({ annee, onOuvrirCommune }: { annee: number; onOuvrirCommune: (communeId: string) => void }) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const [catalogue, setCatalogue] = useState<IndicateurCatalogue[]>([]);
  const [code, setCode] = useState('M3-1');
  const [niveau, setNiveau] = useState<'gouvernorat' | 'district'>('gouvernorat');
  const [groupes, setGroupes] = useState<Groupe[] | null>(null);
  const [communes, setCommunes] = useState<ValeurCommune[] | null>(null);
  const [contours, setContours] = useState<ContoursGouvernorats | null>(null);
  const [districtDe, setDistrictDe] = useState<Map<string, string>>(new Map());
  const [tri, setTri] = useState<Tri>({ cle: 'nom', sens: 1 });
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    void api.catalogueIndicateurs().then((c) => setCatalogue(c.indicateurs)).catch(() => setCatalogue([]));
    void api.contoursGouvernorats().then(setContours).catch(() => setContours(null));
    void api
      .kpiDistricts()
      .then((d) => setDistrictDe(new Map(d.rattachements.map((r) => [r.gouvernorat, r.district_code]))))
      .catch(() => setDistrictDe(new Map()));
  }, []);

  useEffect(() => {
    setGroupes(null);
    setCommunes(null);
    setErreur(null);
    Promise.all([api.repartitionIndicateur(annee, code, niveau), api.repartitionIndicateur(annee, code, 'commune')])
      .then(([g, c]) => {
        setGroupes(g as Groupe[]);
        setCommunes(c as ValeurCommune[]);
      })
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [annee, code, niveau, t]);

  const indicateur = catalogue.find((c) => c.code === code);
  // Un indicateur rapporté à un objectif se compare par son taux d'atteinte ;
  // une donnée (tonnage, coût…) par sa valeur.
  const enTaux = (groupes ?? []).some((g) => g.taux_moyen != null);
  const mesure = (g: Groupe) => (enTaux ? (g.taux_moyen == null ? null : 100 * g.taux_moyen) : g.valeur_moyenne);
  const unite = enTaux ? '%' : (indicateur?.unite ?? '');
  const affiche = (v: number | null) => (v == null ? t('kpi.statuts.non_renseigne') : `${formaterNombre(v, Math.abs(v) < 10 && !Number.isInteger(v) ? 2 : 1)}${unite ? ` ${unite}` : ''}`);
  const nomGroupe = (g: Groupe) => (g.cle === 'non_rattache' ? t('kpi.national.nonRattache') : (g.nom ?? g.cle));

  // Les classes de couleur : cinq intervalles égaux entre la plus petite et la
  // plus grande valeur présente.
  const valeurs = (groupes ?? []).map(mesure).filter((v): v is number => v != null);
  const min = valeurs.length ? Math.min(...valeurs) : 0;
  const max = valeurs.length ? Math.max(...valeurs) : 0;
  const teinte = (v: number | null) => {
    if (v == null) return GRIS;
    if (max === min) return TEINTES[2];
    return TEINTES[Math.min(4, Math.floor(((v - min) / (max - min)) * 5))];
  };
  const groupeDuGouvernorat = (gouv: string) =>
    (groupes ?? []).find((g) => g.cle === (niveau === 'gouvernorat' ? gouv : (districtDe.get(gouv) ?? 'non_rattache'))) ?? null;

  const cadre = useMemo(() => {
    if (!contours?.features.length) return null;
    const b = L.geoJSON(contours as unknown as GeoJSON.GeoJsonObject).getBounds();
    return b.isValid() ? b : null;
  }, [contours]);

  const communesAffichees = useMemo(() => {
    const cle = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const r = cle(recherche.trim());
    const liste = (communes ?? []).filter((c) => !r || cle(c.nom).includes(r) || cle(c.gouvernorat).includes(r));
    return [...liste].sort((a, b) => {
      if (tri.cle === 'valeur') {
        // Le chiffre affiché : le taux d'atteinte quand l'indicateur se lit en
        // taux. Les communes sans valeur restent en bas, quel que soit le sens.
        const va = enTaux ? a.taux_atteinte : a.valeur;
        const vb = enTaux ? b.taux_atteinte : b.valeur;
        if (va == null && vb == null) return a.nom.localeCompare(b.nom);
        if (va == null) return 1;
        if (vb == null) return -1;
        return tri.sens * (va - vb);
      }
      return tri.sens * (a[tri.cle] ?? '').localeCompare(b[tri.cle] ?? '');
    });
  }, [communes, tri, recherche, enTaux]);

  const trier = (cle: Tri['cle']) => setTri((x) => ({ cle, sens: x.cle === cle ? ((-x.sens) as 1 | -1) : 1 }));

  if (erreur) return <Erreur message={erreur} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-ardoise-600">{t('national.repartition.indicateur')}</span>
          <select value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 min-h-10 max-w-full rounded-lg border border-ardoise-300 bg-white px-2 text-sm">
            {(['indicateur', 'dma', 'donnee'] as const).map((f) => (
              <optgroup key={f} label={t(`national.repartition.familles.${f}`)}>
                {catalogue
                  .filter((c) => c.famille === f)
                  .map((c) => (
                    <option key={c.code} value={c.code}>{ar ? c.libelle_ar : c.libelle_fr}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="flex gap-1" role="group" aria-label={t('kpi.national.niveau')}>
          {(['gouvernorat', 'district'] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={niveau === n}
              onClick={() => setNiveau(n)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${niveau === n ? 'bg-siipi-600 text-white' : 'bg-white text-ardoise-700 ring-1 ring-ardoise-300'}`}
            >
              {t(`kpi.national.niveaux.${n}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-ardoise-600">
        {t(enTaux ? 'national.repartition.lectureTaux' : 'national.repartition.lectureValeur')} {t('national.repartition.sansClassement')}
      </p>

      {!groupes || !communes ? (
        <Chargement />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {/* --- La carte ------------------------------------------------------ */}
            <section className="space-y-2" aria-label={t('national.repartition.carte')}>
              <div className="h-[28rem] overflow-hidden rounded-xl border border-ardoise-200 bg-white">
                {contours && cadre ? (
                  <MapContainer bounds={cadre} scrollWheelZoom={false} className="size-full">
                    <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" opacity={0.4} />
                    <GeoJSON
                      key={`${code}-${niveau}-${annee}-${districtDe.size}`}
                      data={contours as unknown as GeoJSON.GeoJsonObject}
                      style={(f) => {
                        const g = groupeDuGouvernorat(String(f?.properties?.gouvernorat));
                        // « Non rattaché » n'est pas un territoire : peint de sa moyenne,
                        // il colorerait tout gouvernorat hors district de la valeur d'une
                        // commune lointaine.
                        const colore = g && g.cle !== 'non_rattache';
                        return { color: '#374151', weight: 1, fillColor: teinte(colore ? mesure(g) : null), fillOpacity: 0.85 };
                      }}
                      onEachFeature={(f, couche) => {
                        const gouv = String(f.properties?.gouvernorat);
                        const g = groupeDuGouvernorat(gouv);
                        // Un élément rempli par textContent, pas une chaîne HTML : les
                        // noms viennent de la base, et Leaflet insérerait la chaîne
                        // telle quelle dans la page.
                        const bulle = document.createElement('div');
                        const titre = document.createElement('strong');
                        titre.textContent = niveau === 'district' && g ? `${gouv} — ${nomGroupe(g)}` : gouv;
                        bulle.append(titre);
                        for (const ligne of [affiche(g ? mesure(g) : null), g ? t('national.repartition.couverture', { n: g.communes_renseignees, total: g.communes }) : '']) {
                          if (!ligne) continue;
                          const div = document.createElement('div');
                          div.textContent = ligne;
                          bulle.append(div);
                        }
                        couche.bindTooltip(bulle, { sticky: true });
                      }}
                    />
                  </MapContainer>
                ) : (
                  <p className="p-4 text-sm text-ardoise-500">{t('national.repartition.carteIndisponible')}</p>
                )}
              </div>
              <ul className="flex flex-wrap items-center gap-3 text-xs text-ardoise-600" aria-label={t('national.repartition.legende')}>
                {/* Une seule valeur, ou toutes égales : une seule case, sans cinq
                    intervalles « 13,0–13,0 » qui ne disent rien. */}
                {valeurs.length > 0 && max === min && (
                  <li className="flex items-center gap-1">
                    <span className="inline-block size-3 rounded-sm" style={{ background: TEINTES[2] }} aria-hidden="true" />
                    <span className="chiffres" dir="ltr">{formaterNombre(min, 1)}</span>
                  </li>
                )}
                {valeurs.length > 0 &&
                  max > min &&
                  TEINTES.map((c, i) => (
                    <li key={c} className="flex items-center gap-1">
                      <span className="inline-block size-3 rounded-sm" style={{ background: c }} aria-hidden="true" />
                      <span className="chiffres" dir="ltr">
                        {formaterNombre(min + ((max - min) * i) / 5, 1)}–{formaterNombre(min + ((max - min) * (i + 1)) / 5, 1)}
                      </span>
                    </li>
                  ))}
                <li className="flex items-center gap-1">
                  <span className="inline-block size-3 rounded-sm" style={{ background: GRIS }} aria-hidden="true" />
                  {t('kpi.statuts.non_renseigne')}
                </li>
              </ul>
            </section>

            {/* --- Le graphique de répartition (ordre alphabétique) ---------------- */}
            <section className="space-y-2" aria-label={t('national.repartition.graphique')}>
              <div className="rounded-xl border border-ardoise-200 bg-white p-2" dir="ltr" style={{ height: Math.max(220, groupes.length * 22 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={groupes.map((g) => ({ nom: nomGroupe(g), v: mesure(g), n: g.communes_renseignees, total: g.communes }))} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="nom" width={110} tick={{ fontSize: 11 }} interval={0} />
                    <Tooltip
                      formatter={(v, _n, item) => [
                        `${affiche(typeof v === 'number' ? v : null)} — ${t('national.repartition.couverture', { n: item.payload.n, total: item.payload.total })}`,
                        ar ? (indicateur?.libelle_ar ?? '') : (indicateur?.libelle_fr ?? ''),
                      ]}
                      contentStyle={{ fontSize: 12, direction: ar ? 'rtl' : 'ltr' }}
                    />
                    <Bar dataKey="v" fill="#3f9e6c" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* --- Le tableau par groupe : la moyenne et sur combien de communes ---- */}
          <section className="space-y-2" aria-labelledby="repartition-groupes">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="repartition-groupes" className="text-sm font-semibold text-ardoise-800">{t(`national.repartition.parNiveau.${niveau}`)}</h3>
              <BoutonExport chemin={`/kpi/repartition?${new URLSearchParams({ annee: String(annee), code, niveau }).toString()}`} />
            </div>
            <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="border-b border-ardoise-200 bg-ardoise-50 text-xs text-ardoise-500">
                  <tr>
                    <th className="px-3 py-2 text-start">{t(`kpi.national.niveaux.${niveau}`)}</th>
                    <th className="px-3 py-2 text-end">{t('national.repartition.moyenne')}</th>
                    <th className="px-3 py-2 text-start">{t('national.repartition.couvertureColonne')}</th>
                    <th className="px-3 py-2 text-end">{t('kpi.sources.mesure')}</th>
                    <th className="px-3 py-2 text-end">{t('kpi.sources.declare')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupes.map((g) => (
                    <tr key={g.cle} className="border-t border-ardoise-100">
                      <td className="px-3 py-2 font-medium text-ardoise-900">{nomGroupe(g)}</td>
                      <td className={`chiffres px-3 py-2 text-end ${mesure(g) == null ? 'text-ardoise-400' : ''}`}>{affiche(mesure(g))}</td>
                      <td className="px-3 py-2 text-ardoise-700">{t('national.repartition.couverture', { n: g.communes_renseignees, total: g.communes })}</td>
                      <td className="chiffres px-3 py-2 text-end">{formaterNombre(g.communes_mesurees)}</td>
                      <td className="chiffres px-3 py-2 text-end">{formaterNombre(g.communes_declarees)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* --- Le détail par commune (FNCT) : triable, sans rang ------------------ */}
          <section className="space-y-2" aria-labelledby="repartition-communes">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="repartition-communes" className="text-sm font-semibold text-ardoise-800">{t('national.repartition.parCommune')}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder={t('national.repartition.rechercher')}
                  aria-label={t('national.repartition.rechercher')}
                  className="min-h-10 rounded-lg border border-ardoise-300 px-3 text-sm"
                />
                <BoutonExport chemin={`/kpi/repartition?${new URLSearchParams({ annee: String(annee), code, niveau: 'commune' }).toString()}`} />
              </div>
            </div>
            <div className="max-h-[32rem] overflow-auto rounded-xl border border-ardoise-200 bg-white">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="sticky top-0 border-b border-ardoise-200 bg-ardoise-50 text-xs text-ardoise-500">
                  <tr>
                    {(['nom', 'gouvernorat', 'valeur'] as const).map((c) => (
                      <th key={c} className={`px-3 py-2 ${c === 'valeur' ? 'text-end' : 'text-start'}`} aria-sort={tri.cle === c ? (tri.sens === 1 ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => trier(c)} className="min-h-8 font-semibold uppercase hover:text-ardoise-800">
                          {t(`national.repartition.colonnes.${c}`)} {tri.cle === c ? (tri.sens === 1 ? '▲' : '▼') : '⇅'}
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-start">{t('kpi.panneau.colonnes.source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {communesAffichees.map((c) => (
                    <tr key={c.commune_id} className="border-t border-ardoise-100">
                      <td className="px-3 py-1.5">
                        <button type="button" className="text-start font-medium text-siipi-700 hover:underline" onClick={() => onOuvrirCommune(c.commune_id)}>
                          {ar && c.nom_ar ? c.nom_ar : c.nom}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-ardoise-700">{c.gouvernorat}</td>
                      <td className={`chiffres px-3 py-1.5 text-end ${c.valeur == null ? 'text-ardoise-400' : ''}`}>
                        {c.statut === 'sans_objet' ? t('kpi.statuts.sans_objet') : c.valeur == null ? t('kpi.statuts.non_renseigne') : affiche(enTaux && c.taux_atteinte != null ? 100 * c.taux_atteinte : c.valeur)}
                      </td>
                      <td className="px-3 py-1.5 text-xs">{c.source ? t(`kpi.sources.${c.source}`) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
