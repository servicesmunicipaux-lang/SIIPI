// La navigation du portail : onglets sur grand écran, tiroir sur petit.
//
// POURQUOI UN TIROIR. L'espace communal comptait sept onglets ; il en compte
// dix, et le tableau de bord, les rapports et les paramètres en ajouteront.
// Une barre horizontale qui déborde se parcourt en la faisant défiler
// latéralement — le geste le moins naturel qui soit, et celui qui cache
// justement les derniers onglets, ceux qu'on vient d'ajouter.
//
// LE SENS D'OUVERTURE SUIT LA LANGUE. La plateforme bascule
// `document.documentElement.dir` en « rtl » pour l'arabe. Un tiroir qui
// entrerait toujours par la gauche arriverait, en arabe, du côté opposé à
// celui où se trouve le bouton qui l'ouvre. Les classes logiques de Tailwind
// (`start-0`, variante `rtl:`) le font entrer par le bord de DÉBUT de ligne :
// à gauche en français, à droite en arabe.
//
// CE QUE LE CLAVIER DOIT POUVOIR FAIRE, ET QUI EST SOUVENT OUBLIÉ : sortir.
// Échap ferme, le focus revient au bouton, et tant que le tiroir est ouvert la
// tabulation tourne à l'intérieur — sans quoi elle part derrière le voile,
// dans une page qu'on ne voit pas et qu'on croit pourtant parcourir.

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function NavigationOnglets<T extends string>({
  onglets,
  actif,
  onChoisir,
  libelle,
  etiquette,
}: {
  onglets: readonly T[];
  actif: T;
  onChoisir: (cle: T) => void;
  /** Nom de la navigation, lu par les lecteurs d'écran. */
  libelle: string;
  etiquette: (cle: T) => string;
}) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const idPanneau = useId();

  // --- Échap ferme, où que soit le focus -------------------------------------
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOuvert(false);
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  // --- La page ne défile plus derrière le voile ------------------------------
  //
  // On compense la largeur de la barre de défilement qui disparaît : sans
  // cela, tout le contenu saute de quelques pixels à l'ouverture, et le regard
  // suit ce saut au lieu de suivre le tiroir.
  useEffect(() => {
    if (!ouvert) return;
    const style = document.body.style;
    const debordementAvant = style.overflow;
    const margeAvant = style.paddingInlineEnd;
    const largeurBarre = window.innerWidth - document.documentElement.clientWidth;

    style.overflow = 'hidden';
    if (largeurBarre > 0) style.paddingInlineEnd = `${largeurBarre}px`;

    return () => {
      style.overflow = debordementAvant;
      style.paddingInlineEnd = margeAvant;
    };
  }, [ouvert]);

  // --- Le focus entre à l'ouverture, revient au bouton à la fermeture --------
  //
  // Le premier rendu est écarté : sans ce garde-fou, l'effet se déclenche au
  // chargement de la page avec « ouvert » à faux, et le focus sauterait sur le
  // bouton du menu alors que personne ne l'a demandé — c'est-à-dire que la
  // lecture au clavier commencerait au mauvais endroit à chaque arrivée.
  const premierRendu = useRef(true);
  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    if (ouvert) {
      // L'onglet courant plutôt que le premier : on reprend là où l'on est.
      const courant = panneau.current?.querySelector<HTMLElement>('[aria-current="page"]');
      (courant ?? panneau.current)?.focus();
    } else {
      // Toujours, et sans condition. Une fermeture par Échap ou par le voile
      // laisse le focus dans un panneau devenu inert : le navigateur le
      // renvoie alors au <body>, d'où l'on ne peut plus rien atteindre à la
      // tabulation sans repartir du début du document.
      bouton.current?.focus();
    }
  }, [ouvert]);

  // --- La tabulation tourne à l'intérieur du tiroir --------------------------
  const surTabulation = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panneau.current) return;
    const focusables = panneau.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const premier = focusables[0];
    const dernier = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  const choisir = (cle: T) => {
    onChoisir(cle);
    setOuvert(false); // l'effet ci-dessus ramène le focus au bouton
  };

  return (
    <>
      {/* --- Petit écran : le bouton --------------------------------------- */}
      <div className="mb-4 flex items-center gap-3 lg:hidden">
        <button
          ref={bouton}
          type="button"
          onClick={() => setOuvert(true)}
          aria-expanded={ouvert}
          aria-controls={idPanneau}
          aria-label={t('communal.menu.ouvrir')}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-ardoise-300 text-ardoise-700"
        >
          {/* Trois traits. aria-hidden : le nom du bouton est déjà donné
              par aria-label, et laisser lire « barre barre barre » n'apporte
              rien. */}
          <span className="flex w-5 flex-col gap-[5px]" aria-hidden="true">
            <span className="h-[2px] w-full rounded bg-current" />
            <span className="h-[2px] w-full rounded bg-current" />
            <span className="h-[2px] w-full rounded bg-current" />
          </span>
        </button>
        <p className="text-sm font-medium text-ardoise-900">{etiquette(actif)}</p>
      </div>

      {/* --- Le voile ------------------------------------------------------- */}
      <div
        onClick={() => setOuvert(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ardoise-900/40 transition-opacity duration-200 motion-reduce:transition-none lg:hidden ${
          ouvert ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* --- Le tiroir ------------------------------------------------------ */}
      {/* `inert` quand il est fermé : il reste monté pour l'animation, mais ni
          le focus ni les lecteurs d'écran n'y entrent. */}
      <div
        id={idPanneau}
        ref={panneau}
        role="dialog"
        aria-modal="true"
        aria-label={libelle}
        tabIndex={-1}
        inert={!ouvert}
        onKeyDown={surTabulation}
        className={`fixed inset-y-0 start-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl outline-none transition-transform duration-200 motion-reduce:transition-none lg:hidden ${
          ouvert ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-ardoise-200 p-3">
          <h2 className="text-sm font-semibold text-ardoise-900">{libelle}</h2>
          <button
            type="button"
            onClick={() => setOuvert(false)}
            aria-label={t('communal.menu.fermer')}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ardoise-500 hover:text-ardoise-900"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>

        <nav aria-label={libelle} className="flex flex-col p-2">
          {onglets.map((cle) => (
            <button
              key={cle}
              type="button"
              onClick={() => choisir(cle)}
              aria-current={actif === cle ? 'page' : undefined}
              className={`min-h-11 rounded-lg px-3 text-start text-sm font-medium ${
                actif === cle
                  ? 'bg-siipi-50 text-siipi-700'
                  : 'text-ardoise-600 hover:bg-ardoise-50 hover:text-ardoise-900'
              }`}
            >
              {etiquette(cle)}
            </button>
          ))}
        </nav>
      </div>

      {/* --- Grand écran : la barre d'onglets, inchangée --------------------- */}
      <nav
        className="mb-6 hidden gap-1 overflow-x-auto border-b border-ardoise-200 lg:flex"
        aria-label={libelle}
      >
        {onglets.map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => onChoisir(cle)}
            aria-current={actif === cle ? 'page' : undefined}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${
              actif === cle
                ? 'border-siipi-600 text-siipi-700'
                : 'border-transparent text-ardoise-500 hover:text-ardoise-800'
            }`}
          >
            {etiquette(cle)}
          </button>
        ))}
      </nav>
    </>
  );
}
