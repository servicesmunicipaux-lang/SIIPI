// Une ligne d'un registre tenu au fil de l'eau — plein de carburant, fin de
// poste, dotation EPI, incident du travail, commerce, convention (lot
// « sources KPI » ; registre de formulaires, refonte lot 2b).
//
// Le formulaire et la définition de ses champs vivaient dans l'écran des
// registres ; ils sont ici, pour que le catalogue « + Ajouter » ouvre le même
// formulaire, avec les mêmes champs obligatoires.
//
// Un champ « oui / non » obligatoire n'a pas de réponse par défaut : la fin
// de poste ne s'enregistre pas tant qu'on n'a pas dit si la benne était
// bâchée — une case pré-cochée enregistrerait des « oui » que personne n'a
// donnés.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type NomRegistre } from '../../lib/api';

export type TypeChamp = 'texte' | 'nombre' | 'date' | 'choix' | 'ouiNon' | 'engin' | 'agent' | 'commerce';

export interface ChampRegistre {
  cle: string;
  type: TypeChamp;
  requis?: boolean;
  options?: string[];
}

/** Les champs de chaque registre : les clés sont celles de l'API (sourcesKpi.routes.ts). */
export const CHAMPS_REGISTRES: Record<NomRegistre, ChampRegistre[]> = {
  'fins-de-poste': [
    { cle: 'vehiculeId', type: 'engin', requis: true },
    { cle: 'jour', type: 'date', requis: true },
    { cle: 'benneBachee', type: 'ouiNon', requis: true },
    { cle: 'chauffeurId', type: 'agent' },
    { cle: 'observation', type: 'texte' },
  ],
  carburant: [
    { cle: 'vehiculeId', type: 'engin', requis: true },
    { cle: 'datePlein', type: 'date', requis: true },
    { cle: 'litres', type: 'nombre', requis: true },
    { cle: 'montantTnd', type: 'nombre', requis: true },
    { cle: 'kilometrage', type: 'nombre' },
  ],
  epi: [
    { cle: 'personnelId', type: 'agent', requis: true },
    { cle: 'typeEpi', type: 'choix', requis: true, options: ['kit_complet', 'gants', 'chaussures', 'gilet', 'tenue', 'masque', 'casque', 'lunettes', 'autre'] },
    { cle: 'dateRemise', type: 'date', requis: true },
    { cle: 'dateRenouvellement', type: 'date' },
  ],
  incidents: [
    { cle: 'dateIncident', type: 'date', requis: true },
    { cle: 'type', type: 'choix', requis: true, options: ['accident', 'presque_accident', 'agression', 'maladie_professionnelle', 'autre'] },
    { cle: 'gravite', type: 'choix', requis: true, options: ['benin', 'avec_arret', 'grave'] },
    { cle: 'personnelId', type: 'agent' },
    { cle: 'joursArret', type: 'nombre' },
    { cle: 'description', type: 'texte' },
  ],
  commerces: [
    { cle: 'nom', type: 'texte', requis: true },
    { cle: 'categorie', type: 'choix', options: ['commerce', 'institution'] },
    { cle: 'activite', type: 'texte' },
    { cle: 'adresse', type: 'texte' },
  ],
  conventions: [
    { cle: 'commerceId', type: 'commerce', requis: true },
    { cle: 'type', type: 'choix', requis: true, options: ['collecte', 'nettoyage', 'tri', 'autre'] },
    { cle: 'dateDebut', type: 'date', requis: true },
    { cle: 'dateFin', type: 'date' },
    { cle: 'tonnageEstime', type: 'nombre' },
  ],
};

const champ = 'min-h-10 w-full rounded-lg border border-ardoise-300 bg-white px-2 text-sm';
const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50';
const boutonPrincipal = 'min-h-10 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-50';

/** « 12,5 » ou « 12.5 » → 12.5 ; vide → undefined (champ non envoyé). */
const nombre = (s: string) => (s.trim() === '' ? undefined : Number(s.trim().replace(/\s/g, '').replace(',', '.')));

export function FormulaireRegistre({
  communeId,
  nom,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  nom: NomRegistre;
  onFait: () => void | Promise<void>;
  /** Absent dans l'écran du registre, où le formulaire reste ouvert au-dessus de la liste. */
  onAnnuler?: () => void;
}) {
  const { t } = useTranslation();
  const champs = CHAMPS_REGISTRES[nom];
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<{ engin: [string, string][]; agent: [string, string][]; commerce: [string, string][] }>({
    engin: [],
    agent: [],
    commerce: [],
  });
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    const types = new Set(champs.map((c) => c.type));
    void Promise.all([
      types.has('engin') ? api.engins(communeId).catch(() => []) : Promise.resolve([]),
      types.has('agent') ? api.personnel(communeId).catch(() => []) : Promise.resolve([]),
      types.has('commerce') ? api.registre('commerces', communeId).catch(() => []) : Promise.resolve([]),
    ]).then(([e, a, c]) =>
      setOptions({
        engin: (e as { id: string; registration: string }[]).map((x) => [x.id, x.registration]),
        agent: (a as { id: string; nom_complet: string }[]).map((x) => [x.id, x.nom_complet]),
        commerce: (c as { id: string; nom: string }[]).map((x) => [x.id, x.nom]),
      })
    );
  }, [communeId, champs]);

  const enregistrer = async () => {
    const corps: Record<string, unknown> = {};
    for (const c of champs) {
      const v = saisie[c.cle] ?? '';
      if (v === '') {
        if (c.requis) {
          setEtat({ type: 'erreur', texte: t('registres.requis', { champ: t(`registres.${nom}.champs.${c.cle}`) }) });
          return;
        }
        continue;
      }
      corps[c.cle] = c.type === 'nombre' ? nombre(v) : c.type === 'ouiNon' ? v === 'oui' : v;
    }
    setEnCours(true);
    setEtat(null);
    try {
      await api.ajouterAuRegistre(nom, communeId, corps);
      setSaisie({});
      setEtat({ type: 'ok', texte: t('registres.enregistre') });
      await onFait();
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnCours(false);
    }
  };

  const libelle = (cle: string) => t(`registres.${nom}.champs.${cle}`);

  return (
    <div className="space-y-2">
      <form
        className="grid gap-2 rounded-xl border border-ardoise-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          void enregistrer();
        }}
      >
        {champs.map((c) =>
          c.type === 'ouiNon' ? (
            // Deux boutons radio SANS valeur par défaut, groupés sous leur question.
            <fieldset key={c.cle} className="text-xs text-ardoise-600">
              <legend className="block">
                {libelle(c.cle)}
                {c.requis && ' *'}
              </legend>
              <span className="flex min-h-10 items-center gap-3">
                {['oui', 'non'].map((v) => (
                  <label key={v} className="flex items-center gap-1 text-sm text-ardoise-800">
                    <input type="radio" name={`${nom}-${c.cle}`} checked={saisie[c.cle] === v} onChange={() => setSaisie((s) => ({ ...s, [c.cle]: v }))} />
                    {t(`commun.${v}`)}
                  </label>
                ))}
              </span>
            </fieldset>
          ) : (
            <label key={c.cle} className="text-xs text-ardoise-600">
              <span className="block">
                {libelle(c.cle)}
                {c.requis && ' *'}
              </span>
              {c.type === 'choix' || c.type === 'engin' || c.type === 'agent' || c.type === 'commerce' ? (
                <select value={saisie[c.cle] ?? ''} onChange={(e) => setSaisie((s) => ({ ...s, [c.cle]: e.target.value }))} className={champ}>
                  <option value="">—</option>
                  {(c.type === 'choix' ? (c.options ?? []).map((o) => [o, t(`registres.${nom}.options.${c.cle}.${o}`)]) : options[c.type]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={c.type === 'date' ? 'date' : 'text'}
                  inputMode={c.type === 'nombre' ? 'decimal' : undefined}
                  value={saisie[c.cle] ?? ''}
                  onChange={(e) => setSaisie((s) => ({ ...s, [c.cle]: e.target.value }))}
                  className={champ}
                />
              )}
            </label>
          )
        )}
        <div className="flex flex-wrap items-end gap-2">
          <button type="submit" disabled={enCours} className={boutonPrincipal}>
            {t('registres.ajouter')}
          </button>
          {onAnnuler && (
            <button type="button" onClick={onAnnuler} className={bouton}>
              {t('commun.annuler')}
            </button>
          )}
        </div>
      </form>
      {etat && (
        <p role={etat.type === 'ok' ? 'status' : 'alert'} className={`text-sm ${etat.type === 'ok' ? 'text-siipi-700' : 'text-red-700'}`}>
          {etat.texte}
        </p>
      )}
    </div>
  );
}
