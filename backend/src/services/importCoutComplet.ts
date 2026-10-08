// La lecture d'un fichier « agrégats de PCGD » (lot 17.5) : celui que la FNCT
// tire d'un rapport de bureau d'études (format de
// docs/specs_metier/sources/mhamdia-pcgd-2025-agregats.json, qui reste hors du
// dépôt public).
//
// CE QUI EST RETENU QUAND LE RAPPORT SE CONTREDIT. Le fichier range les
// chiffres principaux, et sous `autres_chiffres_du_rapport` les versions
// publiées ailleurs dans le même rapport : les premiers sont « retenus », les
// secondes rangées comme variantes (écart E4). Pour les charges indirectes,
// publiées avec deux totaux, est retenu celui qui égale la somme de ses lignes
// (siège + parc + direction) ; si aucun ne l'égale, aucun n'est retenu, et le
// calcul repart des lignes. SIIPI n'invente pas de troisième chiffre.
//
// AUCUNE DONNÉE NOMINATIVE N'ENTRE. Un fichier qui porterait un champ de nom,
// de CIN, de téléphone ou de salaire individuel est refusé en bloc.

import type { ConstatLecture, Nature } from './coutComplet.js';

export class FichierInvalide extends Error {}

export interface LigneValeur {
  nature: Nature;
  code: string;
  montant: number | null;
  numerateur: number | null;
  pas_arrondi: number | null;
  retenue: boolean;
  reference: string;
}

export interface EtudeLue {
  exercice: number;
  document: string;
  bureau_etudes: string | null;
  gouvernorat: string | null;
  tonnage_pese_t: number | null;
  tonnage_source: string | null;
  population: number | null;
  population_source: string | null;
  menages: number | null;
  valeurs: LigneValeur[];
  constats: ConstatLecture[];
}

const CHAMPS_INTERDITS = /(^|_)(cin|nom_agent|noms_agents|prenom|telephone|tel|adresse|salaire_individuel|salaires_individuels|matricule)(_|$)/i;

function verifierAnonymat(objet: unknown, chemin = ''): void {
  if (Array.isArray(objet)) objet.forEach((v, i) => verifierAnonymat(v, `${chemin}[${i}]`));
  else if (objet && typeof objet === 'object') {
    for (const [cle, v] of Object.entries(objet)) {
      if (CHAMPS_INTERDITS.test(cle)) {
        throw new FichierInvalide(
          `Le champ « ${chemin}${cle} » ressemble à une donnée personnelle : un fichier de coût complet ne porte que des agrégats. Retirez-le et rechargez.`
        );
      }
      verifierAnonymat(v, `${chemin}${cle}.`);
    }
  }
}

const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Le pas d'arrondi d'un ratio tel que le rapport l'écrit : 155 → 1 ; 11.7 → 0,1. */
export function pasArrondi(v: number): number {
  const decimales = (String(v).split('.')[1] ?? '').length;
  return Number((10 ** -decimales).toFixed(decimales));
}

const objet = (v: unknown, nom: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new FichierInvalide(`Section « ${nom} » absente ou illisible dans le fichier.`);
  }
  return v as Record<string, unknown>;
};

// Les postes déclarés absents à la lecture, reconnus par leur libellé.
const POSTES_ABSENTS: [RegExp, string][] = [
  [/cpscl|intérêts? de la dette|interets? de la dette/i, 'interets_dette'],
  [/charges patronales/i, 'charges_patronales'],
  [/redevance anged/i, 'redevance_anged'],
  [/sous-traitance/i, 'sous_traitance'],
];
const POSTES_ABSENTS_MULTIPLES: [RegExp, string][] = [
  [/assurance/i, 'assurance'],
  [/habillement/i, 'habillement'],
  [/taxes? de circulation/i, 'taxes_circulation'],
];

const ECARTS_CALCULES = new Set(['E1', 'E2', 'E3', 'E4', 'E5', 'E7', 'E8']);

export function lireFichierPcgd(brut: unknown): EtudeLue {
  verifierAnonymat(brut);
  const racine = objet(brut, 'racine');
  const meta = objet(racine._meta, '_meta');
  const exercice = nombre(meta.exercice);
  if (exercice === null || exercice < 2000 || exercice > 2100) {
    throw new FichierInvalide('_meta.exercice doit être une année (par exemple 2025).');
  }
  const document = typeof meta.source === 'string' && meta.source.trim() ? meta.source.trim() : null;
  if (!document) throw new FichierInvalide('_meta.source doit nommer le rapport dont les chiffres sont tirés.');

  const commune = objet(racine.commune, 'commune');
  const cleePopulation = Object.keys(commune).find((k) => k.startsWith('population'));
  const tonnages = objet(racine.tonnages, 'tonnages');
  const annuel = objet(tonnages.annuel, 'tonnages.annuel');

  const directes = objet(racine[`charges_directes_collecte_${exercice}`], `charges_directes_collecte_${exercice}`);
  const autres = (directes.autres_chiffres_du_rapport ?? {}) as Record<string, unknown>;
  const indirectes = objet(racine[`charges_indirectes_collecte_${exercice}`], `charges_indirectes_collecte_${exercice}`);
  const publies = objet(racine.totaux_et_ratios_publies, 'totaux_et_ratios_publies');

  const valeurs: LigneValeur[] = [];
  const constats: ConstatLecture[] = [];
  const ajouter = (nature: Nature, code: string, v: unknown, reference: string, retenue = true, extra: Partial<LigneValeur> = {}) => {
    const montant = nombre(v);
    if (montant === null) return;
    valeurs.push({ nature, code, montant, numerateur: null, pas_arrondi: null, retenue, reference, ...extra });
  };
  const d = `charges_directes_collecte_${exercice}`;
  const i = `charges_indirectes_collecte_${exercice}`;

  // A et B — les postes directs, et leurs autres versions publiées.
  ajouter('poste', 'personnel', directes.frais_de_personnel, `${d}.frais_de_personnel`);
  ajouter('poste', 'engins', directes.depenses_engins_carburant_entretien, `${d}.depenses_engins_carburant_entretien`);
  ajouter('poste', 'transfert_decharge', directes.transfert_et_mise_en_decharge, `${d}.transfert_et_mise_en_decharge`);
  ajouter('poste', 'amortissement', directes.amortissements_materiel_collecte_et_precollecte, `${d}.amortissements_materiel_collecte_et_precollecte`);
  for (const [cle, code] of [
    ['frais_de_personnel_tableau_III_5_2_2', 'personnel'],
    ['entretien_engins_tableau_III_5_2_2', 'engins'],
  ] as const) {
    ajouter('poste', code, autres[cle], `${d}.autres_chiffres_du_rapport.${cle}`, false);
  }
  // Les postes que la lecture n'a pas trouvés : déclarés absents (montant
  // NULL) — non renseignés, jamais zéro. Un libellé qui ne correspond à aucun
  // poste reste une note de lecture.
  const absents = Array.isArray(directes.postes_absents_du_rapport_a_la_lecture)
    ? (directes.postes_absents_du_rapport_a_la_lecture as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const declares = new Set<string>();
  for (const libelle of absents) {
    const codes = [
      ...POSTES_ABSENTS.filter(([re]) => re.test(libelle)).map(([, c]) => c),
      ...POSTES_ABSENTS_MULTIPLES.filter(([re]) => re.test(libelle)).map(([, c]) => c),
    ];
    if (codes.length === 0) {
      constats.push({ code: 'E7', sujet: 'Poste absent à la lecture', constat: libelle });
    }
    for (const code of codes) {
      if (declares.has(code) || valeurs.some((v) => v.nature === 'poste' && v.code === code)) continue;
      declares.add(code);
      valeurs.push({
        nature: 'poste', code, montant: null, numerateur: null, pas_arrondi: null, retenue: true,
        reference: `${d}.postes_absents_du_rapport_a_la_lecture`,
      });
    }
  }

  // C et D — les charges indirectes, par centre de coût.
  ajouter('poste', 'qp_parc', indirectes.parc_municipal, `${i}.parc_municipal`);
  ajouter('poste', 'qp_siege', indirectes.siege, `${i}.siege`);
  ajouter('poste', 'qp_direction', indirectes.direction_proprete, `${i}.direction_proprete`);

  // Les totaux publiés.
  ajouter('total', 'sous_total_hors_amortissement', directes.sous_total_hors_amortissements, `${d}.sous_total_hors_amortissements`);
  ajouter('total', 'total_direct', directes.total_charges_directes, `${d}.total_charges_directes`);
  ajouter('total', 'cout_total', publies.cout_total, 'totaux_et_ratios_publies.cout_total');
  const lignesIndirectes = ['siege', 'parc_municipal', 'direction_proprete'].map((k) => nombre(indirectes[k]));
  const sommeIndirectes = lignesIndirectes.every((x) => x !== null)
    ? (lignesIndirectes as number[]).reduce((s, x) => s + x, 0)
    : null;
  const totauxIndirects = Object.keys(indirectes).filter((k) => k.startsWith('total') && nombre(indirectes[k]) !== null);
  const retenuIndirect = totauxIndirects.find((k) => nombre(indirectes[k]) === sommeIndirectes) ?? null;
  for (const k of totauxIndirects) ajouter('total', 'total_indirect', indirectes[k], `${i}.${k}`, k === retenuIndirect);

  // Les ratios publiés, avec leur pas d'arrondi.
  const RATIOS_PUBLIES = [
    'cout_par_tonne', 'cout_direct_par_tonne', 'cout_indirect_par_tonne', 'personnel_par_tonne', 'engins_par_tonne',
    'transfert_par_tonne', 'amortissement_par_tonne', 'maintenance_par_tonne', 'gasoil_par_tonne', 'cout_par_jour',
    'cout_direct_par_jour', 'cout_indirect_par_jour', 'cout_par_habitant', 'cout_par_menage', 'cout_par_habitat',
  ];
  const NUMERATEURS: Record<string, string> = {
    maintenance_par_tonne: 'cout_maintenance_parc_total',
    gasoil_par_tonne: 'carburant_gasoil',
  };
  for (const code of RATIOS_PUBLIES) {
    const v = nombre(publies[code]);
    if (v === null || v <= 0) continue;
    ajouter('ratio', code, v, `totaux_et_ratios_publies.${code}`, true, {
      pas_arrondi: pasArrondi(v),
      numerateur: NUMERATEURS[code] ? nombre(autres[NUMERATEURS[code]]) : null,
    });
  }

  // La ventilation par flux : ce que le rapport isole.
  const campagnes = racine[`campagnes_de_proprete_${exercice}`] as Record<string, unknown> | undefined;
  if (campagnes) ajouter('flux', 'campagnes_proprete', campagnes.total_publie, `campagnes_de_proprete_${exercice}.total_publie`);

  // Ce que la lecture a relevé et que SIIPI ne recalcule pas.
  if (Array.isArray(racine.ecarts_constates_a_la_lecture)) {
    for (const e of racine.ecarts_constates_a_la_lecture as Record<string, unknown>[]) {
      if (typeof e?.id !== 'string' || ECARTS_CALCULES.has(e.id)) continue;
      if (typeof e.sujet === 'string' && typeof e.constat === 'string') {
        constats.push({ code: e.id, sujet: e.sujet, constat: e.constat });
      }
    }
  }

  return {
    exercice,
    document,
    bureau_etudes: typeof meta.bureau_etudes === 'string' ? meta.bureau_etudes : null,
    gouvernorat: typeof commune.gouvernorat === 'string' ? commune.gouvernorat : null,
    tonnage_pese_t: nombre(annuel[String(exercice)]),
    tonnage_source: typeof tonnages.unite === 'string' ? tonnages.unite : null,
    population: cleePopulation ? nombre(commune[cleePopulation]) : null,
    population_source: cleePopulation ?? null,
    menages: nombre(commune.menages),
    valeurs,
    constats,
  };
}
