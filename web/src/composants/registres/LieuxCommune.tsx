// Les lieux de la commune — marchés, cimetières, abattoirs, écoles, centres
// de santé — et leurs nettoyages (lot « sources KPI »).
//
// On pose un lieu d'un clic sur la carte. On y planifie des nettoyages, qu'on
// clôt en saisissant les mètres linéaires réalisés : c'est ce qui fait
// MESURER par la plateforme le balayage (M1-1), les marchés (M2-4), les
// cimetières (M2-3) et les abattoirs (M2-5), que la fiche d'évaluation
// faisait jusqu'ici déclarer.
//
// L'état d'un lieu se lit sur ses nettoyages. Jamais nettoyé et rien de
// prévu : « non renseigné », pas « sale ».

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, ErreurApi, type ActionPlanifiee, type CollectionFrontieres, type Lieu } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement, Erreur } from '../Elements';

const TYPES = ['marche', 'cimetiere', 'abattoir', 'ecole', 'sante', 'autre'] as const;
const COULEURS: Record<string, string> = {
  marche: '#d97706',
  cimetiere: '#6f7c8d',
  abattoir: '#dc2626',
  ecole: '#2563eb',
  sante: '#16a34a',
  autre: '#9333ea',
};
const CLASSES_ETAT: Record<string, string> = {
  propre: 'bg-siipi-100 text-siipi-800',
  nettoyage_prevu: 'bg-blue-100 text-blue-800',
  a_surveiller: 'bg-amber-100 text-amber-900',
  en_retard: 'bg-red-100 text-red-800',
  non_renseigne: 'bg-ardoise-100 text-ardoise-600',
};

const champ = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm';
const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-10 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-50';

/** Un clic sur la carte donne la position — du lieu à créer ou à déplacer. */
function Pointeur({ actif, onPosition }: { actif: boolean; onPosition: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      if (actif) onPosition(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

/**
 * Cadre la carte une seule fois : sur les lieux s'il y en a, sinon sur la
 * frontière de la commune — une commune sans lieu ne doit pas s'ouvrir sur
 * le centre de Tunis.
 */
function Cadrer({ lieux, frontiere }: { lieux: Lieu[]; frontiere: CollectionFrontieres | null }) {
  const carte = useMap();
  const fait = useRef(false);
  useEffect(() => {
    if (fait.current) return;
    const cadre = lieux.length
      ? L.latLngBounds(lieux.map((l) => [l.lat, l.lng] as [number, number]))
      : frontiere?.features.length
        ? L.geoJSON(frontiere as unknown as GeoJSON.GeoJsonObject).getBounds()
        : null;
    if (cadre?.isValid()) {
      carte.fitBounds(cadre, { padding: [24, 24], maxZoom: 16 });
      fait.current = true;
    }
  }, [lieux, frontiere, carte]);
  return null;
}

export function LieuxCommune({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [lieux, setLieux] = useState<Lieu[] | null>(null);
  const [frontiere, setFrontiere] = useState<CollectionFrontieres | null>(null);
  const [filtre, setFiltre] = useState<string>('');
  const [choisi, setChoisi] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState<{ nom: string; type: string; adresse: string; lat: number | null; lng: number | null } | null>(null);
  const [deplacer, setDeplacer] = useState(false);
  const [nettoyages, setNettoyages] = useState<ActionPlanifiee[]>([]);
  const [datePlan, setDatePlan] = useState('');
  const [ml, setMl] = useState<Record<string, string>>({});
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    try {
      setLieux(await api.lieux(communeId));
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    }
  };
  const chargerNettoyages = async (id: string) => setNettoyages(await api.nettoyagesLieu(communeId, id).catch(() => []));

  useEffect(() => {
    void charger();
    api.frontieres([communeId], 0.0002).then(setFrontiere, () => setFrontiere(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);
  useEffect(() => {
    if (choisi) void chargerNettoyages(choisi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choisi]);

  const executer = async (tache: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setEtat(null);
    try {
      await tache();
      await charger();
      if (choisi) await chargerNettoyages(choisi);
      setEtat({ type: 'ok', texte });
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnCours(false);
    }
  };

  if (!lieux) return etat ? <Erreur message={etat.texte} onReessayer={() => void charger()} /> : <Chargement />;

  const visibles = lieux.filter((l) => !filtre || l.type === filtre);
  const lieu = lieux.find((l) => l.id === choisi) ?? null;
  const centre: [number, number] = lieux[0] ? [lieux[0].lat, lieux[0].lng] : [34, 9.6];
  const pointage = !!nouveau || deplacer;

  return (
    <div className="space-y-3">
      <p className="text-sm text-ardoise-600">{t('registres.lieux.aide')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label={t('registres.lieux.type')} className={champ}>
          <option value="">{t('registres.lieux.tousTypes')}</option>
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`registres.lieux.types.${ty}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={nouveau ? boutonPrincipal : bouton}
          onClick={() => {
            setDeplacer(false);
            setNouveau((n) => (n ? null : { nom: '', type: 'marche', adresse: '', lat: null, lng: null }));
          }}
        >
          {t('registres.lieux.ajouter')}
        </button>
      </div>
      {pointage && <p className="rounded bg-blue-50 p-2 text-xs text-blue-900">{t('registres.lieux.cliquerCarte')}</p>}

      <div className="h-[45dvh] overflow-hidden rounded-xl border border-ardoise-200">
        <MapContainer center={centre} zoom={13} scrollWheelZoom className={`size-full ${pointage ? 'cursor-crosshair' : ''}`}>
          <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Cadrer lieux={lieux} frontiere={frontiere} />
          {frontiere && (
            <GeoJSON
              key={communeId}
              data={frontiere as unknown as GeoJSON.GeoJsonObject}
              interactive={false}
              style={{ color: '#13784f', weight: 2, fillOpacity: 0.03 }}
            />
          )}
          <Pointeur
            actif={pointage}
            onPosition={(lat, lng) => {
              if (nouveau) setNouveau({ ...nouveau, lat, lng });
              else if (deplacer && lieu)
                void executer(() => api.modifierLieu(lieu.id, { lat, lng }), t('registres.lieux.deplace')).then(() => setDeplacer(false));
            }}
          />
          {visibles.map((l) => (
            <CircleMarker
              key={l.id}
              center={[l.lat, l.lng]}
              radius={choisi === l.id ? 11 : 8}
              pathOptions={{ color: COULEURS[l.type], fillOpacity: l.actif ? 0.7 : 0.25, weight: choisi === l.id ? 3 : 1 }}
              eventHandlers={{ click: () => setChoisi(l.id) }}
            >
              <Tooltip>{l.nom}</Tooltip>
            </CircleMarker>
          ))}
          {nouveau?.lat != null && nouveau.lng != null && (
            <CircleMarker center={[nouveau.lat, nouveau.lng]} radius={10} pathOptions={{ color: '#13784f', dashArray: '4 4' }} />
          )}
        </MapContainer>
      </div>

      {etat && (
        <p role={etat.type === 'ok' ? 'status' : 'alert'} className={`text-sm ${etat.type === 'ok' ? 'text-siipi-700' : 'text-red-700'}`}>
          {etat.texte}
        </p>
      )}

      {nouveau && (
        <form
          className="grid gap-2 rounded-xl border border-siipi-200 bg-siipi-50 p-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (nouveau.lat == null || nouveau.lng == null) {
              setEtat({ type: 'erreur', texte: t('registres.lieux.positionRequise') });
              return;
            }
            void executer(
              () =>
                api.creerLieu(communeId, {
                  nom: nouveau.nom.trim(),
                  type: nouveau.type as (typeof TYPES)[number],
                  lat: nouveau.lat!,
                  lng: nouveau.lng!,
                  adresse: nouveau.adresse.trim() || null,
                }),
              t('registres.lieux.cree')
            ).then(() => setNouveau(null));
          }}
        >
          <input required value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} placeholder={t('registres.lieux.nom')} aria-label={t('registres.lieux.nom')} className={champ} />
          <select value={nouveau.type} onChange={(e) => setNouveau({ ...nouveau, type: e.target.value })} aria-label={t('registres.lieux.type')} className={champ}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`registres.lieux.types.${ty}`)}
              </option>
            ))}
          </select>
          <input value={nouveau.adresse} onChange={(e) => setNouveau({ ...nouveau, adresse: e.target.value })} placeholder={t('registres.lieux.adresse')} aria-label={t('registres.lieux.adresse')} className={champ} />
          <span className="chiffres self-center text-xs text-ardoise-600">
            {nouveau.lat != null ? `${nouveau.lat}, ${nouveau.lng}` : t('registres.lieux.positionRequise')}
          </span>
          <button type="submit" disabled={enCours} className={boutonPrincipal}>
            {t('registres.lieux.creer')}
          </button>
        </form>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ul className="divide-y divide-ardoise-100 rounded-xl border border-ardoise-200 bg-white">
          {visibles.length === 0 && <li className="p-4 text-sm text-ardoise-500">{t('registres.lieux.vide')}</li>}
          {visibles.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setChoisi(l.id)} className={`flex w-full items-center justify-between gap-2 p-3 text-start hover:bg-ardoise-50 ${choisi === l.id ? 'bg-siipi-50' : ''}`}>
                <span>
                  <span className="block font-medium text-ardoise-900">{l.nom}</span>
                  <span className="text-xs text-ardoise-500">
                    {t(`registres.lieux.types.${l.type}`)}
                    {l.zone_nom && ` · ${l.zone_nom}`}
                    {l.dernier_nettoyage && ` · ${t('registres.lieux.dernier', { date: f.date(l.dernier_nettoyage) })}`}
                  </span>
                </span>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${CLASSES_ETAT[l.etat]}`}>{t(`registres.lieux.etats.${l.etat}`)}</span>
              </button>
            </li>
          ))}
        </ul>

        {lieu && (
          <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-ardoise-900">{lieu.nom}</h3>
                <p className="text-xs text-ardoise-500">
                  {t(`registres.lieux.types.${lieu.type}`)}
                  {lieu.type === 'abattoir' && ` · ${t('registres.lieux.jamaisPublic')}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={deplacer ? boutonPrincipal : bouton} onClick={() => { setNouveau(null); setDeplacer((x) => !x); }}>
                  {t('registres.lieux.deplacer')}
                </button>
                <button type="button" disabled={enCours} className={bouton} onClick={() => void executer(() => api.modifierLieu(lieu.id, { actif: !lieu.actif }), t('registres.enregistre'))}>
                  {lieu.actif ? t('registres.lieux.desactiver') : t('registres.lieux.activer')}
                </button>
                <button
                  type="button"
                  disabled={enCours}
                  className={bouton}
                  onClick={() => {
                    if (window.confirm(t('registres.confirmerRetrait'))) void executer(() => api.retirerLieu(lieu.id), t('registres.lieux.retire')).then(() => setChoisi(null));
                  }}
                >
                  {t('registres.retirer')}
                </button>
              </div>
            </div>

            <h4 className="text-sm font-medium text-ardoise-800">{t('registres.lieux.nettoyages')}</h4>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void executer(
                  () => api.planifierAction(communeId, { titre: t('registres.lieux.titreNettoyage', { nom: lieu.nom }), type: 'nettoyage', poiId: lieu.id, datePrevue: datePlan, pointIds: [] }),
                  t('registres.lieux.planifie')
                ).then(() => setDatePlan(''));
              }}
            >
              <label className="text-xs text-ardoise-600">
                <span className="block">{t('registres.lieux.datePrevue')}</span>
                <input type="date" required value={datePlan} onChange={(e) => setDatePlan(e.target.value)} className={champ} />
              </label>
              <button type="submit" disabled={enCours} className={boutonPrincipal}>
                {t('registres.lieux.planifier')}
              </button>
            </form>
            {nettoyages.length === 0 ? (
              <p className="text-sm text-ardoise-500">{t('registres.lieux.aucunNettoyage')}</p>
            ) : (
              <ul className="space-y-1.5">
                {nettoyages.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ardoise-200 p-2 text-sm">
                    <span>
                      <span className="chiffres">{f.date(a.date_prevue)}</span> · {t(`communal.points.actions.etats.${a.etat}`)}
                      {a.metres_lineaires != null && <span className="chiffres"> · {t('registres.lieux.ml', { n: a.metres_lineaires })}</span>}
                    </span>
                    {a.statut === 'planifiee' && (
                      <span className="flex items-center gap-1.5">
                        <input
                          inputMode="decimal"
                          value={ml[a.id] ?? ''}
                          onChange={(e) => setMl((x) => ({ ...x, [a.id]: e.target.value }))}
                          placeholder={t('registres.lieux.mlRealises')}
                          aria-label={t('registres.lieux.mlRealises')}
                          className={`${champ} w-36`}
                        />
                        <button
                          type="button"
                          disabled={enCours}
                          className={boutonPrincipal}
                          onClick={() => {
                            const v = (ml[a.id] ?? '').trim();
                            void executer(
                              () => api.modifierAction(a.id, { statut: 'terminee', ...(v ? { metresLineaires: Number(v.replace(',', '.')) } : {}) }),
                              t('registres.lieux.termine')
                            );
                          }}
                        >
                          {t('registres.lieux.terminer')}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
