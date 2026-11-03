-- =========================================================================
-- 094 — Le journal d'audit ne garde pas la position d'un engin.
-- Constat du 02/11/2026, campagne `position-engins`.
--
-- La migration 014 déclare le déclencheur d'audit de `vehicules` avec la liste
-- des champs alimentés par la télématique (position, vitesse, carburant…) et ne
-- journalise pas une mise à jour qui ne touche qu'eux. Mais dès qu'un autre champ
-- change dans la même écriture — une remontée qui passe l'engin « en tournée » —,
-- la ligne de journal recopiait la ligne entière, position comprise. Le contrat de
-- PATCH /trucks/{id}/position dit ces remontées « volontairement exclues du
-- journal d'audit » ; elles ne l'étaient qu'à moitié.
--
-- La position d'un engin, croisée avec le carnet de bord qui nomme son chauffeur,
-- dit où était une personne à une heure donnée : un journal conservé cinq ans
-- n'a pas à la tenir. Les champs ignorés ne sont donc plus écrits du tout, ni
-- dans les données d'avant et d'après, ni dans la liste des champs changés. Seul
-- `vehicules` déclare de tels champs ; les autres tables ne changent pas.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.enregistrer_changement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_old        jsonb;
  v_new        jsonb;
  v_champs     text[];
  v_ignores    text[] := COALESCE(TG_ARGV, ARRAY[]::text[]);
  v_commune    text;
  v_record_id  text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  -- Un mot de passe, même haché, n'a rien à faire dans un journal conservé
  -- cinq ans : on le retire des deux côtés de la comparaison.
  v_old := v_old - 'password_hash';
  v_new := v_new - 'password_hash';

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(cle ORDER BY cle), ARRAY[]::text[])
      INTO v_champs
      FROM jsonb_object_keys(v_new) AS cle
     WHERE v_new -> cle IS DISTINCT FROM v_old -> cle;

    -- Rien n'a changé : pas de ligne de journal.
    IF array_length(v_champs, 1) IS NULL THEN
      RETURN NULL;
    END IF;

    -- Mise à jour purement télématique (position GPS, niveau de carburant...) :
    -- ces écritures peuvent arriver toutes les quelques secondes par véhicule.
    -- Les journaliser noierait l'historique métier sous le bruit machine et
    -- ferait grossir la base sans rien prouver d'utile.
    IF v_champs <@ v_ignores THEN
      RETURN NULL;
    END IF;

    SELECT COALESCE(array_agg(c ORDER BY c), ARRAY[]::text[])
      INTO v_champs
      FROM unnest(v_champs) AS c
     WHERE c <> ALL (v_ignores);
  END IF;

  -- Les champs ignorés ne sont pas écrits non plus quand la ligne est
  -- journalisée pour un autre champ (voir l'en-tête de la migration).
  v_old := v_old - v_ignores;
  v_new := v_new - v_ignores;

  v_record_id := COALESCE(v_new ->> 'id', v_old ->> 'id');

  -- Rattachement du journal à une commune, pour que chaque commune ne voie que
  -- son propre historique. La table communes n'a pas de colonne commune_id :
  -- c'est son identifiant qui joue ce rôle.
  IF TG_TABLE_NAME = 'communes' THEN
    v_commune := v_record_id;
  ELSE
    v_commune := COALESCE(v_new ->> 'commune_id', v_old ->> 'commune_id');
  END IF;

  INSERT INTO audit_log (
    table_name, record_id, operation, commune_id,
    changed_by, changed_by_role, changed_fields, old_data, new_data
  ) VALUES (
    TG_TABLE_NAME, v_record_id, TG_OP, v_commune,
    app.current_user_id(), app.current_role_name(), v_champs, v_old, v_new
  );

  RETURN NULL; -- déclencheur AFTER : la valeur de retour est ignorée
END;
$$;

-- Les lignes déjà au journal sont nettoyées de la même façon, comme la
-- migration 056 l'a fait pour l'identité des pré-collecteurs : une base migrée
-- (et non installée neuve) garderait sinon cinq ans les positions passées. La
-- liste est celle des arguments du déclencheur de vehicules (014) ; la liste des
-- champs changés d'une création ou d'un retrait, nulle, reste nulle.
UPDATE audit_log
   SET old_data = old_data - ARRAY['lat', 'lng', 'geom', 'current_speed_kmh', 'fuel_level_percent',
                                   'current_weight_tons', 'completed_stops', 'last_update', 'updated_at'],
       new_data = new_data - ARRAY['lat', 'lng', 'geom', 'current_speed_kmh', 'fuel_level_percent',
                                   'current_weight_tons', 'completed_stops', 'last_update', 'updated_at'],
       changed_fields = CASE WHEN changed_fields IS NULL THEN NULL
                             ELSE ARRAY(SELECT f FROM unnest(changed_fields) AS f
                                         WHERE f NOT IN ('lat', 'lng', 'geom', 'current_speed_kmh', 'fuel_level_percent',
                                                         'current_weight_tons', 'completed_stops', 'last_update', 'updated_at')
                                         ORDER BY f)
                        END
 WHERE table_name = 'vehicules'
   AND (old_data ?| ARRAY['lat', 'lng', 'geom', 'current_speed_kmh', 'fuel_level_percent',
                          'current_weight_tons', 'completed_stops', 'last_update', 'updated_at']
     OR new_data ?| ARRAY['lat', 'lng', 'geom', 'current_speed_kmh', 'fuel_level_percent',
                          'current_weight_tons', 'completed_stops', 'last_update', 'updated_at']);

COMMENT ON FUNCTION app.enregistrer_changement() IS
  'Déclencheur d''audit générique. Les arguments du déclencheur nomment les champs ignorés (télématique de vehicules) : une mise à jour qui ne touche qu''eux n''est pas journalisée, et ils ne sont jamais écrits au journal, même quand la ligne l''est pour un autre champ (094).';
