// Le chiffre que l'œil doit trouver en premier (jalon D, lot D3 ; SPEC_D § D3).
//
// Une valeur en grand, son unité à côté en petit : c'est tout. La hiérarchie
// d'un écran de chiffres tient là — si le libellé et la valeur ont la même taille,
// on lit « Non renseigné » aussi gros que « 33,3 % », et les dix-sept absences
// écrasent les deux mesures réelles.
//
// Pas de police à chasse fixe ici : elle sert aux colonnes de tableau (`.chiffres`),
// où les chiffres doivent s'aligner d'une ligne à l'autre. Un chiffre isolé, lui,
// se lit mieux dans la police de l'écran, aux chiffres alignés (`.chiffre-cle`).

const TAILLES = { md: 'text-2xl', lg: 'text-4xl', xl: 'text-5xl' } as const;

export function ChiffreCle({
  valeur,
  unite,
  taille = 'lg',
}: {
  /** La valeur déjà mise en forme (séparateurs, décimales) : ce composant n'arrondit rien. */
  valeur: string;
  unite?: string | null;
  taille?: keyof typeof TAILLES;
}) {
  return (
    <span className={`chiffre-cle font-semibold leading-none text-ardoise-900 ${TAILLES[taille]}`}>
      {valeur}
      {unite && <span className="ms-1 text-base font-normal text-ardoise-500">{unite}</span>}
    </span>
  );
}
