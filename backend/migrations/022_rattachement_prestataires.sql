-- 022_rattachement_prestataires.sql
--
-- Le rattachement multi-communes cesse de dépendre du moment de la migration.
--
-- La migration 020 a créé utilisateur_communes et repris l'existant par un
-- INSERT ... SELECT. Cette reprise ne vaut que pour les comptes présents CE
-- JOUR-LÀ : sur une installation neuve, les migrations tournent avant que le
-- moindre compte n'existe, et la table reste vide. En production, tout compte
-- prestataire créé ensuite par l'administrateur n'y entre pas davantage —
-- aucune écriture applicative ne l'alimente.
--
-- Effet observé : l'écran « Mes communes sous contrat » du prestataire est
-- vide alors qu'il travaille bel et bien pour une commune. Effet plus grave à
-- terme : le jour où le cloisonnement ne lira plus que cette table (et c'est
-- la direction prise par app.mes_communes()), un prestataire sans ligne ne
-- verrait plus rien du tout.
--
-- Correction : un déclencheur sur users. Le rattachement principal
-- (users.commune_id) se reflète automatiquement dans utilisateur_communes,
-- quel que soit le chemin par lequel le compte a été créé — seed, route
-- d'administration, import futur. Ce qui doit rester vrai en permanence
-- appartient à la base, pas à celui qui écrit dedans.

-- ---------------------------------------------------------------------------
-- 1. Reprise, pour les bases déjà installées
-- ---------------------------------------------------------------------------

INSERT INTO utilisateur_communes (user_id, commune_id)
SELECT u.id, u.commune_id
  FROM users u
 WHERE u.role = 'gestionnaire_prestataire'
   AND u.commune_id IS NOT NULL
   AND u.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Le déclencheur
--
-- SECURITY DEFINER : utilisateur_communes n'est pas ouverte en écriture à
-- l'utilisateur courant, et ne doit pas l'être — un prestataire ne s'accorde
-- pas un contrat à lui-même.
--
-- Ce que le déclencheur NE fait PAS : supprimer un rattachement. Un contrat
-- qui se termine se clôt par une date de fin (traçable, opposable), jamais par
-- la disparition silencieuse d'une ligne. Changer la commune principale d'un
-- compte ajoute donc la nouvelle sans effacer l'ancienne ; c'est à
-- l'administrateur de clore la précédente s'il le souhaite.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.refleter_rattachement_principal() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF NEW.role = 'gestionnaire_prestataire' AND NEW.commune_id IS NOT NULL THEN
    INSERT INTO utilisateur_communes (user_id, commune_id)
    VALUES (NEW.id, NEW.commune_id)
    ON CONFLICT (user_id, commune_id) DO NOTHING;
  END IF;
  RETURN NULL;  -- déclencheur AFTER : la valeur de retour est ignorée
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rattachement_principal ON users;
CREATE TRIGGER trg_rattachement_principal
  AFTER INSERT OR UPDATE OF role, commune_id ON users
  FOR EACH ROW EXECUTE FUNCTION app.refleter_rattachement_principal();

COMMENT ON FUNCTION app.refleter_rattachement_principal() IS
  'Maintient utilisateur_communes en accord avec users.commune_id. N''efface jamais un rattachement : un contrat se clôt par une date de fin, pas par une ligne qui disparaît.';
