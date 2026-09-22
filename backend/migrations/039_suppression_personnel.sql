-- ===========================================================================
-- Migration 039 — Le « D » de CRUD pour le registre du personnel
--
-- `app.supprimer()` est la seule voie de suppression offerte à l'API : elle
-- vérifie le droit d'écriture sur la commune, puis marque la ligne
-- `deleted_at`. Sa liste blanche a grandi migration après migration au fil des
-- modules — mais `personnel`, créé au module 4, n'y a jamais été ajouté.
--
-- Conséquence : une commune pouvait inscrire un agent, la corriger, mais
-- jamais la retirer. Une erreur de saisie restait au registre à vie, et
-- l'effectif affiché ne pouvait que croître. Ce n'est pas une protection de la
-- donnée, c'est une impasse : la commune n'a alors d'autre issue que de
-- « désactiver » l'agent, ce qui veut dire tout autre chose (un agent inactif
-- est un agent en poste qui ne travaille pas ce mois-ci, pas une ligne saisie
-- par erreur).
--
-- La suppression reste LOGIQUE. Une feuille de pointage, une affectation, une
-- pesée saisie par cet agent restent lisibles : on ne réécrit pas l'histoire
-- d'un service public parce qu'une ligne a été mal tapée.
-- ===========================================================================

CREATE OR REPLACE FUNCTION app.supprimer(p_table text, p_id text)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_commune text;
BEGIN
  IF p_table NOT IN ('users', 'vehicules', 'conteneurs', 'tickets',
                     'pesees_anged', 'zones_collecte', 'barbechas',
                     'five_axis_scores', 'circuits', 'controles_terrain',
                     'declarations_passage', 'incidents', 'annonces_collecte',
                     'collecteurs_agrees', 'demandes_enlevement',
                     'personnel') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  IF NOT app.can_write_commune(v_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  EXECUTE format('UPDATE %I SET deleted_at = now(), deleted_by = $2 WHERE id::text = $1', p_table)
    USING p_id, app.current_user_id();

  RETURN true;
END;
$fn$;

COMMENT ON FUNCTION app.supprimer(text, text) IS
  'Suppression logique d''une ligne, avec vérification du droit d''écriture sur sa commune. Seule voie de suppression offerte à l''API. Toute table que l''interface doit pouvoir retirer figure ici — une table absente de la liste est une table que l''utilisateur ne peut pas corriger.';

GRANT EXECUTE ON FUNCTION app.supprimer(text, text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- Un agent retiré du registre ne doit pas rester silencieusement affecté à un
-- circuit : la tournée paraîtrait pourvue par quelqu'un qui n'est plus là.
-- L'API refuse la suppression tant que l'agent tient un poste (409, avec le
-- nom des circuits) ; ce déclencheur est la ceinture et les bretelles, pour le
-- cas où une ligne serait retirée par un autre chemin — reprise, script,
-- console. Il CLÔT l'affectation, il ne l'efface pas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.clore_affectations_agent_retire()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE circuit_equipe
       SET date_fin = CURRENT_DATE
     WHERE personnel_id = NEW.id AND date_fin IS NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_personnel_retire_clot_affectations ON personnel;
CREATE TRIGGER trg_personnel_retire_clot_affectations
  AFTER UPDATE OF deleted_at ON personnel
  FOR EACH ROW EXECUTE FUNCTION app.clore_affectations_agent_retire();

COMMENT ON FUNCTION app.clore_affectations_agent_retire() IS
  'Clôt les affectations en cours d''un agent retiré du registre. Ne les efface pas : la tournée de la semaine dernière garde l''équipe qui l''a réellement faite.';
