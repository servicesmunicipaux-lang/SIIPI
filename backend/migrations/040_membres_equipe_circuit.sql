-- ===========================================================================
-- Migration 040 — Les membres de l'équipe, et pas seulement leur nombre
--
-- `app.equipes_du_jour()` rendait des COMPTES : combien d'affectés, combien de
-- présents, un chauffeur oui ou non. Cela suffisait pour signaler qu'un
-- circuit n'est pas pourvu ; cela ne suffit pas pour le pourvoir. L'écran
-- pouvait dire « aucun agent affecté » sans jamais pouvoir dire QUI est là,
-- ni offrir de retirer quelqu'un — l'identifiant de l'affectation, seul moyen
-- de la clore, ne quittait jamais la base.
--
-- La fonction rend désormais aussi la liste des membres. Un tableau JSON
-- plutôt qu'une seconde requête par circuit : quatorze circuits à l'écran
-- feraient quinze allers-retours pour afficher une page qui tient en un.
--
-- Chaque membre porte l'identifiant de SON AFFECTATION (circuit_equipe.id) et
-- non celui de l'agent : c'est l'affectation qu'on clôt, jamais l'agent. Un
-- chauffeur qui change de secteur reste au registre.
-- ===========================================================================

DROP FUNCTION IF EXISTS app.equipes_du_jour(text, date);

CREATE OR REPLACE FUNCTION app.equipes_du_jour(p_commune text, p_jour date DEFAULT CURRENT_DATE)
  RETURNS TABLE (
    circuit_id     uuid,
    circuit        text,
    taille_prevue  smallint,
    affectes       bigint,
    presents       bigint,
    absents        bigint,
    chauffeur      boolean,
    membres        jsonb
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT c.id, c.nom, c.taille_equipe,
         count(ce.id),
         count(*) FILTER (WHERE pr.present),
         count(*) FILTER (WHERE pr.id IS NOT NULL AND NOT pr.present),
         bool_or(ce.role = 'chauffeur'),
         -- coalesce : un circuit sans personne rend un tableau vide, jamais
         -- NULL. Côté écran, « rien » et « pas encore chargé » ne doivent pas
         -- se ressembler.
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'affectation_id', ce.id,
               'personnel_id',   p.id,
               'nom_complet',    p.nom_complet,
               'matricule',      p.matricule,
               'fonction',       p.fonction,
               'role',           ce.role,
               'depuis',         ce.date_debut,
               -- true / false / null : pointé présent, pointé absent, ou pas
               -- encore pointé. Les trois états sont distincts et l'écran du
               -- matin repose entièrement sur cette distinction.
               'present',        pr.present
             )
             ORDER BY CASE ce.role WHEN 'chef_equipe' THEN 0
                                   WHEN 'chauffeur'   THEN 1
                                   ELSE 2 END, p.nom_complet
           ) FILTER (WHERE ce.id IS NOT NULL),
           '[]'::jsonb
         )
    FROM circuits c
    LEFT JOIN circuit_equipe ce
           ON ce.circuit_id = c.id
          AND ce.date_debut <= p_jour
          AND (ce.date_fin IS NULL OR ce.date_fin >= p_jour)
    LEFT JOIN personnel p
           ON p.id = ce.personnel_id AND p.deleted_at IS NULL
    LEFT JOIN presences pr
           ON pr.personnel_id = ce.personnel_id AND pr.jour = p_jour
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.date_debut <= p_jour
     AND (c.date_fin IS NULL OR c.date_fin >= p_jour)
   GROUP BY c.id, c.nom, c.taille_equipe
   ORDER BY c.nom
$$;

COMMENT ON FUNCTION app.equipes_du_jour(text, date) IS
  'Pour chaque circuit actif ce jour-là : la taille d''équipe prévue à la fiche, les agents affectés avec l''identifiant de leur affectation, et leur pointage du jour. Un circuit sans chauffeur affecté est la première chose qu''un chef de service veut voir le matin ; pouvoir y affecter quelqu''un depuis le même écran est la seconde.';

GRANT EXECUTE ON FUNCTION app.equipes_du_jour(text, date) TO siipi_app;
