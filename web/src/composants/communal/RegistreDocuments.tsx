// Le registre des documents à numérotation scellée (lot 16.2) : ordres de
// mission, bons de carburant, bons de travail, déclarations de panne.
//
// Tout ce qui a été émis y figure — annulé compris : un numéro ne disparaît
// jamais du registre, c'est ce qui le rend opposable. On y imprime une pièce,
// on l'annule avec un motif (jamais on ne la modifie), et l'on voit les
// numéros manquants : un trou dans la séquence est le premier signe d'un
// registre trafiqué hors de l'application.
//
// Les gabarits sont provisoires jusqu'à la validation d'un chef de dépôt
// (décision du 16/10/2026) : l'écran le dit, l'impression aussi.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, imprimerDocument, type DocumentEmis, type GabaritDocument, type TrouDocument } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFormats } from '../../lib/formats';
import { useAjoutEnLigne } from '../ajout/useAjoutEnLigne';
import { Chargement, Erreur } from '../Elements';

const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-40';

/** Ce qui dit, en une ligne, de quoi parle la pièce. */
function resume(d: DocumentEmis): string {
  const c = (d.contenu ?? {}) as Record<string, unknown>;
  return [c.engin, c.agent, c.destination, c.nature, c.carburant && c.litres != null ? `${c.litres} L ${c.carburant}` : null]
    .filter((x) => typeof x === 'string' || typeof x === 'number')
    .join(' · ');
}

export function RegistreDocuments({ communeId }: { communeId: string }) {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const { utilisateur } = useAuth();
  const commune = utilisateur?.role === 'admin_commune';
  const [documents, setDocuments] = useState<DocumentEmis[] | null>(null);
  const [gabarits, setGabarits] = useState<GabaritDocument[]>([]);
  const [trous, setTrous] = useState<TrouDocument[]>([]);
  const [type, setType] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const arabe = i18n.language === 'ar';

  const charger = useCallback(async () => {
    try {
      const [d, g, tr] = await Promise.all([api.documentsEmis(communeId), api.gabaritsDocuments(), api.trousDocuments(communeId)]);
      setDocuments(d);
      setGabarits(g);
      setTrous(tr);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  }, [communeId, t]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const ordre = useAjoutEnLigne('ordre-mission', communeId, t('ajout.types.ordre-mission'), charger);
  const travail = useAjoutEnLigne('bon-travail', communeId, t('ajout.types.bon-travail'), charger);
  const panne = useAjoutEnLigne('declaration-panne', communeId, t('ajout.types.declaration-panne'), charger);

  const titreDe = useMemo(() => new Map<string, string>(gabarits.map((g) => [g.type, arabe ? g.ar : g.fr])), [gabarits, arabe]);
  const affiches = (documents ?? []).filter((d) => !type || d.type_document === type);
  const provisoires = gabarits.some((g) => g.statut === 'provisoire');

  const agir = async (action: () => Promise<unknown>, texte?: string) => {
    setErreur(null);
    setMessage(null);
    try {
      await action();
      if (texte) setMessage(texte);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };
  const annuler = (d: DocumentEmis) => {
    const motif = window.prompt(t('communal.documents.motif', { numero: d.numero_affiche }));
    if (motif === null) return;
    void agir(async () => {
      await api.annulerDocument(d.id, motif);
      await charger();
    }, t('communal.documents.annule', { numero: d.numero_affiche }));
  };

  if (!documents) return erreur ? <Erreur message={erreur} onReessayer={() => void charger()} /> : <Chargement />;

  return (
    <section className="space-y-4" aria-labelledby="registre-documents">
      <header className="space-y-1">
        <h1 id="registre-documents" className="text-xl font-semibold text-ardoise-900">{t('communal.documents.titre')}</h1>
        <p className="max-w-3xl text-sm text-ardoise-600">{t('communal.documents.aide')}</p>
        {provisoires && (
          <p className="max-w-3xl rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">{t('communal.documents.provisoires')}</p>
        )}
      </header>

      {commune && (
        <div className="flex flex-wrap gap-2">
          {ordre.bouton}
          {travail.bouton}
          {panne.bouton}
        </div>
      )}
      {ordre.formulaire}
      {travail.formulaire}
      {panne.formulaire}
      {commune && <p className="text-xs text-ardoise-500">{t('communal.documents.carburant')}</p>}

      {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>}
      {message && <p role="status" className="rounded-lg border border-siipi-300 bg-siipi-50 p-3 text-sm text-siipi-900">{message}</p>}
      {trous.length > 0 && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {t('communal.documents.trous', {
            liste: trous.map((x) => `${titreDe.get(x.type_document) ?? x.type_document} ${x.exercice} n° ${x.numero_manquant}`).join(' ; '),
          })}
        </p>
      )}

      <label className="block text-sm">
        <span className="text-ardoise-600">{t('communal.documents.filtre')}</span>
        <select value={type} onChange={(e) => setType(e.target.value)} className="ms-2 min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm">
          <option value="">{t('communal.documents.tous')}</option>
          {gabarits.map((g) => (
            <option key={g.type} value={g.type}>{arabe ? g.ar : g.fr}</option>
          ))}
        </select>
      </label>

      {affiches.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-4 text-sm text-ardoise-600">{t('communal.documents.aucun')}</p>
      ) : (
        <ul className="space-y-2">
          {affiches.map((d) => (
            <li key={d.id} className={`rounded-xl border bg-white p-3 ${d.statut === 'annule' ? 'border-red-200' : 'border-ardoise-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-[14rem] flex-1">
                  <p className="font-medium text-ardoise-900">
                    <span className="chiffres">{d.numero_affiche}</span> · {titreDe.get(d.type_document) ?? d.type_document}
                    {d.statut === 'annule' && (
                      <span className="ms-2 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">{t('communal.documents.statutAnnule')}</span>
                    )}
                  </p>
                  <p className="text-sm text-ardoise-600">
                    {f.date(d.emis_le)}
                    {resume(d) && ` · ${resume(d)}`}
                  </p>
                  {d.statut === 'annule' && d.motif_annulation && (
                    <p className="text-xs text-red-800">{t('communal.documents.motifAffiche', { motif: d.motif_annulation })}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={bouton} onClick={() => void agir(() => imprimerDocument(d.id))}>
                    {t('communal.documents.imprimer')}
                  </button>
                  {commune && d.statut === 'emis' && (
                    <button type="button" className={`${bouton} text-red-800`} onClick={() => annuler(d)}>
                      {t('communal.documents.annuler')}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
