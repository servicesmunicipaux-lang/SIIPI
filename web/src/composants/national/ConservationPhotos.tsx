import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type EtatConservation } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';

/**
 * La conservation des photos (décision FNCT D-FNCT-4), vue de la FNCT.
 *
 * L'écran ne compresse rien et ne restaure rien lui-même : la tâche mensuelle
 * le fait, avec l'archive froide branchée. Il montre ce qu'elle a fait — et ce
 * qu'elle a refusé de faire — et c'est d'ici que la FNCT demande l'original
 * d'une photo. Une demande qui dépasse son échéance de 48 heures se signale en
 * retard plutôt que de disparaître dans une liste.
 */
export function ConservationPhotos() {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const arabe = i18n.language === 'ar';
  const [etat, setEtat] = useState<EtatConservation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fichierId, setFichierId] = useState('');
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function lire() {
    setErreur(null);
    try {
      setEtat(await api.etatConservation());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('commun.erreur'));
    }
  }

  useEffect(() => {
    void lire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function demander(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    setMessage(null);
    try {
      const d = await api.demanderRestauration(fichierId.trim(), motif.trim());
      setMessage(t('national.conservation.demandeOuverte', { echeance: f.date(d.echeance, { heure: true }) }));
      setFichierId('');
      setMotif('');
      await lire();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  }

  const parametre = (cle: string) => etat?.parametres.find((p) => p.cle === cle)?.valeur ?? '';
  // Les durées sont rangées en base comme des intervalles PostgreSQL (« 36 months ») :
  // on n'en affiche que le nombre, dans la phrase de la langue courante.
  const nombreDe = (valeur: string) => Number.parseInt(valeur, 10) || 0;
  const ko = (octets: number) => `${formaterNombre(Math.round(octets / 1024))} ${t('national.conservation.ko')}`;
  const raison = (code: string | null) =>
    code ? t(`national.conservation.raisons.${code}`, { defaultValue: code }) : '';

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-ardoise-900">{t('national.conservation.titre')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-700">{t('national.conservation.intro')}</p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900">
          {message}
        </p>
      )}
      {!etat && !erreur && <p className="text-sm text-ardoise-600">{t('commun.chargement')}</p>}

      {etat && (
        <>
          <div className="rounded-xl border border-ardoise-200 bg-white p-4">
            <p className="text-sm text-ardoise-800">
              {t('national.conservation.regle', {
                mois: nombreDe(parametre('medias.delai_compression')),
                qualite: parametre('medias.qualite_jpeg'),
                taille: parametre('medias.taille_max_compressee_ko'),
                heures: nombreDe(parametre('medias.delai_restauration')),
              })}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-ardoise-50 p-2">
                <dt className="text-xs text-ardoise-600">{t('national.conservation.compressees')}</dt>
                <dd className="font-semibold tabular-nums text-ardoise-900">{formaterNombre(etat.photos_compressees)}</dd>
              </div>
              <div className="rounded-lg bg-ardoise-50 p-2">
                <dt className="text-xs text-ardoise-600">{t('national.conservation.enAttente')}</dt>
                <dd className="font-semibold tabular-nums text-ardoise-900">{formaterNombre(etat.photos_en_attente)}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-ardoise-900">{t('national.conservation.passages')}</h3>
            {etat.passages.length === 0 ? (
              <p className="text-sm text-ardoise-600">{t('national.conservation.aucunPassage')}</p>
            ) : (
              <ul className="space-y-2">
                {etat.passages.map((p) => (
                  <li key={p.id} className="rounded-lg border border-ardoise-200 bg-white p-3 text-sm">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-ardoise-900">{f.date(p.debut, { heure: true })}</span>
                      <span className="text-ardoise-600">
                        {t(`national.conservation.declencheur.${p.declenche_par}`)}
                        {p.perimetre ? ` — ${t('national.conservation.restreint', { commune: (arabe && p.perimetre_nom_ar) || p.perimetre_nom || p.perimetre })}` : ''}
                      </span>
                      <span
                        className={
                          p.statut === 'refuse'
                            ? 'font-semibold text-red-800'
                            : p.statut === 'termine'
                              ? 'text-siipi-800'
                              : 'text-amber-800'
                        }
                      >
                        {t(`national.conservation.statutPassage.${p.statut}`)}
                      </span>
                    </p>
                    {/* Le motif est le diagnostic écrit par la tâche, en français, pour celui qui
                        doit brancher l'archive : il garde son sens de lecture. */}
                    {p.statut === 'refuse' && p.motif_refus && (
                      <p className="mt-1 text-red-900" dir="ltr" lang="fr">{p.motif_refus}</p>
                    )}
                    {p.statut === 'termine' && (
                      <p className="mt-1 text-ardoise-700">
                        {t('national.conservation.bilan', {
                          compressees: formaterNombre(p.photos_compressees),
                          eligibles: formaterNombre(p.photos_eligibles),
                          avant: ko(p.octets_avant),
                          apres: ko(p.octets_apres),
                        })}
                      </p>
                    )}
                    {p.anomalies.length > 0 && (
                      <details className="mt-1 text-amber-900">
                        <summary>{t('national.conservation.anomalies', { count: p.anomalies.length })}</summary>
                        <ul className="mt-1 list-disc ps-5">
                          {p.anomalies.map((a) => (
                            <li key={a.fichier}>
                              <span className="font-mono text-xs" dir="ltr">{a.fichier}</span> — {raison(a.raison)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-ardoise-900">{t('national.conservation.demandes')}</h3>
            {etat.demandes.length === 0 ? (
              <p className="text-sm text-ardoise-600">{t('national.conservation.aucuneDemande')}</p>
            ) : (
              <ul className="space-y-2">
                {etat.demandes.map((d) => (
                  <li
                    key={d.id}
                    className={`rounded-lg border bg-white p-3 text-sm ${d.en_retard ? 'border-red-300' : 'border-ardoise-200'}`}
                  >
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-ardoise-900">{d.nom_original}</span>
                      <span className="text-ardoise-600">{(arabe && d.commune_ar) || d.commune}</span>
                      {d.statut === 'restauree' ? (
                        <span className="text-siipi-800">
                          {t('national.conservation.restauree', { date: f.date(d.restauree_le, { heure: true }) })}
                        </span>
                      ) : d.en_retard ? (
                        <span className="font-semibold text-red-800">{t('national.conservation.enRetard')}</span>
                      ) : (
                        <span className="text-amber-800">{t('national.conservation.ouverte')}</span>
                      )}
                    </p>
                    <p className="mt-1 text-ardoise-700" dir="auto">{d.motif}</p>
                    <p className="mt-1 text-xs text-ardoise-600">
                      {t('national.conservation.echeance', {
                        demandee: f.date(d.demandee_le, { heure: true }),
                        echeance: f.date(d.echeance, { heure: true }),
                      })}
                    </p>
                    {d.statut === 'demandee' && d.derniere_erreur && (
                      <p className="mt-1 text-xs text-amber-900">
                        {t('national.conservation.derniereTentative', {
                          raison: raison(d.derniere_erreur),
                          tentatives: d.tentatives,
                        })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={(e) => void demander(e)} className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
            <h3 className="font-semibold text-ardoise-900">{t('national.conservation.demander')}</h3>
            <p className="text-sm text-ardoise-700">{t('national.conservation.demanderAide')}</p>
            <div>
              <label htmlFor="conservation-fichier" className="block text-sm text-ardoise-800">
                {t('national.conservation.fichier')}
              </label>
              <input
                id="conservation-fichier"
                value={fichierId}
                onChange={(e) => setFichierId(e.target.value)}
                required
                dir="ltr"
                pattern="[0-9a-fA-F-]{36}"
                className="mt-1 block w-full rounded-lg border border-ardoise-300 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label htmlFor="conservation-motif" className="block text-sm text-ardoise-800">
                {t('national.conservation.motif')}
              </label>
              <textarea
                id="conservation-motif"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                required
                minLength={10}
                maxLength={1000}
                rows={3}
                className="mt-1 block w-full rounded-lg border border-ardoise-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={envoi}
              className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              {envoi ? t('national.conservation.envoi') : t('national.conservation.envoyer')}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
