// Les fonds de carte de SIIPI, et le choix entre eux (lot S0 : carte du
// conseiller SIG, 16 octobre 2026).
//
// DEUX FONDS, ET SEULEMENT CEUX-LÀ : le plan OpenStreetMap, par défaut, et
// l'imagerie satellite d'Esri, qui montre le bâti et les dépôts sauvages qu'un
// plan ne montre pas. Pas de tuiles Google : appelées hors de leur API, elles
// enfreignent les conditions de Google (feuille de route, lot S0) — la carte du
// conseiller en chargeait, elles ne sont pas reprises.
//
// C'EST LE SEUL ENDROIT OÙ VIVENT LES ADRESSES DE TUILES, avec leur attribution :
// `npm run lint` refuse une adresse de tuiles écrite ailleurs
// (scripts/verifier-fonds-de-carte.mjs). Un fond ajouté un jour l'est ici, pour
// toutes les cartes à la fois.

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LayersControl, TileLayer } from 'react-leaflet';

const PLAN = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
};
const SATELLITE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
  maxZoom: 19,
};

export type Superposition = { cle: string; libelle: string; contenu: ReactNode; active?: boolean };

export function FondsDeCarte({
  choix = true,
  opacite,
  superpositions = [],
}: {
  /** false : le plan seul, sans sélecteur — une petite carte d'aperçu, une carte thématique qui doit rester lisible. */
  choix?: boolean;
  opacite?: number;
  /** Les couches qu'on peut afficher ou masquer dans le même sélecteur (les communes, par exemple). */
  superpositions?: Superposition[];
}) {
  const { t } = useTranslation();
  if (!choix) return <TileLayer {...PLAN} opacity={opacite} />;
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name={t('carte.fonds.plan')}>
        <TileLayer {...PLAN} opacity={opacite} />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name={t('carte.fonds.satellite')}>
        <TileLayer {...SATELLITE} opacity={opacite} />
      </LayersControl.BaseLayer>
      {superpositions.map((s) => (
        <LayersControl.Overlay key={s.cle} checked={s.active ?? true} name={s.libelle}>
          {s.contenu}
        </LayersControl.Overlay>
      ))}
    </LayersControl>
  );
}
