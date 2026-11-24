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
 * Un texte libre qui porte, quelque part, huit chiffres ou plus qui se suivent :
 * un CIN ou un téléphone glissé dans une phrase. Distincte de
 * ressembleAUnIdentifiant (une case entière d'un fichier du personnel), dont
 * l'import garde la règle.
 *
 * MÊME RÈGLE, CARACTÈRE POUR CARACTÈRE, que app._texte_sans_identifiant (107) ;
 * celle-ci ne sert qu'à répondre 400 en nommant le champ :
 *   1. les chiffres arabes-indiens (٠-٩), persans (۰-۹) et pleine chasse (０-９)
 *      deviennent des chiffres ASCII : un numéro tapé au clavier arabe est le même ;
 *   2. seuls les ESPACES entre deux chiffres (espace insécable compris) sont
 *      retirés : « 98 123 456 » redevient huit chiffres ;
 *   3. points, tirets et barres obliques ne sont jamais joints : une date
 *      (23.11.2026, 2026-11-23, 23/11/2026) ou un numéro d'arrêté (2026-1234)
 *      reste permis.
 */
const CHIFFRES_NON_ASCII = /[٠-٩۰-۹０-９]/g;
export function contientUnIdentifiant(texte: string): boolean {
  const ascii = texte.replace(CHIFFRES_NON_ASCII, (c) => {
    const p = c.codePointAt(0) as number;
    return String(p >= 0xff10 ? p - 0xff10 : p >= 0x06f0 ? p - 0x06f0 : p - 0x0660);
  });
  return /[0-9]{8}/.test(ascii.replace(/(?<=[0-9])[\s   ]+(?=[0-9])/g, ''));
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
