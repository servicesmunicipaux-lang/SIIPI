// La navigation du portail communal, en cinq pôles métier.
//
// CE QUI NE MARCHAIT PAS. Dix-sept onglets sur une barre horizontale : sur un
// téléphone, treize d'entre eux vivaient hors de l'écran, derrière un
// défilement horizontal que rien n'annonçait. Un directeur qui cherchait
// « Personnel » ne pouvait pas savoir que l'onglet existait — la barre n'en
// montrait aucune trace. Et le défilement horizontal au pouce entre en
// concurrence avec le défilement vertical de la page : on part de travers une
// fois sur deux.
//
// POURQUOI CINQ, ET POURQUOI CEUX-LÀ. Les pôles ne regroupent pas par parenté
// technique mais par MOMENT DE LA JOURNÉE et par interlocuteur :
//
//   Cockpit    ce qu'on ouvre en arrivant : ce qui bloque aujourd'hui.
//   Terrain    ce qui se passe dehors — et qui se regarde sur une carte, pas
//              dans trois listes séparées.
//   Citoyens   ce qui vient du dehors et appelle une réponse.
//   Flotte     le dépôt : engins, carburant, entretien, sécurité, dotations.
//   Pilotage   ce qu'on rend à sa hiérarchie, et ce qu'on se dit à soi-même.
//
// Un pôle tient en un regard ; dix-sept onglets, non. C'est la seule raison
// pour laquelle cinq vaut mieux que dix-sept : la mémoire de celui qui cherche.
//
// TROIS COMPORTEMENTS, UN SEUL COMPOSANT.
//   • poste fixe large  — la barre est posée, toujours visible, rétractable en
//                         colonne d'icônes pour rendre la largeur à la carte ;
//   • poste fixe étroit
//     et téléphone      — la barre est un tiroir qui glisse par-dessus, fermé
//                         par Échap, par le voile, et par le choix d'un écran ;
//   • arabe             — le tiroir vient de la DROITE. Non par symétrie
//                         décorative : le pouce d'un lecteur d'arabe part de ce
//                         côté-là.
//
// L'état déplié/replié survit au rechargement (localStorage) : un directeur
// qui travaille à deux écrans le règle une fois.

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// « administration » n'est pas un pôle métier : c'est le tiroir des réglages,
// rendu en bas et à part. Il est déclaré ici parce qu'il partage le même
// rendu, pas parce qu'il partage la même nature.
export type ClePole = 'cockpit' | 'terrain' | 'citoyens' | 'flotte' | 'pilotage' | 'administration';

export type EntreeNavigation<T extends string> = {
  cle: T;
  pole: ClePole;
  /** Compteur d'attention : un nombre d'éléments qui réclament une décision. */
  attention?: number;
};

const ORDRE_POLES: ClePole[] = ['cockpit', 'terrain', 'citoyens', 'flotte', 'pilotage', 'administration'];

// Des glyphes, pas une bibliothèque d'icônes : quatre kilo-octets de SVG
// plutôt qu'une dépendance de plus dans une application qui doit s'installer
// sur un téléphone d'agent, parfois en 3G.
const CHEMIN_ICONE: Record<ClePole, string> = {
  cockpit: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm9 0h7V11h-7v9Zm0-16v5h7V4h-7Z',
  terrain: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z',
  citoyens: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-8 2-8 4.5V21h16v-2.5C20 16 16 14 12 14Z',
  flotte: 'M3 13V7a1 1 0 0 1 1-1h9v7h3l3 3v3h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3v-3Z',
  pilotage: 'M4 20h16v-2H4v2ZM6 16h3V8H6v8Zm5 0h3V4h-3v12Zm5 0h3v-6h-3v6Z',
  administration: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4a9 9 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a9 9 0 0 0-2.2-1.3L16 2.6H8l-.3 2.8a9 9 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6A9 9 0 0 0 3 12c0 .4 0 .9.1 1.3l-2 1.6 2 3.4 2.4-1c.7.6 1.4 1 2.2 1.3l.3 2.8h8l.3-2.8c.8-.3 1.5-.7 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
};

export function BarreLaterale<T extends string>({
  entrees,
  actif,
  onChoisir,
  etiquette,
  libelle,
}: {
  entrees: EntreeNavigation<T>[];
  actif: T;
  onChoisir: (cle: T) => void;
  /** Le libellé d'un écran, traduit par l'appelant. */
  etiquette: (cle: T) => string;
  /** Le nom de la navigation, pour les lecteurs d'écran. */
  libelle: string;
}) {
  const { t } = useTranslation();
  const idPanneau = useId();
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const [replie, setReplie] = useState(() => {
    // localStorage peut lever (navigation privée, données bloquées) : l'écran
    // doit s'afficher quand même.
    try { return window.localStorage.getItem('siipi.barre.repliee') === '1'; } catch { return false; }
  });
  const bouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLElement>(null);
  const premierRendu = useRef(true);

  useEffect(() => {
    try { window.localStorage.setItem('siipi.barre.repliee', replie ? '1' : '0'); } catch { /* sans stockage, le réglage ne survit pas */ }
  }, [replie]);

  // Tiroir ouvert : la page dessous ne défile plus, et la largeur de la barre
  // de défilement est compensée — sans quoi le contenu saute de quelques
  // pixels à l'ouverture, ce qui se voit.
  useEffect(() => {
    if (!tiroirOuvert) return;
    const corps = document.body;
    const largeurBarre = window.innerWidth - document.documentElement.clientWidth;
    const overflow = corps.style.overflow;
    const marge = corps.style.paddingInlineEnd;
    corps.style.overflow = 'hidden';
    if (largeurBarre > 0) corps.style.paddingInlineEnd = `${largeurBarre}px`;

    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setTiroirOuvert(false); };
    document.addEventListener('keydown', auClavier);
    return () => {
      corps.style.overflow = overflow;
      corps.style.paddingInlineEnd = marge;
      document.removeEventListener('keydown', auClavier);
    };
  }, [tiroirOuvert]);

  // Le focus suit l'ouverture, et REVIENT au bouton à la fermeture : sans cela
  // un utilisateur au clavier se retrouve en haut de page après chaque choix.
  // Le premier rendu est écarté, sinon la page volerait le focus au chargement.
  useEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return; }
    if (tiroirOuvert) {
      const courant = panneau.current?.querySelector<HTMLElement>('[aria-current="page"]');
      (courant ?? panneau.current)?.focus();
    } else {
      bouton.current?.focus();
    }
  }, [tiroirOuvert]);

  const parPole = ORDRE_POLES.map((pole) => ({
    pole,
    lignes: entrees.filter((e) => e.pole === pole),
  })).filter((g) => g.lignes.length > 0);

  const attentionPole = (pole: ClePole) =>
    entrees.filter((e) => e.pole === pole).reduce((n, e) => n + (e.attention ?? 0), 0);

  const choisir = (cle: T) => { onChoisir(cle); setTiroirOuvert(false); };

  const contenu = (
    <nav aria-label={libelle} className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      {parPole.map(({ pole, lignes }) => (
        <div key={pole} className="mb-1">
          {/* Replié, le titre du pôle laisse place à l'icône seule : on garde
              le repère visuel sans manger la largeur. */}
          <div
            className={`flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ardoise-500 ${
              replie ? 'justify-center' : ''
            }`}
            title={replie ? t(`communal.poles.${pole}`) : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0 fill-current">
              <path d={CHEMIN_ICONE[pole]} />
            </svg>
            {!replie && <span>{t(`communal.poles.${pole}`)}</span>}
            {replie && attentionPole(pole) > 0 && (
              <span className="absolute size-2 translate-x-3 -translate-y-2 rounded-full bg-red-600" />
            )}
          </div>

          <ul className={replie ? 'sr-only' : ''}>
            {lignes.map(({ cle, attention }) => {
              const courant = cle === actif;
              return (
                <li key={cle}>
                  <button
                    type="button"
                    onClick={() => choisir(cle)}
                    aria-current={courant ? 'page' : undefined}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-start text-sm ${
                      courant
                        ? 'bg-siipi-600 font-semibold text-white'
                        : 'text-ardoise-700 hover:bg-ardoise-100'
                    }`}
                  >
                    <span className="truncate">{etiquette(cle)}</span>
                    {attention !== undefined && attention > 0 && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                          courant ? 'bg-white/20 text-white' : 'bg-red-100 text-red-900'
                        }`}
                      >
                        {attention}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Replié, chaque écran reste atteignable par une pastille : une
              colonne d'icônes muettes obligerait à déplier pour tout. */}
          {replie && (
            <ul className="flex flex-col items-center gap-1">
              {lignes.map(({ cle }) => (
                <li key={cle}>
                  <button
                    type="button"
                    onClick={() => choisir(cle)}
                    aria-current={cle === actif ? 'page' : undefined}
                    title={etiquette(cle)}
                    className={`size-8 rounded-md text-xs font-semibold ${
                      cle === actif ? 'bg-siipi-600 text-white' : 'text-ardoise-600 hover:bg-ardoise-100'
                    }`}
                  >
                    {etiquette(cle).slice(0, 2)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* --- Téléphone et poste étroit : le bouton, puis le tiroir --- */}
      <div className="mb-3 flex items-center gap-2 lg:hidden">
        <button
          ref={bouton}
          type="button"
          aria-expanded={tiroirOuvert}
          aria-controls={idPanneau}
          onClick={() => setTiroirOuvert((v) => !v)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-800"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
            <path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" />
          </svg>
          {t('communal.navigationOuvrir')}
          {entrees.reduce((n, e) => n + (e.attention ?? 0), 0) > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-900">
              {entrees.reduce((n, e) => n + (e.attention ?? 0), 0)}
            </span>
          )}
        </button>
        <span className="truncate text-sm text-ardoise-500">{etiquette(actif)}</span>
      </div>

      {tiroirOuvert && (
        <div
          className="fixed inset-0 z-40 bg-ardoise-900/40 lg:hidden"
          onClick={() => setTiroirOuvert(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={panneau}
        id={idPanneau}
        tabIndex={-1}
        // inert : replié, le tiroir sort de l'ordre de tabulation. Sans lui, la
        // tabulation traverse dix-sept boutons invisibles avant d'atteindre la
        // page.
        inert={!tiroirOuvert ? true : undefined}
        className={`fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] overflow-y-auto border-e border-ardoise-200 bg-white shadow-xl transition-transform duration-200 lg:hidden ${
          tiroirOuvert ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-ardoise-200 p-3">
          <span className="text-sm font-semibold text-ardoise-900">{libelle}</span>
          <button
            type="button"
            onClick={() => setTiroirOuvert(false)}
            className="min-h-11 rounded-lg px-3 text-sm text-ardoise-600"
          >
            {t('commun.fermer')}
          </button>
        </div>
        {contenu}
      </aside>

      {/* --- Poste fixe large : la barre est posée --- */}
      <aside
        className={`hidden shrink-0 border-e border-ardoise-200 bg-white lg:sticky lg:top-0 lg:block lg:h-[calc(100vh-1rem)] ${
          replie ? 'lg:w-16' : 'lg:w-64'
        }`}
      >
        <div className={`flex items-center border-b border-ardoise-200 p-2 ${replie ? 'justify-center' : 'justify-between'}`}>
          {!replie && <span className="px-1 text-sm font-semibold text-ardoise-900">{libelle}</span>}
          <button
            type="button"
            onClick={() => setReplie((v) => !v)}
            aria-label={replie ? t('communal.navigationDeplier') : t('communal.navigationReplier')}
            title={replie ? t('communal.navigationDeplier') : t('communal.navigationReplier')}
            className="size-9 rounded-lg text-ardoise-600 hover:bg-ardoise-100"
          >
            {/* Le chevron pointe vers où la barre va partir — et il s'inverse
                en arabe, sans quoi il désignerait le mauvais côté. */}
            <svg viewBox="0 0 24 24" aria-hidden="true" className={`mx-auto size-5 fill-current ${replie ? 'rotate-180' : ''} rtl:-scale-x-100`}>
              <path d="M15 6 9 12l6 6V6Z" />
            </svg>
          </button>
        </div>
        {contenu}
      </aside>
    </>
  );
}
