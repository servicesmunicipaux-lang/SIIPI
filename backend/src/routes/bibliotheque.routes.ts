// La bibliothèque nationale des données (jalon D, lot D4 ; SPEC_D_pret_a_presenter.md).
//
// Un catalogue de tout ce que SIIPI réunit, par commune, gouvernorat et district : neuf éléments,
// chacun avec son nombre, sa période, et « N communes sur M » qui le tiennent. LECTURE SEULE, et
// RÉSERVÉE À LA FNCT : le ministère la voit depuis un compte FNCT, sans nouveau rôle.
//
// CE QUE LA BIBLIOTHÈQUE NE FAIT PAS.
//   - Elle ne crée aucune donnée : elle rend visible ce qui existe et ce qui manque.
//   - Elle ne donne accès à AUCUN fichier : un rapport est listé (titre, auteur, année), jamais
//     ouvert d'ici — les fichiers restent dans leur commune.
//   - Elle ne classe personne : les territoires viennent dans l'ordre alphabétique.
//   - Elle ne remplace pas un « non tenu » par un zéro : un élément qu'aucune commune n'a se dit
//     « aucune commune », par l'absence de lignes.
//   - Elle n'additionne pas ce qui ne s'additionne pas : les pesées gardent leur nature, et leur
//     tonnage n'est pas sommé ici.
//
// Les chiffres viennent de `app.bibliotheque_lignes()` (migration 084), la seule lecture de ce
// que les neuf éléments ont de commun.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { exportable } from '../services/export.js';
import { JEU_BIBLIOTHEQUE } from '../services/jeuxExport.js';

export const bibliothequeRouter = Router();

/** Les neuf éléments, dans l'ordre où l'écran les montre : documents, références, séries. */
export const ELEMENTS = [
  { cle: 'pcgd', groupe: 'documents' },
  { cle: 'rapports_etudes', groupe: 'documents' },
  { cle: 'cout_complet', groupe: 'documents' },
  { cle: 'caracterisation', groupe: 'references' },
  { cle: 'population', groupe: 'references' },
  { cle: 'pesees', groupe: 'series' },
  { cle: 'circuits', groupe: 'series' },
  { cle: 'points', groupe: 'series' },
  { cle: 'reclamations', groupe: 'series' },
] as const;
type CleElement = (typeof ELEMENTS)[number]['cle'];
const CLES = ELEMENTS.map((e) => e.cle) as [CleElement, ...CleElement[]];

export const elementSchema = z.object({ element: z.enum(CLES) });
export const qLignesSchema = z.object({ element: z.enum(CLES).optional() });

interface Ligne {
  element: CleElement;
  commune_id: string;
  intitule: string | null;
  annee: number | null;
  auteur: string | null;
  statut: string | null;
  nature: string | null;
  nombre: string;
  premiere: string | null;
  derniere: string | null;
  mois_couverts: number | null;
}

interface Commune {
  id: string;
  name: string;
  name_ar: string | null;
  gouvernorat: string;
  district: string | null;
}

/** Les communes réelles (ni la démonstration, ni une commune retirée), avec leur district. */
async function communesReelles(): Promise<Commune[]> {
  return query<Commune>(
    `SELECT c.id, c.name, c.name_ar, c.gouvernorat, gd.district_code AS district
       FROM communes c
       LEFT JOIN gouvernorats_district gd ON gd.gouvernorat = c.gouvernorat
      WHERE NOT c.est_demo AND c.deleted_at IS NULL`
  );
}

const alphabetique = (a: string, b: string) => a.localeCompare(b, 'fr');
const plusTot = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a < b ? a : b);
const plusTard = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a > b ? a : b);

/**
 * Ce qui distingue les lignes d'un même élément — le statut d'un PCGD, le niveau d'une
 * caractérisation, la nature d'une population ou d'une pesée — et le nombre de communes qui l'ont.
 */
function repartition(lignes: Ligne[]): Record<string, number> {
  const parValeur = new Map<string, Set<string>>();
  for (const l of lignes) {
    const valeur = l.nature ?? l.statut;
    if (!valeur) continue;
    if (!parValeur.has(valeur)) parValeur.set(valeur, new Set());
    parValeur.get(valeur)!.add(l.commune_id);
  }
  return Object.fromEntries([...parValeur.entries()].sort(([a], [b]) => alphabetique(a, b)).map(([k, v]) => [k, v.size]));
}

// ---------------------------------------------------------------------------
// Le catalogue : une ligne par élément
// ---------------------------------------------------------------------------

bibliothequeRouter.get(
  '/',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (_req, res) => {
    const [communes, lignes] = await Promise.all([communesReelles(), query<Ligne>('SELECT * FROM app.bibliotheque_lignes()')]);
    res.json({
      communes_total: communes.length,
      elements: ELEMENTS.map(({ cle, groupe }) => {
        const siennes = lignes.filter((l) => l.element === cle);
        return {
          element: cle,
          groupe,
          communes_avec: new Set(siennes.map((l) => l.commune_id)).size,
          nombre: siennes.reduce((n, l) => n + Number(l.nombre), 0),
          premiere: siennes.reduce<string | null>((m, l) => plusTot(m, l.premiere), null),
          derniere: siennes.reduce<string | null>((m, l) => plusTard(m, l.derniere), null),
          repartition: repartition(siennes),
        };
      }),
    });
  })
);

// ---------------------------------------------------------------------------
// Les lignes à plat, exportables (Excel, CSV) — avant /:element, qui les prendrait pour un élément.
// ---------------------------------------------------------------------------

bibliothequeRouter.get(
  '/lignes',
  requireAuth,
  requireRole('super_admin_fnct'),
  exportable(JEU_BIBLIOTHEQUE),
  asyncHandler(async (req, res) => {
    const { element } = qLignesSchema.parse(req.query);
    const [communes, lignes] = await Promise.all([communesReelles(), query<Ligne>('SELECT * FROM app.bibliotheque_lignes()')]);
    const parId = new Map(communes.map((c) => [c.id, c]));
    res.json(
      lignes
        .filter((l) => !element || l.element === element)
        .map((l) => {
          const c = parId.get(l.commune_id);
          return { ...l, nombre: Number(l.nombre), commune: c?.name ?? l.commune_id, gouvernorat: c?.gouvernorat ?? null, district: c?.district ?? null };
        })
        // Ordre alphabétique : un catalogue, pas un classement.
        .sort(
          (a, b) =>
            ELEMENTS.findIndex((e) => e.cle === a.element) - ELEMENTS.findIndex((e) => e.cle === b.element) ||
            alphabetique(a.gouvernorat ?? '', b.gouvernorat ?? '') ||
            alphabetique(a.commune, b.commune) ||
            alphabetique(a.intitule ?? '', b.intitule ?? '')
        )
    );
  })
);

// ---------------------------------------------------------------------------
// Un élément : par gouvernorat, par district, puis commune par commune
// ---------------------------------------------------------------------------

bibliothequeRouter.get(
  '/:element',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const parse = elementSchema.safeParse(req.params);
    if (!parse.success) throw new ApiError(404, 'Élément inconnu de la bibliothèque.');
    const { element } = parse.data;
    const [communes, toutes, districts] = await Promise.all([
      communesReelles(),
      query<Ligne>('SELECT * FROM app.bibliotheque_lignes()'),
      query<{ code: string; nom: string }>('SELECT code, nom FROM districts_fnct'),
    ]);
    const lignes = toutes.filter((l) => l.element === element);
    const parId = new Map(communes.map((c) => [c.id, c]));
    const avec = new Set(lignes.map((l) => l.commune_id));

    /** Les territoires d'un niveau : « N communes sur M », dans l'ordre alphabétique. */
    const territoires = (cleDe: (c: Commune) => string, nomDe: (cle: string) => string) => {
      const groupes = new Map<string, { communes: number; avec: number; nombre: number; derniere: string | null }>();
      for (const c of communes) {
        const g = groupes.get(cleDe(c)) ?? { communes: 0, avec: 0, nombre: 0, derniere: null };
        g.communes += 1;
        if (avec.has(c.id)) g.avec += 1;
        groupes.set(cleDe(c), g);
      }
      for (const l of lignes) {
        const c = parId.get(l.commune_id);
        if (!c) continue;
        const g = groupes.get(cleDe(c))!;
        g.nombre += Number(l.nombre);
        g.derniere = plusTard(g.derniere, l.derniere);
      }
      return [...groupes.entries()]
        .map(([cle, g]) => ({ cle, nom: nomDe(cle), communes: g.communes, communes_avec: g.avec, nombre: g.nombre, derniere: g.derniere }))
        .sort((a, b) => alphabetique(a.nom, b.nom));
    };
    const nomDistrict = new Map(districts.map((d) => [d.code, d.nom]));

    res.json({
      element,
      groupe: ELEMENTS.find((e) => e.cle === element)!.groupe,
      communes_total: communes.length,
      communes_avec: avec.size,
      repartition: repartition(lignes),
      gouvernorats: territoires(
        (c) => c.gouvernorat,
        (cle) => cle
      ),
      districts: territoires(
        (c) => c.district ?? 'non_rattache',
        (cle) => nomDistrict.get(cle) ?? cle
      ),
      lignes: lignes
        .map((l) => {
          const c = parId.get(l.commune_id)!;
          return {
            commune_id: l.commune_id,
            commune: c.name,
            commune_ar: c.name_ar,
            gouvernorat: c.gouvernorat,
            intitule: l.intitule,
            annee: l.annee,
            auteur: l.auteur,
            statut: l.statut,
            nature: l.nature,
            nombre: Number(l.nombre),
            premiere: l.premiere,
            derniere: l.derniere,
            mois_couverts: l.mois_couverts,
          };
        })
        .sort((a, b) => alphabetique(a.gouvernorat, b.gouvernorat) || alphabetique(a.commune, b.commune) || alphabetique(a.intitule ?? '', b.intitule ?? '')),
    });
  })
);
