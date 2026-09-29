// Un registre tenu au fil de l'eau — pleins de carburant, fins de poste,
// dotations EPI, incidents du travail, commerces, conventions (lot « sources
// KPI »). Un formulaire, une liste, un retrait logique : c'est tout ce qu'il
// faut pour que la plateforme MESURE ce que la fiche d'évaluation faisait
// déclarer.
//
// Un champ « oui / non » obligatoire n'a pas de réponse par défaut : la fin
// de poste ne s'enregistre pas tant qu'on n'a pas dit si la benne était
// bâchée — une case pré-cochée enregistrerait des « oui » que personne n'a
// donnés.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type NomRegistre } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement } from '../Elements';

export type TypeChamp = 'texte' | 'nombre' | 'date' | 'choix' | 'ouiNon' | 'engin' | 'agent' | 'commerce';

export interface ChampRegistre {
  cle: string;
  type: TypeChamp;
  requis?: boolean;
  options?: string[];
}

export interface ColonneRegistre {
  cle: string;
  type?: 'texte' | 'date' | 'nombre' | 'montant' | 'ouiNon' | 'choix';
  /** Préfixe des libellés d'une colonne codée : `registres.<prefixe>.<valeur>`. */
  prefixe?: string;
}

const champ = 'min-h-10 w-full rounded-lg border border-ardoise-300 bg-white px-2 text-sm';
const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-10 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-50';

/** « 12,5 » ou « 12.5 » → 12.5 ; vide → undefined (champ non envoyé). */
const nombre = (s: string) => (s.trim() === '' ? undefined : Number(s.trim().replace(/\s/g, '').replace(',', '.')));

export function RegistreSimple({
  communeId,
  nom,
  champs,
  colonnes,
  onModifie,
}: {
  communeId: string;
  nom: NomRegistre;
  champs: ChampRegistre[];
  colonnes: ColonneRegistre[];
  onModifie?: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [lignes, setLignes] = useState<Record<string, any>[] | null>(null);
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<{ engin: [string, string][]; agent: [string, string][]; commerce: [string, string][] }>({
    engin: [],
    agent: [],
    commerce: [],
  });
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    try {
      setLignes(await api.registre(nom, communeId));
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    }
  };

  useEffect(() => {
    void charger();
    const types = new Set(champs.map((c) => c.type));
    void Promise.all([
      types.has('engin') ? api.engins(communeId).catch(() => []) : Promise.resolve([]),
      types.has('agent') ? api.personnel(communeId).catch(() => []) : Promise.resolve([]),
      types.has('commerce') ? api.registre('commerces', communeId).catch(() => []) : Promise.resolve([]),
    ]).then(([e, a, c]) =>
      setOptions({
        engin: (e as any[]).map((x) => [x.id, x.registration]),
        agent: (a as any[]).map((x) => [x.id, x.nom_complet]),
        commerce: (c as any[]).map((x) => [x.id, x.nom]),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, nom]);

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
      await charger();
      onModifie?.();
      setEtat({ type: 'ok', texte: t('registres.enregistre') });
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnCours(false);
    }
  };

  const retirer = async (id: string) => {
    if (!window.confirm(t('registres.confirmerRetrait'))) return;
    try {
      await api.retirerDuRegistre(nom, id);
      await charger();
      onModifie?.();
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    }
  };

  const cellule = (l: Record<string, any>, c: ColonneRegistre) => {
    const v = l[c.cle];
    if (v === null || v === undefined || v === '') return <span className="text-ardoise-300">—</span>;
    switch (c.type) {
      case 'date':
        return f.date(v);
      case 'nombre':
        return <span className="chiffres">{formaterNombre(v, Number.isInteger(Number(v)) ? 0 : 2)}</span>;
      case 'montant':
        return <span className="chiffres">{formaterNombre(v, 3)} TND</span>;
      case 'ouiNon':
        return <span className={v ? 'text-siipi-700' : 'text-red-700'}>{v ? t('commun.oui') : t('commun.non')}</span>;
      case 'choix':
        return t(`registres.${c.prefixe}.${v}`, { defaultValue: String(v) });
      default:
        return String(v);
    }
  };

  const libelle = (cle: string) => t(`registres.${nom}.champs.${cle}`);

  return (
    <div className="space-y-3">
      <p className="text-sm text-ardoise-600">{t(`registres.${nom}.aide`)}</p>
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
        <div className="flex items-end">
          <button type="submit" disabled={enCours} className={boutonPrincipal}>
            {t('registres.ajouter')}
          </button>
        </div>
      </form>
      {etat && (
        <p role={etat.type === 'ok' ? 'status' : 'alert'} className={`text-sm ${etat.type === 'ok' ? 'text-siipi-700' : 'text-red-700'}`}>
          {etat.texte}
        </p>
      )}
      {!lignes ? (
        <Chargement />
      ) : lignes.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-4 text-sm text-ardoise-500">{t(`registres.${nom}.vide`)}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-ardoise-200 bg-ardoise-50 text-xs uppercase text-ardoise-500">
              <tr>
                {colonnes.map((c) => (
                  <th key={c.cle} className="px-3 py-2 text-start">
                    {t(`registres.${nom}.colonnes.${c.cle}`)}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-b border-ardoise-100 last:border-0">
                  {colonnes.map((c) => (
                    <td key={c.cle} className="px-3 py-2">
                      {cellule(l, c)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-end">
                    <button type="button" className={bouton} onClick={() => void retirer(l.id)}>
                      {t('registres.retirer')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
