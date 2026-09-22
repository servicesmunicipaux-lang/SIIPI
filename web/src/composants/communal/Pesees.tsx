// Les pesées.
//
// L'ÉCRAN S'OUVRE SUR CE QU'IL RESTE À SAISIR, pas sur ce qui a été saisi.
// C'est la même leçon que la feuille de pointage du module 4 : une liste des
// seules lignes déjà enregistrées ne montre jamais celles qu'on a oubliées, et
// c'est précisément ce qu'on cherche à voir. Chaque voyage attendu du jour a sa
// case ; on tape un poids, on valide, la ligne passe au vert.
//
// LA SURCHARGE EST SIGNALÉE À LA SAISIE. Le module 3 connaît la charge utile
// des vingt-neuf engins de Dar Chaabane. Un poids au-dessus de cette charge est
// soit une décimale déplacée — 42 000 kg tapé au lieu de 4 200 — soit une
// surcharge réelle. Les deux appellent une action, mais pas la même, et aucune
// ne se voit en relisant une liste le mois suivant.
//
// CE QUI N'EST PAS ICI : l'import des classeurs ANGeD et le recoupement avec
// leurs chiffres. L'interopérabilité avec leur plateforme n'est pas possible
// aujourd'hui ; le registre est bâti pour les accueillir le jour venu.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type Pesee,
  type PeseeAttendue,
  type TonnageCircuit,
  type TonnageMensuel,
} from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const TYPES_DECHET = ['menager', 'vert', 'ddc', 'encombrant', 'metal', 'tri', 'autre'] as const;
type TypeDechet = (typeof TYPES_DECHET)[number];

type Vue = 'saisie' | 'registre' | 'tonnages';
const VUES: Vue[] = ['saisie', 'registre', 'tonnages'];

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const nombre = (n: unknown, d = 0) =>
  n === null || n === undefined
    ? '—'
    : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function Pesees({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [vue, setVue] = useState<Vue>('saisie');
  const [jour, setJour] = useState(aujourdhui());

  const [attendues, setAttendues] = useState<PeseeAttendue[] | null>(null);
  const [registre, setRegistre] = useState<Pesee[] | null>(null);
  const [tonnages, setTonnages] = useState<TonnageCircuit[] | null>(null);
  const [mensuel, setMensuel] = useState<TonnageMensuel[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [a, r, tg, m] = await Promise.all([
        api.peseesAttendues(communeId, jour),
        api.pesees(communeId),
        api.tonnages(communeId),
        api.tonnageMensuel(communeId),
      ]);
      setAttendues(a);
      setRegistre(r);
      setTonnages(tg);
      setMensuel(m);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, jour, t]);

  useEffect(() => { void charger(); }, [charger]);

  const resume = useMemo(() => {
    const l = attendues ?? [];
    return { attendus: l.length, peses: l.filter((x) => x.pesee_id !== null).length };
  }, [attendues]);

  const tonnageJour = useMemo(
    () => (attendues ?? []).reduce((s, x) => s + Number(x.poids_net_kg ?? 0), 0) / 1000,
    [attendues]
  );

  if (erreur && !attendues) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!attendues || !registre || !tonnages || !mensuel) return <Chargement />;

  const surcharges = registre.filter((p) => p.surcharge).length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.pesees.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-600">{t('communal.pesees.chapeau')}</p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Carte
          libelle={t('communal.pesees.aSaisir')}
          valeur={`${nombre(resume.peses)} / ${nombre(resume.attendus)}`}
          accent={resume.attendus > 0 && resume.peses < resume.attendus ? 'attente' : undefined}
        />
        <Carte libelle={t('communal.pesees.tonnageJour')} valeur={`${nombre(tonnageJour, 2)} t`} />
        <Carte
          libelle={t('communal.pesees.tonnage30j')}
          valeur={`${nombre(tonnages.reduce((s, x) => s + Number(x.tonnage_t), 0), 1)} t`}
        />
        <Carte
          libelle={t('communal.pesees.surcharges')}
          valeur={nombre(surcharges)}
          accent={surcharges > 0 ? 'alerte' : undefined}
        />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-ardoise-200" aria-label={t('communal.pesees.navigation')}>
        {VUES.map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => setVue(cle)}
            aria-current={vue === cle ? 'page' : undefined}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${
              vue === cle ? 'border-siipi-600 text-siipi-700' : 'border-transparent text-ardoise-500 hover:text-ardoise-800'
            }`}
          >
            {t(`communal.pesees.vues.${cle}`)}
          </button>
        ))}
      </nav>

      {vue === 'saisie' && (
        <section className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-ardoise-700">
            {t('communal.pesees.jour')}
            <input
              type="date"
              value={jour}
              max={aujourdhui()}
              onChange={(e) => setJour(e.target.value)}
              className="min-h-11 rounded-lg border border-ardoise-300 px-3"
            />
          </label>

          {attendues.length === 0 ? (
            <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">
              {t('communal.pesees.aucunVoyage')}
            </p>
          ) : (
            <ul className="divide-y divide-ardoise-200 rounded-xl border border-ardoise-200 bg-white">
              {attendues.map((a) => (
                <LigneSaisie
                  key={`${a.circuit_id}-${a.voyage}`}
                  ligne={a}
                  communeId={communeId}
                  jour={jour}
                  onFait={charger}
                  onErreur={setErreur}
                />
              ))}
            </ul>
          )}

          <p className="text-xs text-ardoise-500">{t('communal.pesees.noteSaisie')}</p>
        </section>
      )}

      {vue === 'registre' && (
        <section className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          {registre.length === 0 ? (
            <p className="p-6 text-sm text-ardoise-600">{t('communal.pesees.registreVide')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ardoise-50 text-left text-xs uppercase text-ardoise-600">
                <tr>
                  <th className="p-3">{t('communal.pesees.colDate')}</th>
                  <th className="p-3">{t('communal.pesees.colCircuit')}</th>
                  <th className="p-3">{t('communal.pesees.colEngin')}</th>
                  <th className="p-3">{t('communal.pesees.colFlux')}</th>
                  <th className="p-3 text-right">{t('communal.pesees.colPoids')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ardoise-200">
                {registre.map((p) => (
                  <tr key={p.id} className={p.surcharge ? 'bg-red-50' : undefined}>
                    <td className="p-3 whitespace-nowrap">
                      {new Date(p.date_pesee).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="p-3">
                      {p.circuit ?? <span className="text-ardoise-500">{t('communal.pesees.horsCircuit')}</span>}
                      {p.voyage > 1 && <span className="text-ardoise-500"> · {t('communal.pesees.voyageN', { n: p.voyage })}</span>}
                    </td>
                    <td className="p-3 text-ardoise-600">{p.engin ?? '—'}</td>
                    <td className="p-3 text-ardoise-600">
                      {t(`communal.pesees.flux.${p.type_dechet}`, { defaultValue: p.type_dechet })}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {nombre(p.poids_net_kg)} kg
                      {p.surcharge && (
                        <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-900">
                          {t('communal.pesees.surcharge', { n: nombre(p.charge_utile_t, 1) })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {vue === 'tonnages' && (
        <section className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-ardoise-50 text-left text-xs uppercase text-ardoise-600">
                <tr>
                  <th className="p-3">{t('communal.pesees.colCircuit')}</th>
                  <th className="p-3">{t('communal.pesees.colFlux')}</th>
                  <th className="p-3 text-right">{t('communal.pesees.colPesees')}</th>
                  <th className="p-3 text-right">{t('communal.pesees.colTonnage')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ardoise-200">
                {tonnages.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-ardoise-600">{t('communal.pesees.registreVide')}</td></tr>
                )}
                {tonnages.map((x) => (
                  <tr key={`${x.circuit_id ?? 'hors'}-${x.type_dechet}`}>
                    <td className="p-3 font-medium text-ardoise-900">{x.circuit}</td>
                    <td className="p-3 text-ardoise-600">
                      {t(`communal.pesees.flux.${x.type_dechet}`, { defaultValue: x.type_dechet })}
                    </td>
                    <td className="p-3 text-right tabular-nums">{nombre(x.pesees)}</td>
                    <td className="p-3 text-right tabular-nums">{nombre(x.tonnage_t, 2)} t</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mensuel.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-ardoise-50 text-left text-xs uppercase text-ardoise-600">
                  <tr>
                    <th className="p-3">{t('communal.pesees.colMois')}</th>
                    <th className="p-3 text-right">{t('communal.pesees.colTonnage')}</th>
                    <th className="p-3 text-right">{t('communal.pesees.colKgHab')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ardoise-200">
                  {mensuel.map((m) => (
                    <tr key={`${m.annee}-${m.mois}`}>
                      <td className="p-3">{MOIS[m.mois - 1]} {m.annee}</td>
                      <td className="p-3 text-right tabular-nums">{nombre(m.tonnage_t, 2)} t</td>
                      <td className="p-3 text-right tabular-nums">
                        {m.kg_hab_jour === null ? '—' : nombre(m.kg_hab_jour, 3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-ardoise-200 p-3 text-xs text-ardoise-500">
                {t('communal.pesees.noteKgHab')}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// --- Une ligne de saisie -----------------------------------------------------

function LigneSaisie({
  ligne,
  communeId,
  jour,
  onFait,
  onErreur,
}: {
  ligne: PeseeAttendue;
  communeId: string;
  jour: string;
  onFait: () => Promise<void>;
  onErreur: (m: string | null) => void;
}) {
  const { t } = useTranslation();
  const [poids, setPoids] = useState('');
  const [flux, setFlux] = useState<TypeDechet>((ligne.type_dechet as TypeDechet) ?? 'menager');
  const [enCours, setEnCours] = useState(false);

  const deja = ligne.pesee_id !== null;

  const enregistrer = async () => {
    const valeur = Number(poids.replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      onErreur(t('communal.pesees.poidsInvalide'));
      return;
    }
    setEnCours(true);
    onErreur(null);
    try {
      await api.creerPesee(communeId, {
        datePesee: jour,
        circuitId: ligne.circuit_id,
        voyage: ligne.voyage,
        vehiculeId: ligne.vehicule_id ?? undefined,
        vehiculeImmat: ligne.vehicule_id ? undefined : ligne.vehicule_immat,
        typeDechet: flux,
        poidsNetKg: valeur,
      });
      setPoids('');
      await onFait();
    } catch (err) {
      onErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <li className={`flex flex-wrap items-center gap-3 p-3 ${deja ? 'bg-siipi-50/40' : ''}`}>
      <div className="min-w-[10rem] flex-1">
        <p className="font-medium text-ardoise-900">{ligne.circuit}</p>
        <p className="text-xs text-ardoise-500">
          {t('communal.pesees.voyageN', { n: ligne.voyage })}
          {ligne.vehicule_immat ? ` · ${ligne.vehicule_immat}` : ''}
        </p>
      </div>

      {deja ? (
        <p className="text-sm font-medium text-siipi-800">
          {Number(ligne.poids_net_kg).toLocaleString('fr-FR')} kg
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={flux}
            onChange={(e) => setFlux(e.target.value as TypeDechet)}
            className="min-h-11 rounded-lg border border-ardoise-300 px-2 text-sm"
            aria-label={t('communal.pesees.colFlux')}
          >
            {TYPES_DECHET.map((f) => (
              <option key={f} value={f}>{t(`communal.pesees.flux.${f}`)}</option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            value={poids}
            onChange={(e) => setPoids(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void enregistrer(); }}
            placeholder={t('communal.pesees.kg')}
            className="min-h-11 w-28 rounded-lg border border-ardoise-300 px-3 text-right"
            aria-label={t('communal.pesees.colPoids')}
          />
          <button
            type="button"
            onClick={() => void enregistrer()}
            disabled={enCours || poids.trim() === ''}
            className="min-h-11 rounded-lg bg-siipi-600 px-3 text-sm text-white disabled:opacity-40"
          >
            {t('communal.pesees.enregistrer')}
          </button>
        </div>
      )}
    </li>
  );
}

function Carte({
  libelle,
  valeur,
  accent,
}: {
  libelle: string;
  valeur: string;
  accent?: 'attente' | 'alerte';
}) {
  const bord =
    accent === 'alerte' ? 'border-red-300 bg-red-50'
    : accent === 'attente' ? 'border-amber-300 bg-amber-50'
    : 'border-ardoise-200 bg-white';
  return (
    <div className={`rounded-xl border p-3 ${bord}`}>
      <p className="text-xs uppercase tracking-wide text-ardoise-500">{libelle}</p>
      <p className="mt-1 text-lg font-semibold text-ardoise-900">{valeur}</p>
    </div>
  );
}
