// La carte des communes, dans l'observatoire (lot S0 : carte du conseiller SIG,
// 16 octobre 2026).
//
// Ce que la carte du conseiller apportait, sur les données de SIIPI : le choix du
// fond (plan ou satellite), la couche des communes qu'on montre ou qu'on cache,
// un gouvernorat à la fois, la recherche d'une commune par « nom — gouvernorat »
// (deux Ennour, deux Ezzouhour : le nom seul ne suffit pas), et la fiche de
// chacune. Le contour est le tracé officiel du découpage ; la superficie en est
// calculée sur l'ellipsoïde par la base — celle du conseiller, prise en
// projection Web Mercator, était trop grande d'un tiers à une moitié.
//
// LA POPULATION DIT D'OÙ ELLE VIENT : une estimation ne se lit pas comme un
// recensement. Le total ne s'écrit qu'avec sa provenance.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GeoJSON, LayerGroup, MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, ErreurApi, type CarteCommunes as Carte } from '../../lib/api';
import { formaterNombre } from '../../i18n';
import { FondsDeCarte } from '../carte/FondsDeCarte';
import { Chargement, Erreur } from '../Elements';

type Commune = Carte['features'][number];
type Fiche = Commune['properties'];

const STYLE = { color: '#2f47e2', weight: 1, fillColor: '#2f47e2', fillOpacity: 0.35 };
const STYLE_SURVOL = { weight: 3, color: '#000' };

const libelle = (p: Fiche) => `${p.nom} — ${p.gouvernorat}`;

/** Cadre la carte sur ce qui est affiché, chaque fois que cela change. */
function Cadrer({ communes, maxZoom }: { communes: Commune[]; maxZoom: number }) {
  const carte = useMap();
  useEffect(() => {
    if (!communes.length) return;
    const limites = L.geoJSON({ type: 'FeatureCollection', features: communes } as never).getBounds();
    if (limites.isValid()) carte.fitBounds(limites, { padding: [20, 20], maxZoom });
  }, [carte, communes, maxZoom]);
  return null;
}

export function CarteCommunes() {
  const { t, i18n } = useTranslation();
  const [carte, setCarte] = useState<Carte | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [gouvernorat, setGouvernorat] = useState('');
  const [recherche, setRecherche] = useState('');
  const [choisie, setChoisie] = useState<Commune | null>(null);
  const arabe = i18n.language === 'ar';

  const charger = useCallback(() => {
    setErreur(null);
    api
      .carteCommunes()
      .then(setCarte)
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [t]);
  useEffect(() => charger(), [charger]);

  const gouvernorats = useMemo(
    () => [...new Set((carte?.features ?? []).map((f) => f.properties.gouvernorat))].sort((a, b) => a.localeCompare(b, 'fr')),
    [carte]
  );
  const parLibelle = useMemo(() => new Map((carte?.features ?? []).map((f) => [libelle(f.properties).toLowerCase(), f])), [carte]);
  const affichees = useMemo(
    () => (choisie ? [choisie] : (carte?.features ?? []).filter((f) => !gouvernorat || f.properties.gouvernorat === gouvernorat)),
    [carte, choisie, gouvernorat]
  );

  if (erreur) return <Erreur message={erreur} onReessayer={charger} />;
  if (!carte) return <Chargement />;

  // Le total d'une population s'écrit avec sa provenance ; une commune sans
  // population est comptée à part, jamais pour zéro.
  const parProvenance = new Map<string, number>();
  let sansPopulation = 0;
  for (const f of affichees) {
    if (f.properties.population == null) sansPopulation++;
    else parProvenance.set(f.properties.provenance ?? 'inconnue', (parProvenance.get(f.properties.provenance ?? 'inconnue') ?? 0) + f.properties.population);
  }

  const choisir = (texte: string) => {
    setRecherche(texte);
    const q = texte.trim().toLowerCase();
    if (!q) return setChoisie(null);
    const f = parLibelle.get(q) ?? carte.features.find((x) => x.properties.nom.toLowerCase() === q);
    if (f) {
      setChoisie(f);
      setRecherche(libelle(f.properties));
    }
  };
  const toutAfficher = () => {
    setGouvernorat('');
    setRecherche('');
    setChoisie(null);
  };

  // La fiche est bâtie élément par élément (textContent) : un nom venu d'un
  // import ne s'interprète jamais comme du HTML.
  const fiche = (p: Fiche) => {
    const racine = document.createElement('div');
    racine.className = 'text-sm';
    const titre = document.createElement('p');
    titre.className = 'font-semibold';
    titre.textContent = arabe && p.nom_ar ? p.nom_ar : p.nom;
    racine.appendChild(titre);
    const second = document.createElement('p');
    second.className = 'text-ardoise-600';
    second.dir = arabe ? 'ltr' : 'rtl';
    second.textContent = (arabe ? p.nom : p.nom_ar) ?? '';
    racine.appendChild(second);
    const densite = p.population != null && p.superficie_km2 ? p.population / p.superficie_km2 : null;
    const lignes: [string, string][] = [
      [t('national.carte.fiche.gouvernorat'), p.gouvernorat],
      [t('national.carte.fiche.district'), p.district ?? t('kpi.national.nonRattache')],
      [t('national.carte.fiche.type'), p.type ?? t('kpi.statuts.non_renseigne')],
      [
        t('national.carte.fiche.population'),
        p.population == null
          ? t('kpi.statuts.non_renseigne')
          : `${formaterNombre(p.population, 0)} (${t(`national.carte.provenances.${p.provenance ?? 'inconnue'}`, { defaultValue: p.provenance ?? '' })})`,
      ],
      [t('national.carte.fiche.superficie'), p.superficie_km2 == null ? t('kpi.statuts.non_renseigne') : `${formaterNombre(p.superficie_km2, 2)} km²`],
      [t('national.carte.fiche.densite'), densite == null ? t('kpi.statuts.non_renseigne') : `${formaterNombre(densite, 0)} ${t('national.carte.habKm2')}`],
      [t('national.carte.fiche.secteurs'), p.secteurs == null ? t('kpi.statuts.non_renseigne') : String(p.secteurs)],
      [t('national.carte.fiche.code'), p.code == null ? t('kpi.statuts.non_renseigne') : String(p.code)],
    ];
    const table = document.createElement('table');
    table.className = 'mt-1';
    for (const [k, v] of lignes) {
      const tr = table.insertRow();
      const a = tr.insertCell();
      a.className = 'pe-3 text-ardoise-500';
      a.textContent = k;
      tr.insertCell().textContent = v;
    }
    racine.appendChild(table);
    return racine;
  };

  const couche = (
    <LayerGroup>
      <GeoJSON
        key={`${gouvernorat}|${choisie?.properties.id ?? ''}|${i18n.language}`}
        data={{ type: 'FeatureCollection', features: affichees } as never}
        style={() => STYLE}
        onEachFeature={(f, l) => {
          const p = f.properties as Fiche;
          l.bindTooltip(arabe && p.nom_ar ? p.nom_ar : p.nom, { sticky: true });
          l.bindPopup(() => fiche(p));
          const chemin = l as L.Path;
          l.on('mouseover', () => {
            chemin.setStyle(STYLE_SURVOL);
            chemin.bringToFront();
          });
          l.on('mouseout', () => chemin.setStyle(STYLE));
          if (choisie) setTimeout(() => l.openPopup(), 0);
        }}
      />
    </LayerGroup>
  );

  return (
    <section className="space-y-3" aria-labelledby="carte-communes">
      <header className="space-y-1">
        <h1 id="carte-communes" className="text-xl font-semibold text-ardoise-900">{t('national.carte.titre')}</h1>
        <p className="max-w-3xl text-sm text-ardoise-600">{t('national.carte.chapeau')}</p>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-ardoise-600">{t('national.carte.recherche')}</span>
          <input
            type="search"
            list="carte-communes-liste"
            value={recherche}
            onChange={(e) => (e.target.value ? setRecherche(e.target.value) : choisir(''))}
            onBlur={(e) => choisir(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && choisir((e.target as HTMLInputElement).value)}
            placeholder={t('national.carte.rechercheExemple')}
            className="mt-1 min-h-10 w-72 max-w-full rounded-lg border border-ardoise-300 bg-white px-3 text-sm"
          />
          <datalist id="carte-communes-liste">
            {carte.features.map((f) => (
              <option key={f.properties.id} value={libelle(f.properties)} />
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="block text-ardoise-600">{t('national.carte.gouvernorat')}</span>
          <select
            value={gouvernorat}
            onChange={(e) => {
              setGouvernorat(e.target.value);
              setChoisie(null);
              setRecherche('');
            }}
            className="mt-1 min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm"
          >
            <option value="">{t('national.carte.tous')}</option>
            {gouvernorats.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={toutAfficher} className="min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 hover:bg-ardoise-50">
          {t('national.carte.toutAfficher')}
        </button>
        <p className="ms-auto text-sm text-ardoise-700" role="status">
          {t('national.carte.compte', { n: affichees.length })}
          {[...parProvenance.entries()].map(([prov, total]) => (
            <span key={prov}>
              {' · '}
              {t('national.carte.habitants', { n: formaterNombre(total, 0), provenance: t(`national.carte.provenances.${prov}`, { defaultValue: prov }) })}
            </span>
          ))}
          {sansPopulation > 0 && <span>{' · '}{t('national.carte.sansPopulation', { n: sansPopulation })}</span>}
        </p>
      </div>

      <div className="h-[70dvh] overflow-hidden rounded-xl border border-ardoise-200">
        <MapContainer center={[34, 9.6]} zoom={6} scrollWheelZoom preferCanvas className="size-full">
          <FondsDeCarte superpositions={[{ cle: 'communes', libelle: t('national.carte.couche'), contenu: couche }]} />
          <Cadrer communes={affichees} maxZoom={choisie ? 13 : 18} />
        </MapContainer>
      </div>
      <p className="text-xs text-ardoise-500">{t('national.carte.source')}</p>
    </section>
  );
}
