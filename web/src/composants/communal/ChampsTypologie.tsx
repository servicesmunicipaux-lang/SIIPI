// La typologie d'un engin de collecte (lot T) : sa classe, son volume et ce qui le
// garantit. Les mêmes champs servent à l'ajout d'un engin et à sa fiche dans le parc.
//
// LA CLASSE N'EST JAMAIS CHOISIE À LA PLACE DE LA COMMUNE. Pour les deux types dont
// la classe ne fait pas de doute (une benne tasseuse, une ampli-roll), l'écran la
// PROPOSE, avec un bouton ; rien n'est coché d'avance. Un « camion » peut être une
// benne basculante ou un pick-up, une « remorque » agricole ou compactrice : là, il
// n'y a rien à proposer.
//
// Un tracteur ne porte pas de classe : la benne est sa remorque. L'écran le dit au
// lieu d'offrir une liste vide.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClasseEngin } from '../../lib/api';
import { champAjout } from '../ajout/CadreAjout';
import { formaterNombre } from '../../i18n';

export const PROVENANCES_VOLUME = ['constructeur', 'mesure', 'declare'] as const;
export type ProvenanceVolume = (typeof PROVENANCES_VOLUME)[number];

export interface SaisieTypologie {
  classe: string | null;
  volume: string;
  provenance: ProvenanceVolume | null;
}

const PROPOSITIONS: Record<string, string> = {
  benne_tasseuse: 'benne_tasseuse',
  camion_ampliroll: 'ampli_roll',
};

/** « 12,5 » ou « 12.5 » → 12.5 ; vide → null (non renseigné, pas zéro). */
export const volumeSaisi = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(/\s/g, '').replace(',', '.')));

/** Le volume se saisit positif, ou pas du tout ; une provenance suppose un volume. */
export function typologieValide(v: SaisieTypologie): boolean {
  const n = volumeSaisi(v.volume);
  if (n !== null && !(Number.isFinite(n) && n > 0)) return false;
  return v.provenance === null || n !== null;
}

const deuxDecimales = (n: number) => Math.round(n * 100) / 100;
const volumeRef = (x: number) => formaterNombre(x, Number.isInteger(x) ? 0 : 1);

export function ChampsTypologie(props: {
  idPrefixe: string;
  type: string;
  classes: ClasseEngin[];
  valeur: SaisieTypologie;
  onChange: (v: SaisieTypologie) => void;
}) {
  const { t, i18n } = useTranslation();
  const { idPrefixe, type, classes, valeur, onChange } = props;
  const [mesure, setMesure] = useState({ longueur: '', largeur: '', hauteur: '' });
  const libelle = (k: ClasseEngin) => (i18n.language === 'ar' ? k.libelle_ar : k.libelle_fr);
  const nombre = (s: string) => volumeSaisi(s);

  if (type === 'tracteur') {
    return <p className="rounded-lg bg-ardoise-50 p-2.5 text-xs text-ardoise-600">{t('communal.parc.typologie.tracteur')}</p>;
  }

  const compatibles = classes.filter((k) => k.types_compatibles.includes(type));
  const choisie = classes.find((k) => k.code === valeur.classe) ?? null;
  const proposee = PROPOSITIONS[type] && !valeur.classe ? classes.find((k) => k.code === PROPOSITIONS[type]) : undefined;
  const volume = nombre(valeur.volume);
  const horsPlage =
    choisie?.volume_ref_min_m3 != null && choisie.volume_ref_max_m3 != null && volume !== null && volume > 0 &&
    (volume < choisie.volume_ref_min_m3 || volume > choisie.volume_ref_max_m3);
  const dimensions = [mesure.longueur, mesure.largeur, mesure.hauteur].map(nombre);
  const produit = dimensions.every((d) => d !== null && Number.isFinite(d) && d > 0)
    ? deuxDecimales((dimensions[0] as number) * (dimensions[1] as number) * (dimensions[2] as number))
    : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm" htmlFor={`${idPrefixe}-classe`}>
          {t('communal.parc.typologie.classe')}
          <select
            id={`${idPrefixe}-classe`}
            value={valeur.classe ?? ''}
            disabled={compatibles.length === 0}
            onChange={(e) => onChange({ ...valeur, classe: e.target.value || null })}
            className={champAjout}
          >
            <option value="">{t('communal.parc.typologie.classeNonRenseignee')}</option>
            {compatibles.map((k) => (
              <option key={k.code} value={k.code}>{libelle(k)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm" htmlFor={`${idPrefixe}-volume`}>
          {t('communal.parc.typologie.volume')}
          <input
            id={`${idPrefixe}-volume`}
            inputMode="decimal"
            dir="ltr"
            value={valeur.volume}
            onChange={(e) => onChange({ ...valeur, volume: e.target.value, provenance: e.target.value.trim() === '' ? null : valeur.provenance })}
            className={champAjout}
          />
        </label>
        <label className="text-sm" htmlFor={`${idPrefixe}-provenance`}>
          {t('communal.parc.typologie.provenance')}
          <select
            id={`${idPrefixe}-provenance`}
            value={valeur.provenance ?? ''}
            disabled={volume === null}
            onChange={(e) => onChange({ ...valeur, provenance: (e.target.value || null) as ProvenanceVolume | null })}
            className={champAjout}
          >
            <option value="">{t('communal.parc.typologie.provenanceNonDite')}</option>
            {PROVENANCES_VOLUME.map((p) => (
              <option key={p} value={p}>{t(`communal.parc.typologie.provenances.${p}`)}</option>
            ))}
          </select>
        </label>
      </div>

      {compatibles.length === 0 && <p className="text-xs text-ardoise-500">{t('communal.parc.typologie.aucuneClasse')}</p>}

      {proposee && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-ardoise-600">
          {t('communal.parc.typologie.proposition', { classe: libelle(proposee) })}
          <button
            type="button"
            onClick={() => onChange({ ...valeur, classe: proposee.code })}
            className="min-h-9 rounded-lg border border-siipi-300 bg-siipi-50 px-2.5 text-xs font-medium text-siipi-800"
          >
            {t('communal.parc.typologie.retenir')}
          </button>
        </p>
      )}

      {choisie && choisie.volume_ref_min_m3 != null && choisie.volume_ref_max_m3 != null && (
        <p className="text-xs text-ardoise-500">
          {t('communal.parc.typologie.plage', { min: volumeRef(choisie.volume_ref_min_m3), max: volumeRef(choisie.volume_ref_max_m3) })}
        </p>
      )}
      {horsPlage && <p className="text-xs text-amber-800">{t('communal.parc.typologie.horsPlage')}</p>}

      {/* La méthode de terrain : mesurer la benne qui contient les déchets. */}
      <details className="rounded-lg border border-ardoise-200 p-2.5">
        <summary className="cursor-pointer text-xs font-medium text-ardoise-700">{t('communal.parc.typologie.mesurer')}</summary>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['longueur', 'largeur', 'hauteur'] as const).map((d) => (
            <label key={d} className="text-xs" htmlFor={`${idPrefixe}-${d}`}>
              {t(`communal.parc.typologie.${d}`)}
              <input
                id={`${idPrefixe}-${d}`}
                inputMode="decimal"
                dir="ltr"
                value={mesure[d]}
                onChange={(e) => setMesure({ ...mesure, [d]: e.target.value })}
                className={champAjout}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={produit === null}
          onClick={() => produit !== null && onChange({ ...valeur, volume: String(produit).replace('.', ','), provenance: 'mesure' })}
          className="mt-2 min-h-9 rounded-lg border border-ardoise-300 bg-white px-2.5 text-xs font-medium text-ardoise-700 disabled:opacity-40"
        >
          {produit === null
            ? t('communal.parc.typologie.reporterVide')
            : t('communal.parc.typologie.reporter', { volume: String(produit).replace('.', ',') })}
        </button>
      </details>
    </div>
  );
}
