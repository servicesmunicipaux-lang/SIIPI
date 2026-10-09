// La commune est-elle prête pour sa recette terrain ? (R1, FEUILLE_DE_ROUTE § 6)
//
//   npm run recette:etat -- <identifiant de la commune>
//   npm run recette:etat:prod -- <identifiant de la commune>
//
// POURQUOI UNE COMMANDE. Une recette se prépare avec la commune au téléphone :
// il faut pouvoir lui dire, en une page, ce qui l'empêche de commencer et ce
// qu'elle pourra compléter en route. Le panneau « À vérifier » dit déjà les
// écarts de ses registres ; il ne dit pas si quelqu'un, dans la commune, peut
// seulement se connecter, ni si un compte de démonstration y écrit encore.
//
// ELLE NE MODIFIE RIEN. Tout se lit dans une transaction READ ONLY : la base
// refuserait une écriture glissée ici par erreur. Ce qu'il faut corriger, la
// commande le dit ; elle ne le corrige pas (règle d'or 1.5).
//
// Codes de sortie : 0 prête ; 3 pas prête (préalables à lever) ; 2 usage ;
// 1 commune introuvable ou erreur.
process.env.SIIPI_DB_CONTEXT = 'server';
const { pool } = await import('../db.js');
const { COMPTES_DE_DEMONSTRATION } = await import('../motDePassePublic.js');

const communeId = process.argv[2]?.trim();
if (!communeId) {
  console.error('Usage : npm run recette:etat -- <identifiant de la commune>   (exemple : nabeul_dar_chaabane_el_fehri)');
  process.exit(2);
}

// Les registres que la recette du jalon 11 remplit. Vides aujourd'hui : c'est
// attendu, et c'est ce qu'on regardera se remplir.
const REGISTRES_DE_LA_RECETTE: Array<[string, string]> = [
  ['carnets_de_bord', 'Carnet de bord (sorties d’engins)'],
  ['documents_emis', 'Documents émis (bons de carburant, ordres de mission…)'],
  ['fuel_logs', 'Pleins de carburant'],
  ['quotas_carburant', 'Quotas mensuels de carburant'],
  ['pesees', 'Pesées'],
  ['presences', 'Pointage quotidien'],
  ['immobilisations_engins', 'Immobilisations d’engins'],
  ['dossiers_declassement', 'Dossiers de déclassement'],
];

const client = await pool.connect();
let code = 1;
try {
  await client.query('BEGIN READ ONLY');
  const commune = (
    await client.query<{ name: string; jour: string }>(
      "SELECT name, to_char((now() AT TIME ZONE 'Africa/Tunis')::date, 'DD/MM/YYYY') AS jour FROM communes WHERE id = $1",
      [communeId]
    )
  ).rows[0];
  if (!commune) {
    console.error(`Commune introuvable : « ${communeId} ». L'identifiant s'écrit comme dans la base (exemple : nabeul_dar_chaabane_el_fehri).`);
    process.exitCode = 1;
  } else {
    const nombre = async (sql: string, params: unknown[] = [communeId]) =>
      Number((await client.query<{ n: string }>(sql, params)).rows[0]?.n ?? 0);

    // Un compte de la commune : rattaché à titre principal, ou par un
    // rattachement en cours (app.mes_communes, règle d'or 1.2).
    const comptes = (
      await client.query<{ email: string; role: string; provisoire: boolean }>(
        `SELECT DISTINCT u.email, u.role, u.mot_de_passe_provisoire AS provisoire
           FROM users u
           LEFT JOIN utilisateur_communes uc ON uc.user_id = u.id AND uc.commune_id = $1 AND uc.actif
                AND (uc.date_debut IS NULL OR uc.date_debut <= CURRENT_DATE)
                AND (uc.date_fin IS NULL OR uc.date_fin >= CURRENT_DATE)
          WHERE u.deleted_at IS NULL AND u.is_active AND u.role = 'admin_commune'
            AND (u.commune_id = $1 OR uc.user_id IS NOT NULL)
          ORDER BY u.email`,
        [communeId]
      )
    ).rows;
    const demonstration = comptes.filter((c) => (COMPTES_DE_DEMONSTRATION as readonly string[]).includes(c.email));
    const propres = comptes.filter((c) => !demonstration.includes(c));

    const engins = await nombre('SELECT count(*) AS n FROM vehicules WHERE commune_id = $1');
    const agents = await nombre('SELECT count(*) AS n FROM personnel WHERE commune_id = $1 AND actif');
    const circuits = await nombre('SELECT count(*) AS n FROM circuits WHERE commune_id = $1 AND actif AND deleted_at IS NULL');
    const ecarts = (
      await client.query<{ gravite: string; domaine: string; sujet: string; constat: string; quoi_faire: string }>(
        'SELECT gravite, domaine, sujet, constat, quoi_faire FROM app.incoherences_commune($1)',
        [communeId]
      )
    ).rows;
    const bloquants = ecarts.filter((e) => e.gravite === 'bloquant');

    const prealables: Array<[boolean, string, string[]]> = [
      [
        propres.length > 0,
        `Compte propre de la commune (administrateur) : ${propres.length}`,
        propres.length > 0
          ? propres.map((c) => `${c.email}${c.provisoire ? ' — mot de passe provisoire, à remplacer à la première connexion' : ''}`)
          : ['Le chef de dépôt n’a aucun compte. La FNCT l’ouvre depuis le portail de la commune (Annuaire des communes → la commune → Comptes) ; le mot de passe provisoire lui est remis en main propre.'],
      ],
      [
        demonstration.length === 0,
        `Compte de démonstration rattaché à la commune : ${demonstration.length}`,
        demonstration.map(
          (c) => `${c.email} — son mot de passe est public : clore ce rattachement avant d’y saisir du réel (date de fin, voir docs/recette/R1_DAR_CHAABANE.md § 2)`
        ),
      ],
      [
        engins > 0 && agents > 0 && circuits > 0,
        `Registres chargés : ${engins} engin(s), ${agents} agent(s) actif(s), ${circuits} circuit(s)`,
        engins > 0 && agents > 0 && circuits > 0 ? [] : ['Charger le parc, le personnel et les circuits de la commune avant la recette.'],
      ],
      [
        bloquants.length === 0,
        `Incohérences bloquantes (panneau « À vérifier ») : ${bloquants.length}`,
        bloquants.map((e) => `${e.sujet} — ${e.constat} → ${e.quoi_faire}`),
      ],
    ];

    const sansPrix = await nombre('SELECT count(*) AS n FROM vehicules WHERE commune_id = $1 AND valeur_achat_tnd IS NULL');
    const sansDate = await nombre('SELECT count(*) AS n FROM vehicules WHERE commune_id = $1 AND date_premiere_circulation IS NULL');
    const entete = async (cle: string) =>
      (await nombre('SELECT count(*) AS n FROM app.parametre_national($1, CURRENT_DATE)', [cle])) > 0;
    const autres = new Map<string, number>();
    for (const e of ecarts.filter((x) => x.gravite !== 'bloquant')) {
      const cle = `${e.gravite} · ${e.constat}`;
      autres.set(cle, (autres.get(cle) ?? 0) + 1);
    }

    const l: string[] = [];
    l.push(`Recette terrain — ${commune.name} (${communeId}), état au ${commune.jour}`);
    l.push('');
    l.push('1. Préalables — ils empêchent de commencer');
    for (const [ok, titre, details] of prealables) {
      l.push(`  [${ok ? 'OK' : 'À FAIRE'}] ${titre}`);
      for (const d of details) l.push(`           ${d}`);
    }
    l.push('');
    l.push('2. À recueillir pendant la recette — ils n’empêchent pas de commencer');
    l.push(`  - Engins sans prix d’achat : ${sansPrix} ; sans date de première mise en circulation : ${sansDate} (dossier de déclassement, seuil de 80 %)`);
    l.push(
      `  - En-tête des documents (paramètres nationaux, FNCT) : ministère de tutelle ${(await entete('ministere_tutelle')) ? 'renseigné' : 'non renseigné'} ; ` +
        `formule d’en-tête ${(await entete('entete_etat')) ? 'renseignée' : 'non renseignée'}`
    );
    if (autres.size === 0) l.push('  - Panneau « À vérifier » : rien d’autre');
    for (const [cle, n] of [...autres.entries()].sort()) l.push(`  - ${cle} (${n})`);
    l.push('');
    l.push('3. Registres que la recette remplira (vides avant elle : c’est attendu)');
    for (const [table, libelle] of REGISTRES_DE_LA_RECETTE) {
      l.push(`  - ${libelle} : ${await nombre(`SELECT count(*) AS n FROM ${table} WHERE commune_id = $1`)}`);
    }
    const restants = prealables.filter(([ok]) => !ok).length;
    l.push('');
    l.push(restants === 0 ? 'Verdict : PRÊTE — la recette peut commencer.' : `Verdict : PAS PRÊTE — ${restants} préalable(s) à lever.`);
    console.log(l.join('\n'));
    process.exitCode = restants === 0 ? 0 : 3;
  }
  await client.query('ROLLBACK');
  code = Number(process.exitCode ?? 0);
} finally {
  client.release();
  await pool.end();
}
process.exit(code);
