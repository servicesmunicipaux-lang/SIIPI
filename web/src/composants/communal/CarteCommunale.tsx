// La carte du portail municipal.
//
// Deux cartes, et la distinction entre les deux est délibérée :
//
//   1. la carte OPÉRATIONNELLE — signalements, conteneurs, engins, secteurs —
//      avec des filtres par couche. C'est l'outil de travail : tout afficher
//      en même temps sur une commune de vingt mille habitants donne une tache
//      illisible, et la première chose que fait un directeur de propreté est
//      d'éteindre ce qui ne le concerne pas ce matin.
//
//   2. la carte des LIMITES, en lecture seule. Elle rappelle où s'arrête le
//      territoire, et rien d'autre. La commune ne peut pas la modifier : une
//      limite communale se rectifie à la FNCT, depuis l'annuaire national —
//      sans quoi chaque commune pourrait s'attribuer un quartier voisin.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api, ErreurApi, type CollectionFrontieres } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { formaterNombre } from '../../i18n';

type Couche = 'signalements' | 'conteneurs' | 'engins' | 'secteurs' | 'circuits' | 'points';

// Couleurs des arrêts, par type relevé sur le terrain. Les repères de début et
// de fin encadrent la tournée ; un point noir n'est pas un arrêt de collecte
// mais un dépôt sauvage constaté en passant, et il doit sauter aux yeux.
const COULEUR_POINT: Record<string, string> = {
  debut_collecte: '#16a34a',
  fin_collecte: '#dc2626',
  point_noir: '#171717',
  centre_transfert: '#7c3aed',
  parc_municipal: '#0369a1',
  hors_conteneur: '#b45309',
  point_de_collecte: '#0f766e',
  porte_a_porte: '#0ea5e9',
};

const COULEUR_TICKET: Record<string, string> = {
  recu: '#dc2626',
  assigne: '#ea580c',
  en_cours: '#ca8a04',
  resolu: '#16a34a',
  rejete: '#64748b',
};

interface Point {
  id: string;
  lat: number | null;
  lng: number | null;
  [k: string]: unknown;
}

export function CarteCommunale({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [frontiere, setFrontiere] = useState<CollectionFrontieres | null>(null);
  const [tickets, setTickets] = useState<Point[]>([]);
  const [conteneurs, setConteneurs] = useState<Point[]>([]);
  const [engins, setEngins] = useState<Point[]>([]);
  const [secteurs, setSecteurs] = useState<any[]>([]);
  const [circuits, setCircuits] = useState<any[]>([]);
  const [points, setPoints] = useState<any[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [actives, setActives] = useState<Set<Couche>>(
    new Set<Couche>(['signalements', 'conteneurs', 'secteurs'])
  );

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        // Chaque couche est facultative : une commune qui n'a pas encore saisi
        // sa flotte doit voir ses signalements malgré tout. Un seul refus ne
        // doit pas vider la carte entière.
        const [f, tk, ct, en, zn, ci, pt] = await Promise.all([
          api.frontieres([communeId], 0.0002).catch(() => null),
          api.reclamations(communeId).catch(() => []),
          api.conteneurs(communeId).catch(() => []),
          api.engins(communeId).catch(() => []),
          api.zones(communeId).catch(() => []),
          api.circuits(communeId).catch(() => []),
          api.pointsCommune(communeId).catch(() => []),
        ]);
        if (annule) return;
        setFrontiere(f);
        setTickets(tk as unknown as Point[]);
        setConteneurs(ct as unknown as Point[]);
        setEngins(en as unknown as Point[]);
        setSecteurs(zn);
        setCircuits(ci);
        setPoints(pt as unknown as any[]);
        setErreur(null);
      } catch (err) {
        if (!annule) setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      }
    })();
    return () => {
      annule = true;
    };
  }, [communeId, t]);

  const centre = useMemo<[number, number]>(() => {
    const p = [...tickets, ...conteneurs].find((x) => x.lat != null && x.lng != null);
    if (p) return [p.lat as number, p.lng as number];
    const g = frontiere?.features[0]?.geometry;
    if (g) {
      // Premier sommet du tracé : suffisant pour cadrer, et sans dépendance
      // à une bibliothèque de calcul géométrique côté navigateur.
      const c =
        g.type === 'Polygon'
          ? (g.coordinates as number[][][])[0][0]
          : (g.coordinates as number[][][][])[0][0][0];
      return [c[1], c[0]];
    }
    return [34, 9.6];
  }, [tickets, conteneurs, frontiere]);

  const basculer = (c: Couche) =>
    setActives((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  if (erreur) return <Erreur message={erreur} />;
  if (!frontiere && tickets.length === 0 && conteneurs.length === 0) return <Chargement />;

  const compteurs: Record<Couche, number> = {
    signalements: tickets.filter((x) => x.lat != null).length,
    conteneurs: conteneurs.filter((x) => x.lat != null).length,
    engins: engins.filter((x) => x.lat != null).length,
    secteurs: secteurs.length,
    circuits: circuits.filter((c: any) => c.trace).length,
    points: points.length,
  };

  const proprietes = frontiere?.features[0]?.properties;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------
          1. Carte opérationnelle
          ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <header>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.carte.titre')}</h1>
          <p className="mt-1 text-sm text-ardoise-500">{t('communal.carte.sousTitre')}</p>
        </header>

        {/* Un renvoi vers l'endroit où l'on ajoute des tracés et des arrêts.
            Sans lui, la question « où importe-t-on un KML ? » n'avait pour
            réponse qu'un chemin qu'il fallait connaître : Circuits, ouvrir un
            circuit, onglet Points. Une fonction qu'on ne trouve pas n'existe
            pas. */}
        {compteurs.points === 0 && compteurs.circuits === 0 && (
          <p className="rounded-xl border border-siipi-200 bg-siipi-50 p-3 text-sm text-siipi-900">
            {t('communal.carte.ouImporter')}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {(['signalements', 'conteneurs', 'engins', 'secteurs', 'circuits', 'points'] as Couche[]).map(
            (c) => (
              <button
                key={c}
                type="button"
                onClick={() => basculer(c)}
                aria-pressed={actives.has(c)}
                disabled={compteurs[c] === 0}
                className={`min-h-11 rounded-full px-3 text-sm font-medium disabled:opacity-40 ${
                  actives.has(c) && compteurs[c] > 0
                    ? 'bg-ardoise-900 text-white'
                    : 'border border-ardoise-300 bg-white text-ardoise-700'
                }`}
              >
                {t(`communal.carte.couches.${c}`)}
                <span className="chiffres ms-1.5 opacity-70">{compteurs[c]}</span>
              </button>
            )
          )}
        </div>

        <div className="h-[60dvh] overflow-hidden rounded-xl border border-ardoise-200">
          <MapContainer center={centre} zoom={13} scrollWheelZoom className="size-full">
            <TileLayer
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* La limite communale est toujours dessinée : c'est le cadre de
                lecture de tout le reste. Elle n'est pas une couche qu'on
                éteint, et elle n'est pas modifiable ici. */}
            {frontiere && (
              <GeoJSON
                key="limite"
                data={frontiere as never}
                style={{ color: '#334155', weight: 2, fillOpacity: 0.04, dashArray: '4 3' }}
              />
            )}

            {actives.has('secteurs') &&
              secteurs
                .filter((z: any) => z.geometry)
                .map((z: any) => (
                  <GeoJSON
                    key={`z-${z.id}`}
                    data={z.geometry as never}
                    style={{ color: z.color ?? '#2563eb', weight: 1.5, fillOpacity: 0.1 }}
                  >
                    <Popup>{z.name}</Popup>
                  </GeoJSON>
                ))}

            {actives.has('circuits') &&
              circuits
                .filter((c: any) => c.trace)
                .map((c: any) => (
                  <GeoJSON
                    key={`c-${c.id}`}
                    data={c.trace as never}
                    style={{ color: '#7c3aed', weight: 3 }}
                  >
                    <Popup>{c.nom}</Popup>
                  </GeoJSON>
                ))}

            {/* Les arrêts de collecte. Numérotés, parce que la question posée
                devant cette carte est « dans quel ordre passe-t-on », et un
                semis de points identiques n'y répond pas. Le numéro reprend le
                rang dans le voyage, pas un compteur d'affichage. */}
            {actives.has('points') &&
              points.map((p: any) => (
                <CircleMarker
                  key={`p-${p.id}`}
                  center={[p.lat, p.lng]}
                  radius={9}
                  pathOptions={{
                    color: COULEUR_POINT[p.type] ?? '#0ea5e9',
                    fillColor: COULEUR_POINT[p.type] ?? '#0ea5e9',
                    fillOpacity: 0.8,
                    weight: 1.5,
                  }}
                >
                  <Tooltip permanent direction="center" className="siipi-numero">
                    <span className="chiffres text-[10px] font-bold text-white">{p.ordre}</span>
                  </Tooltip>
                  <Popup>
                    <p className="font-semibold">
                      {p.ordre}. {p.nom ?? t(`communal.circuits.typesPoint.${p.type}`, { defaultValue: p.type })}
                    </p>
                    <p className="text-xs">{p.circuit_nom}</p>
                    <p className="text-xs">
                      {t(`communal.circuits.typesPoint.${p.type}`, { defaultValue: p.type })}
                      {p.voyage > 1 && ` · ${t('communal.circuits.voyageN', { n: p.voyage })}`}
                    </p>
                    {p.heure_observee && (
                      <p className="text-xs">
                        {t('communal.circuits.carte.heureObservee')} {String(p.heure_observee).slice(0, 5)}
                      </p>
                    )}
                    {!p.heure_observee && p.heure_estimee && (
                      <p className="text-xs text-ardoise-500">
                        {t('communal.circuits.carte.heureEstimee')} {String(p.heure_estimee).slice(0, 5)}
                      </p>
                    )}
                  </Popup>
                </CircleMarker>
              ))}

            {actives.has('signalements') &&
              tickets
                .filter((x) => x.lat != null && x.lng != null)
                .map((x: any) => (
                  <CircleMarker
                    key={`t-${x.id}`}
                    center={[x.lat, x.lng]}
                    radius={7}
                    pathOptions={{
                      color: COULEUR_TICKET[x.status] ?? '#64748b',
                      fillColor: COULEUR_TICKET[x.status] ?? '#64748b',
                      fillOpacity: 0.75,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <p className="font-semibold">{x.title}</p>
                      <p className="text-xs">{t(`citoyen.statuts.${x.status}`)}</p>
                    </Popup>
                  </CircleMarker>
                ))}

            {actives.has('conteneurs') &&
              conteneurs
                .filter((x) => x.lat != null && x.lng != null)
                .map((x: any) => (
                  <CircleMarker
                    key={`k-${x.id}`}
                    center={[x.lat, x.lng]}
                    radius={5}
                    pathOptions={{
                      color: '#0284c7',
                      fillColor: '#0284c7',
                      fillOpacity: 0.6,
                      weight: 1,
                    }}
                  >
                    <Popup>
                      {x.type ?? t('communal.carte.couches.conteneurs')}
                      {x.fill_level != null && ` · ${x.fill_level} %`}
                    </Popup>
                  </CircleMarker>
                ))}

            {actives.has('engins') &&
              engins
                .filter((x) => x.lat != null && x.lng != null)
                .map((x: any) => (
                  <CircleMarker
                    key={`e-${x.id}`}
                    center={[x.lat, x.lng]}
                    radius={6}
                    pathOptions={{
                      color: '#b45309',
                      fillColor: '#f59e0b',
                      fillOpacity: 0.85,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      {x.registration} · {x.status}
                    </Popup>
                  </CircleMarker>
                ))}
          </MapContainer>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          2. Limites communales, en lecture seule
          ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-semibold text-ardoise-900">{t('communal.limites.titre')}</h2>
          <p className="mt-1 text-sm text-ardoise-500">{t('communal.limites.sousTitre')}</p>
        </header>

        {!frontiere || frontiere.features.length === 0 ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            {t('communal.limites.absente')}
          </p>
        ) : (
          <>
            <div className="h-[40dvh] overflow-hidden rounded-xl border border-ardoise-200">
              {/* Ni zoom à la molette, ni déplacement, ni outil de dessin :
                  cette carte informe, elle ne se manipule pas. */}
              <MapContainer
                center={centre}
                zoom={11}
                scrollWheelZoom={false}
                dragging={false}
                doubleClickZoom={false}
                zoomControl={false}
                attributionControl={false}
                className="size-full"
              >
                <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <GeoJSON
                  key="limite-seule"
                  data={frontiere as never}
                  style={{ color: '#13784f', weight: 2.5, fillOpacity: 0.1 }}
                />
              </MapContainer>
            </div>

            {proprietes && (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-ardoise-200 bg-white p-3">
                  <dt className="text-xs text-ardoise-500">{t('communal.limites.superficie')}</dt>
                  <dd className="chiffres text-lg font-semibold text-ardoise-900">
                    {formaterNombre(proprietes.areaKm2, 2)} km²
                  </dd>
                </div>
                <div className="rounded-xl border border-ardoise-200 bg-white p-3">
                  <dt className="text-xs text-ardoise-500">{t('communal.limites.population')}</dt>
                  <dd className="chiffres text-lg font-semibold text-ardoise-900">
                    {formaterNombre(proprietes.population)}
                  </dd>
                </div>
                <div className="rounded-xl border border-ardoise-200 bg-white p-3">
                  <dt className="text-xs text-ardoise-500">{t('communal.limites.densite')}</dt>
                  <dd className="chiffres text-lg font-semibold text-ardoise-900">
                    {proprietes.areaKm2
                      ? formaterNombre(proprietes.population / proprietes.areaKm2)
                      : '—'}
                  </dd>
                </div>
                <div className="rounded-xl border border-ardoise-200 bg-white p-3">
                  <dt className="text-xs text-ardoise-500">{t('communal.limites.code')}</dt>
                  <dd className="chiffres text-lg font-semibold text-ardoise-900">
                    {proprietes.codeMunicipalite ?? '—'}
                  </dd>
                </div>
              </dl>
            )}

            <p className="text-xs text-ardoise-500">
              {t(`national.decoupage.sources.${proprietes?.source ?? 'officiel'}`)}{' '}
              {t('communal.limites.mention')}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
