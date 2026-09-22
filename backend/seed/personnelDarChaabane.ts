// ---------------------------------------------------------------------------
// Effectif du service propreté de Dar Chaabane El Fehri.
//
// Source : « كتلة أجور عملة النظافة 2021-2022-2023-2024 » (projet de budget
// communal) et l'organigramme municipal « التنظيم الهيكلي لبلدية دار شعبان
// الفهري ».
//
// CE QUI EST REPRIS DU FICHIER RÉEL, PARCE QUE C'EST VRAI ET UTILE :
//   • l'effectif : 60 ouvriers et 1 technicien principal en 2024 ;
//   • la structure de classement : classes 4 à 8, échelons 3 à 8, telle
//     qu'elle figure au registre, agent par agent ;
//   • la masse salariale du service : 1 168 566 TND (2021), 1 276 629 (2022),
//     1 282 224 (2023), 1 324 500 (2024).
//
// CE QUI N'EST PAS REPRIS, ET NE LE SERA JAMAIS :
//   • les NOMS. Le fichier source nomme soixante personnes. Les noms ci-dessous
//     sont fabriqués : un prénom et un patronyme tirés de deux listes closes,
//     assemblés pour que la longueur du nom reste du même ordre que dans le
//     registre — ce que le décret-loi n° 2022-54 demande d'un jeu de test. Le
//     rapprochement ligne à ligne avec le registre réel est impossible : les
//     agents sont mélangés par un tirage déterministe avant d'être nommés.
//   • les SALAIRES INDIVIDUELS. Le registre en porte treize colonnes (prime de
//     salissure, prime kilométrique, prime de nuit…). Aucune n'entre en base :
//     la table `personnel` n'a pas de colonne pour les recevoir. Seule la
//     masse salariale du SERVICE est chargée, dans `effectifs_service`.
//   • toute donnée de santé, de CIN, de téléphone ou d'adresse.
//
// À QUOI CE JEU SERT. À éprouver le module sur un effectif de la bonne taille.
// Un module du personnel qui marche sur cinq agents fictifs et s'effondre sur
// soixante ne sert à rien : c'est soixante lignes que le technicien de Dar
// Chaabane devra pointer chaque matin.
// ---------------------------------------------------------------------------

process.env.SIIPI_DB_CONTEXT = 'server';
const { pool, query, queryOne } = await import('../src/db.js');

/**
 * La commune se retrouve par son nom, pas par un identifiant écrit en dur :
 * le référentiel national a connu plusieurs orthographes (« Dar Chaâbane »,
 * « Dar Chaabane El Fehri »), et un identifiant figé casserait le jour où
 * celui du référentiel officiel change. Même requête que le seed du parc.
 */
async function trouverCommune(): Promise<string | null> {
  const ligne = await queryOne<{ id: string }>(
    `SELECT id FROM communes
      WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%'
      ORDER BY length(name) LIMIT 1`
  );
  return ligne?.id ?? null;
}

// --- Le classement réel, agent par agent, sans les noms ---------------------
//
// Relevé sur la feuille « عملة PROPRETE024 » : [classe, échelon], soixante
// paires. Elles sont TRIÉES, donc détachées de l'ordre du registre dès la
// lecture du fichier source ; le mélange appliqué plus bas les redistribue
// ensuite. Une paire classe/échelon seule ne désigne personne : vingt-six
// agents partagent la classe 4.
const CLASSEMENT: Array<[number, number]> = [
  [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3], [4, 3],
  [4, 3], [4, 3], [4, 3], [4, 3], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4],
  [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [5, 3], [5, 3], [5, 3], [5, 3],
  [5, 3], [5, 3], [5, 3], [5, 3], [5, 3], [5, 3], [5, 3], [5, 4], [5, 4], [5, 4],
  [5, 5], [5, 5], [5, 5], [5, 5], [5, 5], [5, 7], [6, 4], [6, 4], [6, 6], [6, 7],
  [6, 7], [6, 7], [6, 8], [6, 8], [7, 4], [7, 4], [7, 4], [8, 3], [8, 3], [8, 5],
];

// --- Les noms fabriqués -----------------------------------------------------
//
// Deux listes closes de prénoms et de patronymes tunisiens courants. Aucune
// des combinaisons produites ne prétend désigner quelqu'un ; elles servent à
// ce que l'écran ressemble à un vrai écran, avec des noms de vraie longueur.
const PRENOMS = [
  'محمد', 'أحمد', 'علي', 'سمير', 'نبيل', 'منير', 'رياض', 'كمال', 'حاتم', 'طارق',
  'عماد', 'وليد', 'ياسين', 'حسن', 'صالح', 'مراد', 'جمال', 'فتحي', 'رضا', 'نجيب',
];
const PATRONYMES = [
  'التونسي', 'الهمامي', 'الشابي', 'المرزوقي', 'العياري', 'السعيدي', 'الجبالي',
  'القروي', 'الزواري', 'العبيدي', 'الحمروني', 'المناعي', 'الرياحي', 'السلامي',
  'البوعزيزي', 'الغربي', 'النفزي', 'الدريدي', 'القيزاني', 'الخماسي',
];

/**
 * Tirage déterministe (générateur congruentiel linéaire à graine fixe).
 *
 * Pourquoi déterministe : le jeu doit être reproductible, sinon deux exécutions
 * donnent deux bases différentes et un test qui passe le lundi échoue le mardi.
 * Pourquoi un tirage tout de même : il mélange l'ordre du registre avant
 * d'attribuer les noms, de sorte que « le troisième agent de la liste » ne soit
 * plus le troisième agent du registre réel. Sans ce mélange, un nom fictif
 * resterait en face du classement d'une personne identifiable par sa place.
 */
function melangeDeterministe<T>(liste: T[], graine: number): T[] {
  const copie = [...liste];
  let etat = graine;
  const suivant = () => {
    etat = (etat * 1103515245 + 12345) % 2147483648;
    return etat / 2147483648;
  };
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(suivant() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

type Fonction =
  | 'chauffeur' | 'agent' | 'chef_equipe' | 'agent_balayage' | 'encadrement'
  | 'tractoriste' | 'mecanicien' | 'jardinier';

/**
 * Répartition des fonctions.
 *
 * ATTENTION — CE N'EST PAS UNE DONNÉE SOURCE. Le registre de paie ne dit pas
 * qui conduit et qui balaie : tous y sont « عامل ». La répartition ci-dessous
 * est DÉDUITE du parc (13 engins en état de marche affectés à des circuits, il
 * faut donc autant de conducteurs) et des treize circuits du registre. Elle est
 * marquée comme telle dans l'observation de chaque agent, pour qu'un lecteur
 * de la base ne la prenne jamais pour un relevé. La commune la corrigera : ce
 * sera sa première saisie réelle, et c'est très bien ainsi.
 */
function fonctionPourRang(rang: number): Fonction {
  if (rang === 0) return 'chef_equipe';
  if (rang === 1) return 'chef_equipe';
  if (rang < 10) return 'chauffeur';      //  8 conducteurs de poids lourds
  if (rang < 14) return 'tractoriste';    //  4 conducteurs de tracteurs
  if (rang < 16) return 'mecanicien';     //  2 à l'atelier
  if (rang < 20) return 'jardinier';      //  4 aux espaces verts
  if (rang < 38) return 'agent_balayage'; // 18 au balayage
  return 'agent';                         // 22 à la collecte
}

const SERVICE_PAR_FONCTION: Record<Fonction, string> = {
  chauffeur: 'proprete', agent: 'proprete', chef_equipe: 'proprete',
  agent_balayage: 'proprete', encadrement: 'proprete',
  tractoriste: 'proprete', mecanicien: 'atelier', jardinier: 'espaces_verts',
};

const NOTE_DEDUITE =
  'Fonction déduite du parc et du registre des circuits, non relevée : à confirmer par la commune.';

// --- La masse salariale du service, année par année -------------------------
//
// Les seuls chiffres d'argent de ce module. Ils viennent de la feuille
// « حوصلة كتلة الأجور » du projet de budget communal.
const MASSE_SALARIALE: Array<{
  annee: number; ouvriers: number; encadrement: number;
  masse: number; masseOuvriers: number | null;
}> = [
  { annee: 2021, ouvriers: 0,  encadrement: 0, masse: 1168566, masseOuvriers: null },
  { annee: 2022, ouvriers: 61, encadrement: 1, masse: 1276629, masseOuvriers: 1005483.184 },
  { annee: 2023, ouvriers: 63, encadrement: 1, masse: 1282224, masseOuvriers: 1047068.316 },
  { annee: 2024, ouvriers: 60, encadrement: 1, masse: 1324500, masseOuvriers: 1080058.544 },
];
// 2021 : le détail nominatif de cette année n'est pas au dossier — seule la
// masse l'est. On charge donc la masse et on laisse l'effectif à zéro plutôt
// que de reporter celui de 2022, ce qui inventerait une stabilité non observée.

const SOURCE = 'Projet de budget communal — كتلة أجور عملة النظافة 2021-2024';

async function charger(): Promise<void> {
  const COMMUNE = await trouverCommune();
  if (!COMMUNE) {
    console.error("Dar Chaabane absente du référentiel. Lancer d'abord « npm run seed »." );
    process.exitCode = 1;
    return;
  }
  console.log(`[personnel] commune : ${COMMUNE}`);

  // --- Les agents -----------------------------------------------------------
  const classementMelange = melangeDeterministe(CLASSEMENT, 20240419);
  let crees = 0;
  let mis_a_jour = 0;

  for (let rang = 0; rang < classementMelange.length; rang += 1) {
    const [classe, echelon] = classementMelange[rang];
    const fonction = fonctionPourRang(rang);
    const matricule = `DCF-${String(rang + 1).padStart(3, '0')}`;
    // Vingt prénoms et vingt patronymes font quatre cents combinaisons ; on les
    // parcourt avec un pas premier avec quatre cents, ce qui garantit soixante
    // noms TOUS DIFFÉRENTS. Un simple « prénom[rang % 20] » se répétait tous les
    // vingt agents : sur une feuille de pointage de soixante et une lignes, trois
    // homonymes rendent l'écran inutilisable — le technicien ne saurait pas qui
    // il coche.
    const combinaison = (rang * 21 + 7) % (PRENOMS.length * PATRONYMES.length);
    const nom = `${PRENOMS[combinaison % PRENOMS.length]} ${
      PATRONYMES[Math.floor(combinaison / PRENOMS.length)]
    }`;

    const existant = await queryOne<{ id: string }>(
      'SELECT id FROM personnel WHERE commune_id = $1 AND matricule = $2',
      [COMMUNE, matricule]
    );

    if (existant) {
      await query(
        `UPDATE personnel
            SET nom_complet = $1, fonction = $2, grade = $3, classe = $4::smallint,
                echelon = $5::smallint, statut = $6, service = $7, affectation = $8,
                observation = $9, actif = true, updated_at = now()
          WHERE id = $10`,
        [nom, fonction, 'عامل', classe, echelon, 'titulaire',
         SERVICE_PAR_FONCTION[fonction],
         fonction === 'mecanicien' ? 'atelier' : fonction === 'agent_balayage' ? 'balayage' : 'circuit',
         NOTE_DEDUITE, existant.id]
      );
      mis_a_jour += 1;
    } else {
      await query(
        `INSERT INTO personnel
           (commune_id, matricule, nom_complet, fonction, grade, classe, echelon,
            statut, service, affectation, permis, observation)
         VALUES ($1, $2, $3, $4, $5, $6::smallint, $7::smallint, $8, $9, $10, $11::text[], $12)`,
        [COMMUNE, matricule, nom, fonction, 'عامل', classe, echelon, 'titulaire',
         SERVICE_PAR_FONCTION[fonction],
         fonction === 'mecanicien' ? 'atelier' : fonction === 'agent_balayage' ? 'balayage' : 'circuit',
         // Le permis n'est pas au dossier. On le laisse vide plutôt que de le
         // supposer : app.incoherences_commune le signalera, ce qui est
         // exactement le comportement voulu.
         null, NOTE_DEDUITE]
      );
      crees += 1;
    }
  }

  // Le technicien principal : un seul, et c'est l'encadrement du service.
  const matriculeCadre = 'DCF-CAD-001';
  const cadre = await queryOne<{ id: string }>(
    'SELECT id FROM personnel WHERE commune_id = $1 AND matricule = $2',
    [COMMUNE, matriculeCadre]
  );
  if (cadre) {
    await query(
      `UPDATE personnel SET nom_complet = $1, fonction = 'encadrement', grade = $2,
              statut = 'titulaire', service = 'proprete', affectation = 'encadrement',
              observation = $3, actif = true, updated_at = now()
        WHERE id = $4`,
      ['نجلاء الرياحي', 'تقني رئيس',
       'Seul cadre technique du service — organigramme municipal.', cadre.id]
    );
    mis_a_jour += 1;
  } else {
    await query(
      `INSERT INTO personnel
         (commune_id, matricule, nom_complet, fonction, grade, statut, service,
          affectation, observation)
       VALUES ($1, $2, $3, 'encadrement', $4, 'titulaire', 'proprete', 'encadrement', $5)`,
      [COMMUNE, matriculeCadre, 'نجلاء الرياحي', 'تقني رئيس',
       'Seul cadre technique du service — organigramme municipal.']
    );
    crees += 1;
  }

  // --- La masse salariale ---------------------------------------------------
  for (const a of MASSE_SALARIALE) {
    await query(
      `INSERT INTO effectifs_service
         (commune_id, annee, service, effectif_ouvriers, effectif_encadrement,
          masse_salariale_tnd, masse_salariale_ouvriers_tnd, source)
       VALUES ($1, $2::smallint, 'proprete', $3::smallint, $4::smallint, $5, $6, $7)
       ON CONFLICT (commune_id, annee, service) DO UPDATE
          SET effectif_ouvriers = EXCLUDED.effectif_ouvriers,
              effectif_encadrement = EXCLUDED.effectif_encadrement,
              masse_salariale_tnd = EXCLUDED.masse_salariale_tnd,
              masse_salariale_ouvriers_tnd = EXCLUDED.masse_salariale_ouvriers_tnd,
              source = EXCLUDED.source,
              updated_at = now()`,
      [COMMUNE, a.annee, a.ouvriers, a.encadrement, a.masse, a.masseOuvriers, SOURCE]
    );
  }

  console.log(`Personnel Dar Chaabane : ${crees} créé(s), ${mis_a_jour} mis à jour.`);
  console.log(`Masse salariale : ${MASSE_SALARIALE.length} exercices chargés.`);
  console.log('Noms fictifs. Aucun salaire individuel, aucune donnée de santé (décret-loi 2022-54).');
}

try {
  await charger();
} finally {
  await pool.end();
}
