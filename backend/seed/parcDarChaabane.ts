// ---------------------------------------------------------------------------
// Parc matériel de Dar Chaabane El Fehri.
//
// Source : « قائمة في الوضعية الحالية لوسائل ومعدّات النظافة التابعة للبلدية »,
// arrêtée au 19 avril 2024 par le chef du magasin municipal. 29 engins.
//
// Le fichier est en arabe et ses valeurs sont libres : on traduit ici, une
// fois, avec la correspondance sous les yeux. Traduire à la volée dans
// l'interface reviendrait à refaire ce travail à chaque écran, et à le refaire
// différemment.
//
// Ce qui n'est PAS repris : l'ancienneté des pannes. Le fichier est un
// instantané ; il dit qu'un engin est immobilisé, jamais depuis quand. On
// enregistre la date de l'inventaire, et « etat_depuis » reste vide jusqu'à ce
// que la commune le renseigne.
// ---------------------------------------------------------------------------

process.env.SIIPI_DB_CONTEXT = 'server';
const { pool, query, queryOne } = await import('../src/db.js');

/** Date du relevé : 19/04/2024, portée en tête du fichier. */
const INVENTAIRE_LE = '2024-04-19';

type Etat = 'en_service' | 'en_panne' | 'a_reformer' | 'reforme';
type Categorie = 'poids_lourd' | 'engin_lourd' | 'tracteur' | 'remorque';

interface Engin {
  immatriculation: string;
  type: string;
  categorie: Categorie;
  marque: string;
  miseEnCirculation: string; // AAAA-MM-JJ
  valeurTnd: number | null;
  chargeUtileT: number | null;
  domaine: string;
  etat: Etat;
  motif: string | null;
}

// « معطب للتفويت » n'est pas « معطب » : le premier reviendra, le second est
// déjà sorti de l'inventaire dans l'esprit du magasinier.
const PARC: Engin[] = [
  // --- الشاحنات الثقيلة — poids lourds ---
  { immatriculation: '02 214 146', type: 'camion', categorie: 'poids_lourd', marque: 'Renault Trucks', miseEnCirculation: '2010-01-22', valeurTnd: 80000, chargeUtileT: 6, domaine: 'Déchets verts et de jardins', etat: 'en_panne', motif: 'En attente d’achat de pièces de rechange par marché' },
  { immatriculation: '02 214 147', type: 'camion', categorie: 'poids_lourd', marque: 'Renault Trucks', miseEnCirculation: '2010-01-22', valeurTnd: 80000, chargeUtileT: 6, domaine: 'Déchets verts et de jardins', etat: 'en_service', motif: null },
  { immatriculation: '96176',      type: 'benne_tasseuse', categorie: 'poids_lourd', marque: 'Ford', miseEnCirculation: '2013-07-05', valeurTnd: 45000, chargeUtileT: 12, domaine: 'Propreté (levée des déchets)', etat: 'en_panne', motif: 'En maintenance interne au magasin municipal' },
  { immatriculation: '02 215 435', type: 'benne_tasseuse', categorie: 'poids_lourd', marque: 'Iveco', miseEnCirculation: '2012-12-31', valeurTnd: 220000, chargeUtileT: 12, domaine: 'Propreté (levée des déchets)', etat: 'en_service', motif: 'Entretien à prévoir sur le caisson arrière' },
  { immatriculation: '02 217 972', type: 'balayeuse', categorie: 'poids_lourd', marque: 'RCM', miseEnCirculation: '2015-08-12', valeurTnd: 146000, chargeUtileT: null, domaine: 'Propreté (balayage mécanique)', etat: 'en_panne', motif: null },
  { immatriculation: '02 216 543', type: 'camion_remorque', categorie: 'poids_lourd', marque: 'Iveco', miseEnCirculation: '2013-12-12', valeurTnd: 211600, chargeUtileT: 20, domaine: 'Déchets solides et terres', etat: 'en_service', motif: null },
  { immatriculation: '02 216 542', type: 'remorque', categorie: 'remorque', marque: 'Tunicom', miseEnCirculation: '2013-12-12', valeurTnd: null, chargeUtileT: null, domaine: 'Déchets solides et terres', etat: 'en_service', motif: null },
  { immatriculation: '02 220635',  type: 'camion', categorie: 'poids_lourd', marque: 'Iveco', miseEnCirculation: '2019-03-20', valeurTnd: 205000, chargeUtileT: 6, domaine: 'Déchets solides et terres', etat: 'en_service', motif: null },
  { immatriculation: '02 222 902', type: 'benne_tasseuse', categorie: 'poids_lourd', marque: 'Iveco', miseEnCirculation: '2022-06-30', valeurTnd: 382418, chargeUtileT: 8, domaine: 'Propreté (levée des déchets)', etat: 'en_service', motif: null },

  // --- الآليات الثقيلة — engins lourds ---
  { immatriculation: '02 214 559', type: 'chargeuse_pelleteuse', categorie: 'engin_lourd', marque: 'Cukurova', miseEnCirculation: '2010-02-11', valeurTnd: 95000, chargeUtileT: null, domaine: 'Déchets solides et terres', etat: 'en_panne', motif: 'Réfection du moteur nécessaire' },
  { immatriculation: '02 220 811', type: 'chargeuse_pelleteuse', categorie: 'engin_lourd', marque: 'New Holland', miseEnCirculation: '2019-03-24', valeurTnd: 155000, chargeUtileT: null, domaine: 'Déchets solides et terres', etat: 'en_service', motif: null },
  { immatriculation: '02 216 137', type: 'chargeuse', categorie: 'engin_lourd', marque: 'Cukurova', miseEnCirculation: '2013-09-10', valeurTnd: 190000, chargeUtileT: null, domaine: 'Déchets solides et terres', etat: 'en_panne', motif: 'Distributeur hydraulique réparé ; reste l’entretien du moyeu de rotation des roues (prestataire à Sfax)' },
  { immatriculation: '02 216238',  type: 'mini_chargeuse', categorie: 'engin_lourd', marque: 'New Holland', miseEnCirculation: '2014-02-04', valeurTnd: 45000, chargeUtileT: null, domaine: 'Déchets solides et terres', etat: 'en_panne', motif: 'En attente d’achat de pièces de rechange par marché' },
  { immatriculation: '02 220 943', type: 'mini_chargeuse', categorie: 'engin_lourd', marque: 'JCB', miseEnCirculation: '2019-04-11', valeurTnd: 45000, chargeUtileT: null, domaine: 'Déchets solides et terres', etat: 'en_service', motif: null },
  { immatriculation: '02 217 080', type: 'niveleuse', categorie: 'engin_lourd', marque: 'SDLG', miseEnCirculation: '2014-06-02', valeurTnd: 196000, chargeUtileT: null, domaine: 'Nettoyage des terrains vagues', etat: 'en_service', motif: null },

  // --- الجرّارات — tracteurs ---
  { immatriculation: '02 201 078', type: 'tracteur', categorie: 'tracteur', marque: 'Landini', miseEnCirculation: '1994-06-28', valeurTnd: 15000, chargeUtileT: null, domaine: 'Propreté (levée des déchets)', etat: 'a_reformer', motif: 'À réformer' },
  { immatriculation: '02 210 846', type: 'tracteur', categorie: 'tracteur', marque: 'Landini', miseEnCirculation: '2002-06-17', valeurTnd: 15000, chargeUtileT: null, domaine: 'Propreté (levée des déchets)', etat: 'en_panne', motif: 'À réformer' },
  { immatriculation: '02 211 958', type: 'tracteur', categorie: 'tracteur', marque: 'New Holland', miseEnCirculation: '2004-08-09', valeurTnd: 15000, chargeUtileT: null, domaine: 'Propreté (levée des déchets)', etat: 'en_service', motif: null },
  { immatriculation: '02 212 594', type: 'tracteur', categorie: 'tracteur', marque: 'Landini', miseEnCirculation: '2005-08-08', valeurTnd: 15000, chargeUtileT: null, domaine: 'Propreté (levée des déchets)', etat: 'en_service', motif: null },
  { immatriculation: '02 212 595', type: 'tracteur', categorie: 'tracteur', marque: 'Landini', miseEnCirculation: '2005-08-08', valeurTnd: 15000, chargeUtileT: null, domaine: 'Propreté (levée des déchets)', etat: 'en_panne', motif: 'Contrôle moteur à effectuer' },
  { immatriculation: '02 214 971', type: 'tracteur', categorie: 'tracteur', marque: 'SAME', miseEnCirculation: '2011-04-19', valeurTnd: 24500, chargeUtileT: null, domaine: 'Propreté (levée des déchets)', etat: 'en_panne', motif: 'En attente d’achat de pièces de rechange par marché' },
  { immatriculation: '02 217 316', type: 'tracteur', categorie: 'tracteur', marque: 'Changfa', miseEnCirculation: '2015-09-25', valeurTnd: 38000, chargeUtileT: null, domaine: 'Propreté (levée des déchets)', etat: 'a_reformer', motif: 'Déposé chez le constructeur pour réfection du moteur ; à réformer' },
  { immatriculation: '02 217 317', type: 'tracteur', categorie: 'tracteur', marque: 'Changfa', miseEnCirculation: '2015-09-25', valeurTnd: 38000, chargeUtileT: null, domaine: 'Propreté (levée des déchets)', etat: 'a_reformer', motif: 'Contrôle moteur à effectuer ; à réformer' },
  { immatriculation: '02 219385',  type: 'tracteur', categorie: 'tracteur', marque: 'Fiat 820', miseEnCirculation: '2007-07-17', valeurTnd: 15000, chargeUtileT: null, domaine: 'Déchets verts et de jardins', etat: 'en_panne', motif: 'En attente d’achat de pièces de rechange par marché' },

  // --- المجرورات — remorques ---
  { immatriculation: '02 212 549', type: 'remorque', categorie: 'remorque', marque: 'SIMMA', miseEnCirculation: '2005-06-01', valeurTnd: 2000, chargeUtileT: 3, domaine: 'Propreté (levée des déchets)', etat: 'en_service', motif: null },
  { immatriculation: '02 212 550', type: 'remorque', categorie: 'remorque', marque: 'SIMMA', miseEnCirculation: '2005-06-01', valeurTnd: 2000, chargeUtileT: 3, domaine: 'Propreté (levée des déchets)', etat: 'en_service', motif: null },
  { immatriculation: '02 211 762', type: 'remorque', categorie: 'remorque', marque: 'AM-Sud', miseEnCirculation: '2004-07-19', valeurTnd: 2000, chargeUtileT: 3, domaine: 'Propreté (levée des déchets)', etat: 'en_service', motif: null },
  { immatriculation: '02 219387',  type: 'remorque', categorie: 'remorque', marque: 'SIMMA', miseEnCirculation: '2008-01-21', valeurTnd: 2000, chargeUtileT: 3, domaine: 'Propreté (levée des déchets)', etat: 'en_service', motif: null },
  { immatriculation: '02 219388',  type: 'remorque', categorie: 'remorque', marque: 'SIMMA', miseEnCirculation: '2008-01-21', valeurTnd: 2000, chargeUtileT: 3, domaine: 'Propreté (levée des déchets)', etat: 'en_service', motif: null },
];

/** Identifiant stable, dérivé de l'immatriculation : un réimport ne duplique pas. */
const identifiant = (immat: string) => `dcef-${immat.replace(/\s+/g, '')}`;

async function main() {
  const commune = await queryOne<{ id: string }>(
    `SELECT id FROM communes
      WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%'
      ORDER BY length(name) LIMIT 1`
  );
  if (!commune) {
    throw new Error("Dar Chaabane absente du référentiel. Lancer « npm run seed » d'abord.");
  }
  console.log(`[parc] commune : ${commune.id}`);

  let crees = 0;
  let maj = 0;
  for (const e of PARC) {
    const id = identifiant(e.immatriculation);
    const existant = await queryOne<{ id: string }>('SELECT id FROM vehicules WHERE id = $1', [id]);
    const valeurs = [
      e.immatriculation,
      commune.id,
      e.type,
      e.categorie,
      e.marque,
      e.miseEnCirculation,
      e.valeurTnd,
      e.chargeUtileT,
      e.domaine,
      e.etat,
      e.motif,
      INVENTAIRE_LE,
    ];
    if (existant) {
      await query(
        `UPDATE vehicules SET registration=$1, commune_id=$2, type=$3, categorie=$4, marque=$5,
                date_premiere_circulation=$6::date, valeur_achat_tnd=$7, charge_utile_t=$8,
                domaine_emploi=$9, etat=$10, motif_immobilisation=$11, inventaire_le=$12::date
          WHERE id=$13`,
        [...valeurs, id]
      );
      maj++;
    } else {
      await query(
        `INSERT INTO vehicules (id, registration, commune_id, type, categorie, marque,
                date_premiere_circulation, valeur_achat_tnd, charge_utile_t, domaine_emploi,
                etat, motif_immobilisation, inventaire_le)
         VALUES ($13,$1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12::date)`,
        [...valeurs, id]
      );
      crees++;
    }
  }

  // Le camion à remorque et sa remorque ont été acquis ensemble et portent des
  // immatriculations consécutives : c'est le seul attelage que le fichier
  // permet d'établir sans supposer. Les six autres remorques restent libres,
  // faute d'information — et c'est à la commune de les affecter.
  await query(
    `UPDATE vehicules SET attele_a = $1 WHERE id = $2`,
    [identifiant('02 216 543'), identifiant('02 216 542')]
  );

  const etat = await queryOne<Record<string, unknown>>(
    'SELECT * FROM app.etat_du_parc($1)',
    [commune.id]
  );
  console.log(`[parc] ${crees} engin(s) créé(s), ${maj} mis à jour`);
  console.log('');
  console.log(`[parc] État au ${INVENTAIRE_LE} :`);
  console.log(`[parc]   ${etat?.total} engins — ${etat?.en_service} en service, ${etat?.en_panne} en panne, ${etat?.a_reformer} à réformer`);
  console.log(`[parc]   disponibilité ${etat?.taux_disponibilite} % (hors remorques)`);
  console.log(`[parc]   âge moyen ${etat?.age_moyen_annees} ans — valeur ${Number(etat?.valeur_parc_tnd).toLocaleString('fr')} TND`);
  if (Number(etat?.immobilises_sans_motif) > 0) {
    console.log(`[parc]   ${etat?.immobilises_sans_motif} immobilisé(s) sans motif écrit`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('[parc] échec :', err);
  process.exit(1);
});
