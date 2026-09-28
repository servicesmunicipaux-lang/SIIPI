// Les actions planifiées sur les points (Jalon 6, B3.5) : une campagne de
// déchets verts, un remplacement de bacs — et son avancement, point par point.
//
// Une action se planifie depuis le tableau, sur une sélection. Ici, on la suit :
// on pointe ce qui est fait, on la termine, on retrouve ses points dans le
// tableau pour les exporter.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, cheminPoints, ErreurApi, type ActionDetaillee, type ActionPlanifiee } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement, Erreur } from '../Elements';
import { BoutonExport } from '../BoutonExport';

const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-10 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white hover:bg-siipi-700 disabled:opacity-50';

const CLASSES_ETAT: Record<string, string> = {
  planifiee: 'bg-blue-100 text-blue-800',
  en_retard: 'bg-red-100 text-red-800',
  terminee: 'bg-siipi-100 text-siipi-800',
  annulee: 'bg-ardoise-100 text-ardoise-600',
};

function Avancement({ faits, total }: { faits: number; total: number }) {
  const { t } = useTranslation();
  const pct = total ? Math.round((faits / total) * 100) : 0;
  return (
    <div className="min-w-40">
      <div className="h-2 overflow-hidden rounded-full bg-ardoise-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-siipi-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ardoise-600">{t('communal.points.actions.avancement', { faits, total })}</p>
    </div>
  );
}

export function ActionsPoints({
  communeId,
  peutEcrire,
  onVoirDansTableau,
}: {
  communeId: string;
  peutEcrire: boolean;
  onVoirDansTableau: (actionId: string) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [actions, setActions] = useState<ActionPlanifiee[] | null>(null);
  const [ouverte, setOuverte] = useState<ActionDetaillee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    try {
      setActions(await api.actionsPoints(communeId));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  const ouvrir = async (id: string) => {
    try {
      setOuverte(await api.actionPoints(id));
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  const agir = async (tache: () => Promise<unknown>, fermer = false) => {
    if (!ouverte) return;
    setEnCours(true);
    try {
      await tache();
      if (fermer) setOuverte(null);
      else await ouvrir(ouverte.id);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  if (erreur && !actions) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!actions) return <Chargement />;

  if (ouverte) {
    const aFaire = ouverte.points.filter((p) => !p.fait_le).map((p) => p.id);
    return (
      <section className="space-y-4 rounded-xl border border-ardoise-200 bg-white p-4">
        <button type="button" onClick={() => setOuverte(null)} className="text-sm text-siipi-700 underline">
          ← {t('communal.points.actions.retour')}
        </button>
        {erreur && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {erreur}
          </p>
        )}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ardoise-900">{ouverte.titre}</h2>
            <p className="text-sm text-ardoise-600">
              {f.date(ouverte.date_prevue)}
              {ouverte.date_fin && ` → ${f.date(ouverte.date_fin)}`}
              {ouverte.responsable && ` · ${ouverte.responsable}`}
            </p>
            {ouverte.description && <p className="mt-1 text-sm text-ardoise-700">{ouverte.description}</p>}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${CLASSES_ETAT[ouverte.etat]}`}>
            {t(`communal.points.actions.etats.${ouverte.etat}`)}
          </span>
        </header>
        <Avancement faits={ouverte.nb_faits} total={ouverte.nb_points} />

        <div className="flex flex-wrap gap-2">
          <BoutonExport chemin={cheminPoints(communeId, { actionId: ouverte.id })} desactive={ouverte.nb_points === 0} />
          <button type="button" className={bouton} onClick={() => onVoirDansTableau(ouverte.id)}>
            {t('communal.points.actions.voirDansTableau')}
          </button>
          {peutEcrire && ouverte.statut === 'planifiee' && (
            <>
              <button
                type="button"
                className={bouton}
                disabled={enCours || aFaire.length === 0}
                onClick={() => void agir(() => api.avancementAction(ouverte.id, { pointIds: aFaire, fait: true }))}
              >
                {t('communal.points.actions.toutFait')}
              </button>
              <button
                type="button"
                className={boutonPrincipal}
                disabled={enCours}
                onClick={() => void agir(() => api.modifierAction(ouverte.id, { statut: 'terminee' }))}
              >
                {t('communal.points.actions.terminer')}
              </button>
              <button
                type="button"
                className={bouton}
                disabled={enCours}
                onClick={() => void agir(() => api.modifierAction(ouverte.id, { statut: 'annulee' }))}
              >
                {t('communal.points.actions.annuler')}
              </button>
            </>
          )}
          {peutEcrire && ouverte.statut !== 'planifiee' && (
            <button
              type="button"
              className={bouton}
              disabled={enCours}
              onClick={() => void agir(() => api.modifierAction(ouverte.id, { statut: 'planifiee' }))}
            >
              {t('communal.points.actions.reprendre')}
            </button>
          )}
          {peutEcrire && (
            <button
              type="button"
              className={bouton}
              disabled={enCours}
              onClick={() => {
                if (window.confirm(t('communal.points.actions.confirmerRetrait', { titre: ouverte.titre })))
                  void agir(() => api.retirerAction(ouverte.id), true);
              }}
            >
              {t('communal.points.retirer')}
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-ardoise-200">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-ardoise-200 bg-ardoise-50 text-xs uppercase text-ardoise-500">
              <tr>
                <th className="px-3 py-2 text-start">{t('communal.points.actions.fait')}</th>
                <th className="px-3 py-2 text-start">{t('communal.points.colonnes.circuit')}</th>
                <th className="px-3 py-2 text-start">{t('communal.points.colonnes.ordre')}</th>
                <th className="px-3 py-2 text-start">{t('communal.points.colonnes.nom')}</th>
                <th className="px-3 py-2 text-start">{t('communal.points.actions.faitLe')}</th>
              </tr>
            </thead>
            <tbody>
              {ouverte.points.map((p) => (
                <tr key={p.id} className="border-b border-ardoise-100 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={!!p.fait_le}
                      disabled={!peutEcrire || enCours || ouverte.statut !== 'planifiee'}
                      aria-label={t('communal.points.actions.cocherFait', { nom: p.nom ?? `#${p.ordre}` })}
                      onChange={() => void agir(() => api.avancementAction(ouverte.id, { pointIds: [p.id], fait: !p.fait_le }))}
                    />
                  </td>
                  <td className="px-3 py-2 text-ardoise-600">{p.circuit_nom}</td>
                  <td className="chiffres px-3 py-2">{p.ordre}</td>
                  <td className="px-3 py-2 font-medium text-ardoise-900">{p.nom ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-ardoise-500">
                    {p.fait_le ? `${f.date(p.fait_le, { heure: true })}${p.fait_par ? ` · ${p.fait_par}` : ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {erreur && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {erreur}
        </p>
      )}
      <p className="text-sm text-ardoise-600">{t('communal.points.actions.aide')}</p>
      {actions.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">{t('communal.points.actions.aucune')}</p>
      ) : (
        <ul className="space-y-2">
          {actions.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => void ouvrir(a.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-ardoise-200 bg-white p-4 text-start hover:border-siipi-300"
              >
                <span>
                  <span className="block font-medium text-ardoise-900">{a.titre}</span>
                  <span className="text-sm text-ardoise-600">
                    {f.date(a.date_prevue)}
                    {a.date_fin && ` → ${f.date(a.date_fin)}`}
                    {a.responsable && ` · ${a.responsable}`}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <Avancement faits={a.nb_faits} total={a.nb_points} />
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${CLASSES_ETAT[a.etat]}`}>
                    {t(`communal.points.actions.etats.${a.etat}`)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
