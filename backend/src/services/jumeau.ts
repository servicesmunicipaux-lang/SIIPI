// LE JUMEAU NUMÉRIQUE (lot S1, FEUILLE_DE_ROUTE.md § 6bis).
//
// Charge backend/seed/data/jumeau_3mois.json — trois mois d'activité simulée,
// produits une fois pour toutes par scripts/jumeau/generer.py — dans une
// commune de démonstration fictive. Le fichier est versionné : l'application
// ne génère rien, elle charge. Deux chargements donnent donc les mêmes
// données, et la campagne simulation-3mois compare ce que l'application en
// calcule à ce qu'en calcule un script indépendant d'elle.
//
// Les garde-fous ne vivent pas ici mais dans la base (migration 055) : une
// ligne « simule » est refusée dans une commune réelle, et le retrait refuse
// toute commune réelle. Ce module ne fait que les contrôles qui permettent de
// répondre par un message clair avant d'atteindre ce refus.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { ApiError } from '../middleware/errorHandler.js';

const fichierJeu = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'seed', 'data', 'jumeau_3mois.json');

/** Le contenu du fichier : un objet par table, les liens par code (circuit, matricule, engin). */
type Jeu = Record<string, any> & {
  periode: { debut: string; fin: string };
  commune: { id: string; name: string; name_ar: string; gouvernorat: string; population: number; lat: number; lng: number };
};

export function lireJeu(): Jeu {
  return JSON.parse(fs.readFileSync(fichierJeu, 'utf-8')) as Jeu;
}

export const COMMUNE_DEMO = (): string => lireJeu().commune.id;

export interface EtatDemo {
  communeId: string;
  chargee: boolean;
  periode: { debut: string; fin: string };
  compteurs: Record<string, number>;
}

const TABLES_COMPTEES = [
  'vehicules', 'personnel', 'circuits', 'presences', 'pesees', 'tickets', 'fins_de_poste', 'fuel_logs', 'actions_planifiees',
  'carnets_de_bord',
];

export async function etatDemo(client: pg.PoolClient, communeId: string): Promise<EtatDemo> {
  const jeu = lireJeu();
  const { rows } = await client.query<{ est_demo: boolean }>('SELECT est_demo FROM communes WHERE id = $1', [communeId]);
  const chargee = rows[0]?.est_demo === true;
  const compteurs: Record<string, number> = {};
  if (chargee) {
    for (const t of TABLES_COMPTEES) {
      // Noms de tables issus d'une liste fixe ci-dessus, jamais de la requête.
      const r = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} WHERE commune_id = $1`, [communeId]);
      compteurs[t] = r.rows[0].n;
    }
  }
  return { communeId, chargee, periode: jeu.periode, compteurs };
}

/** Refuse une commune réelle, avec un message qui dit pourquoi (la base refuserait de toute façon). */
async function verifierCible(client: pg.PoolClient, communeId: string) {
  const { rows } = await client.query<{ est_demo: boolean }>('SELECT est_demo FROM communes WHERE id = $1', [communeId]);
  if (rows[0] && !rows[0].est_demo) {
    throw new ApiError(
      409,
      `Refusé : ${communeId} est une commune réelle. Le jeu de démonstration ne se charge ni ne se retire que dans une commune de démonstration.`
    );
  }
}

export async function retirerDemo(client: pg.PoolClient, communeId: string): Promise<number> {
  await verifierCible(client, communeId);
  const { rows } = await client.query<{ n: number }>('SELECT app.retirer_jeu_demo($1) AS n', [communeId]);
  return rows[0].n;
}

/**
 * Charge le jeu dans `communeId` (par défaut, la commune du fichier). Un jeu
 * déjà chargé est d'abord retiré : recharger rend exactement l'état initial,
 * corrections et saisies de démonstration comprises.
 */
export async function chargerDemo(client: pg.PoolClient, communeId?: string): Promise<EtatDemo> {
  const jeu = lireJeu();
  const id = communeId ?? jeu.commune.id;
  await retirerDemo(client, id);

  const c = jeu.commune;
  await client.query(
    `INSERT INTO communes (id, name, name_ar, gouvernorat, population, lat, lng, est_demo, activee)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)`,
    [id, c.name, c.name_ar, c.gouvernorat, c.population, c.lat, c.lng]
  );
  await client.query(
    `INSERT INTO parametres_commune (commune_id, delai_reclamation_jours, objectif_balayage_ml_j) VALUES ($1, $2, $3)`,
    [id, jeu.parametres.delai_reclamation_jours, jeu.parametres.objectif_balayage_ml_j]
  );

  // Chaque table se charge d'une seule requête : le tableau JSON est déplié
  // par jsonb_to_recordset et les liens (code de circuit, matricule, engin)
  // sont résolus par jointure, dans la commune chargée seulement.
  const charger = (sql: string, lignes: unknown[]) => client.query(sql, [id, JSON.stringify(lignes)]);
  const debut = jeu.periode.debut;

  await charger(
    `INSERT INTO vehicules (id, registration, commune_id, type, categorie, marque, charge_utile_t, etat,
                            motif_immobilisation, etat_depuis, provenance)
     SELECT $1 || '-' || lower(x.cle), x.registration, $1, x.type, x.categorie, x.marque, x.charge_utile_t, x.etat,
            x.motif_immobilisation, x.etat_depuis, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(cle text, registration text, type text, categorie text, marque text,
            charge_utile_t numeric, etat text, motif_immobilisation text, etat_depuis date)`,
    jeu.vehicules
  );
  await charger(
    `INSERT INTO personnel (commune_id, matricule, nom_complet, fonction, service, statut, affectation, permis, provenance)
     SELECT $1, x.matricule, x.nom_complet, x.fonction, x.service, x.statut, x.affectation, x.permis, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(matricule text, nom_complet text, fonction text, service text,
            statut text, affectation text, permis text[])`,
    jeu.personnel
  );
  await client.query(
    `INSERT INTO circuits (commune_id, code, nom, mode_collecte, type_dechet, voyages_par_jour, jours_passage,
                           vehicule_id, taille_equipe, poste, heure_depart, heure_fin, date_debut, actif, provenance)
     SELECT $1, x.code, x.nom, x.mode_collecte, x.type_dechet, x.voyages_par_jour, x.jours_passage,
            CASE WHEN x.vehicule IS NOT NULL THEN $1 || '-' || lower(x.vehicule) END,
            x.taille_equipe, x.poste, x.heure_depart, x.heure_fin, $3::date, true, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(code text, nom text, mode_collecte text, type_dechet text,
            voyages_par_jour smallint, jours_passage smallint[], vehicule text, taille_equipe smallint, poste text,
            heure_depart time, heure_fin time)`,
    [id, JSON.stringify(jeu.circuits), debut]
  );
  const equipes = jeu.circuits.flatMap((ci: any) => ci.equipe.map((e: any) => ({ circuit: ci.code, ...e })));
  await client.query(
    `INSERT INTO circuit_equipe (circuit_id, personnel_id, role, date_debut)
     SELECT ci.id, pe.id, x.role, $3::date
       FROM jsonb_to_recordset($2::jsonb) AS x(circuit text, matricule text, role text)
       JOIN circuits ci ON ci.commune_id = $1 AND ci.code = x.circuit
       JOIN personnel pe ON pe.commune_id = $1 AND pe.matricule = x.matricule`,
    [id, JSON.stringify(equipes), debut]
  );
  const points = jeu.circuits.flatMap((ci: any) => ci.points.map((p: any) => ({ circuit: ci.code, ...p })));
  await charger(
    `INSERT INTO points_collecte (circuit_id, commune_id, voyage, ordre, nom, type, geom, source, provenance)
     SELECT ci.id, $1, 1, x.ordre, x.nom, x.type, ST_SetSRID(ST_MakePoint(x.lng, x.lat), 4326), 'saisie', 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(circuit text, ordre int, nom text, type text, lat float8, lng float8)
       JOIN circuits ci ON ci.commune_id = $1 AND ci.code = x.circuit`,
    points
  );
  await charger(
    `INSERT INTO presences (commune_id, personnel_id, jour, present, motif_absence, circuit_id, voyage, provenance)
     SELECT $1, pe.id, x.jour, x.present, x.motif_absence, ci.id, 1, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(matricule text, jour date, present boolean, motif_absence text, circuit text)
       JOIN personnel pe ON pe.commune_id = $1 AND pe.matricule = x.matricule
       LEFT JOIN circuits ci ON ci.commune_id = $1 AND ci.code = x.circuit`,
    jeu.presences
  );
  await charger(
    `INSERT INTO pesees (commune_id, date_pesee, circuit_id, voyage, vehicule_id, type_dechet, poids_net_kg, source, provenance)
     SELECT $1, x.jour, ci.id, x.voyage, $1 || '-' || lower(x.vehicule), x.type_dechet, x.poids_net_kg, 'saisie_communale', 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(circuit text, jour date, voyage smallint, vehicule text, type_dechet text, poids_net_kg numeric)
       JOIN circuits ci ON ci.commune_id = $1 AND ci.code = x.circuit`,
    jeu.pesees
  );
  await charger(
    `INSERT INTO fins_de_poste (commune_id, vehicule_id, circuit_id, chauffeur_id, jour, benne_bachee, provenance)
     SELECT $1, $1 || '-' || lower(x.vehicule), ci.id, pe.id, x.jour, x.benne_bachee, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(vehicule text, circuit text, chauffeur text, jour date, benne_bachee boolean)
       JOIN circuits ci ON ci.commune_id = $1 AND ci.code = x.circuit
       JOIN personnel pe ON pe.commune_id = $1 AND pe.matricule = x.chauffeur`,
    jeu.fins_de_poste
  );
  await charger(
    `INSERT INTO fuel_logs (commune_id, vehicule_id, date_plein, litres, montant_tnd, provenance)
     SELECT $1, $1 || '-' || lower(x.vehicule), x.jour, x.litres, x.montant_tnd, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(vehicule text, jour date, litres numeric, montant_tnd numeric)`,
    jeu.carburant
  );
  // Lot 16.3 : le carnet de bord et les quotas — la distance se déduit des
  // compteurs, comme pour une saisie réelle.
  await charger(
    `INSERT INTO carnets_de_bord (commune_id, vehicule_id, jour, seance, chauffeur_id, circuit_id,
                                  compteur_sortie, compteur_retour, provenance)
     SELECT $1, $1 || '-' || lower(x.vehicule), x.jour, x.seance, pe.id, ci.id, x.compteur_sortie, x.compteur_retour, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(vehicule text, circuit text, chauffeur text, jour date, seance text,
            compteur_sortie numeric, compteur_retour numeric)
       JOIN circuits ci ON ci.commune_id = $1 AND ci.code = x.circuit
       JOIN personnel pe ON pe.commune_id = $1 AND pe.matricule = x.chauffeur`,
    jeu.carnets ?? []
  );
  await charger(
    `INSERT INTO quotas_carburant (commune_id, vehicule_id, litres_mois, depuis, provenance)
     SELECT $1, $1 || '-' || lower(x.vehicule), x.litres_mois, x.depuis, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(vehicule text, litres_mois numeric, depuis date)`,
    jeu.quotas ?? []
  );
  await charger(
    `INSERT INTO tickets (ticket_number, commune_id, category, status, priority, title, location_name, lat, lng, geom,
                          created_at, accepted_at, resolved_at, rejection_reason, provenance)
     SELECT x.numero, $1, x.category, x.status, x.priority, x.title, x.location_name, x.lat, x.lng,
            ST_SetSRID(ST_MakePoint(x.lng, x.lat), 4326), x.cree_le,
            CASE WHEN x.status = 'resolu' THEN x.cree_le END, x.resolu_le, x.rejet_motif, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(numero text, category text, status text, priority text, title text,
            location_name text, lat float8, lng float8, cree_le timestamptz, resolu_le timestamptz, rejet_motif text)`,
    jeu.tickets
  );
  await charger(
    `INSERT INTO poi (commune_id, nom, type, geom, provenance)
     SELECT $1, x.nom, x.type, ST_SetSRID(ST_MakePoint(x.lng, x.lat), 4326), 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(cle text, nom text, type text, lat float8, lng float8)`,
    jeu.poi
  );
  // Le lieu d'un nettoyage est désigné dans le fichier par sa clé, résolue ici
  // par son nom : la table poi n'a pas de code.
  const nomDuLieu = new Map(jeu.poi.map((p: any) => [p.cle, p.nom]));
  await charger(
    `INSERT INTO actions_planifiees (commune_id, titre, date_prevue, statut, terminee_le, type, poi_id, metres_lineaires, provenance)
     SELECT $1, x.titre, x.jour, x.statut,
            CASE WHEN x.statut = 'terminee' THEN (x.jour + time '12:00') AT TIME ZONE 'Africa/Tunis' END,
            'nettoyage', po.id, x.metres_lineaires, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(titre text, jour date, lieu text, statut text, metres_lineaires numeric)
       LEFT JOIN poi po ON po.commune_id = $1 AND po.nom = x.lieu`,
    jeu.nettoyages.map((n: any) => ({ ...n, lieu: n.poi ? nomDuLieu.get(n.poi) : null }))
  );
  await charger(
    `INSERT INTO controles_terrain (circuit_id, commune_id, date_controle, voyage, etat, provenance)
     SELECT ci.id, $1, x.jour, x.voyage, x.etat, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(circuit text, jour date, voyage smallint, etat text)
       JOIN circuits ci ON ci.commune_id = $1 AND ci.code = x.circuit`,
    jeu.controles
  );
  await charger(
    `INSERT INTO incidents (commune_id, circuit_id, date_incident, type, statut, description, provenance)
     SELECT $1, ci.id, x.jour, x.type, x.statut, x.description, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(circuit text, jour date, type text, statut text, description text)
       JOIN circuits ci ON ci.commune_id = $1 AND ci.code = x.circuit`,
    jeu.incidents
  );
  await charger(
    `INSERT INTO incidents_travail (commune_id, personnel_id, date_incident, type, gravite, jours_arret, provenance)
     SELECT $1, pe.id, x.jour, x.type, x.gravite, x.jours_arret, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(matricule text, jour date, type text, gravite text, jours_arret int)
       JOIN personnel pe ON pe.commune_id = $1 AND pe.matricule = x.matricule`,
    jeu.incidents_travail
  );
  await charger(
    `INSERT INTO dotations_epi (commune_id, personnel_id, type_epi, date_remise, provenance)
     SELECT $1, pe.id, x.type_epi, x.date_remise, 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(matricule text, type_epi text, date_remise date)
       JOIN personnel pe ON pe.commune_id = $1 AND pe.matricule = x.matricule`,
    jeu.dotations_epi
  );
  await charger(
    `INSERT INTO effectifs_service (commune_id, annee, service, effectif_ouvriers, effectif_encadrement, masse_salariale_tnd, source, provenance)
     SELECT $1, x.annee, x.service, x.effectif_ouvriers, x.effectif_encadrement, x.masse_salariale_tnd, 'jumeau numérique', 'simule'
       FROM jsonb_to_recordset($2::jsonb) AS x(annee smallint, service text, effectif_ouvriers smallint,
            effectif_encadrement smallint, masse_salariale_tnd numeric)`,
    jeu.effectifs
  );

  for (const pub of jeu.publications) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO publications (commune_id, type, statut, titre_fr, titre_ar, contenu_fr, contenu_ar, publiee_le,
                                 date_debut, date_fin, provenance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'simule') RETURNING id`,
      [id, pub.type, pub.statut, pub.titre_fr, pub.titre_ar, pub.contenu_fr, pub.contenu_ar, pub.publiee_le, pub.date_debut, pub.date_fin]
    );
    const publication = rows[0].id;
    if (pub.questions.length === 0) continue;
    await client.query(
      `INSERT INTO sondage_questions (publication_id, ordre, libelle_fr, libelle_ar, type, options_fr, options_ar)
       SELECT $1, x.ordre, x.libelle_fr, x.libelle_ar, x.type, x.options_fr, x.options_ar
         FROM jsonb_to_recordset($2::jsonb) AS x(ordre smallint, libelle_fr text, libelle_ar text, type text,
              options_fr text[], options_ar text[])`,
      [publication, JSON.stringify(pub.questions)]
    );
    // Les réponses passent par une fonction de la base : la table n'est
    // ouverte qu'aux citoyens, et le jeu n'en crée aucun (migration 055).
    await client.query('SELECT app.charger_reponses_demo($1, $2::jsonb)', [publication, JSON.stringify(pub.reponses)]);
  }

  return etatDemo(client, id);
}
