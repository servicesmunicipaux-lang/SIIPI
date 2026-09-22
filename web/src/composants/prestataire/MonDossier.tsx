// Le dossier du prestataire : ses contrats, et la confrontation vue de son côté.
//
// La même table que celle du directeur de la propreté, volontairement. Un
// tableau contractuel que seule une des deux parties peut consulter n'est pas
// un tableau contractuel, c'est un dossier à charge. En le donnant aussi au
// prestataire, on lui permet de voir venir une divergence et de la contester
// avant la réunion de fin de mois — ce qui est précisément l'intérêt de la
// commune : un désaccord traité à chaud coûte moins cher qu'un litige.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Contrat, type LigneConfrontation } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const STYLE_SITUATION: Record<string, string> = {
  concordant: 'bg-siipi-100 text-siipi-800',
  divergent: 'bg-red-100 text-red-900',
  non_controle: 'bg-amber-100 text-amber-900',
  non_declare: 'bg-sky-100 text-sky-900',
  silence: 'bg-ardoise-200 text-ardoise-700',
};

function ilYA(jours: number): string {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MonDossier() {
  const { t } = useTranslation();
  const [contrats, setContrats] = useState<Contrat[] | null>(null);
  const [lignes, setLignes] = useState<LigneConfrontation[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [jours, setJours] = useState(30);
  const [filtre, setFiltre] = useState('a_traiter');

  const depuis = useMemo(() => ilYA(jours), [jours]);
  const jusqua = useMemo(() => ilYA(0), []);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const [c, l] = await Promise.all([api.mesContrats(), api.maConfrontation(depuis, jusqua)]);
        if (!annule) {
          setContrats(c);
          setLignes(l);
          setErreur(null);
        }
      } catch (err) {
        if (!annule) setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
      }
    })();
    return () => {
      annule = true;
    };
  }, [depuis, jusqua, t]);

  if (erreur) return <Erreur message={erreur} />;
  if (!contrats) return <Chargement />;

  const divergences = lignes.filter((l) => l.situation === 'divergent');
  const aSignaler = lignes.filter(
    (l) => l.situation === 'non_declare' || l.situation === 'silence'
  );

  // « À traiter » réunit les deux colonnes de chiffres ci-dessus : c'est la
  // vue par défaut, celle qui répond à « qu'est-ce que j'ai à faire ? ».
  const selection =
    filtre === 'tous'
      ? lignes
      : filtre === 'a_traiter'
        ? [...divergences, ...aSignaler]
        : filtre === 'non_declare'
          ? aSignaler
          : lignes.filter((l) => l.situation === filtre);

  // Du plus récent au plus ancien : un passage d'avant-hier non déclaré se
  // rattrape encore et une divergence fraîche se conteste ; à trois semaines,
  // l'un et l'autre sont perdus. Trier dans l'autre sens mettrait en tête
  // exactement ce sur quoi il n'y a plus rien à faire.
  const affichees = [...selection].sort((a, b) => String(b.jour).localeCompare(String(a.jour)));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-lg font-semibold text-ardoise-900">
          {t('prestataire.dossier.contrats')}
        </h1>
        {contrats.length === 0 ? (
          <p className="rounded-xl border border-ardoise-200 bg-white p-4 text-sm text-ardoise-500">
            {t('prestataire.dossier.aucunContrat')}
          </p>
        ) : (
          <ul className="space-y-2">
            {contrats.map((c) => (
              <li key={c.commune_id} className="rounded-xl border border-ardoise-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-ardoise-900">{c.commune_nom}</p>
                  {c.contrat_reference && (
                    <span className="chiffres text-xs text-ardoise-500">{c.contrat_reference}</span>
                  )}
                </div>
                {(c.date_debut || c.date_fin) && (
                  <p className="chiffres mt-1 text-xs text-ardoise-500">
                    {c.date_debut ?? '—'} → {c.date_fin ?? '—'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ardoise-900">
              {t('prestataire.dossier.confrontation')}
            </h2>
            <p className="mt-1 text-sm text-ardoise-500">{t('prestataire.dossier.sousTitre')}</p>
          </div>
          <div className="flex gap-1.5">
            {[7, 30, 90].map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => setJours(j)}
                className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                  jours === j
                    ? 'bg-ardoise-900 text-white'
                    : 'border border-ardoise-300 bg-white text-ardoise-700'
                }`}
              >
                {t('communal.preuve.jours', { jours: j })}
              </button>
            ))}
          </div>
        </div>

        {/* Ce que le prestataire doit voir en premier : ce qui lui est
            reproché, et ce qu'il a oublié de déclarer — l'un se conteste,
            l'autre se rattrape. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-semibold text-red-900 uppercase">
              {t('prestataire.dossier.divergences')}
            </p>
            <p className="chiffres-titre mt-1 text-3xl font-bold text-red-900">
              {divergences.length}
            </p>
            <p className="mt-1 text-sm text-red-900">{t('prestataire.dossier.divergencesAide')}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-900 uppercase">
              {t('prestataire.dossier.manquants')}
            </p>
            <p className="chiffres-titre mt-1 text-3xl font-bold text-amber-900">
              {aSignaler.length}
            </p>
            <p className="mt-1 text-sm text-amber-900">{t('prestataire.dossier.manquantsAide')}</p>
          </div>
        </div>

        {/* Sur un téléphone, un tableau de cinq colonnes et deux cents lignes
            ne se lit pas — et les cinq divergences qui comptent se noyaient
            parmi cinquante-neuf « silences ». On affiche donc par défaut ce qui
            appelle une action du prestataire : ce qu'il peut contester, et ce
            qu'il lui reste à déclarer. Le reste est à un clic. */}
        <div className="flex flex-wrap gap-1.5">
          {['a_traiter', 'divergent', 'non_declare', 'concordant', 'tous'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltre(f)}
              className={`min-h-11 rounded-full px-3 text-sm font-medium ${
                filtre === f
                  ? 'bg-ardoise-900 text-white'
                  : 'border border-ardoise-300 bg-white text-ardoise-700'
              }`}
            >
              {t(`prestataire.dossier.filtres.${f}`)}
            </button>
          ))}
        </div>

        {affichees.length === 0 ? (
          <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
            {t('prestataire.dossier.aucuneLigne')}
          </p>
        ) : (
          <ul className="space-y-2">
            {affichees.slice(0, 25).map((l) => (
              <li
                key={`${l.circuit_id}-${l.jour}`}
                className="rounded-xl border border-ardoise-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-ardoise-900">{l.circuit_nom}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STYLE_SITUATION[l.situation] ?? ''
                    }`}
                  >
                    {t(`communal.situations.${l.situation}`)}
                  </span>
                </div>
                <p className="chiffres mt-0.5 text-xs text-ardoise-500">{l.jour}</p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-ardoise-500">
                      {t('prestataire.dossier.jaiDeclare')}
                    </dt>
                    <dd className="text-ardoise-900">
                      {l.declaration ? t(`communal.declarations.${l.declaration}`) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ardoise-500">
                      {t('prestataire.dossier.communeConstate')}
                    </dt>
                    <dd className="text-ardoise-900">
                      {l.constat ? t(`communal.etats.${l.constat}`) : '—'}
                    </dd>
                  </div>
                </dl>
                {l.incident && (
                  <p className="mt-2 text-xs text-amber-700">
                    {t(`communal.typesIncident.${l.incident}`, { defaultValue: l.incident })}
                  </p>
                )}
              </li>
            ))}
            {affichees.length > 25 && (
              <li className="px-1 text-xs text-ardoise-500">
                {t('prestataire.dossier.tronque', { affichees: 25, total: affichees.length })}
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
