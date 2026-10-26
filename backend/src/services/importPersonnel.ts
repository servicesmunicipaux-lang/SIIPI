// Les garde-fous de l'import du personnel (préparation de la recette R1).
//
// LE FICHIER D'UNE COMMUNE EST SOUVENT SA FEUILLE DE PAIE. Elle porte le salaire,
// le numéro de CIN, parfois l'adresse ou un arrêt maladie. Le registre n'a pas de
// colonne pour les recevoir (loi organique n° 2004-63, minimisation), mais les
// IGNORER ne suffit pas : le fichier serait accepté, et la commune croirait que
// SIIPI garde ce qu'elle a envoyé. Un fichier qui en porte est REFUSÉ en entier,
// en nommant la colonne : la commune la retire et renvoie quatre colonnes.
//
// Un numéro de huit chiffres seul dans une case est refusé de même, où qu'il soit :
// c'est la forme d'un CIN, et celle d'un numéro de téléphone tunisien.
import { normaliser } from './import.js';

/** Les familles de données que le registre ne garde jamais, et ce qui les annonce dans un en-tête. */
const INTERDITES: Array<{ quoi: string; motifs: RegExp[] }> = [
  {
    quoi: 'un salaire ou une rémunération individuelle',
    motifs: [/salaire/, /remuneration/, /\bprimes?\b/, /indemnite/, /\bpaie\b/, /\bbrut\b/, /\bnet a payer\b/, /اجر/, /أجر/, /راتب/, /مرتب/, /منحة/, /جراية/],
  },
  {
    quoi: 'un numéro de pièce d’identité',
    motifs: [/\bcin\b/, /carte d'identite/, /piece d'identite/, /numero d'identite/, /passeport/, /بطاقة التعريف/, /ب\.ت\.و/, /جواز/],
  },
  {
    quoi: 'une donnée de santé',
    motifs: [/sante/, /maladie/, /medical/, /medecin/, /diagnostic/, /handicap/, /invalidite/, /صحة/, /صحي/, /مرض/, /طبي/, /إعاقة/],
  },
  {
    quoi: 'une adresse ou un téléphone personnel',
    motifs: [/adresse/, /domicile/, /\btel\b/, /telephone/, /\bgsm\b/, /portable/, /mobile/, /عنوان/, /سكنى/, /هاتف/, /جوال/],
  },
];

/** Ce qu'annonce un en-tête interdit, ou null. */
export function colonneInterdite(entete: string): string | null {
  // Deux formes : sans accent pour les motifs latins ; composée (NFC) pour l'arabe,
  // que la décomposition sépare de sa hamza — « أجر » n'y serait plus reconnu.
  const formes = [normaliser(entete), entete.normalize('NFC').toLowerCase().trim()];
  if (!formes[0]) return null;
  return INTERDITES.find((f) => f.motifs.some((m) => formes.some((e) => m.test(e))))?.quoi ?? null;
}

/** Une case qui a la forme d'un CIN ou d'un téléphone : huit chiffres, espaces ou points mis à part. */
export function ressembleAUnIdentifiant(valeur: string): boolean {
  return /^\d{8}$/.test(valeur.replace(/[\s.\-]/g, ''));
}

/**
 * Le refus d'un fichier, en mots, ou null s'il peut être lu. Les en-têtes d'abord,
 * puis chaque case : une seule suffit.
 */
export function refusFichierPersonnel(rangees: string[][]): string | null {
  const entetes = rangees[0] ?? [];
  for (const entete of entetes) {
    const quoi = colonneInterdite(entete);
    if (quoi) {
      return (
        `La colonne « ${entete.trim()} » porte ${quoi} : SIIPI ne le garde jamais (loi organique n° 2004-63). ` +
        'Retirez cette colonne du fichier, puis importez-le à nouveau. Quatre colonnes suffisent : Nom, Prénom, Fonction, Statut.'
      );
    }
  }
  for (let i = 1; i < rangees.length; i++) {
    for (let j = 0; j < rangees[i].length; j++) {
      if (ressembleAUnIdentifiant(rangees[i][j] ?? '')) {
        const colonne = (entetes[j] ?? '').trim() || `n° ${j + 1}`;
        return (
          `Ligne ${i + 1}, colonne « ${colonne} » : huit chiffres, la forme d'un numéro de CIN ou de téléphone. ` +
          'SIIPI ne garde ni l’un ni l’autre : retirez-le du fichier, puis importez-le à nouveau.'
        );
      }
    }
  }
  return null;
}

/** La clé qui reconnaît un agent, dans un ordre ou dans l'autre (« Prénom Nom » ou « Nom Prénom »). */
export function clesAgent(prenom: string, nom: string): [string, string] {
  return [normaliser(`${prenom} ${nom}`), normaliser(`${nom} ${prenom}`)];
}
