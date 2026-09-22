// ---------------------------------------------------------------------------
// Communication & relation citoyen — jeu d'essai de Dar Chaabane El Fehri.
//
// CE QUI EST RÉEL ICI, ET CE QUI NE L'EST PAS. Contrairement aux circuits, au
// parc et au personnel, la commune n'a fourni AUCUN sondage, projet ni
// notification : ces objets n'existent pas encore, la plateforme est ce qui
// les fera exister. Il n'y a donc rien à importer.
//
// Ce qui est réel, en revanche, c'est le TERRAIN sur lequel ils se posent :
// le découpage en secteurs de la commune, et ses circuits. Les contenus
// ci-dessous s'appuient dessus — ils ciblent de vrais secteurs, et les
// décomptes de destinataires qu'ils produisent sont de vrais décomptes.
//
// CHAQUE CONTENU EST MARQUÉ « EXEMPLE », EN BASE ET PAS SEULEMENT DANS SON
// TITRE. La colonne `est_exemple` est vérifiée par un déclencheur : la base
// REFUSE de publier vers les citoyens un contenu qui la porte. Un sondage de
// démonstration qu'un élu prendrait pour une consultation réelle n'est pas
// une gêne, c'est un incident — et le supprimer après coup ne rattraperait
// pas les réponses déjà données.
//
// Ils restent donc en brouillon. La commune les ouvrira, verra comment un
// périmètre se dessine et combien de foyers il touche, puis écrira les siens.
// ---------------------------------------------------------------------------

process.env.SIIPI_DB_CONTEXT = 'server';
const { pool, query, queryOne } = await import('../src/db.js');

async function trouverCommune(): Promise<string | null> {
  const ligne = await queryOne<{ id: string }>(
    `SELECT id FROM communes
      WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%'
      ORDER BY length(name) LIMIT 1`
  );
  return ligne?.id ?? null;
}

interface Exemple {
  cle: string;
  type: 'sondage' | 'projet' | 'notification';
  titreFr: string;
  titreAr: string;
  contenuFr: string;
  contenuAr: string;
  perimetre: 'commune' | 'secteurs';
  projetNature?: 'communal' | 'associatif';
  projetEtat?: 'en_preparation' | 'actif' | 'termine';
  questions?: Array<{
    libelleFr: string;
    libelleAr: string;
    type: 'choix_unique' | 'choix_multiple' | 'texte' | 'note';
    optionsFr?: string[];
    optionsAr?: string[];
  }>;
}

const EXEMPLES: Exemple[] = [
  {
    cle: 'exemple-sondage-satisfaction',
    type: 'sondage',
    titreFr: '[EXEMPLE] Satisfaction sur la collecte des ordures ménagères',
    titreAr: '[نموذج] الرضاء عن رفع الفضلات المنزلية',
    contenuFr:
      "Modèle de consultation. Trois questions courtes : la régularité du passage, la propreté des points de regroupement, et une note d'ensemble. À reprendre et à adapter avant toute publication réelle.",
    contenuAr:
      'نموذج استشارة. ثلاثة أسئلة قصيرة: انتظام المرور، نظافة نقاط التجميع، وتقييم عام. يُعدّل قبل أي نشر حقيقي.',
    perimetre: 'commune',
    questions: [
      {
        libelleFr: 'Le camion passe-t-il aux jours annoncés ?',
        libelleAr: 'هل تمرّ الشاحنة في الأيام المعلنة؟',
        type: 'choix_unique',
        optionsFr: ['Toujours', 'Souvent', 'Rarement', 'Jamais'],
        optionsAr: ['دائما', 'غالبا', 'نادرا', 'أبدا'],
      },
      {
        libelleFr: 'Qu’est-ce qui vous gêne le plus ?',
        libelleAr: 'ما الذي يزعجك أكثر؟',
        type: 'choix_multiple',
        optionsFr: [
          'Les horaires de passage',
          'Les dépôts sauvages',
          'L’état des conteneurs',
          'Les odeurs',
          'Rien en particulier',
        ],
        optionsAr: [
          'أوقات المرور',
          'الإلقاء العشوائي',
          'حالة الحاويات',
          'الروائح',
          'لا شيء بالتحديد',
        ],
      },
      {
        libelleFr: 'Note d’ensemble du service de propreté (0 à 10)',
        libelleAr: 'تقييم عام لمصلحة النظافة (من 0 إلى 10)',
        type: 'note',
      },
    ],
  },
  {
    cle: 'exemple-notification-report',
    type: 'notification',
    titreFr: '[EXEMPLE] Collecte reportée — secteur concerné',
    titreAr: '[نموذج] تأجيل الرفع — القطاع المعني',
    contenuFr:
      'Modèle de message ciblé. Le report d’une tournée ne concerne qu’un secteur : c’est exactement le cas où l’on écrit à quelques centaines de foyers plutôt qu’à toute la commune.',
    contenuAr:
      'نموذج رسالة موجّهة. تأجيل جولة لا يهمّ سوى قطاع واحد: وهي الحالة التي نكتب فيها لبضع مئات من العائلات لا لكامل البلدية.',
    perimetre: 'secteurs',
  },
  {
    cle: 'exemple-projet-points-verts',
    type: 'projet',
    titreFr: '[EXEMPLE] Aménagement de points de regroupement',
    titreAr: '[نموذج] تهيئة نقاط تجميع',
    contenuFr:
      'Modèle de fiche projet : intitulé, périmètre, période, documents joints. Sert à montrer comment un projet s’affiche côté citoyen une fois rendu visible.',
    contenuAr:
      'نموذج بطاقة مشروع: العنوان، النطاق، الفترة، الوثائق المرفقة. يبيّن كيف يظهر المشروع للمواطن بعد إتاحته.',
    perimetre: 'secteurs',
    projetNature: 'communal',
    projetEtat: 'en_preparation',
  },
];

async function charger(): Promise<void> {
  const COMMUNE = await trouverCommune();
  if (!COMMUNE) {
    console.error("Dar Chaabane absente du référentiel. Lancer d'abord « npm run seed »." );
    process.exitCode = 1;
    return;
  }
  console.log(`[communication] commune : ${COMMUNE}`);

  // Les secteurs réels de la commune. S'il n'y en a pas encore, les exemples
  // ciblés sur secteur retombent sur la commune entière plutôt que d'échouer :
  // le découpage n'est pas un prérequis pour regarder à quoi ressemble l'écran.
  const secteurs = await query<{ id: string }>(
    `SELECT id FROM zones_collecte
      WHERE commune_id = $1 AND status = 'active' AND deleted_at IS NULL
      ORDER BY code, name LIMIT 2`,
    [COMMUNE]
  );
  const aDesSecteurs = secteurs.length > 0;
  if (!aDesSecteurs) {
    console.log('[communication] aucun secteur actif : les exemples ciblés visent la commune entière.');
  }

  let crees = 0;
  let maj = 0;

  for (const e of EXEMPLES) {
    const cible = e.perimetre === 'secteurs' && aDesSecteurs ? 'zones' : 'commune';
    const zoneIds = cible === 'zones' ? secteurs.map((z) => z.id) : null;

    const existant = await queryOne<{ id: string }>(
      `SELECT id FROM publications
        WHERE commune_id = $1 AND est_exemple AND titre_fr = $2 AND deleted_at IS NULL`,
      [COMMUNE, e.titreFr]
    );

    let id: string;
    if (existant) {
      await query(
        `UPDATE publications
            SET titre_ar = $1, contenu_fr = $2, contenu_ar = $3,
                perimetre_type = $4, zone_ids = $5::uuid[],
                projet_nature = $6, projet_etat = $7,
                statut = 'brouillon', est_exemple = true
          WHERE id = $8`,
        [e.titreAr, e.contenuFr, e.contenuAr, cible, zoneIds,
         e.projetNature ?? null, e.projetEtat ?? null, existant.id]
      );
      id = existant.id;
      maj += 1;
    } else {
      const cree = await queryOne<{ id: string }>(
        `INSERT INTO publications
           (commune_id, type, titre_fr, titre_ar, contenu_fr, contenu_ar,
            perimetre_type, zone_ids, projet_nature, projet_etat, statut, est_exemple)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9, $10, 'brouillon', true)
         RETURNING id`,
        [COMMUNE, e.type, e.titreFr, e.titreAr, e.contenuFr, e.contenuAr,
         cible, zoneIds, e.projetNature ?? null, e.projetEtat ?? null]
      );
      id = cree!.id;
      crees += 1;
    }

    if (e.questions) {
      // On ne réécrit le questionnaire que s'il n'a reçu aucune réponse — même
      // règle que la route : modifier une question déjà répondue changerait
      // rétroactivement le sens de ce qui a été répondu.
      const repondu = await queryOne<{ n: string }>(
        'SELECT count(*) AS n FROM sondage_reponses WHERE publication_id = $1',
        [id]
      );
      if (Number(repondu?.n ?? 0) === 0) {
        await query('DELETE FROM sondage_questions WHERE publication_id = $1', [id]);
        for (const [i, q] of e.questions.entries()) {
          await query(
            `INSERT INTO sondage_questions
               (publication_id, ordre, libelle_fr, libelle_ar, type, options_fr, options_ar)
             VALUES ($1, $2::smallint, $3, $4, $5, $6::text[], $7::text[])`,
            [id, i + 1, q.libelleFr, q.libelleAr, q.type, q.optionsFr ?? null, q.optionsAr ?? null]
          );
        }
      }
    }
  }

  console.log(`Communication Dar Chaabane : ${crees} exemple(s) créé(s), ${maj} mis à jour.`);
  console.log('Tous en brouillon et marqués « exemple » : la base refuse de les publier vers les citoyens.');
}

try {
  await charger();
} finally {
  await pool.end();
}
