// Le PDF par l'impression du navigateur (Jalon 4, lot 2 — A3.4, B5.2.4).
//
// POURQUOI PAS UN PDF FABRIQUÉ PAR LE SERVEUR : l'arabe exige la mise en forme
// contextuelle des lettres et le sens de lecture de droite à gauche. Le
// navigateur les fait déjà, parfaitement ; un générateur côté serveur
// demanderait une bibliothèque lourde et une police arabe embarquée, pour un
// résultat moins sûr. « Imprimer → Enregistrer en PDF » existe sur tous les
// postes.
//
// COMMENT : le bloc visé est COPIÉ dans une zone d'impression dédiée, avec un
// en-tête (titre, date, organisme), et tout le reste de la page est retiré de
// l'impression par `display: none` — pas masqué par `visibility`, qui
// laisserait sa place vide et produirait des pages blanches. La copie est
// défaite après l'impression.

export interface OptionsImpression {
  titre: string;
  /** Lignes d'en-tête sous le titre : commune, période, organisme… */
  details?: string[];
  /** Pour les tableaux larges : page A4 à l'italienne. */
  paysage?: boolean;
}

export function imprimer(bloc: HTMLElement, options: OptionsImpression): void {
  const zone = document.createElement('div');
  zone.id = 'zone-impression';

  const entete = document.createElement('header');
  entete.className = 'entete-impression';
  const titre = document.createElement('h1');
  titre.textContent = options.titre;
  entete.appendChild(titre);
  for (const d of options.details ?? []) {
    const p = document.createElement('p');
    p.textContent = d;
    entete.appendChild(p);
  }
  zone.appendChild(entete);

  const copie = bloc.cloneNode(true) as HTMLElement;
  // Un en-tête de colonne cliquable (tri) est un bouton : il devient du texte,
  // sans quoi le tableau s'imprimerait sans titres de colonnes. Les autres
  // boutons d'une copie ne répondent plus à rien : ils sont retirés.
  copie.querySelectorAll('th button').forEach((b) => {
    const texte = document.createElement('span');
    // Sans les flèches de tri : sur le papier, elles n'indiquent plus rien.
    texte.textContent = (b.textContent ?? '').replace(/[⇅▲▼↑↓]/g, '').trim();
    b.replaceWith(texte);
  });
  copie.querySelectorAll('button, select').forEach((n) => n.remove());
  copie.querySelectorAll('input').forEach((n) => (n.closest('label') ?? n).remove());
  zone.appendChild(copie);
  document.body.appendChild(zone);

  const style = document.createElement('style');
  style.textContent = `@page { size: A4 ${options.paysage ? 'landscape' : 'portrait'}; margin: 12mm; }`;
  document.head.appendChild(style);

  // Le titre du document devient le nom proposé par « Enregistrer en PDF ».
  const titreAvant = document.title;
  document.title = options.titre;
  document.documentElement.classList.add('impression');

  let fait = false;
  const nettoyer = () => {
    if (fait) return;
    fait = true;
    document.documentElement.classList.remove('impression');
    document.title = titreAvant;
    zone.remove();
    style.remove();
    window.removeEventListener('afterprint', nettoyer);
  };
  window.addEventListener('afterprint', nettoyer);
  window.print();
  // Certains navigateurs n'émettent pas « afterprint » quand l'aperçu est
  // annulé : on nettoie de toute façon au prochain tour.
  window.setTimeout(nettoyer, 1000);
}
