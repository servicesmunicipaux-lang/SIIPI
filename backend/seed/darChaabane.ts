// ---------------------------------------------------------------------------
// Jeu de données de la commune pilote : Dar Chaabane El Fehri.
//
// Source unique : « كشف حول مسالك رفع الفضلات 2024 » — le relevé des circuits
// de levée des déchets ménagers établi par la commune (مصلحة النظافة), feuille
// « مسالك رفع الفضلات (2) ». Rien n'est inventé ici : chaque valeur figure au
// registre. Les écarts éventuels avec le terrain se discutent avec la commune,
// ils ne se corrigent pas dans un fichier de démarrage.
//
// Les cinq circuits de balayage (feuille « اشغال الكنس ») sont chargés aussi :
// ce sont des circuits au sens du module, avec leur longueur et leur effectif,
// même si l'activité diffère de la levée.
//
// PERSONNEL. Le dossier de la commune contient les noms des agents et leur
// masse salariale. Rien de cela n'est repris : les agents sont créés sous des
// noms fictifs, de même forme et longueur, conformément au décret-loi 2022-54
// et à la consigne de la FNCT. Affecter un agent à une tournée n'a jamais eu
// besoin de son vrai nom.
// ---------------------------------------------------------------------------

process.env.SIIPI_DB_CONTEXT = 'server';
const { pool, query, queryOne } = await import('../src/db.js');

interface CircuitRegistre {
  numero: number;
  nom: string;
  longueurKm: number;
  modeCollecte: 'porte_a_porte' | 'conteneurs';
  dureeHeures: number;
  materiel: string;
  tailleEquipe: number;
  voyagesParJour: number;
  tonnage: string;
}

// Feuille « مسالك رفع الفضلات (2) » — levée des déchets ménagers.
const LEVEE: CircuitRegistre[] = [
  { numero: 1, nom: 'مسلك عدد 1', longueurKm: 55, modeCollecte: 'porte_a_porte', dureeHeures: 4.5, materiel: 'Tracteur + remorque 4 m³', tailleEquipe: 2, voyagesParJour: 2, tonnage: 'entre 2,7 et 4 t/jour' },
  { numero: 2, nom: 'مسلك عدد 2', longueurKm: 60, modeCollecte: 'porte_a_porte', dureeHeures: 5,   materiel: 'Tracteur + remorque 4 m³', tailleEquipe: 2, voyagesParJour: 2, tonnage: 'entre 2 et 3,5 t/jour' },
  { numero: 3, nom: 'مسلك عدد 3', longueurKm: 50, modeCollecte: 'porte_a_porte', dureeHeures: 4.5, materiel: 'Tracteur + remorque 4 m³', tailleEquipe: 2, voyagesParJour: 2, tonnage: 'entre 2 et 3,5 t/jour' },
  { numero: 4, nom: 'مسلك عدد 4', longueurKm: 55, modeCollecte: 'porte_a_porte', dureeHeures: 4,   materiel: 'Tracteur + remorque 4 m³', tailleEquipe: 2, voyagesParJour: 2, tonnage: 'entre 2 et 3,5 t/jour' },
  { numero: 5, nom: 'مسلك عدد 5', longueurKm: 60, modeCollecte: 'porte_a_porte', dureeHeures: 4.5, materiel: 'Tracteur + remorque 4 m³', tailleEquipe: 2, voyagesParJour: 2, tonnage: 'entre 2 et 3,5 t/jour' },
  { numero: 6, nom: 'مسلك عدد 6', longueurKm: 50, modeCollecte: 'porte_a_porte', dureeHeures: 4,   materiel: 'Tracteur + remorque 4 m³', tailleEquipe: 2, voyagesParJour: 2, tonnage: 'entre 2 et 3,5 t/jour' },
  { numero: 7, nom: 'مسلك عدد 7', longueurKm: 27, modeCollecte: 'conteneurs',    dureeHeures: 4,   materiel: 'Benne tasseuse 8 m³',      tailleEquipe: 2, voyagesParJour: 1, tonnage: '8 t/jour' },
  { numero: 8, nom: 'مسلك عدد 8', longueurKm: 27, modeCollecte: 'conteneurs',    dureeHeures: 4,   materiel: 'Benne tasseuse 8 m³',      tailleEquipe: 2, voyagesParJour: 1, tonnage: '8 t/jour' },
];

// Feuille « اشغال الكنس » — balayage, intervention manuelle.
const BALAYAGE = [
  { numero: 1, longueurKm: 2.807, agents: 3 },
  { numero: 2, longueurKm: 1.642, agents: 2 },
  { numero: 3, longueurKm: 0.592, agents: 1 },
  { numero: 4, longueurKm: 1.483, agents: 2 },
  { numero: 5, longueurKm: 0.442, agents: 1 },
];

// Noms FICTIFS, de forme tunisienne courante. Les agents réels de Dar Chaabane
// ne figurent nulle part ici, et n'ont pas à y figurer.
const AGENTS_FICTIFS = [
  ['MAT-0101', 'Slim Ben Romdhane', 'chauffeur'],
  ['MAT-0102', 'Hédi Gharbi', 'chauffeur'],
  ['MAT-0103', 'Ridha Mabrouk', 'chauffeur'],
  ['MAT-0104', 'Fethi Trabelsi', 'chauffeur'],
  ['MAT-0105', 'Lotfi Jaziri', 'chauffeur'],
  ['MAT-0106', 'Mongi Khelifi', 'chauffeur'],
  ['MAT-0107', 'Nabil Ayari', 'chauffeur'],
  ['MAT-0108', 'Taoufik Hamdi', 'chauffeur'],
  ['MAT-0201', 'Mohamed Saidi', 'agent'],
  ['MAT-0202', 'Anis Bouzid', 'agent'],
  ['MAT-0203', 'Karim Nasri', 'agent'],
  ['MAT-0204', 'Sofiane Rekik', 'agent'],
  ['MAT-0205', 'Walid Chaouch', 'agent'],
  ['MAT-0206', 'Bilel Mejri', 'agent'],
  ['MAT-0207', 'Hamza Oueslati', 'agent'],
  ['MAT-0208', 'Aymen Zouari', 'agent'],
  ['MAT-0301', 'Salah Dridi', 'chef_equipe'],
] as const;

async function trouverCommune(): Promise<string> {
  const c = await queryOne<{ id: string }>(
    `SELECT id FROM communes
      WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%'
      ORDER BY length(name) LIMIT 1`
  );
  if (!c) {
    throw new Error(
      "Dar Chaabane El Fehri est absente du référentiel des communes. Lancer « npm run seed » d'abord."
    );
  }
  return c.id;
}

async function main() {
  const commune = await trouverCommune();
  console.log(`[dar-chaabane] commune : ${commune}`);

  // La commune pilote doit être activée, sinon rien ne s'affiche.
  await query('UPDATE communes SET activee = true WHERE id = $1', [commune]);

  // --- Personnel ------------------------------------------------------------
  //
  // Ce jeu-ci n'existe que pour donner une équipe aux circuits quand le module
  // 4 n'a pas encore été chargé. Dès que le registre réel est là (matricules
  // DCF-, issus de la paie), ces dix-sept silhouettes n'ont plus lieu d'être :
  // elles gonflaient l'effectif de la commune de 61 à 78 agents, faussaient la
  // masse salariale par tête et occupaient les huit circuits — au point qu'y
  // affecter un agent réel se soldait par un refus (409), le poste étant déjà
  // pris par quelqu'un qui n'existe pas.
  //
  // On ne les remplace pas automatiquement : la feuille de paie dit qui est
  // employé, elle ne dit pas qui conduit le circuit n° 3. Cette affectation-là
  // est une décision de la commune, et le panneau de cohérence la réclame
  // (contrôles n° 8 et 9) plutôt que de l'inventer.
  const registreReel = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM personnel
      WHERE commune_id = $1 AND matricule LIKE 'DCF-%' AND deleted_at IS NULL`,
    [commune]
  );
  const avecRegistreReel = (registreReel?.n ?? 0) > 0;

  const personnel: Record<string, string> = {};
  for (const [matricule, nom, fonction] of (avecRegistreReel ? [] : AGENTS_FICTIFS)) {
    const existant = await queryOne<{ id: string }>(
      'SELECT id FROM personnel WHERE commune_id = $1 AND matricule = $2 AND deleted_at IS NULL',
      [commune, matricule]
    );
    if (existant) {
      personnel[matricule] = existant.id;
      continue;
    }
    const cree = await queryOne<{ id: string }>(
      `INSERT INTO personnel (commune_id, matricule, nom_complet, fonction)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [commune, matricule, nom, fonction]
    );
    personnel[matricule] = cree!.id;
  }
  console.log(
    avecRegistreReel
      ? `[dar-chaabane] personnel : registre réel présent (${registreReel!.n} agents DCF-), ` +
        'aucun agent fictif créé. Les équipes de circuit sont à affecter depuis l\'écran Personnel.'
      : `[dar-chaabane] personnel : ${Object.keys(personnel).length} agents (noms fictifs, ` +
        'en attendant le chargement du module 4)'
  );

  // --- Circuits de levée -----------------------------------------------------
  let crees = 0;
  let maj = 0;
  for (const c of LEVEE) {
    const description =
      `Registre communal 2024 — ${c.materiel}, ${c.tailleEquipe} agents, ` +
      `${c.voyagesParJour} voyage(s)/jour, ${c.tonnage}. ` +
      `Longueur et durée déclarées par la commune, non mesurées.`;

    const existant = await queryOne<{ id: string }>(
      'SELECT id FROM circuits WHERE commune_id = $1 AND code = $2 AND deleted_at IS NULL',
      [commune, `LEVEE-${c.numero}`]
    );

    const valeurs = [
      commune,
      c.nom,
      `LEVEE-${c.numero}`,
      description,
      // « يوميا » au registre : tous les jours de la semaine.
      [1, 2, 3, 4, 5, 6, 7],
      'menager',
      c.modeCollecte,
      c.voyagesParJour,
      Math.round(c.dureeHeures * 60),
      c.longueurKm,
      c.tailleEquipe,
    ];

    if (existant) {
      await query(
        `UPDATE circuits SET nom=$2, description=$4, jours_passage=$5::smallint[], type_dechet=$6,
                mode_collecte=$7, voyages_par_jour=$8, duree_prevue_minutes=$9,
                longueur_declaree_km=$10, taille_equipe=$11, updated_at=now()
          WHERE id=$12`,
        [...valeurs, existant.id]
      );
      maj++;
      continue;
    }

    const cree = await queryOne<{ id: string }>(
      `INSERT INTO circuits
         (commune_id, nom, code, description, jours_passage, type_dechet,
          mode_collecte, voyages_par_jour, duree_prevue_minutes,
          longueur_declaree_km, taille_equipe, date_debut)
       VALUES ($1,$2,$3,$4,$5::smallint[],$6,$7,$8,$9,$10,$11, CURRENT_DATE)
       RETURNING id`,
      valeurs
    );
    crees++;

    // Équipe : un chauffeur et un ripeur par circuit, conformément aux
    // « 2 agents par engin » du registre. Sautée dès que le registre réel est
    // chargé — mieux vaut un circuit que la plateforme signale comme non
    // pourvu qu'un circuit pourvu par un agent imaginaire.
    if (avecRegistreReel) continue;
    const chauffeur = AGENTS_FICTIFS[c.numero - 1];
    const ripeur = AGENTS_FICTIFS[7 + c.numero];
    for (const [agent, role] of [
      [chauffeur, 'chauffeur'],
      [ripeur, 'agent'],
    ] as const) {
      if (!agent) continue;
      await query(
        `INSERT INTO circuit_equipe (circuit_id, personnel_id, role) VALUES ($1,$2,$3)`,
        [cree!.id, personnel[agent[0]], role]
      );
    }
  }

  // --- Circuits de balayage --------------------------------------------------
  for (const b of BALAYAGE) {
    const existant = await queryOne<{ id: string }>(
      'SELECT id FROM circuits WHERE commune_id = $1 AND code = $2 AND deleted_at IS NULL',
      [commune, `BALAYAGE-${b.numero}`]
    );
    if (existant) {
      maj++;
      continue;
    }
    await query(
      `INSERT INTO circuits
         (commune_id, nom, code, description, jours_passage, type_dechet,
          mode_collecte, voyages_par_jour, longueur_declaree_km, taille_equipe, date_debut)
       VALUES ($1,$2,$3,$4,$5::smallint[],'balayage','mixte',1,$6,$7, CURRENT_DATE)`,
      [
        commune,
        `مسلك كنس عدد ${b.numero}`,
        `BALAYAGE-${b.numero}`,
        `Registre communal 2024 — balayage manuel, ${b.agents} agent(s), ${b.longueurKm} km déclarés.`,
        [1, 2, 3, 4, 5, 6],
        b.longueurKm,
        b.agents,
      ]
    );
    crees++;
  }

  console.log(`[dar-chaabane] circuits : ${crees} créés, ${maj} mis à jour`);
  console.log('[dar-chaabane] terminé.');
  await pool.end();
}

main().catch((err) => {
  console.error('[dar-chaabane] échec :', err);
  process.exit(1);
});
