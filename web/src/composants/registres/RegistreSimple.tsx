// Un registre tenu au fil de l'eau — pleins de carburant, fins de poste,
// dotations EPI, incidents du travail, commerces, conventions (lot « sources
// KPI »). Un formulaire, une liste, un retrait logique : c'est tout ce qu'il
// faut pour que la plateforme MESURE ce que la fiche d'évaluation faisait
// déclarer.
//
// Le formulaire est celui du registre des formulaires d'ajout
// (ajout/FormulaireRegistre) : le catalogue « + Ajouter » ouvre le même.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type NomRegistre } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement } from '../Elements';
import { FormulaireRegistre } from '../ajout/FormulaireRegistre';

export interface ColonneRegistre {
  cle: string;
  type?: 'texte' | 'date' | 'nombre' | 'montant' | 'ouiNon' | 'choix';
  /** Préfixe des libellés d'une colonne codée : `registres.<prefixe>.<valeur>`. */
  prefixe?: string;
}

const bouton = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';

export function RegistreSimple({
  communeId,
  nom,
  colonnes,
  onModifie,
}: {
  communeId: string;
  nom: NomRegistre;
  colonnes: ColonneRegistre[];
  onModifie?: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const [lignes, setLignes] = useState<Record<string, any>[] | null>(null);
  const [etat, setEtat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);

  const charger = async () => {
    try {
      setLignes(await api.registre(nom, communeId));
    } catch (err) {
      setEtat({ type: 'erreur', texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, nom]);

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

  return (
    <div className="space-y-3">
      <p className="text-sm text-ardoise-600">{t(`registres.${nom}.aide`)}</p>
      <FormulaireRegistre
        communeId={communeId}
        nom={nom}
        onFait={async () => {
          await charger();
          onModifie?.();
        }}
      />
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
