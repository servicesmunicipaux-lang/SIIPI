// Déchets verts, gravats, encombrants.
//
// Aucun camion ne passe pour ces déchets-là. L'écran a donc un rôle que les
// autres n'ont pas : il doit donner une issue légale à quelqu'un qui, sans
// lui, appellerait le collecteur informel — devenu illégal. C'est pourquoi
// l'annuaire des collecteurs agréés est affiché À CÔTÉ du formulaire, et non
// caché derrière un second écran : le citoyen doit voir les deux voies au même
// moment, pas découvrir la seconde après avoir renoncé à la première.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type AdresseCitoyen,
  type CollecteurAgree,
  type DemandeEnlevement,
  type TypeDechetOccasionnel,
} from '../lib/api';
import { Chargement, Erreur } from './Elements';

const TYPES: TypeDechetOccasionnel[] = ['vert', 'ddc', 'encombrant', 'metal', 'autre'];
const ACCES = ['rue', 'cour', 'etage', 'difficile'] as const;

const COULEUR_STATUT: Record<string, string> = {
  recue: 'bg-ardoise-100 text-ardoise-700',
  planifiee: 'bg-sky-100 text-sky-900',
  realisee: 'bg-siipi-100 text-siipi-800',
  orientee_collecteur: 'bg-amber-100 text-amber-900',
  refusee: 'bg-red-100 text-red-900',
  annulee: 'bg-ardoise-100 text-ardoise-500',
};

/* Une date d'enlèvement se lit « jeudi 19 septembre », pas « 2026-09-19 ».
   Midi et non minuit : à minuit, un décalage horaire d'une heure renvoie la
   veille — le même piège que celui corrigé côté serveur sur les colonnes DATE. */
function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat(document.documentElement.lang || 'fr', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${iso}T12:00:00`));
}

export function Enlevement({ adresse }: { adresse: AdresseCitoyen | null }) {
  const { t } = useTranslation();
  const [demandes, setDemandes] = useState<DemandeEnlevement[] | null>(null);
  const [collecteurs, setCollecteurs] = useState<CollecteurAgree[]>([]);
  const [type, setType] = useState<TypeDechetOccasionnel>('vert');
  const [volume, setVolume] = useState('');
  const [description, setDescription] = useState('');
  const [acces, setAcces] = useState<(typeof ACCES)[number]>('rue');
  const [dateSouhaitee, setDateSouhaitee] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);

  const communeId = adresse?.commune_id ?? null;

  const charger = async () => {
    if (!communeId) return;
    const [d, c] = await Promise.all([
      api.mesDemandes().catch(() => []),
      api.collecteurs(communeId).catch(() => []),
    ]);
    setDemandes(d);
    setCollecteurs(c);
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  if (!communeId) {
    return (
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        {t('citoyen.signaler.adresseRequise')}
      </p>
    );
  }

  if (!demandes) return <Chargement />;

  // Les collecteurs du type sélectionné : un numéro qui ne correspond pas au
  // besoin envoie le citoyen au refus, puis à la benne sauvage.
  const collecteursDuType = collecteurs.filter((c) => (c.types_dechets ?? []).includes(type));

  const envoyer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.demanderEnlevement({
        typeDechet: type,
        volumeM3: volume ? Number.parseFloat(volume) : null,
        description: description || null,
        acces,
        dateSouhaitee: dateSouhaitee || null,
      });
      setVolume('');
      setDescription('');
      setDateSouhaitee('');
      setFormulaireOuvert(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ardoise-900">{t('citoyen.enlevement.titre')}</h1>
        <p className="mt-1 text-sm text-ardoise-500">{t('citoyen.enlevement.explication')}</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ardoise-700">
          {t('citoyen.enlevement.type')}
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {TYPES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v)}
              className={`rounded-lg border px-3 py-3 text-sm font-medium ${
                type === v
                  ? 'border-siipi-500 bg-siipi-50 text-siipi-800'
                  : 'border-ardoise-300 bg-white text-ardoise-700'
              }`}
            >
              {t(`citoyen.typesOccasionnels.${v}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Voie 1 : la commune. */}
      {!formulaireOuvert ? (
        <button
          type="button"
          onClick={() => setFormulaireOuvert(true)}
          className="w-full rounded-lg bg-siipi-600 px-4 py-3.5 font-semibold text-white"
        >
          {t('citoyen.enlevement.demander')}
        </button>
      ) : (
        <form
          onSubmit={envoyer}
          className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4"
        >
          <label className="block">
            <span className="text-sm font-medium text-ardoise-700">
              {t('citoyen.enlevement.volume')}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0.5"
              max="100"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              placeholder={t('citoyen.enlevement.volumeExemple')}
              className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2.5 text-base"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ardoise-700">
              {t('citoyen.enlevement.acces')}
            </span>
            <select
              value={acces}
              onChange={(e) => setAcces(e.target.value as (typeof ACCES)[number])}
              className="mt-1 w-full rounded-lg border border-ardoise-300 bg-white px-3 py-2.5 text-base"
            >
              {ACCES.map((a) => (
                <option key={a} value={a}>
                  {t(`citoyen.acces.${a}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ardoise-700">
              {t('citoyen.enlevement.dateSouhaitee')}
            </span>
            <input
              type="date"
              value={dateSouhaitee}
              onChange={(e) => setDateSouhaitee(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2.5 text-base"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ardoise-700">
              {t('citoyen.signaler.precisions')}
            </span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2.5 text-base"
            />
          </label>

          {/* Dit avant l'envoi, pas découvert après : la commune facture
              généralement l'enlèvement, et une surprise sur le prix est ce qui
              fait renoncer. */}
          <p className="rounded-lg bg-ardoise-50 p-2.5 text-xs text-ardoise-600">
            {t('citoyen.enlevement.mentionTarif')}
          </p>

          {erreur && <Erreur message={erreur} />}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormulaireOuvert(false)}
              className="flex-1 rounded-lg border border-ardoise-300 bg-white px-4 py-3 font-medium text-ardoise-700"
            >
              {t('citoyen.annuler')}
            </button>
            <button
              type="submit"
              disabled={envoi}
              className="flex-1 rounded-lg bg-siipi-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {t('citoyen.enlevement.envoyer')}
            </button>
          </div>
        </form>
      )}

      {/* Voie 2 : les collecteurs agréés, visibles en même temps. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ardoise-700">
          {t('citoyen.enlevement.collecteurs')}
        </h2>
        {collecteursDuType.length === 0 ? (
          <p className="rounded-xl border border-ardoise-200 bg-white p-4 text-sm text-ardoise-500">
            {t('citoyen.enlevement.aucunCollecteur')}
          </p>
        ) : (
          collecteursDuType.map((c) => (
            <article key={c.id} className="rounded-xl border border-ardoise-200 bg-white p-4">
              <p className="font-medium text-ardoise-900">{c.raison_sociale}</p>
              {c.agrement_anged && (
                <p className="mt-0.5 text-xs text-ardoise-500">
                  {t('citoyen.enlevement.agrement')} {c.agrement_anged}
                </p>
              )}
              {c.zone_intervention && (
                <p className="mt-0.5 text-xs text-ardoise-500">{c.zone_intervention}</p>
              )}
              {c.telephone && (
                // Un lien tel: plutôt qu'un numéro à recopier : l'appel est
                // l'action, tout le reste est du décor.
                <a
                  href={`tel:${c.telephone}`}
                  className="mt-2 block rounded-lg border border-siipi-300 bg-siipi-50 px-3 py-2.5 text-center text-sm font-semibold text-siipi-800"
                >
                  {t('citoyen.enlevement.appeler')} {c.telephone}
                </a>
              )}
            </article>
          ))
        )}
        <p className="text-xs text-ardoise-500">{t('citoyen.enlevement.mentionLegale')}</p>
      </section>

      {/* Suivi des demandes déjà déposées. */}
      {demandes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ardoise-700">
            {t('citoyen.enlevement.mesDemandes')}
          </h2>
          {demandes.map((d) => (
            <article key={d.id} className="rounded-xl border border-ardoise-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="chiffres text-sm font-semibold text-ardoise-900">{d.numero}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    COULEUR_STATUT[d.statut] ?? 'bg-ardoise-100 text-ardoise-700'
                  }`}
                >
                  {t(`citoyen.statutsEnlevement.${d.statut}`)}
                </span>
              </div>
              <p className="mt-1 text-sm text-ardoise-600">
                {t(`citoyen.typesOccasionnels.${d.type_dechet}`)}
                {d.volume_estime_m3 ? ` · ${d.volume_estime_m3} m³` : ''}
              </p>
              {d.date_prevue && (
                <p className="mt-1 text-sm text-ardoise-600">
                  {t('citoyen.enlevement.datePrevue')} : {formaterDate(d.date_prevue)}
                </p>
              )}
              {d.montant_dt != null && (
                <p className="chiffres mt-1 text-sm font-semibold text-ardoise-900">
                  {d.montant_dt} DT
                  {d.paiement_statut === 'regle' && ` · ${t('citoyen.enlevement.regle')}`}
                </p>
              )}
              {d.reponse_commune && (
                <p className="mt-1 text-sm text-ardoise-600">{d.reponse_commune}</p>
              )}
              {/* Une orientation sans le numéro à appeler laisse le citoyen
                  exactement là où il était. */}
              {d.collecteur_nom && (
                <a
                  href={`tel:${d.collecteur_telephone ?? ''}`}
                  className="mt-2 block rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-center text-sm font-semibold text-amber-900"
                >
                  {d.collecteur_nom} · {d.collecteur_telephone}
                </a>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
