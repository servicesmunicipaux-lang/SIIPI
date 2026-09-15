// Moteur de calcul des indicateurs nationaux — implémentation réelle et exécutée
// (le prototype affichait ces formules comme "extrait de code" statique, sans jamais
// les exécuter). Reprend les formules définies dans les spécifications Phase 3.

export interface KpiCalculationInput {
  tonnageAnnuelKg: number;
  population: number;
  coutTotalExploitationTND?: number;
}

export interface KpiCalculationResult {
  qpKgHabJour: number;
  tcTauxCollecte: number;
  coutParHabitantTND: number | null;
  indicePerformance: 'A (Excellente)' | 'B (Satisfaisante)' | 'C (À renforcer)';
}

const PRODUCTION_ESTIMEE_KG_HAB_JOUR = 0.85; // référence nationale (cf. spécifications Phase 3)

export function calculateNationalKpi(input: KpiCalculationInput): KpiCalculationResult {
  if (input.population <= 0) {
    throw new Error('La population doit être strictement positive.');
  }

  const qpKgHabJour = input.tonnageAnnuelKg / (input.population * 365);
  const productionEstimeeAnnuelleKg = input.population * 365 * PRODUCTION_ESTIMEE_KG_HAB_JOUR;
  const tcTauxCollecte = Math.min(100, (input.tonnageAnnuelKg / productionEstimeeAnnuelleKg) * 100);
  const coutParHabitantTND =
    input.coutTotalExploitationTND !== undefined ? input.coutTotalExploitationTND / input.population : null;

  return {
    qpKgHabJour: Number(qpKgHabJour.toFixed(3)),
    tcTauxCollecte: Number(tcTauxCollecte.toFixed(1)),
    coutParHabitantTND: coutParHabitantTND !== null ? Number(coutParHabitantTND.toFixed(2)) : null,
    indicePerformance: tcTauxCollecte > 90 ? 'A (Excellente)' : tcTauxCollecte > 80 ? 'B (Satisfaisante)' : 'C (À renforcer)',
  };
}

// 5 axes officiels — cahier des charges FNCT/ANGeD §3.2.10.
export interface FiveAxisInput {
  efficaciteOperationnelle: number;    // Axe 1 : taux de collecte, respect des tournées, disponibilité flotte...
  qualiteService: number;              // Axe 2 : délai de traitement réclamations, indice de propreté, satisfaction...
  performanceEnvironnementale: number; // Axe 3 : taux de valorisation/tri, conformité PCGD, écarts de pesée...
  performanceEconomique: number;       // Axe 4 : coût par habitant, taux de recouvrement TCL, exécution budgétaire...
  securiteRh: number;                  // Axe 5 : accidents du travail, couverture sociale, formation du personnel...
}

export function calculateOverallScore(input: FiveAxisInput): number {
  for (const [key, value] of Object.entries(input)) {
    if (value < 0 || value > 100) {
      throw new Error(`Le score de l'axe "${key}" doit être compris entre 0 et 100.`);
    }
  }
  const sum =
    input.efficaciteOperationnelle +
    input.qualiteService +
    input.performanceEnvironnementale +
    input.performanceEconomique +
    input.securiteRh;
  return Number((sum / 5).toFixed(2));
}
