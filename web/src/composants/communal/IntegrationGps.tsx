// L'écran « Intégration GPS » du portail communal (lot 17.4b ; DECISIONS_2026-10-20.md
// § 8 et compléments du 23/10/2026).
//
// LA COMMUNE PARAMÈTRE, LA FNCT CONSULTE. La FNCT voit le même écran, en lecture
// seule : les champs sont désactivés et les gestes absents, un bandeau le dit.
//
// CE QUI SE VOIT D'ABORD, C'EST L'ÉTAT : la date du dernier relevé reçu (ou, en
// mots, qu'aucun n'est arrivé — jamais un zéro), et le dernier échec s'il est
// plus récent. Un fournisseur en panne ne bloque rien ; l'écran le dit.
//
// « ESSAYER » EST L'OUTIL DE LA COMMUNE quand les positions n'arrivent plus : il lit
// sans rien enregistrer et montre ce que la correspondance comprend. Un horodatage
// qu'elle ne sait pas lire s'affiche avec la valeur reçue ET le format attendu,
// exemple compris : sinon la commune ne sait pas quoi corriger.
//
// LES SECRETS NE SE RELISENT PAS. Le jeton s'écrit (« enregistré le … ») ; le secret
// du webhook ne se montre qu'une fois, à sa création.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, ErreurApi, type BoitierGps, type ConfigurationGps, type PositionsSignaleesGps, type ResultatGps, type TracesGps, type SaisieConfigurationGps } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';
import { FondsDeCarte } from '../carte/FondsDeCarte';
import { Pastille } from '../ui/Pastille';
import { FormulaireBoitierGps } from '../ajout/FormulaireBoitierGps';
import { champAjout } from '../ajout/CadreAjout';

type FormatHorodatage = 'iso' | 'epoch_s' | 'epoch_ms';
type Correspondance = SaisieConfigurationGps['correspondance'];

const CHAMPS: Array<keyof Omit<Correspondance, 'format_horodatage'>> = ['liste', 'boitier', 'latitude', 'longitude', 'horodatage', 'vitesse', 'cap'];

const correspondanceVide: Correspondance = {
  liste: '', boitier: '', latitude: '', longitude: '', horodatage: '', format_horodatage: 'iso', vitesse: '', cap: '',
};

/** Le jour de Tunis (UTC+1), au format AAAA-MM-JJ. */
const aujourdhuiTunis = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

/** Une date impossible pour une position : avant 2020, ou plus de 10 minutes dans l'avenir. */
const horsBornes = (iso: string) => {
  const t = new Date(iso).getTime();
  return t < Date.UTC(2019, 11, 31, 23) || t > Date.now() + 10 * 60 * 1000;
};

export function IntegrationGps({ communeId, fnct }: { communeId: string; fnct: boolean }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [config, setConfig] = useState<ConfigurationGps | null>(null);
  const [boitiers, setBoitiers] = useState<BoitierGps[]>([]);
  const [signalees, setSignalees] = useState<PositionsSignaleesGps>([]);
  const [traces, setTraces] = useState<TracesGps | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [c, b, s, tr] = await Promise.all([
        api.configurationGps(communeId),
        api.boitiersGps(communeId),
        api.positionsSignaleesGps(communeId),
        api.tracesGps(communeId),
      ]);
      setConfig(c);
      setBoitiers(b);
      setSignalees(s);
      setTraces(tr);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, t]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (erreur && !config) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!config) return <Chargement />;

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-ardoise-900">{t('communal.gps.titre')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.gps.intro')}</p>
      </header>

      {fnct && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <Pastille ton="neutre">{t('communal.gps.lectureSeule')}</Pastille> <span className="ms-1">{t('communal.gps.lectureSeuleAide')}</span>
        </div>
      )}

      <Etat config={config} />
      <Configuration communeId={communeId} config={config} fnct={fnct} onEnregistre={charger} />
      {config.configure && <Essai communeId={communeId} config={config} fnct={fnct} onInterroge={charger} />}
      {config.configure && config.mode === 'push' && <Webhook communeId={communeId} config={config} fnct={fnct} onGenere={charger} />}
      {config.configure && <Boitiers communeId={communeId} boitiers={boitiers} fnct={fnct} onChange={charger} />}
      {config.configure && <Signalees communeId={communeId} signalees={signalees} fnct={fnct} onRattache={charger} />}
      {config.configure && traces && <CarteTraces communeId={communeId} traces={traces} />}
      {erreur && <p className="text-sm text-red-700">{erreur}</p>}
      {/* Pour ne pas laisser croire à une donnée : les dates de cet écran sont à l'heure de Tunis. */}
      <p className="text-xs text-ardoise-500">{t('communal.gps.heureTunis', { maintenant: f.date(new Date().toISOString(), { heure: true }) })}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// L'état : le dernier relevé reçu, le dernier échec
// ---------------------------------------------------------------------------

function Etat({ config }: { config: ConfigurationGps }) {
  const { t } = useTranslation();
  const f = useFormats();
  if (!config.configure) {
    return (
      <div className="rounded-lg border border-dashed border-ardoise-300 bg-ardoise-50/60 p-4 text-sm text-ardoise-700">
        {t('communal.gps.nonConfigure')}
      </div>
    );
  }
  const recu = config.dernier_releve_recu_le ?? null;
  const echec = config.dernier_echec_le ?? null;
  const echecRecent = echec !== null && (recu === null || echec > recu);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-ardoise-200 bg-white p-4">
        <p className="text-xs text-ardoise-500">{t('communal.gps.etat.fournisseur')}</p>
        <p className="mt-1 font-medium text-ardoise-900">{config.nom}</p>
        <div className="mt-2">
          <Pastille ton={config.actif ? 'mesure' : 'neutre'}>{t(config.actif ? 'communal.gps.etat.actif' : 'communal.gps.etat.eteint')}</Pastille>{' '}
          <Pastille ton="neutre">{t(`communal.gps.modes.${config.mode}.court`)}</Pastille>
        </div>
      </div>
      <div className="rounded-lg border border-ardoise-200 bg-white p-4">
        <p className="text-xs text-ardoise-500">{t('communal.gps.etat.dernierReleve')}</p>
        <p className="mt-1 font-medium text-ardoise-900">{recu ? f.date(recu, { heure: true }) : t('communal.gps.etat.aucunReleve')}</p>
      </div>
      <div className={`rounded-lg border bg-white p-4 ${echecRecent ? 'border-red-300 border-s-4 border-s-red-500' : 'border-ardoise-200'}`}>
        <p className="text-xs text-ardoise-500">{t('communal.gps.etat.dernierEchec')}</p>
        {echec ? (
          <>
            <p className="mt-1">
              <Pastille ton={echecRecent ? 'action' : 'neutre'}>{f.date(echec, { heure: true })}</Pastille>
            </p>
            <p className="mt-1 text-sm text-ardoise-700">{config.dernier_echec_message}</p>
            {echecRecent && <p className="mt-1 text-xs text-ardoise-500">{t('communal.gps.etat.echecRienBloque')}</p>}
          </>
        ) : (
          <p className="mt-1 text-sm text-ardoise-600">{t('communal.gps.etat.aucunEchec')}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La configuration
// ---------------------------------------------------------------------------

function Configuration({ communeId, config, fnct, onEnregistre }: { communeId: string; config: ConfigurationGps; fnct: boolean; onEnregistre: () => Promise<void> }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [nom, setNom] = useState(config.nom ?? '');
  const [mode, setMode] = useState<'pull' | 'push'>(config.mode ?? 'pull');
  const [url, setUrl] = useState(config.url ?? '');
  const [cadence, setCadence] = useState(String(config.cadence_minutes ?? 5));
  const [auth, setAuth] = useState<SaisieConfigurationGps['authentification']>(config.authentification ?? 'bearer');
  const [champAuth, setChampAuth] = useState(config.nom_champ_auth ?? '');
  const [jeton, setJeton] = useState('');
  const [corr, setCorr] = useState<Correspondance>({ ...correspondanceVide, ...(config.correspondance ?? {}) });
  const [actif, setActif] = useState(config.actif ?? false);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);

  const enregistrer = async () => {
    setEnvoi(true);
    setMessage(null);
    try {
      const vide = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
      await api.enregistrerConfigurationGps(communeId, {
        nom: nom.trim(),
        mode,
        url: mode === 'pull' ? vide(url) : vide(url),
        cadenceMinutes: Number(cadence) || 5,
        authentification: auth,
        nomChampAuth: auth === 'entete' || auth === 'parametre' ? vide(champAuth) : null,
        correspondance: { ...corr, liste: corr.liste.trim(), vitesse: vide(corr.vitesse), cap: vide(corr.cap) },
        actif,
        ...(jeton ? { jeton } : {}),
      });
      setJeton('');
      setMessage({ ton: 'ok', texte: t('communal.gps.config.enregistree') });
      await onEnregistre();
    } catch (err) {
      setMessage({ ton: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="rounded-lg border border-ardoise-200 bg-white p-4">
      <h3 className="font-medium text-ardoise-900">{t('communal.gps.config.titre')}</h3>
      <fieldset disabled={fnct} className="mt-3 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            {t('communal.gps.config.nom')}
            <input value={nom} onChange={(e) => setNom(e.target.value)} className={champAjout} placeholder={t('communal.gps.config.nomExemple')} />
          </label>
          <div className="text-sm">
            {t('communal.gps.config.mode')}
            <div className="mt-1 space-y-1">
              {(['pull', 'push'] as const).map((m) => (
                <label key={m} className="flex items-start gap-2">
                  <input type="radio" name="mode-gps" checked={mode === m} onChange={() => setMode(m)} className="mt-1" />
                  <span>
                    <span className="font-medium">{t(`communal.gps.modes.${m}.libelle`)}</span>
                    <span className="block text-xs text-ardoise-500">{t(`communal.gps.modes.${m}.aide`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {mode === 'pull' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm sm:col-span-2">
              {t('communal.gps.config.url')}
              <input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} className={champAjout} placeholder="https://…" />
            </label>
            <label className="text-sm">
              {t('communal.gps.config.cadence')}
              <input type="number" min={1} max={1440} dir="ltr" value={cadence} onChange={(e) => setCadence(e.target.value)} className={champAjout} />
            </label>
          </div>
        )}

        {mode === 'pull' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              {t('communal.gps.config.authentification')}
              <select value={auth} onChange={(e) => setAuth(e.target.value as typeof auth)} className={champAjout}>
                {(['bearer', 'entete', 'parametre', 'aucune'] as const).map((a) => (
                  <option key={a} value={a}>
                    {t(`communal.gps.auth.${a}`)}
                  </option>
                ))}
              </select>
            </label>
            {(auth === 'entete' || auth === 'parametre') && (
              <label className="text-sm">
                {t(auth === 'entete' ? 'communal.gps.config.nomEntete' : 'communal.gps.config.nomParametre')}
                <input dir="ltr" value={champAuth} onChange={(e) => setChampAuth(e.target.value)} className={champAjout} />
              </label>
            )}
            {auth !== 'aucune' && (
              <label className="text-sm">
                {t('communal.gps.config.jeton')}
                <input
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  value={jeton}
                  onChange={(e) => setJeton(e.target.value)}
                  className={champAjout}
                  placeholder={
                    config.configure && config.jeton_enregistre_le
                      ? t('communal.gps.config.jetonEnregistre', { date: f.date(config.jeton_enregistre_le, { heure: true }) })
                      : t('communal.gps.config.jetonAbsent')
                  }
                />
              </label>
            )}
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-ardoise-800">{t('communal.gps.config.correspondance')}</p>
          <p className="text-xs text-ardoise-500">{t('communal.gps.config.correspondanceAide')}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CHAMPS.map((c) => (
              <label key={c} className="text-sm">
                {t(`communal.gps.champs.${c}`)}
                <input
                  dir="ltr"
                  value={corr[c] ?? ''}
                  onChange={(e) => setCorr({ ...corr, [c]: e.target.value })}
                  className={champAjout}
                  placeholder={t(`communal.gps.exemplesChamps.${c}`)}
                />
              </label>
            ))}
            <label className="text-sm">
              {t('communal.gps.champs.format_horodatage')}
              <select
                value={corr.format_horodatage}
                onChange={(e) => setCorr({ ...corr, format_horodatage: e.target.value as FormatHorodatage })}
                className={champAjout}
              >
                {(['iso', 'epoch_s', 'epoch_ms'] as const).map((fo) => (
                  <option key={fo} value={fo}>
                    {t(`communal.gps.formats.${fo}.libelle`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
          {t('communal.gps.config.actif')}
        </label>
      </fieldset>

      {!fnct && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={envoi || nom.trim() === ''}
            onClick={() => void enregistrer()}
            className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {t('communal.gps.config.enregistrer')}
          </button>
          {message && <p className={`text-sm ${message.ton === 'ok' ? 'text-siipi-700' : 'text-red-700'}`}>{message.texte}</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Essayer, interroger
// ---------------------------------------------------------------------------

function Essai({ communeId, config, fnct, onInterroge }: { communeId: string; config: ConfigurationGps; fnct: boolean; onInterroge: () => Promise<void> }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [exemple, setExemple] = useState('');
  const [resultat, setResultat] = useState<ResultatGps | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const format = (config.correspondance?.format_horodatage ?? 'iso') as FormatHorodatage;

  const lancer = async (geste: 'essai' | 'interroger') => {
    setEnvoi(true);
    setErreur(null);
    setResultat(null);
    try {
      if (geste === 'interroger') {
        setResultat(await api.interrogerGps(communeId));
        await onInterroge();
      } else if (config.mode === 'push') {
        let json: unknown;
        try {
          json = JSON.parse(exemple);
        } catch {
          setErreur(t('communal.gps.essai.exempleIllisible'));
          return;
        }
        setResultat(await api.essayerGps(communeId, json));
      } else {
        setResultat(await api.essayerGps(communeId));
      }
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="rounded-lg border border-ardoise-200 bg-white p-4">
      <h3 className="font-medium text-ardoise-900">{t('communal.gps.essai.titre')}</h3>
      <p className="mt-1 text-sm text-ardoise-600">{t(config.mode === 'push' ? 'communal.gps.essai.aidePush' : 'communal.gps.essai.aidePull')}</p>
      {/* Décision du 23/10/2026 : quand les positions n'arrivent plus, la commune sait quoi faire sans appeler la FNCT. */}
      <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">{t('communal.gps.essai.siApiChange')}</p>

      {!fnct && config.mode === 'push' && (
        <textarea
          dir="ltr"
          value={exemple}
          onChange={(e) => setExemple(e.target.value)}
          rows={5}
          className={`${champAjout} mt-3 font-mono text-xs`}
          placeholder={t('communal.gps.essai.exemplePlaceholder')}
        />
      )}

      {!fnct && (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={envoi || (config.mode === 'push' && exemple.trim() === '')}
            onClick={() => void lancer('essai')}
            className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {t('communal.gps.essai.essayer')}
          </button>
          {config.mode === 'pull' && (
            <button
              type="button"
              disabled={envoi}
              onClick={() => void lancer('interroger')}
              className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm text-ardoise-800 disabled:opacity-50"
            >
              {t('communal.gps.essai.interroger')}
            </button>
          )}
        </div>
      )}

      {erreur && <p className="mt-3 text-sm text-red-700">{erreur}</p>}
      {resultat?.statut === 'echec' && (
        <p className="mt-3">
          <Pastille ton="action">{t('communal.gps.essai.echec')}</Pastille> <span className="ms-1 text-sm text-ardoise-800">{resultat.message}</span>
        </p>
      )}
      {resultat?.statut === 'ok' && (
        <p className="mt-3 text-sm text-ardoise-800">
          {t('communal.gps.essai.bilan', {
            recues: formaterNombre(resultat.recues ?? 0),
            enregistrees: formaterNombre(resultat.enregistrees ?? 0),
            doublons: formaterNombre(resultat.doublons ?? 0),
            signalees: formaterNombre(resultat.signalees ?? 0),
          })}
        </p>
      )}
      {resultat?.statut === 'essai' && (
        <div className="mt-3">
          <p className="text-sm text-ardoise-800">{t('communal.gps.essai.lues', { n: formaterNombre(resultat.lues ?? 0) })}</p>
          {(resultat.apercu ?? []).length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-ardoise-200 text-start text-xs text-ardoise-500">
                    <th className="px-2 py-1 text-start">{t('communal.gps.champs.boitier')}</th>
                    <th className="px-2 py-1 text-start">{t('communal.gps.champs.latitude')}</th>
                    <th className="px-2 py-1 text-start">{t('communal.gps.champs.longitude')}</th>
                    <th className="px-2 py-1 text-start">{t('communal.gps.champs.horodatage')}</th>
                    <th className="px-2 py-1 text-start">{t('communal.gps.essai.colonneVitesse')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(resultat.apercu ?? []).map((p, i) => (
                    <tr key={i} className="border-b border-ardoise-100 align-top">
                      <td className="px-2 py-1" dir="ltr">{p.boitier ?? '—'}</td>
                      <td className="px-2 py-1 chiffres" dir="ltr">{p.lat ?? t('communal.gps.essai.illisible')}</td>
                      <td className="px-2 py-1 chiffres" dir="ltr">{p.lng ?? t('communal.gps.essai.illisible')}</td>
                      <td className="px-2 py-1">
                        {p.horodatage && !horsBornes(p.horodatage) ? (
                          f.date(p.horodatage, { heure: true })
                        ) : (
                          <HorodatageIllisible brut={p.horodatage_brut} format={format} impossible={!!p.horodatage} />
                        )}
                      </td>
                      <td className="px-2 py-1 chiffres" dir="ltr">{p.vitesse ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Un horodatage que la correspondance n'a pas su lire : la valeur reçue, ce qui
 * était attendu (avec un exemple), et quoi corriger (ajout de Nacer, 23/10/2026).
 */
function HorodatageIllisible({ brut, format, impossible }: { brut: string | null; format: FormatHorodatage; impossible: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="block rounded-md bg-red-50 p-2 text-xs text-red-900 ring-1 ring-inset ring-red-200">
      <span className="font-medium">{t(impossible ? 'communal.gps.essai.horodatageImpossible' : 'communal.gps.essai.horodatageIllisible')}</span>{' '}
      <code dir="ltr" className="rounded bg-white px-1">{brut ?? t('communal.gps.essai.absent')}</code>
      <span className="block mt-1">
        {t('communal.gps.essai.attendu', { format: t(`communal.gps.formats.${format}.libelle`), exemple: t(`communal.gps.formats.${format}.exemple`) })}
      </span>
      <span className="block mt-1">{t('communal.gps.essai.verifierFormat')}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Le webhook
// ---------------------------------------------------------------------------

function Webhook({ communeId, config, fnct, onGenere }: { communeId: string; config: ConfigurationGps; fnct: boolean; onGenere: () => Promise<void> }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [secret, setSecret] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const adresse = `${window.location.origin}/api${config.webhook_chemin ?? ''}`;

  const generer = async () => {
    setErreur(null);
    try {
      const r = await api.secretWebhookGps(communeId);
      setSecret(r.secret);
      await onGenere();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };
  const copier = (texte: string) => void navigator.clipboard?.writeText(texte);

  return (
    <div className="rounded-lg border border-ardoise-200 bg-white p-4">
      <h3 className="font-medium text-ardoise-900">{t('communal.gps.webhook.titre')}</h3>
      <p className="mt-1 text-sm text-ardoise-600">{t('communal.gps.webhook.aide')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code dir="ltr" className="break-all rounded bg-ardoise-100 px-2 py-1 text-xs">{adresse}</code>
        <button type="button" onClick={() => copier(adresse)} className="rounded-md border border-ardoise-300 px-2 py-1 text-xs">
          {t('communal.gps.webhook.copier')}
        </button>
      </div>
      <p className="mt-3 text-sm">
        {config.secret_webhook_enregistre_le ? (
          <Pastille ton="mesure">{t('communal.gps.webhook.secretEnregistre', { date: f.date(config.secret_webhook_enregistre_le, { heure: true }) })}</Pastille>
        ) : (
          <Pastille ton="attention">{t('communal.gps.webhook.sansSecret')}</Pastille>
        )}
      </p>
      {!fnct && (
        <button type="button" onClick={() => void generer()} className="mt-3 min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm">
          {t(config.secret_webhook_enregistre_le ? 'communal.gps.webhook.regenerer' : 'communal.gps.webhook.generer')}
        </button>
      )}
      {secret && (
        <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">{t('communal.gps.webhook.uneFois')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code dir="ltr" className="break-all rounded bg-white px-2 py-1 text-xs">{secret}</code>
            <button type="button" onClick={() => copier(secret)} className="rounded-md border border-ardoise-300 bg-white px-2 py-1 text-xs">
              {t('communal.gps.webhook.copier')}
            </button>
          </div>
        </div>
      )}
      {erreur && <p className="mt-2 text-sm text-red-700">{erreur}</p>}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ardoise-700">{t('communal.gps.webhook.pourFournisseur')}</summary>
        <div dir="ltr" className="mt-2 space-y-1 rounded-md bg-ardoise-50 p-3 font-mono text-xs text-ardoise-800">
          <p>POST {adresse}</p>
          <p>X-SIIPI-Horodatage: &lt;secondes Unix&gt;</p>
          <p>X-SIIPI-Signature: sha256=&lt;HMAC-SHA256 hex(secret, horodatage + "." + corps)&gt;</p>
        </div>
        <p className="mt-2 text-xs text-ardoise-500">{t('communal.gps.webhook.fenetre')}</p>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les boîtiers
// ---------------------------------------------------------------------------

function Boitiers({ communeId, boitiers, fnct, onChange }: { communeId: string; boitiers: BoitierGps[]; fnct: boolean; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [ajout, setAjout] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const clore = async (b: BoitierGps) => {
    if (!window.confirm(t('communal.gps.boitiers.confirmerCloture', { boitier: b.identifiant, engin: b.registration ?? b.vehicule_id }))) return;
    setErreur(null);
    try {
      await api.cloreBoitierGps(b.id);
      await onChange();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  return (
    <div className="rounded-lg border border-ardoise-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-ardoise-900">{t('communal.gps.boitiers.titre')}</h3>
        {!fnct && (
          <button type="button" onClick={() => setAjout((a) => !a)} className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white">
            {ajout ? t('commun.annuler') : t('communal.gps.boitiers.rattacher')}
          </button>
        )}
      </div>
      {ajout && (
        <div className="mt-3">
          <FormulaireBoitierGps
            communeId={communeId}
            onAnnuler={() => setAjout(false)}
            onFait={async () => {
              setAjout(false);
              await onChange();
            }}
          />
        </div>
      )}
      {boitiers.length === 0 ? (
        <p className="mt-2 text-sm text-ardoise-600">{t('communal.gps.boitiers.aucun')}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-ardoise-200 text-xs text-ardoise-500">
                <th className="px-2 py-1 text-start">{t('communal.gps.boitiers.boitier')}</th>
                <th className="px-2 py-1 text-start">{t('communal.gps.boitiers.engin')}</th>
                <th className="px-2 py-1 text-start">{t('communal.gps.boitiers.depuis')}</th>
                <th className="px-2 py-1 text-start">{t('communal.gps.boitiers.jusquau')}</th>
                <th className="px-2 py-1 text-start">{t('communal.gps.boitiers.etat')}</th>
                {!fnct && <th />}
              </tr>
            </thead>
            <tbody>
              {boitiers.map((b) => (
                <tr key={b.id} className="border-b border-ardoise-100">
                  <td className="px-2 py-1" dir="ltr">{b.identifiant}</td>
                  <td className="px-2 py-1" dir="ltr">{b.registration ?? b.vehicule_id}</td>
                  <td className="px-2 py-1">{f.date(b.date_debut, { heure: true })}</td>
                  <td className="px-2 py-1">{b.date_fin ? f.date(b.date_fin, { heure: true }) : '—'}</td>
                  <td className="px-2 py-1">
                    <Pastille ton={b.date_fin ? 'neutre' : 'mesure'}>{t(b.date_fin ? 'communal.gps.boitiers.clos' : 'communal.gps.boitiers.enService')}</Pastille>
                  </td>
                  {!fnct && (
                    <td className="px-2 py-1 text-end">
                      {!b.date_fin && (
                        <button type="button" onClick={() => void clore(b)} className="rounded-md border border-ardoise-300 px-2 py-1 text-xs">
                          {t('communal.gps.boitiers.clore')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erreur && <p className="mt-2 text-sm text-red-700">{erreur}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les positions signalées
// ---------------------------------------------------------------------------

function Signalees({ communeId, signalees, fnct, onRattache }: { communeId: string; signalees: PositionsSignaleesGps; fnct: boolean; onRattache: () => Promise<void> }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [aRattacher, setARattacher] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-ardoise-200 bg-white p-4">
      <h3 className="font-medium text-ardoise-900">{t('communal.gps.signalees.titre')}</h3>
      <p className="mt-1 text-sm text-ardoise-600">{t('communal.gps.signalees.aide')}</p>
      {signalees.length === 0 ? (
        <p className="mt-2 text-sm text-ardoise-600">{t('communal.gps.signalees.aucune')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {signalees.map((s, i) => (
            <li key={`${s.boitier}-${s.motif}-${i}`} className="rounded-md border border-ardoise-200 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Pastille ton="attention">{t(`communal.gps.motifs.${s.motif}`)}</Pastille>
                <code dir="ltr" className="rounded bg-ardoise-100 px-1 text-xs">{s.boitier ?? t('communal.gps.essai.absent')}</code>
                <span className="text-ardoise-700">
                  {t('communal.gps.signalees.nombre', { n: formaterNombre(s.nombre), date: f.date(s.derniere_recue, { heure: true }) })}
                </span>
              </div>
              {s.motif === 'horodatage_invalide' && (
                <p className="mt-1 text-xs text-ardoise-600">
                  {t('communal.gps.signalees.formatChange')} <code dir="ltr" className="rounded bg-ardoise-100 px-1">{s.dernier_horodatage_brut ?? '—'}</code>
                </p>
              )}
              {s.motif === 'boitier_inconnu' && s.boitier && !fnct && (
                <button type="button" onClick={() => setARattacher(s.boitier)} className="mt-2 rounded-md border border-ardoise-300 px-2 py-1 text-xs">
                  {t('communal.gps.signalees.rattacherCeBoitier')}
                </button>
              )}
              {aRattacher !== null && aRattacher === s.boitier && s.motif === 'boitier_inconnu' && (
                <div className="mt-2">
                  <FormulaireBoitierGps
                    communeId={communeId}
                    identifiantInitial={s.boitier ?? ''}
                    onAnnuler={() => setARattacher(null)}
                    onFait={async () => {
                      setARattacher(null);
                      await onRattache();
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La carte
// ---------------------------------------------------------------------------

function CarteTraces({ communeId, traces }: { communeId: string; traces: TracesGps }) {
  const { t } = useTranslation();
  const f = useFormats();
  const dernieres = traces.dernieres ?? [];
  const [engin, setEngin] = useState('');
  const [jour, setJour] = useState(aujourdhuiTunis());
  const [trace, setTrace] = useState<TracesGps | null>(null);

  useEffect(() => {
    if (!engin) {
      setTrace(null);
      return;
    }
    let annule = false;
    api
      .tracesGps(communeId, engin, jour)
      .then((r) => !annule && setTrace(r))
      .catch(() => !annule && setTrace(null));
    return () => {
      annule = true;
    };
  }, [communeId, engin, jour]);

  const points = useMemo(() => (trace?.points ?? []).map((p) => [p.lat, p.lng] as [number, number]), [trace]);
  const limites = useMemo(() => {
    const tous = points.length > 0 ? points : dernieres.map((d) => [d.lat, d.lng] as [number, number]);
    return tous.length > 0 ? L.latLngBounds(tous).pad(0.2) : null;
  }, [points, dernieres]);

  return (
    <div className="rounded-lg border border-ardoise-200 bg-white p-4">
      <h3 className="font-medium text-ardoise-900">{t('communal.gps.carte.titre')}</h3>
      {dernieres.length === 0 ? (
        <p className="mt-2 text-sm text-ardoise-600">{t('communal.gps.carte.aucunePosition')}</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="text-sm">
              {t('communal.gps.carte.engin')}
              <select value={engin} onChange={(e) => setEngin(e.target.value)} className={champAjout}>
                <option value="">{t('communal.gps.carte.tousLesEngins')}</option>
                {dernieres.map((d) => (
                  <option key={d.vehicule_id} value={d.vehicule_id}>
                    {d.registration ?? d.vehicule_id}
                  </option>
                ))}
              </select>
            </label>
            {engin && (
              <label className="text-sm">
                {t('communal.gps.carte.jour')}
                <input type="date" dir="ltr" value={jour} onChange={(e) => setJour(e.target.value)} className={champAjout} />
              </label>
            )}
          </div>
          {engin && trace && points.length === 0 && <p className="mt-2 text-sm text-ardoise-600">{t('communal.gps.carte.aucunPointCeJour')}</p>}
          {limites && (
            <div className="mt-3 h-80 overflow-hidden rounded-lg border border-ardoise-200">
              <MapContainer key={`${engin}-${jour}-${points.length}`} bounds={limites} className="h-full w-full" scrollWheelZoom={false}>
                <FondsDeCarte />
                {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#13784f', weight: 4 }} />}
                {(engin ? dernieres.filter((d) => d.vehicule_id === engin) : dernieres).map((d) => (
                  <CircleMarker key={d.vehicule_id} center={[d.lat, d.lng]} radius={8} pathOptions={{ color: '#0b4f34', fillColor: '#13784f', fillOpacity: 0.9 }}>
                    <Tooltip direction="top" permanent={dernieres.length <= 12}>
                      <span dir="ltr">{d.registration ?? d.vehicule_id}</span> · {f.date(d.horodatage, { heure: true })}
                    </Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
