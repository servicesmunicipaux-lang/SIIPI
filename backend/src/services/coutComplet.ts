// Le rejeu du coût complet d'une étude de bureau d'études (lot 17.5).
//
// Méthode (skill pcgd-cout-complet-methodologie) :
//
//     Z = X + Y        X = A + B        Y = C + D
//     A charges directes réelles    B amortissements
//     C quote-part du parc          D quote-part de l'administration
//
// Ce module ne lit rien et n'écrit rien : il reçoit les lignes déclarées
// (migration 062) et rend le calcul. Rien n'est stocké : un résultat en base
// serait une seconde vérité, qu'une étude rechargée laisserait fausse.
//
// LES ÉCARTS SONT MONTRÉS, PAS TRANCHÉS. Chaque écart E1 à E8 rend ses
// chiffres et son statut — constaté, aucun, non vérifiable, déclaré à la
// lecture —, jamais une correction. L'écran les formule dans les deux langues.
//
// L'ARRONDI N'EST PAS UNE TOLÉRANCE. Un ratio publié « 155 » couvre 154,5 à
// 155,5 : son dénominateur implicite est un INTERVALLE. Un tonnage déclaré
// hors de cet intervalle est un écart ; dedans, ce n'en est pas un. Aucun
// pourcentage arbitraire.
//
// Les valeurs attendues des campagnes sont calculées par un script
// indépendant (backend/tests/cout_complet_attendus.py), qui ne lit que le
// fichier d'entrée : jamais ce code.

export type Nature = 'poste' | 'total' | 'ratio' | 'flux';

export interface ValeurDeclaree {
  nature: Nature;
  code: string;
  montant: number | null;
  numerateur: number | null;
  pas_arrondi: number | null;
  retenue: boolean;
  reference: string | null;
}

export interface EtudeDeclaree {
  tonnage_pese_t: number | null;
  population: number | null;
  menages: number | null;
}

export interface ConstatLecture {
  code: string;
  sujet: string;
  constat: string;
}

export type Bloc = 'A' | 'B' | 'C' | 'D';
export const BLOCS: Bloc[] = ['A', 'B', 'C', 'D'];

/** Le bloc de chaque poste — miroir de app.bloc_poste_cout (migration 062). */
export const BLOC_DU_POSTE: Record<string, Bloc> = {
  personnel: 'A', charges_patronales: 'A', engins: 'A', transfert_decharge: 'A', redevance_anged: 'A',
  sous_traitance: 'A', interets_dette: 'A', assurance: 'A', habillement: 'A', taxes_circulation: 'A',
  autres_directes: 'A',
  amortissement: 'B',
  qp_parc: 'C',
  qp_siege: 'D', qp_direction: 'D', qp_administration: 'D',
};

/**
 * Les postes que la méthode attend (grille du skill, § 9). Un poste attendu
 * que l'étude ne donne pas — ou déclare absent — est « non renseigné » (E7),
 * jamais compté pour 0.
 */
export const POSTES_ATTENDUS: string[] = [
  'personnel', 'charges_patronales', 'engins', 'transfert_decharge', 'redevance_anged', 'sous_traitance',
  'interets_dette', 'assurance', 'habillement', 'taxes_circulation', 'amortissement', 'qp_parc',
];
/** Le bloc D est attendu sous l'une de ces formes (siège et direction, ou administration d'un bloc). */
const POSTES_D = ['qp_siege', 'qp_direction', 'qp_administration'];

/** Les flux que la méthode demande de ventiler quand la commune les gère. */
export const FLUX_ATTENDUS = ['dma', 'demolition', 'balayage'];

type Unite = 't' | 'jours' | 'habitants' | 'menages' | 'habitats';

/** Le numérateur et l'unité du dénominateur de chaque ratio publié. */
const RATIOS: Record<string, { numerateur: [Nature, string] | 'declare'; unite: Unite }> = {
  cout_par_tonne: { numerateur: ['total', 'cout_total'], unite: 't' },
  cout_direct_par_tonne: { numerateur: ['total', 'total_direct'], unite: 't' },
  cout_indirect_par_tonne: { numerateur: ['total', 'total_indirect'], unite: 't' },
  personnel_par_tonne: { numerateur: ['poste', 'personnel'], unite: 't' },
  engins_par_tonne: { numerateur: ['poste', 'engins'], unite: 't' },
  transfert_par_tonne: { numerateur: ['poste', 'transfert_decharge'], unite: 't' },
  amortissement_par_tonne: { numerateur: ['poste', 'amortissement'], unite: 't' },
  maintenance_par_tonne: { numerateur: 'declare', unite: 't' },
  gasoil_par_tonne: { numerateur: 'declare', unite: 't' },
  cout_par_jour: { numerateur: ['total', 'cout_total'], unite: 'jours' },
  cout_direct_par_jour: { numerateur: ['total', 'total_direct'], unite: 'jours' },
  cout_indirect_par_jour: { numerateur: ['total', 'total_indirect'], unite: 'jours' },
  cout_par_habitant: { numerateur: ['total', 'cout_total'], unite: 'habitants' },
  cout_par_menage: { numerateur: ['total', 'cout_total'], unite: 'menages' },
  cout_par_habitat: { numerateur: ['total', 'cout_total'], unite: 'habitats' },
};

export type StatutEcart = 'constate' | 'aucun' | 'non_verifiable' | 'declare';

const arrondi = (v: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round(v * f) / f;
};
const somme = (valeurs: number[]) => valeurs.reduce((s, v) => s + v, 0);

export function rejouer(etude: EtudeDeclaree, valeurs: ValeurDeclaree[], constats: ConstatLecture[]) {
  const retenue = (nature: Nature, code: string) => valeurs.find((v) => v.nature === nature && v.code === code && v.retenue);
  const variantes = (nature: Nature, code: string) =>
    valeurs.filter((v) => v.nature === nature && v.code === code && !v.retenue);
  const montantRetenu = (nature: Nature, code: string) => retenue(nature, code)?.montant ?? null;

  // --- Les blocs A à D -----------------------------------------------------
  // Dans l'ordre de la nomenclature, pas dans celui de l'alphabet.
  const ordre = Object.keys(BLOC_DU_POSTE);
  const postes = valeurs
    .filter((v) => v.nature === 'poste' && v.retenue)
    .sort((a, b) => ordre.indexOf(a.code) - ordre.indexOf(b.code));
  const blocs = Object.fromEntries(
    BLOCS.map((b) => {
      const declarees = postes.filter((p) => BLOC_DU_POSTE[p.code] === b);
      // Un poste attendu que l'étude ne nomme même pas figure aussi, « non
      // renseigné » : le taire laisserait croire qu'il vaut zéro.
      const attendusTus = POSTES_ATTENDUS.filter(
        (c) => BLOC_DU_POSTE[c] === b && !declarees.some((p) => p.code === c)
      ).map((code): ValeurDeclaree => ({
        nature: 'poste', code, montant: null, numerateur: null, pas_arrondi: null, retenue: true, reference: null,
      }));
      const lignes = [...declarees, ...attendusTus].sort((x, y) => ordre.indexOf(x.code) - ordre.indexOf(y.code));
      const renseignes = lignes.filter((p) => p.montant !== null);
      return [
        b,
        {
          // Aucun poste chiffré dans le bloc : le bloc n'est pas renseigné.
          montant: renseignes.length ? arrondi(somme(renseignes.map((p) => p.montant as number)), 3) : null,
          postes: lignes.map((p) => ({
            code: p.code,
            montant: p.montant,
            reference: p.reference,
            variantes: variantes('poste', p.code).map((v) => ({ montant: v.montant, reference: v.reference })),
          })),
        },
      ];
    })
  ) as Record<Bloc, { montant: number | null; postes: { code: string; montant: number | null; reference: string | null; variantes: { montant: number | null; reference: string | null }[] }[] }>;

  const ajoute = (...m: (number | null)[]) => {
    const presents = m.filter((x): x is number => x !== null);
    return presents.length ? arrondi(somme(presents), 3) : null;
  };
  const X = ajoute(blocs.A.montant, blocs.B.montant);
  const Y = ajoute(blocs.C.montant, blocs.D.montant);
  const Z = ajoute(X, Y);
  // Z ne se dit complet que si les quatre blocs sont renseignés.
  const complet = BLOCS.every((b) => blocs[b].montant !== null);

  // --- Le rejeu face aux totaux publiés ----------------------------------------
  const ecart = (siipi: number | null, publie: number | null) =>
    siipi === null || publie === null ? null : arrondi(siipi - publie, 3);
  const comparaison = {
    A: { siipi: blocs.A.montant, publie: montantRetenu('total', 'sous_total_hors_amortissement') },
    X: { siipi: X, publie: montantRetenu('total', 'total_direct') },
    Y: { siipi: Y, publie: montantRetenu('total', 'total_indirect') },
    Z: { siipi: Z, publie: montantRetenu('total', 'cout_total') },
  };
  const comparaisonAvecEcarts = Object.fromEntries(
    Object.entries(comparaison).map(([k, c]) => [k, { ...c, ecart: ecart(c.siipi, c.publie) }])
  );

  // --- Les ratios publiés, et leur dénominateur implicite ----------------------
  const declare: Record<Unite, number | null> = {
    t: etude.tonnage_pese_t,
    jours: null,
    habitants: etude.population,
    menages: etude.menages,
    habitats: null,
  };
  const ratios = valeurs
    .filter((v) => v.nature === 'ratio' && v.retenue)
    .map((r) => {
      const def = RATIOS[r.code];
      const numerateur = def.numerateur === 'declare' ? r.numerateur : montantRetenu(...def.numerateur);
      const valeur = r.montant as number;
      const pas = r.pas_arrondi as number;
      // Le ratio vrai est dans [valeur − pas/2 ; valeur + pas/2] : le
      // dénominateur, dans l'intervalle inverse.
      const intervalle =
        numerateur === null || valeur - pas / 2 <= 0
          ? null
          : { min: arrondi(numerateur / (valeur + pas / 2), 2), max: arrondi(numerateur / (valeur - pas / 2), 2) };
      const reference = declare[def.unite];
      return {
        code: r.code,
        valeur,
        pas_arrondi: pas,
        numerateur,
        unite: def.unite,
        denominateur_implicite: numerateur === null ? null : arrondi(numerateur / valeur, 2),
        intervalle,
        denominateur_declare: reference,
        // Le dénominateur déclaré est-il compatible avec le ratio publié ?
        compatible: intervalle === null || reference === null ? null : reference >= intervalle.min && reference <= intervalle.max,
        // Le même numérateur, divisé par le dénominateur déclaré.
        recalcule: numerateur === null || reference === null ? null : arrondi(numerateur / reference, 2),
      };
    });
  const ratio = (code: string) => ratios.find((r) => r.code === code);

  // --- Les écarts E1 à E8 -----------------------------------------------------
  const notes = (code: string) => constats.filter((c) => c.code === code).map((c) => ({ sujet: c.sujet, constat: c.constat }));
  const ecarts: { code: string; statut: StatutEcart; donnees: Record<string, unknown>; notes: { sujet: string; constat: string }[] }[] = [];

  // E1 — le dénominateur du coût complet à la tonne.
  {
    const r = ratio('cout_par_tonne');
    const statut: StatutEcart = !r || r.compatible === null ? 'non_verifiable' : r.compatible ? 'aucun' : 'constate';
    ecarts.push({
      code: 'E1',
      statut,
      donnees: {
        cout_total: r?.numerateur ?? null,
        ratio_publie: r?.valeur ?? null,
        intervalle: r?.intervalle ?? null,
        tonnage_pese: etude.tonnage_pese_t,
        ratio_sur_tonnage_pese: Z !== null && etude.tonnage_pese_t ? arrondi(Z / etude.tonnage_pese_t, 1) : null,
      },
      notes: notes('E1'),
    });
  }

  // E2 — des ratios à la tonne qui n'impliquent pas le même tonnage.
  {
    const parTonne = ratios.filter((r) => r.unite === 't' && r.intervalle !== null);
    const min = parTonne.length ? Math.max(...parTonne.map((r) => r.intervalle!.min)) : null;
    const max = parTonne.length ? Math.min(...parTonne.map((r) => r.intervalle!.max)) : null;
    const statut: StatutEcart = parTonne.length < 2 ? 'non_verifiable' : (min as number) <= (max as number) ? 'aucun' : 'constate';
    ecarts.push({
      code: 'E2',
      statut,
      donnees: {
        ratios: parTonne.map((r) => ({
          code: r.code,
          numerateur: r.numerateur,
          valeur: r.valeur,
          intervalle: r.intervalle,
          compatible_tonnage_pese: r.compatible,
        })),
        tonnage_pese: etude.tonnage_pese_t,
      },
      notes: notes('E2'),
    });
  }

  // E3 — des totaux qui diffèrent d'un tableau à l'autre, ou ne se recoupent pas.
  {
    const codesTotaux = ['sous_total_hors_amortissement', 'total_direct', 'total_indirect', 'cout_total'];
    const versions = codesTotaux
      .filter((c) => variantes('total', c).length > 0)
      .map((c) => ({
        code: c,
        retenue: { montant: montantRetenu('total', c), reference: retenue('total', c)?.reference ?? null },
        autres: variantes('total', c).map((v) => ({ montant: v.montant, reference: v.reference })),
      }));
    const recoupements: { verification: string; attendu: number; obtenu: number; ecart: number }[] = [];
    const verifier = (verification: string, attendu: number | null, obtenu: number | null) => {
      if (attendu !== null && obtenu !== null && Math.abs(attendu - obtenu) >= 0.5) {
        recoupements.push({ verification, attendu, obtenu, ecart: arrondi(obtenu - attendu, 3) });
      }
    };
    verifier('A_sous_total', blocs.A.montant, comparaison.A.publie);
    verifier('X_total_direct', X, comparaison.X.publie);
    verifier('Y_total_indirect', Y, comparaison.Y.publie);
    verifier('Z_cout_total', Z, comparaison.Z.publie);
    // Une version non retenue du total indirect (ou direct) se somme-t-elle avec
    // l'autre total pour faire le coût publié ?
    const coutTotal = comparaison.Z.publie;
    for (const v of variantes('total', 'total_indirect')) {
      verifier('direct_plus_indirect_variante', coutTotal, ajoute(comparaison.X.publie, v.montant));
    }
    for (const v of variantes('total', 'total_direct')) {
      verifier('direct_variante_plus_indirect', coutTotal, ajoute(v.montant, comparaison.Y.publie));
    }
    const statut: StatutEcart =
      comparaison.Z.publie === null ? 'non_verifiable' : versions.length || recoupements.length ? 'constate' : 'aucun';
    ecarts.push({ code: 'E3', statut, donnees: { versions, recoupements }, notes: notes('E3') });
  }

  // E4 — deux versions d'un même poste.
  {
    const versions = postes
      .filter((p) => variantes('poste', p.code).length > 0)
      .map((p) => ({
        code: p.code,
        retenue: { montant: p.montant, reference: p.reference },
        autres: variantes('poste', p.code).map((v) => ({ montant: v.montant, reference: v.reference })),
      }));
    ecarts.push({ code: 'E4', statut: versions.length ? 'constate' : 'aucun', donnees: { versions }, notes: notes('E4') });
  }

  // E5 — les dénominateurs par habitant, par ménage, par habitat.
  {
    const lignes = ['cout_par_habitant', 'cout_par_menage', 'cout_par_habitat']
      .map((c) => ratio(c))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => ({
        code: r.code,
        valeur: r.valeur,
        intervalle: r.intervalle,
        denominateur_declare: r.denominateur_declare,
        compatible: r.compatible,
        recalcule: r.recalcule,
      }));
    const statut: StatutEcart = !lignes.length
      ? 'non_verifiable'
      : lignes.some((l) => l.compatible === false)
        ? 'constate'
        : lignes.some((l) => l.compatible === null)
          ? 'non_verifiable'
          : 'aucun';
    ecarts.push({ code: 'E5', statut, donnees: { ratios: lignes }, notes: notes('E5') });
  }

  // E6 — ce que la lecture a relevé et que SIIPI ne recalcule pas.
  ecarts.push({ code: 'E6', statut: notes('E6').length ? 'declare' : 'aucun', donnees: {}, notes: notes('E6') });

  // E7 — les postes que la méthode attend et que l'étude ne donne pas.
  {
    const renseigne = (code: string) => postes.some((p) => p.code === code && p.montant !== null);
    const absents = POSTES_ATTENDUS.filter((c) => !renseigne(c));
    if (!POSTES_D.some(renseigne)) absents.push('qp_administration');
    ecarts.push({
      code: 'E7',
      statut: absents.length ? 'constate' : 'aucun',
      donnees: {
        non_renseignes: absents,
        declares_absents: postes.filter((p) => p.montant === null).map((p) => p.code),
      },
      notes: notes('E7'),
    });
  }

  // E8 — la ventilation par flux.
  {
    const flux = valeurs
      .filter((v) => v.nature === 'flux' && v.retenue)
      .map((v) => ({ code: v.code, montant: v.montant, reference: v.reference }));
    const manquants = FLUX_ATTENDUS.filter((c) => !flux.some((f) => f.code === c));
    ecarts.push({
      code: 'E8',
      statut: manquants.length ? 'constate' : 'aucun',
      donnees: { flux_ventiles: flux, flux_manquants: manquants },
      notes: notes('E8'),
    });
  }

  return {
    formule: 'Z = (A + B) + (C + D)',
    blocs,
    X,
    Y,
    Z,
    complet,
    comparaison: comparaisonAvecEcarts,
    recalcul_tonnage_pese: {
      tonnage_pese: etude.tonnage_pese_t,
      cout_par_tonne: Z !== null && etude.tonnage_pese_t ? arrondi(Z / etude.tonnage_pese_t, 2) : null,
      direct_par_tonne: X !== null && etude.tonnage_pese_t ? arrondi(X / etude.tonnage_pese_t, 2) : null,
      indirect_par_tonne: Y !== null && etude.tonnage_pese_t ? arrondi(Y / etude.tonnage_pese_t, 2) : null,
    },
    ratios,
    ecarts,
  };
}
