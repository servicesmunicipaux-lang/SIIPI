// La carte du déploiement, sous les chiffres-clés de la synthèse nationale
// (jalon D, lot D3b ; SPEC_D § D3 : « puis la carte des gouvernorats et districts »).
//
// Chaque territoire est teinté selon la PART de ses communes qui saisissent ce
// mois-ci — une commune « saisit » quand elle-même, ou son prestataire,
// enregistre une donnée (migration 072). La bulle dit « N communes sur M » : le
// dénominateur est toujours là.
//
// CE N'EST PAS UN PALMARÈS. Un territoire où aucune commune ne saisit reste GRIS :
// c'est « pas encore », pas « mauvais » — la même règle que la carte de répartition
// d'un indicateur (règle 1.1). Les territoires se listent dans l'ordre
// alphabétique, jamais classés, et la teinte n'a que cinq niveaux : une nuance
// de plus ferait lire une différence de deux points comme un écart de mérite.

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ContoursGouvernorats, type LigneActivite } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { Chargement } from '../Elements';
import { FondsDeCarte } from '../carte/FondsDeCarte';
import { bornesFenetre } from '../kpi/temps';

/** Cinq teintes du vert de la plateforme, de la plus claire à la plus soutenue. */
const TEINTES = ['#d3f2e1', '#a9e5c5', '#3fb47e', '#13784f', '#0f3f2c'];
const GRIS = '#dde1e6';
/** Les bornes des cinq teintes, en pourcentage des communes d'un territoire qui saisissent. */
const CLASSES = ['< 20', '20–39', '40–59', '60–79', '≥ 80'];

export function CarteDeploiement() {
  const { t } = useTranslation();
  const [niveau, setNiveau] = useState<'gouvernorat' | 'district'>('gouvernorat');
  const [groupes, setGroupes] = useState<LigneActivite[] | null>(null);
  const [contours, setContours] = useState<ContoursGouvernorats | null>(null);
  const [districtDe, setDistrictDe] = useState<Map<string, string>>(new Map());
  const [erreur, setErreur] = useState<string | null>(null);
  const b = useMemo(() => bornesFenetre(new Date().getFullYear(), '12m'), []);

  useEffect(() => {
    void api.contoursGouvernorats().then(setContours).catch(() => setContours(null));
    void api
      .kpiDistricts()
      .then((d) => setDistrictDe(new Map(d.rattachements.map((r) => [r.gouvernorat, r.district_code]))))
      .catch(() => setDistrictDe(new Map()));
  }, []);

  useEffect(() => {
    setGroupes(null);
    // Le dernier mois : le mois en cours, comme le tableau du suivi.
    api
      .activiteCommunes(`${b.fin.slice(0, 7)}-01`, b.fin, niveau)
      .then(setGroupes)
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [b, niveau, t]);

  const cadre = useMemo(() => {
    if (!contours?.features.length) return null;
    const bornes = L.geoJSON(contours as unknown as GeoJSON.GeoJsonObject).getBounds();
    return bornes.isValid() ? bornes : null;
  }, [contours]);

  const groupeDe = (gouvernorat: string) =>
    (groupes ?? []).find((g) => g.cle === (niveau === 'gouvernorat' ? gouvernorat : (districtDe.get(gouvernorat) ?? 'non_rattache'))) ?? null;

  /** La part des communes qui saisissent, de 0 à 1 ; null quand le territoire n'a pas de commune connue. */
  const part = (g: LigneActivite | null) => (g && g.communes > 0 ? g.saisissent / g.communes : null);
  const teinte = (g: LigneActivite | null) => {
    const p = part(g);
    // Aucune commune qui saisit : gris, jamais la plus claire des teintes (qui dirait « un peu »).
    if (p === null || p === 0) return GRIS;
    return TEINTES[Math.min(4, Math.floor(p * 5))];
  };
  const nomDe = (g: LigneActivite) => (g.cle === 'non_rattache' ? t('kpi.national.nonRattache') : (g.nom ?? g.cle));

  // Les territoires où au moins une commune saisit, dans l'ordre alphabétique : un suivi, pas un palmarès.
  const territoires = [...(groupes ?? [])]
    .filter((g) => g.cle !== 'non_rattache' && g.saisissent > 0)
    .sort((x, y) => nomDe(x).localeCompare(nomDe(y), 'fr'));

  if (erreur) return <p role="alert" className="mb-8 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>;

  return (
    <section className="mb-10 space-y-3" aria-labelledby="carte-deploiement">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="carte-deploiement" className="text-lg font-semibold text-ardoise-900">{t('national.carteDeploiement.titre')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('national.carteDeploiement.aide')}</p>
        </div>
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
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-[28rem] overflow-hidden rounded-lg border border-ardoise-200 bg-white">
          {!groupes || !contours ? (
            <Chargement />
          ) : cadre ? (
            <MapContainer bounds={cadre} scrollWheelZoom={false} className="size-full">
              <FondsDeCarte choix={false} opacite={0.4} />
              <GeoJSON
                key={`${niveau}-${groupes.length}-${districtDe.size}`}
                data={contours as unknown as GeoJSON.GeoJsonObject}
                style={(f) => {
                  const g = groupeDe(String(f?.properties?.gouvernorat));
                  // « Non rattaché » n'est pas un territoire : le peindre colorerait tout
                  // gouvernorat hors district de la valeur d'une commune lointaine.
                  const colore = g && g.cle !== 'non_rattache';
                  return { color: '#374151', weight: 1, fillColor: colore ? teinte(g) : GRIS, fillOpacity: 0.85 };
                }}
                onEachFeature={(f, couche) => {
                  const gouv = String(f.properties?.gouvernorat);
                  const g = groupeDe(gouv);
                  // Un élément rempli par textContent : les noms viennent de la base.
                  const bulle = document.createElement('div');
                  const titre = document.createElement('strong');
                  titre.textContent = niveau === 'district' && g ? `${gouv} — ${nomDe(g)}` : gouv;
                  bulle.append(titre);
                  if (g && g.cle !== 'non_rattache') {
                    const ligne = document.createElement('div');
                    ligne.textContent = t('national.carteDeploiement.bulle', { n: formaterNombre(g.saisissent), total: formaterNombre(g.communes) });
                    bulle.append(ligne);
                  }
                  couche.bindTooltip(bulle, { sticky: true });
                }}
              />
            </MapContainer>
          ) : (
            <p className="p-4 text-sm text-ardoise-500">{t('national.repartition.carteIndisponible')}</p>
          )}
        </div>

        <div className="space-y-5 rounded-lg border border-ardoise-200 bg-white p-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ardoise-900">{t('national.carteDeploiement.partCommunes')}</h3>
            <ul className="space-y-1.5 text-sm text-ardoise-700" aria-label={t('national.carteDeploiement.legende')}>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3.5 shrink-0 rounded-sm ring-1 ring-ardoise-300" style={{ background: GRIS }} aria-hidden="true" />
                {t('national.carteDeploiement.aucune')}
              </li>
              {TEINTES.map((c, i) => (
                <li key={c} className="flex items-center gap-2">
                  <span className="inline-block size-3.5 shrink-0 rounded-sm" style={{ background: c }} aria-hidden="true" />
                  <span className="chiffres" dir="ltr">{CLASSES[i]} %</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ardoise-900">{t('national.carteDeploiement.ouOnSaisit')}</h3>
            {!groupes ? null : territoires.length === 0 ? (
              <p className="text-sm text-ardoise-600">{t('national.carteDeploiement.personne')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {territoires.map((g) => (
                  <li key={g.cle} className="flex items-baseline justify-between gap-3">
                    <span className="text-ardoise-800">{nomDe(g)}</span>
                    <span className="chiffres shrink-0 text-ardoise-600">{formaterNombre(g.saisissent)} / {formaterNombre(g.communes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
