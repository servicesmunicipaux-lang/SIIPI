// Les paramètres nationaux historisés (lot 17.3) — l'écran de la FNCT.
//
// UNE VALEUR NE SE RÉÉCRIT PAS. L'écran n'offre pas de bouton « modifier » :
// un tarif change à une date, on AJOUTE la nouvelle valeur avec sa date
// d'effet, et l'ancienne continue de valoriser les pesées d'avant. Une valeur
// saisie à tort se retire, avec un motif, et reste lisible dans l'historique.
//
// « PROVISOIRE » EST LE DÉFAUT. Une valeur ne devient officielle qu'en citant
// la pièce qui la fonde ; la case est cochée d'avance pour qu'on ne déclare
// pas officiel, par distraction, un chiffre recopié d'un rapport.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type ParametreNational, type ValeurParametreNational } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';

const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';
const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';

const message = (e: unknown, defaut: string) => (e instanceof ErreurApi || e instanceof Error ? e.message : defaut);

export function ParametresNationaux() {
  const { t } = useTranslation();
  const [parametres, setParametres] = useState<ParametreNational[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = useCallback(() => {
    api
      .parametresNationaux()
      .then((p) => {
        setParametres(p);
        setErreur(null);
      })
      .catch((e) => setErreur(message(e, t('commun.erreur'))));
  }, [t]);
  useEffect(() => charger(), [charger]);

  const apres = (m: string) => {
    setInfo(m);
    setErreur(null);
    charger();
  };

  if (erreur && !parametres) return <Erreur message={erreur} onReessayer={charger} />;
  if (!parametres) return <Chargement />;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-ardoise-900">{t('national.parametres.titre')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('national.parametres.intro')}</p>
      </header>
      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}
      {info && (
        <p role="status" className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900">{info}</p>
      )}
      {parametres.map((p) => (
        <FicheParametre key={p.code} p={p} onFait={apres} onErreur={(e) => setErreur(message(e, t('commun.erreur')))} />
      ))}
    </section>
  );
}

function Valeur({ p, v }: { p: ParametreNational; v: ValeurParametreNational }) {
  if (p.nature === 'nombre') {
    return (
      <span className="tabular-nums">
        {formaterNombre(v.valeur_nombre, 3)} {p.unite ?? ''}
      </span>
    );
  }
  return (
    <span>
      {v.valeur_fr}
      <span className="block" dir="rtl" lang="ar">{v.valeur_ar}</span>
    </span>
  );
}

function FicheParametre(props: { p: ParametreNational; onFait: (m: string) => void; onErreur: (e: unknown) => void }) {
  const { p, onFait, onErreur } = props;
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const vide = { dateEffet: '', nombre: '', fr: '', ar: '', provisoire: true, reference: '' };
  const [s, setS] = useState(vide);
  const [retrait, setRetrait] = useState<{ id: string; motif: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const libelle = i18n.language === 'ar' ? p.libelle_ar : p.libelle_fr;

  async function ajouter() {
    setEnvoi(true);
    try {
      await api.ajouterValeurParametre(p.code, {
        dateEffet: s.dateEffet,
        valeurNombre: p.nature === 'nombre' ? Number(s.nombre) : null,
        valeurFr: p.nature === 'texte' ? s.fr : null,
        valeurAr: p.nature === 'texte' ? s.ar : null,
        provisoire: s.provisoire,
        reference: s.reference || null,
      });
      setS(vide);
      onFait(t('national.parametres.valeurAjoutee'));
    } catch (e) {
      onErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer() {
    if (!retrait) return;
    try {
      await api.retirerValeurParametre(retrait.id, retrait.motif);
      setRetrait(null);
      onFait(t('national.parametres.valeurRetiree'));
    } catch (e) {
      onErreur(e);
    }
  }

  const valeurSaisie = p.nature === 'nombre' ? s.nombre !== '' : s.fr.trim() !== '' && s.ar.trim() !== '';

  return (
    <article className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
      <div>
        <h3 className="font-semibold text-ardoise-900">{libelle}</h3>
        {/* La description de la base est en français seulement : l'écran prend
            celle des fichiers de langue, qui existe dans les deux. */}
        <p className="text-xs text-ardoise-600">{t(`national.parametres.descriptions.${p.code}`, { defaultValue: '' })}</p>
      </div>

      <div className="rounded-lg bg-ardoise-50 p-3 text-sm">
        <span className="font-medium text-ardoise-700">{t('national.parametres.enVigueur')} : </span>
        {p.en_vigueur ? (
          <>
            <span className="text-base font-semibold text-ardoise-900"><Valeur p={p} v={p.en_vigueur} /></span>
            <span className="ms-2 text-ardoise-600">{t('national.parametres.depuis', { date: f.date(p.en_vigueur.date_effet) })}</span>
            {p.en_vigueur.provisoire && (
              <span className="ms-2 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                {t('national.parametres.provisoire')}
              </span>
            )}
            {p.en_vigueur.reference && <span className="block text-xs text-ardoise-500">{p.en_vigueur.reference}</span>}
          </>
        ) : (
          <span className="text-ardoise-500">{t('national.parametres.nonRenseigne')}</span>
        )}
        {p.a_venir.map((v) => (
          <span key={v.id} className="mt-1 block text-ardoise-700">
            {t('national.parametres.aVenir', { date: f.date(v.date_effet) })} : <Valeur p={p} v={v} />
          </span>
        ))}
      </div>

      {p.historique.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-ardoise-600">
              <tr>
                <th className="px-2 py-1 text-start">{t('national.parametres.dateEffet')}</th>
                <th className="px-2 py-1 text-start">{t('national.parametres.valeur')}</th>
                <th className="px-2 py-1 text-start">{t('national.parametres.reference')}</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {p.historique.map((v) => (
                <tr key={v.id} className={`border-t border-ardoise-100 ${v.retire_le ? 'text-ardoise-400 line-through' : ''}`}>
                  <td className="px-2 py-1">{f.date(v.date_effet)}</td>
                  <td className="px-2 py-1">
                    <Valeur p={p} v={v} />
                    {v.provisoire && <span className="ms-2 text-xs text-amber-800 no-underline">{t('national.parametres.provisoire')}</span>}
                  </td>
                  <td className="px-2 py-1 text-xs">
                    {v.reference ?? '—'}
                    {v.retire_le && (
                      <span className="block no-underline">{t('national.parametres.retireLe', { motif: v.motif_retrait ?? '' })}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-end">
                    {!v.retire_le &&
                      (retrait?.id === v.id ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <input
                            aria-label={t('national.parametres.motifRetrait')}
                            placeholder={t('national.parametres.motifRetrait')}
                            value={retrait.motif}
                            onChange={(e) => setRetrait({ id: v.id, motif: e.target.value })}
                            className="min-h-11 rounded-lg border border-ardoise-300 px-2"
                          />
                          <button type="button" onClick={() => void retirer()} disabled={retrait.motif.trim().length < 5} className={bouton}>
                            {t('national.parametres.confirmerRetrait')}
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setRetrait({ id: v.id, motif: '' })} className={boutonDiscret}>
                          {t('national.parametres.retirer')}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 rounded-lg border border-siipi-200 bg-siipi-50/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="font-medium">{t('national.parametres.dateEffet')}</span>
          <input type="date" min="2000-01-01" value={s.dateEffet} onChange={(e) => setS({ ...s, dateEffet: e.target.value })} className={champ} />
        </label>
        {p.nature === 'nombre' ? (
          <label className="text-sm">
            <span className="font-medium">{t('national.parametres.valeur')} ({p.unite})</span>
            <input type="number" inputMode="decimal" step="0.001" value={s.nombre} onChange={(e) => setS({ ...s, nombre: e.target.value })} className={champ} />
          </label>
        ) : (
          <>
            <label className="text-sm">
              <span className="font-medium">{t('national.parametres.valeurFr')}</span>
              <input value={s.fr} onChange={(e) => setS({ ...s, fr: e.target.value })} className={champ} lang="fr" dir="ltr" />
            </label>
            <label className="text-sm">
              <span className="font-medium">{t('national.parametres.valeurAr')}</span>
              <input value={s.ar} onChange={(e) => setS({ ...s, ar: e.target.value })} className={champ} lang="ar" dir="rtl" />
            </label>
          </>
        )}
        <label className="text-sm lg:col-span-2">
          <span className="font-medium">{t('national.parametres.reference')}</span>
          <input value={s.reference} onChange={(e) => setS({ ...s, reference: e.target.value })} className={champ} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={s.provisoire} onChange={(e) => setS({ ...s, provisoire: e.target.checked })} className="h-5 w-5" />
          {t('national.parametres.provisoire')}
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void ajouter()}
            disabled={envoi || !s.dateEffet || !valeurSaisie || (!s.provisoire && !s.reference.trim())}
            className={bouton}
          >
            {t('national.parametres.ajouter')}
          </button>
        </div>
        <p className="text-xs text-ardoise-600 sm:col-span-2 lg:col-span-4">{t('national.parametres.aideAjout')}</p>
      </div>
    </article>
  );
}
