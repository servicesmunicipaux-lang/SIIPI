// Dates et mesures, dans le format que CHACUN a choisi (TDR §3.2.6 — B6.4 et
// B6.6).
//
// Un seul endroit décide de l'écriture d'une date ou d'un tonnage. Avant ce
// module, chaque écran formatait à sa façon — « fr-FR » ici, la langue du
// navigateur là, une date ISO tronquée ailleurs — et un même 3 octobre
// s'écrivait de trois manières dans le même portail.
//
// Deux règles qui ne se discutent pas, quel que soit le choix :
//   - l'heure est celle de Tunis (UTC+1, sans heure d'été), jamais celle du
//     poste : un constat saisi à 7 h 30 ne doit pas se lire 6 h 30 sur un
//     ordinateur resté à l'heure de Paris ;
//   - les chiffres restent latins, même en arabe : c'est la convention des
//     documents administratifs tunisiens (voir formaterNombre, i18n.ts).

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';
import type { Utilisateur } from './api';

export type Preferences = Utilisateur['preferences'];

export const PREFERENCES_DEFAUT: Preferences = {
  langue: null,
  formatDate: 'jj/mm/aaaa',
  unites: { masse: 't', volume: 'm3', surface: 'km2' },
  alertes: { domainesMasques: [], graviteMin: 'information' },
};

const FUSEAU = 'Africa/Tunis';

type Valeur = string | number | Date | null | undefined;

/** « 2026-10-03 » (une date, sans heure) : lue telle quelle, sans fuseau. */
const DATE_SEULE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jour, mois, année et heure d'un instant, à l'heure de Tunis. */
function parties(v: Valeur): { a: number; m: number; j: number; h: number | null; min: number | null } | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') {
    const seule = DATE_SEULE.exec(v);
    if (seule) return { a: +seule[1], m: +seule[2], j: +seule[3], h: null, min: null };
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: FUSEAU,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return { a: +p.year, m: +p.month, j: +p.day, h: +p.hour, min: +p.minute };
}

const deux = (n: number) => String(n).padStart(2, '0');

function nombre(n: number, decimales: number): string {
  return new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: decimales }).format(n);
}

export function creerFormats(p: Preferences, langue: string, libelle: (cle: string) => string) {
  const ar = langue.startsWith('ar');

  const jour = (x: NonNullable<ReturnType<typeof parties>>): string => {
    switch (p.formatDate) {
      case 'aaaa-mm-jj':
        return `${x.a}-${deux(x.m)}-${deux(x.j)}`;
      case 'jj mois aaaa':
        return new Intl.DateTimeFormat(ar ? 'ar-TN-u-nu-latn' : 'fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(Date.UTC(x.a, x.m - 1, x.j)));
      default:
        return `${deux(x.j)}/${deux(x.m)}/${x.a}`;
    }
  };

  /** Une date, avec l'heure si on la demande et si la valeur en porte une. */
  const date = (v: Valeur, options: { heure?: boolean } = {}): string => {
    const x = parties(v);
    if (!x) return '—';
    const j = jour(x);
    return options.heure && x.h !== null ? `${j} ${deux(x.h)}:${deux(x.min!)}` : j;
  };

  /** Une masse donnée EN TONNES, écrite dans l'unité choisie. */
  const masse = (tonnes: number | string | null | undefined, decimales = 2): string => {
    const n = typeof tonnes === 'string' ? Number.parseFloat(tonnes) : tonnes;
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    return p.unites.masse === 'kg'
      ? `${nombre(n * 1000, 0)} ${libelle('unites.kg')}`
      : `${nombre(n, decimales)} ${libelle('unites.t')}`;
  };

  /** Un volume donné EN MÈTRES CUBES. */
  const volume = (m3: number | string | null | undefined, decimales = 1): string => {
    const n = typeof m3 === 'string' ? Number.parseFloat(m3) : m3;
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    return p.unites.volume === 'l'
      ? `${nombre(n * 1000, 0)} ${libelle('unites.l')}`
      : `${nombre(n, decimales)} ${libelle('unites.m3')}`;
  };

  /** Une surface donnée EN KILOMÈTRES CARRÉS. */
  const surface = (km2: number | string | null | undefined, decimales = 1): string => {
    const n = typeof km2 === 'string' ? Number.parseFloat(km2) : km2;
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    return p.unites.surface === 'ha'
      ? `${nombre(n * 100, 0)} ${libelle('unites.ha')}`
      : `${nombre(n, decimales)} ${libelle('unites.km2')}`;
  };

  return {
    date,
    masse,
    volume,
    surface,
    /** Le symbole de l'unité de masse choisie, pour un en-tête de colonne. */
    uniteMasse: libelle(p.unites.masse === 'kg' ? 'unites.kg' : 'unites.t'),
    uniteVolume: libelle(p.unites.volume === 'l' ? 'unites.l' : 'unites.m3'),
    uniteSurface: libelle(p.unites.surface === 'ha' ? 'unites.ha' : 'unites.km2'),
  };
}

export type Formats = ReturnType<typeof creerFormats>;

/** Les formats de la personne connectée, dans la langue de l'écran. */
export function useFormats(): Formats {
  const { utilisateur } = useAuth();
  const { t, i18n } = useTranslation();
  const p = utilisateur?.preferences ?? PREFERENCES_DEFAUT;
  return useMemo(() => creerFormats(p, i18n.language, (cle) => t(cle)), [p, i18n.language, t]);
}
