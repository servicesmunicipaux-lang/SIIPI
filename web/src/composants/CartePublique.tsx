// Carte publique des signalements.
//
// Ce que cette carte montre volontairement : tous les signalements, tous les
// statuts, y compris ceux qui traînent. C'est le choix assumé de la FNCT — un
// service qui ne montre que ses réussites n'est pas cru.
//
// Ce qu'elle ne montre pas, et ne peut pas montrer : ni nom, ni téléphone, ni
// description libre, et une position déjà arrondie à environ 110 m par le
// serveur. Le filtrage n'est pas fait ici : le front-end ne reçoit jamais les
// données personnelles, donc aucune erreur d'affichage ne peut les révéler.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, ErreurApi, type PointCarte } from '../lib/api';
import { Chargement, Erreur } from './Elements';

const COULEURS: Record<string, string> = {
  recu: '#dc2626',
  assigne: '#ea580c',
  en_cours: '#ca8a04',
  resolu: '#16a34a',
  rejete: '#64748b',
};

// La Tunisie entière : ce n'est qu'un repli, le temps que la limite de la
// commune arrive. Elle ne doit jamais rester à l'écran — un riverain de Houmt
// Souk à qui l'on montre le pays du Nord au Sud ne cherche pas, il ferme.
const CENTRE_TUNISIE: [number, number] = [34.0, 9.6];

// Cadre la carte sur le territoire de la commune dès que sa limite est connue.
// À l'intérieur du MapContainer, seul endroit d'où l'instance Leaflet est
// accessible.
function CadrerSurCommune({ limite }: { limite: GeoJSON.GeoJsonObject | null }) {
  const carte = useMap();
  useEffect(() => {
    if (!limite) return;
    const couche = L.geoJSON(limite);
    const cadre = couche.getBounds();
    if (cadre.isValid()) carte.fitBounds(cadre, { padding: [16, 16] });
  }, [limite, carte]);
  return null;
}

export function CartePublique({ communeId }: { communeId?: string }) {
  const { t } = useTranslation();
  const [points, setPoints] = useState<PointCarte[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<string>('tous');
  const [limite, setLimite] = useState<GeoJSON.GeoJsonObject | null>(null);
  // Les signalements du citoyen qui n'ont pas de position : ils existent, la
  // commune les a reçus, mais une carte n'affiche que des points. Sans ce
  // décompte, l'écran annonce « 0 signalement » à quelqu'un qui vient d'en
  // déposer un, et le service passe pour défaillant alors qu'il a marché.
  const [sansPosition, setSansPosition] = useState(0);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const lignes = await api.cartePublique(communeId);
        if (!annule) setPoints(lignes);
      } catch (err) {
        if (!annule) setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      }
    })();
    return () => {
      annule = true;
    };
  }, [communeId, t]);

  // Limite de la commune : elle sert à cadrer, et à montrer au riverain
  // l'étendue de ce que la carte couvre.
  useEffect(() => {
    if (!communeId) return;
    let annule = false;
    void (async () => {
      try {
        const collection = await api.frontieres([communeId], 0.001);
        if (!annule && collection?.features?.length) setLimite(collection as GeoJSON.GeoJsonObject);
      } catch {
        // Une limite absente n'empêche pas la carte : on reste sur le repli.
      }
    })();
    return () => {
      annule = true;
    };
  }, [communeId]);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const miens = await api.mesSignalements();
        if (!annule) setSansPosition(miens.filter((x) => x.lat == null && x.geom == null).length);
      } catch {
        // Le décompte est un confort : son absence ne doit pas vider la carte.
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  const affiches = useMemo(
    () => (points ?? []).filter((p) => filtre === 'tous' || p.statut === filtre),
    [points, filtre]
  );

  const centre = useMemo<[number, number]>(() => {
    const avecPosition = (points ?? []).filter((p) => p.lat != null && p.lng != null);
    if (avecPosition.length === 0) return CENTRE_TUNISIE;
    return [avecPosition[0].lat as number, avecPosition[0].lng as number];
  }, [points]);

  if (erreur) return <Erreur message={erreur} />;
  if (!points) return <Chargement />;

  const resolus = points.filter((p) => p.statut === 'resolu').length;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-ardoise-900">{t('citoyen.carte.titre')}</h1>
        <p className="text-sm text-ardoise-500">
          {t('citoyen.carte.resume', { total: points.length, resolus })}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['tous', 'recu', 'en_cours', 'resolu'].map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => setFiltre(cle)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filtre === cle
                ? 'bg-ardoise-900 text-white'
                : 'border border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`citoyen.statuts.${cle}`)}
          </button>
        ))}
      </div>

      <div className="h-[55dvh] overflow-hidden rounded-xl border border-ardoise-200">
        <MapContainer
          center={centre}
          zoom={points.length > 0 ? 13 : 7}
          /* La molette zoomait la carte au lieu de faire défiler la page :
             sur un écran où la carte occupe la moitié de la hauteur, le
             lecteur se retrouvait bloqué dessus. Les boutons + et − restent,
             et le pincement fonctionne sur mobile, qui est l'usage visé. */
          scrollWheelZoom={false}
          className="size-full"
        >
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CadrerSurCommune limite={limite} />
          {limite && (
            <GeoJSON
              data={limite}
              style={{ color: '#0f766e', weight: 2, fillOpacity: 0.04, dashArray: '4 4' }}
            />
          )}
          {affiches
            .filter((p) => p.lat != null && p.lng != null)
            .map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat as number, p.lng as number]}
                radius={8}
                pathOptions={{
                  color: COULEURS[p.statut] ?? '#64748b',
                  fillColor: COULEURS[p.statut] ?? '#64748b',
                  fillOpacity: 0.7,
                  weight: 2,
                }}
              >
                <Popup>
                  <p className="font-semibold">{p.titre}</p>
                  <p className="text-xs">
                    {t(`citoyen.categories.${p.categorie}`, {
                      defaultValue: p.categorie,
                    })}{' '}
                    · {t(`citoyen.statuts.${p.statut}`)}
                  </p>
                  <p className="text-xs">
                    {t('citoyen.carte.signaleLe')} {p.signale_le}
                    {p.delai_jours != null &&
                      ` · ${t('citoyen.carte.traiteEn', { jours: p.delai_jours })}`}
                  </p>
                  {p.photo_url && (
                    <img
                      src={p.photo_url}
                      alt=""
                      className="mt-1 max-h-32 rounded"
                      loading="lazy"
                    />
                  )}
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>

      {/* La position affichée est approximative, et le dire fait partie de la
          protection : un citoyen doit savoir qu'on ne publie pas sa porte. */}
      {/* Un signalement sans position n'est pas un signalement perdu. Le dire
          ici évite la conclusion que le citoyen tire sinon tout seul. */}
      {sansPosition > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {t('citoyen.carte.sansPosition', { count: sansPosition })}
        </p>
      )}
      <p className="text-xs text-ardoise-500">{t('citoyen.carte.mentionVieePrivee')}</p>
    </div>
  );
}
