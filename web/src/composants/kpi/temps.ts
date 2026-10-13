// Les périodes des graphiques d'indicateurs (refonte, lot 3b).
//
// Le temps est celui de Tunis (règle d'or 1.3), et toutes les dates voyagent en
// texte « AAAA-MM-JJ » : un objet Date converti en UTC ferait glisser le 1er
// du mois sur le dernier jour du mois précédent.
//
// Un mois sans valeur reste un TROU (règle d'or 1.1) : la liste des mois d'une
// fenêtre est construite ici, et la valeur d'un mois absent de la série est
// `null` — jamais 0.

export type Fenetre = '3m' | '6m' | '12m' | 'annees';

/** Le jour à Tunis (UTC+1, sans heure d'été). */
export const aujourdhuiTunis = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

/** « 2026-03 » décalé de n mois (n négatif : en arrière). */
export function decalerMois(mois: string, n: number): string {
  const [a, m] = mois.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Les mois « AAAA-MM » de `premier` à `dernier` inclus. */
export function listeMois(premier: string, dernier: string): string[] {
  const liste: string[] = [];
  for (let m = premier; m <= dernier; m = decalerMois(m, 1)) liste.push(m);
  return liste;
}

/**
 * Les bornes d'une fenêtre pour l'année affichée : les n derniers mois jusqu'à
 * la fin de cette année (ou jusqu'à aujourd'hui pour l'année en cours), ou les
 * cinq dernières années.
 */
export function bornesFenetre(annee: number, fenetre: Fenetre): { debut: string; fin: string; pas: 'mois' | 'annee'; mois: string[] } {
  const auj = aujourdhuiTunis();
  const fin = annee >= Number(auj.slice(0, 4)) ? auj : `${annee}-12-31`;
  if (fenetre === 'annees') return { debut: `${annee - 4}-01-01`, fin, pas: 'annee', mois: [] };
  const n = fenetre === '3m' ? 3 : fenetre === '6m' ? 6 : 12;
  const dernier = fin.slice(0, 7);
  const premier = decalerMois(dernier, -(n - 1));
  return { debut: `${premier}-01`, fin, pas: 'mois', mois: listeMois(premier, dernier) };
}

/** Le dernier jour d'un mois « AAAA-MM ». */
export function finDeMois(mois: string): string {
  const suivant = decalerMois(mois, 1);
  const [a, m] = suivant.split('-').map(Number);
  // Le jour 0 du mois suivant, calculé en UTC : aucune heure locale n'intervient.
  return new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
}

/** « mars 26 » / « مارس 26 » — le mois court, l'année sur deux chiffres. */
export function libelleMois(mois: string, langue: string): string {
  const [a, m] = mois.split('-').map(Number);
  const nom = new Intl.DateTimeFormat(langue.startsWith('ar') ? 'ar-TN' : 'fr-TN', { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(a, m - 1, 1))
  );
  return `${nom} ${String(a).slice(2)}`;
}
