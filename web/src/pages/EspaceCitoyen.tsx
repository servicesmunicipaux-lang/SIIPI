// Espace citoyen — la moitié du service que le back-end savait déjà rendre
// mais que personne ne pouvait voir.
//
// L'ordre des onglets n'est pas décoratif : « Ma collecte » vient en premier
// parce que c'est la raison pour laquelle on ouvre l'application. Le
// signalement vient ensuite, la carte publique en dernier. Une application
// citoyenne qui s'ouvre sur un formulaire de réclamation se fait désinstaller.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import {
  api,
  ErreurApi,
  type AdresseCitoyen,
  type AnnonceCollecte,
  type Commune,
  type HoraireCollecte,
} from '../lib/api';
import { Chargement, Erreur } from '../composants/Elements';
import { CartePublique } from '../composants/CartePublique';
import { FormulaireSignalement } from '../composants/FormulaireSignalement';
import { ProposerPoint } from '../composants/ProposerPoint';
import { Enlevement } from '../composants/Enlevement';

type Onglet = 'collecte' | 'signaler' | 'proposer' | 'enlevement' | 'carte';

export function EspaceCitoyen() {
  const { t } = useTranslation();
  const [onglet, setOnglet] = useState<Onglet>('collecte');
  const [adresse, setAdresse] = useState<AdresseCitoyen | null>(null);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(async () => {
    try {
      setAdresse(await api.monAdresse());
    } catch {
      setAdresse(null);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  // Cinq onglets, dans l'ordre d'usage : ce qui revient chaque semaine
  // d'abord, ce qui arrive une ou deux fois par an ensuite. « Proposer un
  // point » vient juste après « Signaler » : les deux se ressemblent — une
  // position et une photo — mais l'un signale un problème, l'autre un manque.
  const ONGLETS: Array<{ cle: Onglet; icone: string }> = [
    { cle: 'collecte', icone: '🗓' },
    { cle: 'signaler', icone: '📷' },
    { cle: 'proposer', icone: '📍' },
    { cle: 'enlevement', icone: '🚚' },
    { cle: 'carte', icone: '🗺' },
  ];

  return (
    // pb-20 : la barre de navigation est fixée en bas, à portée de pouce.
    // C'est la zone la plus atteignable d'un téléphone tenu à une main, et
    // l'essentiel des usages se fera debout, dans la rue, une main occupée.
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-24">
      {chargement ? (
        <Chargement />
      ) : (
        <>
          {onglet === 'collecte' && <MaCollecte adresse={adresse} onAdresseChangee={recharger} />}
          {onglet === 'signaler' && <FormulaireSignalement adresse={adresse} />}
          {onglet === 'proposer' && <ProposerPoint adresse={adresse} />}
          {onglet === 'enlevement' && <Enlevement adresse={adresse} />}
          {onglet === 'carte' && <CartePublique communeId={adresse?.commune_id ?? undefined} />}
        </>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-[500] border-t border-ardoise-200 bg-white/95 backdrop-blur"
        aria-label={t('citoyen.navigation')}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {ONGLETS.map(({ cle, icone }) => (
            <button
              key={cle}
              type="button"
              onClick={() => setOnglet(cle)}
              aria-current={onglet === cle ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                onglet === cle ? 'text-siipi-700' : 'text-ardoise-500'
              }`}
            >
              <span aria-hidden className="text-xl leading-none">
                {icone}
              </span>
              {t(`citoyen.onglets.${cle}`)}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ===========================================================================
   Ma collecte
   =========================================================================== */

function MaCollecte({
  adresse,
  onAdresseChangee,
}: {
  adresse: AdresseCitoyen | null;
  onAdresseChangee: () => void;
}) {
  const { t } = useTranslation();
  const [horaires, setHoraires] = useState<HoraireCollecte[] | null>(null);
  const [annonces, setAnnonces] = useState<AnnonceCollecte[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modifier, setModifier] = useState(false);

  const aUneAdresse = Boolean(adresse?.commune_id);

  useEffect(() => {
    if (!aUneAdresse) {
      setHoraires([]);
      return;
    }
    let annule = false;
    void (async () => {
      try {
        const [h, a] = await Promise.all([
          api.horaires(),
          api.annonces(adresse!.commune_id as string).catch(() => []),
        ]);
        if (!annule) {
          setHoraires(h);
          setAnnonces(a);
          setErreur(null);
        }
      } catch (err) {
        if (!annule) setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      }
    })();
    return () => {
      annule = true;
    };
  }, [aUneAdresse, adresse, t]);

  if (!aUneAdresse || modifier) {
    return (
      <FormulaireAdresse
        adresse={adresse}
        onEnregistre={() => {
          setModifier(false);
          onAdresseChangee();
        }}
        onAnnuler={aUneAdresse ? () => setModifier(false) : undefined}
      />
    );
  }

  if (erreur) return <Erreur message={erreur} />;
  if (!horaires) return <Chargement />;

  const prochain = horaires
    .map((h) => h.prochain_passage)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  const impreciss = horaires.some((h) => h.precision_source === 'commune');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ardoise-900">{t('citoyen.collecte.titre')}</h1>
          <p className="truncate text-sm text-ardoise-500">{adresse?.adresse}</p>
        </div>
        <button
          type="button"
          onClick={() => setModifier(true)}
          className="shrink-0 rounded-lg border border-ardoise-300 bg-white px-3 py-1.5 text-sm font-medium text-ardoise-700"
        >
          {t('citoyen.collecte.changerAdresse')}
        </button>
      </div>

      {/* La réponse à la question posée, en gros, avant tout le reste. */}
      <div className="rounded-2xl border border-siipi-300 bg-siipi-50 p-5 text-center">
        <p className="text-xs font-semibold tracking-wide text-siipi-800 uppercase">
          {t('citoyen.collecte.prochainPassage')}
        </p>
        <p className="chiffres-titre mt-1 text-2xl font-bold text-siipi-800">
          {prochain ? formaterJour(prochain, t) : t('citoyen.collecte.aucunPassage')}
        </p>
      </div>

      {impreciss && (
        // Un horaire imprécis affiché comme exact fait sortir les poubelles le
        // mauvais jour. On préfère le dire.
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t('citoyen.collecte.precisionCommune')}
        </p>
      )}

      {/* Trois annonces au maximum : au-delà, plus personne ne les lit. */}
      {annonces.slice(0, 3).map((a) => (
        <div key={a.id} className="rounded-xl border border-sky-300 bg-sky-50 p-3">
          <p className="text-xs font-semibold text-sky-900 uppercase">
            {t(`citoyen.annonces.${a.type}`)}
          </p>
          {/* Le message arabe quand l'interface est en arabe : un encart
                français au milieu d'un écran arabe n'est pas lu. */}
          <p className="mt-0.5 text-sm text-sky-900">{messageLangue(a.message_fr, a.message_ar)}</p>
        </div>
      ))}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ardoise-700">
          {t('citoyen.collecte.mesCircuits')}
        </h2>
        {horaires.length === 0 && (
          <p className="rounded-xl border border-ardoise-200 bg-white p-4 text-sm text-ardoise-500">
            {t('citoyen.collecte.aucunCircuit')}
          </p>
        )}
        {horaires.map((h) => (
          <article key={h.circuit_id} className="rounded-xl border border-ardoise-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium text-ardoise-900">{h.circuit_nom}</h3>
              {h.type_dechet && (
                <span className="shrink-0 rounded bg-ardoise-100 px-1.5 py-0.5 text-[11px] text-ardoise-600">
                  {t(`citoyen.dechets.${h.type_dechet}`, {
                    defaultValue: h.type_dechet,
                  })}
                </span>
              )}
            </div>
            <JoursSemaine jours={h.jours_passage ?? []} />
            {h.prochain_passage && (
              <p className="mt-2 text-sm text-ardoise-600">
                {t('citoyen.collecte.prochain')} : {formaterJour(h.prochain_passage, t)}
              </p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

/* Les sept jours, toujours affichés, ceux de passage mis en évidence.
   Une liste « lundi, mercredi » se relit ; sept pastilles se reconnaissent
   d'un coup d'œil, y compris par quelqu'un qui lit peu. */
function JoursSemaine({ jours }: { jours: number[] }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 flex gap-1.5">
      {[1, 2, 3, 4, 5, 6, 7].map((j) => {
        const actif = jours.includes(j);
        return (
          <span
            key={j}
            title={t(`citoyen.jours.${j}`)}
            className={`grid size-8 place-items-center rounded-lg text-xs font-semibold ${
              actif ? 'bg-siipi-600 text-white' : 'bg-ardoise-100 text-ardoise-400'
            }`}
          >
            {t(`citoyen.joursCourts.${j}`)}
          </span>
        );
      })}
    </div>
  );
}

/** Choisit la version linguistique disponible, sans jamais laisser l'écran vide. */
function messageLangue(fr: string | null | undefined, ar: string | null | undefined): string {
  if (i18next.language?.startsWith('ar') && ar) return ar;
  return fr ?? ar ?? '';
}

function formaterJour(iso: string, t: (cle: string) => string): string {
  const date = new Date(`${iso}T12:00:00`);
  const aujourdhui = new Date();
  const jours = Math.round(
    (date.getTime() - new Date(aujourdhui.toDateString()).getTime()) / 86_400_000
  );
  if (jours <= 0) return t('citoyen.collecte.aujourdhui');
  if (jours === 1) return t('citoyen.collecte.demain');
  return new Intl.DateTimeFormat(document.documentElement.lang || 'fr', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/* ===========================================================================
   Adresse
   =========================================================================== */

function FormulaireAdresse({
  adresse,
  onEnregistre,
  onAnnuler,
}: {
  adresse: AdresseCitoyen | null;
  onEnregistre: () => void;
  onAnnuler?: () => void;
}) {
  const { t } = useTranslation();
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [communeId, setCommuneId] = useState(adresse?.commune_id ?? '');
  const [libelle, setLibelle] = useState(adresse?.adresse ?? '');
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    adresse?.lat && adresse?.lng ? { lat: adresse.lat, lng: adresse.lng } : null
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [geoEnCours, setGeoEnCours] = useState(false);

  useEffect(() => {
    void api
      .communes()
      .then(setCommunes)
      .catch(() => setCommunes([]));
  }, []);

  const communesTriees = useMemo(
    () => [...communes].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [communes]
  );

  const localiser = () => {
    if (!navigator.geolocation) return;
    setGeoEnCours(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoEnCours(false);
      },
      () => setGeoEnCours(false),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  const envoyer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.enregistrerAdresse({
        communeId,
        adresse: libelle,
        lat: position?.lat,
        lng: position?.lng,
      });
      onEnregistre();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ardoise-900">{t('citoyen.adresse.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-500">{t('citoyen.adresse.pourquoi')}</p>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-ardoise-700">{t('citoyen.adresse.commune')}</span>
        <select
          required
          value={communeId}
          onChange={(e) => setCommuneId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ardoise-300 bg-white px-3 py-2.5 text-base"
        >
          <option value="">{t('citoyen.adresse.choisir')}</option>
          {communesTriees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ardoise-700">{t('citoyen.adresse.libelle')}</span>
        <input
          required
          minLength={3}
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder={t('citoyen.adresse.exemple')}
          className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2.5 text-base"
        />
      </label>

      <div className="rounded-xl border border-ardoise-200 bg-white p-3">
        <button
          type="button"
          onClick={localiser}
          disabled={geoEnCours}
          className="w-full rounded-lg border border-siipi-300 bg-siipi-50 px-3 py-2.5 text-sm font-medium text-siipi-800 disabled:opacity-60"
        >
          {geoEnCours ? t('citoyen.adresse.localisation') : t('citoyen.adresse.utiliserGps')}
        </button>
        <p className="mt-2 text-xs text-ardoise-500">
          {position
            ? `${t('citoyen.adresse.positionPrise')} (${position.lat.toFixed(4)}, ${position.lng.toFixed(4)})`
            : t('citoyen.adresse.positionAide')}
        </p>
      </div>

      {erreur && <Erreur message={erreur} />}

      <div className="flex gap-3">
        {onAnnuler && (
          <button
            type="button"
            onClick={onAnnuler}
            className="flex-1 rounded-lg border border-ardoise-300 bg-white px-4 py-3 font-medium text-ardoise-700"
          >
            {t('citoyen.annuler')}
          </button>
        )}
        <button
          type="submit"
          disabled={envoi || !communeId || libelle.length < 3}
          className="flex-1 rounded-lg bg-siipi-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {t('citoyen.adresse.enregistrer')}
        </button>
      </div>
    </form>
  );
}
