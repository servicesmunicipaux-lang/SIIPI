// L'historique d'un découpage et le détail d'une version (Jalon 7, C2.5/C2.6).
//
// Partagés par la commune (qui propose, retire, demande un retour arrière) et
// par la FNCT (qui valide, refuse, restaure directement). Ce que chacun peut
// faire se lit dans les boutons affichés — et, de toute façon, dans l'API.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type VersionDecoupage, type VersionDecoupageDetail } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement } from '../Elements';
import { CarteDecoupage, type Geometrie } from './CarteDecoupage';

const bouton = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-50';

const CLASSES_STATUT: Record<string, string> = {
  soumise: 'bg-amber-100 text-amber-900',
  validee: 'bg-siipi-100 text-siipi-800',
  refusee: 'bg-red-100 text-red-800',
  retiree: 'bg-ardoise-100 text-ardoise-600',
};

export function PastilleVersion({ v }: { v: VersionDecoupage }) {
  const { t } = useTranslation();
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${v.en_vigueur ? 'bg-siipi-600 text-white' : CLASSES_STATUT[v.statut]}`}>
      {v.en_vigueur ? t('decoupage.enVigueur') : t(`decoupage.statuts.${v.statut}`)}
    </span>
  );
}

/** « Version 3 — proposition de la commune » / « Proposition du 3 octobre ». */
export function TitreVersion({ v }: { v: VersionDecoupage }) {
  const { t } = useTranslation();
  const f = useFormats();
  return (
    <>
      {v.numero ? t('decoupage.version', { n: v.numero }) : t('decoupage.propositionDu', { date: f.date(v.soumise_le) })}
      {' — '}
      {t(`decoupage.origines.${v.origine}`)}
      {v.restaure_de_numero ? ` (${t('decoupage.copieDe', { n: v.restaure_de_numero })})` : ''}
    </>
  );
}

export function HistoriqueDecoupage({
  versions,
  onOuvrir,
}: {
  versions: VersionDecoupage[];
  onOuvrir: (id: string) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  if (versions.length === 0) return <p className="text-sm text-ardoise-500">{t('decoupage.aucuneVersion')}</p>;
  return (
    <ol className="divide-y divide-ardoise-100 rounded-xl border border-ardoise-200 bg-white">
      {versions.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => onOuvrir(v.id)}
            className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-start hover:bg-ardoise-50"
          >
            <span>
              <span className="block font-medium text-ardoise-900">
                <TitreVersion v={v} />
              </span>
              <span className="text-xs text-ardoise-500">
                {v.origine === 'initiale' ? (
                  // Personne ne l'a soumise : c'est la photographie prise juste
                  // avant la première modification.
                  t('decoupage.figee', { date: f.date(v.decidee_le, { heure: true }) })
                ) : (
                  <>
                {t('decoupage.soumise', { date: f.date(v.soumise_le, { heure: true }), auteur: v.soumise_par_nom ?? '—' })}
                {v.decidee_le &&
                  ` · ${t(v.statut === 'refusee' ? 'decoupage.refuseeLe' : 'decoupage.decideeLe', {
                    date: f.date(v.decidee_le, { heure: true }),
                    auteur: v.decidee_par_nom ?? '—',
                  })}`}
                  </>
                )}
              </span>
              {v.note && <span className="block text-xs text-ardoise-600">{v.note}</span>}
              {v.motif_refus && <span className="block text-xs text-red-700">{t('decoupage.motif', { motif: v.motif_refus })}</span>}
            </span>
            <span className="flex items-center gap-2">
              <span className="chiffres text-xs text-ardoise-500">
                {t('decoupage.nbSecteurs', { count: v.nb_secteurs })}
                {v.surface_km2 != null && ` · ${f.surface(v.surface_km2, 1)}`}
              </span>
              <PastilleVersion v={v} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * Une version : sa carte comparée à l'état en vigueur, ce qui change, ce qui
 * mérite un regard, et les décisions possibles pour qui la regarde.
 */
export function DetailVersion({
  id,
  fnct,
  onFermer,
  onDecide,
}: {
  id: string;
  fnct: boolean;
  onFermer: () => void;
  onDecide: (message: string) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [v, setV] = useState<VersionDecoupageDetail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [refus, setRefus] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    setV(null);
    void api
      .versionDecoupage(id)
      .then(setV)
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const agir = async (tache: () => Promise<unknown>, message: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await tache();
      onDecide(message);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  if (!v) return erreur ? <p className="text-sm text-red-700">{erreur}</p> : <Chargement />;

  const secteurs = (v.zones as { id: string; name: string; color?: string | null; geometry: Geometrie }[]).map((z) => ({
    cle: z.id,
    name: z.name,
    color: z.color,
    geometry: z.geometry,
  }));
  const actuels = (v.zones_actuelles as { name: string; geometry: Geometrie }[]).map((z) => ({ name: z.name, geometry: z.geometry }));
  const liste = (cle: 'ajoutes' | 'modifies' | 'retires') =>
    v[cle].length > 0 && (
      <p className="text-sm">
        <span className="font-medium text-ardoise-800">{t(`decoupage.ecarts.${cle}`, { count: v[cle].length })}</span>{' '}
        <span className="text-ardoise-600">{v[cle].map((s) => s.name).join(', ')}</span>
      </p>
    );
  const restaurable = v.statut === 'validee' && !v.en_vigueur;

  return (
    <section className="space-y-4 rounded-xl border border-ardoise-200 bg-white p-4">
      <button type="button" onClick={onFermer} className="text-sm font-medium text-siipi-700 hover:underline">
        ← {t('decoupage.retourHistorique')}
      </button>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-ardoise-900">
            {v.commune_nom} — <TitreVersion v={v} />
          </h3>
          <p className="text-xs text-ardoise-500">
            {v.origine === 'initiale'
              ? t('decoupage.figee', { date: f.date(v.decidee_le, { heure: true }) })
              : t('decoupage.soumise', { date: f.date(v.soumise_le, { heure: true }), auteur: v.soumise_par_nom ?? '—' })}
          </p>
          {v.note && <p className="mt-1 text-sm text-ardoise-700">{v.note}</p>}
          {v.motif_refus && <p className="mt-1 text-sm text-red-700">{t('decoupage.motif', { motif: v.motif_refus })}</p>}
        </div>
        <PastilleVersion v={v} />
      </header>

      <CarteDecoupage
        perimetre={v.perimetre as Geometrie | null}
        secteurs={secteurs}
        comparaison={v.en_vigueur ? undefined : { perimetre: v.perimetre_actuel as Geometrie | null, secteurs: actuels }}
        hauteur="h-[50dvh]"
      />
      {!v.en_vigueur && <p className="text-xs text-ardoise-500">{t('decoupage.legendeComparaison')}</p>}

      {!v.en_vigueur && (
        <div className="space-y-1 rounded-lg bg-ardoise-50 p-3">
          <p className="text-sm font-medium text-ardoise-900">{t('decoupage.ecarts.titre')}</p>
          {v.perimetre_change ? (
            <p className="chiffres text-sm text-ardoise-700">
              {t('decoupage.ecarts.perimetre', { avant: f.surface(v.surface_actuelle_km2, 2), apres: f.surface(v.surface_km2, 2) })}
            </p>
          ) : (
            <p className="text-sm text-ardoise-600">{t('decoupage.ecarts.perimetreInchange')}</p>
          )}
          {liste('ajoutes')}
          {liste('modifies')}
          {liste('retires')}
          {v.ajoutes.length + v.modifies.length + v.retires.length === 0 && (
            <p className="text-sm text-ardoise-600">{t('decoupage.ecarts.secteursInchanges')}</p>
          )}
        </div>
      )}

      {v.avertissements.length > 0 && !v.en_vigueur && (
        <ul className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {v.avertissements.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {erreur && (
        <p role="alert" className="text-sm text-red-700">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {fnct && v.statut === 'soumise' && !refus && (
          <>
            <button
              type="button"
              disabled={enCours}
              className={boutonPrincipal}
              onClick={() => void agir(() => api.validerDecoupage(v.id), t('decoupage.valideeMessage', { commune: v.commune_nom }))}
            >
              {t('decoupage.valider')}
            </button>
            <button type="button" disabled={enCours} className={bouton} onClick={() => setRefus(true)}>
              {t('decoupage.refuser')}
            </button>
          </>
        )}
        {!fnct && v.statut === 'soumise' && !v.directe && (
          <button
            type="button"
            disabled={enCours}
            className={bouton}
            onClick={() => void agir(() => api.retirerDecoupage(v.id), t('decoupage.retireeMessage'))}
          >
            {t('decoupage.retirer')}
          </button>
        )}
        {restaurable && (
          <button
            type="button"
            disabled={enCours}
            className={bouton}
            onClick={() => {
              if (!window.confirm(t(fnct ? 'decoupage.confirmerRestaurationFnct' : 'decoupage.confirmerRestauration', { n: v.numero })))
                return;
              void agir(
                () => api.restaurerDecoupage(v.id),
                t(fnct ? 'decoupage.restaureeMessage' : 'decoupage.restaurationProposee', { n: v.numero })
              );
            }}
          >
            {fnct ? t('decoupage.restaurer', { n: v.numero }) : t('decoupage.demanderRestauration', { n: v.numero })}
          </button>
        )}
      </div>

      {refus && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void agir(() => api.refuserDecoupage(v.id, motif.trim()), t('decoupage.refuseeMessage', { commune: v.commune_nom }));
          }}
        >
          <label className="block text-sm">
            <span className="block font-medium text-ardoise-700">{t('decoupage.motifRefus')}</span>
            <textarea
              required
              minLength={5}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-ardoise-300 p-2 text-base"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={enCours} className={boutonPrincipal}>
              {t('decoupage.confirmerRefus')}
            </button>
            <button type="button" className={bouton} onClick={() => setRefus(false)}>
              {t('commun.annuler')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
