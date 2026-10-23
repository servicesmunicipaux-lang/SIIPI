-- ============================================================================
-- 085 — Le connecteur GPS générique (lot 17.4a)
-- docs/specs_metier/DECISIONS_2026-10-20.md § 8 ; FEUILLE_DE_ROUTE.md § 10.4 ;
-- décisions du 23/10/2026 (webhook signé HMAC, traces gardées, commune seule).
--
-- Un connecteur PARAMÉTRÉ, pas programmé : aucun code propre à un fournisseur.
-- Chaque commune décrit le sien — interrogé par SIIPI (pull) ou qui envoie
-- (push, webhook signé) — et la correspondance entre ses champs JSON et une
-- position : boîtier, latitude, longitude, horodatage.
--
-- CE QUE LA BASE TIENT, QUOI QUE FASSE L'API :
--   - des positions D'ENGINS seulement (ligne rouge 3) : une trace porte un
--     engin, jamais une personne ; aucune colonne ne mène au personnel ;
--   - une position n'est rattachée à un engin que par la correspondance
--     boîtier → engin que la commune a saisie, à la date de la position ; sinon
--     elle est SIGNALÉE (gps_positions_non_rattachees), jamais rattachée au
--     hasard ; un boîtier ne se rattache qu'à un engin de SA commune ;
--   - une position hors de Tunisie, ou à l'horodatage illisible ou impossible,
--     n'entre jamais dans les traces ;
--   - la provenance « GPS fournisseur » : une trace ne modifie jamais un
--     circuit, un point relevé ni un engin — elle s'ajoute, à part ;
--   - les secrets (jeton du fournisseur, secret du webhook) vivent dans une table
--     à part, CHIFFRÉS par l'API (la clé n'est que dans l'environnement), que le
--     rôle de l'application ne peut pas lire, et qu'aucun journal d'audit ne
--     recopie.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- La configuration du fournisseur, une par commune
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gps_fournisseurs (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id                 TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nom                        TEXT NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 120),
    mode                       TEXT NOT NULL CHECK (mode IN ('pull', 'push')),
    url                        TEXT CHECK (url IS NULL OR url ~ '^https?://'),
    cadence_minutes            INTEGER NOT NULL DEFAULT 5 CHECK (cadence_minutes BETWEEN 1 AND 1440),
    authentification           TEXT NOT NULL DEFAULT 'bearer' CHECK (authentification IN ('bearer', 'entete', 'parametre', 'aucune')),
    nom_champ_auth             TEXT CHECK (nom_champ_auth IS NULL OR nom_champ_auth ~ '^[A-Za-z0-9_-]{1,64}$'),
    correspondance             JSONB NOT NULL,
    actif                      BOOLEAN NOT NULL DEFAULT false,
    derniere_interrogation_le  TIMESTAMPTZ,
    dernier_releve_recu_le     TIMESTAMPTZ,
    dernier_echec_le           TIMESTAMPTZ,
    dernier_echec_message      TEXT,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                 UUID,
    deleted_at                 TIMESTAMPTZ,
    deleted_by                 UUID,
    CONSTRAINT gps_url_en_pull CHECK (mode <> 'pull' OR url IS NOT NULL),
    CONSTRAINT gps_champ_auth_nomme CHECK (authentification NOT IN ('entete', 'parametre') OR nom_champ_auth IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gps_fournisseur_commune ON gps_fournisseurs (commune_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE gps_fournisseurs IS
  'Le fournisseur GPS d''une commune (lot 17.4a) : mode pull (SIIPI interroge l''URL à la cadence) ou push (webhook signé), authentification, correspondance des champs JSON, état du dernier relevé. Paramétré par la commune ; la FNCT lit ; le prestataire ne lit pas. Aucun secret ici : voir gps_secrets.';
COMMENT ON COLUMN gps_fournisseurs.correspondance IS
  'Les chemins, en notation pointée, des champs du JSON du fournisseur : liste (le tableau des positions ; vide si le corps en est un), boitier, latitude, longitude, horodatage, format_horodatage (iso, epoch_s, epoch_ms), et en option vitesse et cap.';
COMMENT ON COLUMN gps_fournisseurs.dernier_releve_recu_le IS
  'La dernière fois que des positions sont arrivées, quel que soit leur sort. Un fournisseur en panne garde cette date : l''écran la montre, l''échec ne bloque rien.';
COMMENT ON COLUMN gps_fournisseurs.dernier_echec_message IS
  'Le dernier échec d''interrogation ou de lecture, sans jeton ni paramètre d''adresse : l''API les retire avant d''écrire.';

-- ---------------------------------------------------------------------------
-- Les secrets : chiffrés par l'API, illisibles pour l'application, jamais audités
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gps_secrets (
    fournisseur_id  UUID NOT NULL REFERENCES gps_fournisseurs(id) ON DELETE CASCADE,
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nature          TEXT NOT NULL CHECK (nature IN ('jeton', 'webhook')),
    valeur          BYTEA NOT NULL,
    enregistre_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (fournisseur_id, nature)
);
COMMENT ON TABLE gps_secrets IS
  'Le jeton du fournisseur et le secret du webhook d''une commune (lot 17.4a), CHIFFRÉS par l''API (AES-256-GCM, clé SIIPI_SECRET_GPS, hors de la base). Le rôle de l''application n''a aucun droit sur cette table : il écrit par app.gps_enregistrer_secret() et ne lit que la date (app.gps_secrets_enregistres). Sans déclencheur d''audit : le journal ne recopie jamais un secret, même chiffré.';
COMMENT ON COLUMN gps_secrets.valeur IS 'Vecteur d''initialisation (12 octets), étiquette d''authentification (16 octets), puis le texte chiffré. Jamais en clair.';

ALTER TABLE gps_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_secrets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON gps_secrets FROM siipi_app;

-- ---------------------------------------------------------------------------
-- La correspondance boîtier → engin, datée
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gps_boitiers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    fournisseur_id  UUID NOT NULL REFERENCES gps_fournisseurs(id) ON DELETE CASCADE,
    identifiant     TEXT NOT NULL CHECK (length(btrim(identifiant)) BETWEEN 1 AND 120),
    vehicule_id     TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
    date_debut      TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_fin        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    CONSTRAINT gps_boitier_periode CHECK (date_fin IS NULL OR date_fin > date_debut)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gps_boitier_actif ON gps_boitiers (fournisseur_id, identifiant) WHERE date_fin IS NULL;
COMMENT ON TABLE gps_boitiers IS
  'Quel boîtier équipe quel engin, et depuis quand (lot 17.4a). Saisi par la commune. Un boîtier qui change d''engin se CLÔT (date_fin) : la trace de la semaine dernière garde l''engin qui la portait. Un boîtier ne se rattache qu''à un engin de la commune du fournisseur.';

CREATE OR REPLACE FUNCTION app.gps_boitier_coherent() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM gps_fournisseurs f WHERE f.id = NEW.fournisseur_id AND f.commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'GPS_FOURNISSEUR_AUTRE_COMMUNE: ce fournisseur n''est pas celui de la commune.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vehicules v WHERE v.id = NEW.vehicule_id AND v.commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'GPS_ENGIN_AUTRE_COMMUNE: un boîtier ne se rattache qu''à un engin de la commune.';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.vehicule_id, NEW.identifiant, NEW.date_debut, NEW.fournisseur_id)
                          IS DISTINCT FROM (OLD.vehicule_id, OLD.identifiant, OLD.date_debut, OLD.fournisseur_id) THEN
    RAISE EXCEPTION 'GPS_BOITIER_FIGE: une correspondance ne se réécrit pas ; clôturez-la et saisissez la nouvelle.';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_gps_boitier_coherent ON gps_boitiers;
CREATE TRIGGER trg_gps_boitier_coherent BEFORE INSERT OR UPDATE ON gps_boitiers
  FOR EACH ROW EXECUTE FUNCTION app.gps_boitier_coherent();

-- ---------------------------------------------------------------------------
-- Les traces des engins, et les positions signalées
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS traces_engins (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    vehicule_id     TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
    fournisseur_id  UUID NOT NULL REFERENCES gps_fournisseurs(id) ON DELETE CASCADE,
    boitier         TEXT NOT NULL,
    horodatage      TIMESTAMPTZ NOT NULL,
    geom            geometry(Point, 4326) NOT NULL,
    vitesse_kmh     NUMERIC(6, 1) CHECK (vitesse_kmh IS NULL OR vitesse_kmh BETWEEN 0 AND 300),
    cap             SMALLINT CHECK (cap IS NULL OR cap BETWEEN 0 AND 359),
    recu_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance      TEXT NOT NULL DEFAULT 'gps_fournisseur' CHECK (provenance = 'gps_fournisseur'),
    agregee_le      TIMESTAMPTZ,
    CONSTRAINT trace_en_tunisie CHECK (ST_X(geom) BETWEEN 7.5 AND 11.7 AND ST_Y(geom) BETWEEN 30.2 AND 37.6),
    CONSTRAINT trace_horodatage_possible CHECK (horodatage >= TIMESTAMPTZ '2020-01-01 00:00:00+01' AND horodatage <= recu_le + interval '10 minutes'),
    CONSTRAINT uq_trace_position UNIQUE (fournisseur_id, boitier, horodatage)
);
CREATE INDEX IF NOT EXISTS idx_traces_engin_temps ON traces_engins (vehicule_id, horodatage DESC);
CREATE INDEX IF NOT EXISTS idx_traces_commune_temps ON traces_engins (commune_id, horodatage DESC);
CREATE INDEX IF NOT EXISTS idx_traces_geom ON traces_engins USING GIST (geom);

COMMENT ON TABLE traces_engins IS
  'Les positions des ENGINS reçues d''un fournisseur GPS (lot 17.4a), provenance « gps_fournisseur ». Jamais d''une personne (ligne rouge 3). Une trace ne modifie aucun circuit, aucun point relevé, aucun engin : elle s''ajoute, à part. Écrites par app.enregistrer_positions_gps() seulement ; gardées entières pour l''instant (décision du 23/10/2026). Une position reçue deux fois n''est gardée qu''une fois.';
COMMENT ON COLUMN traces_engins.horodatage IS 'L''instant de la position, tel que le fournisseur le donne. Ni avant 2020, ni plus de 10 minutes après sa réception : sinon la position est signalée, pas tracée.';
COMMENT ON COLUMN traces_engins.recu_le IS 'L''instant où SIIPI a reçu la position.';
COMMENT ON COLUMN traces_engins.agregee_le IS 'Date à laquelle cette trace a été résumée. NULL = trace brute.';

CREATE TABLE IF NOT EXISTS gps_positions_non_rattachees (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    commune_id       TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    fournisseur_id   UUID NOT NULL REFERENCES gps_fournisseurs(id) ON DELETE CASCADE,
    boitier          TEXT,
    horodatage_brut  TEXT,
    horodatage       TIMESTAMPTZ,
    lat              DOUBLE PRECISION,
    lng              DOUBLE PRECISION,
    motif            TEXT NOT NULL CHECK (motif IN ('boitier_inconnu', 'hors_tunisie', 'horodatage_invalide', 'coordonnees_invalides')),
    recu_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gps_non_rattachees ON gps_positions_non_rattachees (commune_id, boitier, recu_le DESC);
COMMENT ON TABLE gps_positions_non_rattachees IS
  'Les positions reçues qu''aucune trace n''a prises (lot 17.4a), avec leur motif : boîtier sans engin à cette date, hors de Tunisie, horodatage illisible ou impossible, coordonnées illisibles. SIGNALÉES à la commune, jamais rattachées au hasard ; un boîtier rattaché ensuite ne les reprend pas en silence.';
COMMENT ON COLUMN gps_positions_non_rattachees.horodatage_brut IS 'L''horodatage tel que le fournisseur l''a envoyé : c''est lui qui dit pourquoi il était illisible (un format de date qui a changé, par exemple).';

-- ---------------------------------------------------------------------------
-- Le cloisonnement : la commune écrit, la FNCT lit, le prestataire ne lit pas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.gps_lit(p_commune text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.is_fnct() OR (app.current_role_name() = 'admin_commune' AND p_commune = ANY (app.mes_communes())) $$;
CREATE OR REPLACE FUNCTION app.gps_ecrit(p_commune text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.current_role_name() = 'admin_commune' AND p_commune = ANY (app.mes_communes()) $$;
COMMENT ON FUNCTION app.gps_lit(text) IS 'Lot 17.4a : la FNCT et la commune lisent la configuration GPS et les traces ; le prestataire non.';
COMMENT ON FUNCTION app.gps_ecrit(text) IS 'Lot 17.4a : la commune seule paramètre son fournisseur GPS (décision du 23/10/2026) ; la FNCT lit.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gps_fournisseurs', 'gps_boitiers', 'traces_engins', 'gps_positions_non_rattachees'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.gps_lit(commune_id))', t || '_select', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS gps_fournisseurs_select ON gps_fournisseurs;
CREATE POLICY gps_fournisseurs_select ON gps_fournisseurs FOR SELECT USING (deleted_at IS NULL AND app.gps_lit(commune_id));
DROP POLICY IF EXISTS gps_fournisseurs_insert ON gps_fournisseurs;
CREATE POLICY gps_fournisseurs_insert ON gps_fournisseurs FOR INSERT WITH CHECK (app.gps_ecrit(commune_id));
DROP POLICY IF EXISTS gps_fournisseurs_update ON gps_fournisseurs;
CREATE POLICY gps_fournisseurs_update ON gps_fournisseurs FOR UPDATE
  USING (deleted_at IS NULL AND app.gps_ecrit(commune_id)) WITH CHECK (app.gps_ecrit(commune_id));
DROP POLICY IF EXISTS gps_boitiers_insert ON gps_boitiers;
CREATE POLICY gps_boitiers_insert ON gps_boitiers FOR INSERT WITH CHECK (app.gps_ecrit(commune_id));
DROP POLICY IF EXISTS gps_boitiers_update ON gps_boitiers;
CREATE POLICY gps_boitiers_update ON gps_boitiers FOR UPDATE USING (app.gps_ecrit(commune_id)) WITH CHECK (app.gps_ecrit(commune_id));

GRANT SELECT, INSERT, UPDATE ON gps_fournisseurs TO siipi_app;
GRANT SELECT, INSERT, UPDATE ON gps_boitiers TO siipi_app;
-- Les traces et les positions signalées ne s'écrivent que par app.enregistrer_positions_gps().
GRANT SELECT ON traces_engins, gps_positions_non_rattachees TO siipi_app;
REVOKE INSERT, UPDATE, DELETE ON traces_engins, gps_positions_non_rattachees FROM siipi_app;

-- L'audit : la configuration (pas l'état du dernier relevé, qui change à chaque
-- interrogation et noierait le journal) et les correspondances.
DROP TRIGGER IF EXISTS trg_audit_gps_fournisseurs ON gps_fournisseurs;
CREATE TRIGGER trg_audit_gps_fournisseurs
  AFTER INSERT OR DELETE OR UPDATE OF nom, mode, url, cadence_minutes, authentification, nom_champ_auth, correspondance, actif, deleted_at
  ON gps_fournisseurs FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_gps_boitiers ON gps_boitiers;
CREATE TRIGGER trg_audit_gps_boitiers AFTER INSERT OR UPDATE OR DELETE ON gps_boitiers
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- ---------------------------------------------------------------------------
-- Les secrets, écrits et datés sans jamais être lus par l'application
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.gps_enregistrer_secret(p_fournisseur uuid, p_nature text, p_valeur bytea) RETURNS timestamptz
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_commune text;
  v_le timestamptz;
BEGIN
  SELECT commune_id INTO v_commune FROM gps_fournisseurs WHERE id = p_fournisseur AND deleted_at IS NULL;
  IF v_commune IS NULL OR NOT app.gps_ecrit(v_commune) THEN
    RAISE EXCEPTION 'GPS_INTROUVABLE: fournisseur introuvable.';
  END IF;
  INSERT INTO gps_secrets (fournisseur_id, commune_id, nature, valeur) VALUES (p_fournisseur, v_commune, p_nature, p_valeur)
  ON CONFLICT (fournisseur_id, nature) DO UPDATE SET valeur = EXCLUDED.valeur, enregistre_le = now()
  RETURNING enregistre_le INTO v_le;
  RETURN v_le;
END;
$fn$;
REVOKE ALL ON FUNCTION app.gps_enregistrer_secret(uuid, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.gps_enregistrer_secret(uuid, text, bytea) TO siipi_app;

CREATE OR REPLACE FUNCTION app.gps_secrets_enregistres(p_fournisseur uuid)
  RETURNS TABLE (nature text, enregistre_le timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT s.nature, s.enregistre_le FROM gps_secrets s
    WHERE s.fournisseur_id = p_fournisseur AND app.gps_lit(s.commune_id) $$;
REVOKE ALL ON FUNCTION app.gps_secrets_enregistres(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.gps_secrets_enregistres(uuid) TO siipi_app;

-- ---------------------------------------------------------------------------
-- La réception des positions : le seul chemin vers les traces
-- ---------------------------------------------------------------------------
-- p_positions : un tableau d'objets déjà lus par l'API selon la correspondance
-- du fournisseur — {boitier, lat, lng, horodatage (ISO 8601, ou null s'il était
-- illisible), horodatage_brut, vitesse, cap}. La base, elle, décide du sort de
-- chacun : tracée, doublon, ou signalée avec son motif.
CREATE OR REPLACE FUNCTION app.enregistrer_positions_gps(p_fournisseur uuid, p_positions jsonb)
  RETURNS TABLE (recues integer, enregistrees integer, doublons integer, signalees integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_commune text;
  p jsonb;
  v_boitier text; v_lat double precision; v_lng double precision; v_horo timestamptz;
  v_engin text; v_motif text; v_n integer;
  n_recues integer := 0; n_enr integer := 0; n_dbl integer := 0; n_sig integer := 0;
BEGIN
  SELECT commune_id INTO v_commune FROM gps_fournisseurs WHERE id = p_fournisseur AND deleted_at IS NULL;
  IF v_commune IS NULL THEN
    RAISE EXCEPTION 'GPS_INTROUVABLE: fournisseur introuvable.';
  END IF;
  IF jsonb_typeof(p_positions) <> 'array' THEN
    RAISE EXCEPTION 'GPS_POSITIONS: un tableau de positions est attendu.';
  END IF;

  FOR p IN SELECT * FROM jsonb_array_elements(p_positions) LOOP
    n_recues := n_recues + 1;
    v_motif := NULL; v_engin := NULL;
    v_boitier := nullif(btrim(p->>'boitier'), '');
    BEGIN
      v_lat := (p->>'lat')::double precision;
      v_lng := (p->>'lng')::double precision;
    EXCEPTION WHEN others THEN
      v_lat := NULL; v_lng := NULL;
    END;
    BEGIN
      v_horo := (p->>'horodatage')::timestamptz;
    EXCEPTION WHEN others THEN
      v_horo := NULL;
    END;

    IF v_horo IS NULL OR v_horo < TIMESTAMPTZ '2020-01-01 00:00:00+01' OR v_horo > now() + interval '10 minutes' THEN
      v_motif := 'horodatage_invalide';
    ELSIF v_lat IS NULL OR v_lng IS NULL OR v_lat NOT BETWEEN -90 AND 90 OR v_lng NOT BETWEEN -180 AND 180 THEN
      v_motif := 'coordonnees_invalides';
    ELSIF v_lng NOT BETWEEN 7.5 AND 11.7 OR v_lat NOT BETWEEN 30.2 AND 37.6 THEN
      v_motif := 'hors_tunisie';
    ELSE
      SELECT b.vehicule_id INTO v_engin FROM gps_boitiers b
       WHERE b.fournisseur_id = p_fournisseur AND b.identifiant = v_boitier
         AND b.date_debut <= v_horo AND (b.date_fin IS NULL OR v_horo < b.date_fin)
       ORDER BY b.date_debut DESC LIMIT 1;
      IF v_engin IS NULL THEN v_motif := 'boitier_inconnu'; END IF;
    END IF;

    IF v_motif IS NOT NULL THEN
      INSERT INTO gps_positions_non_rattachees (commune_id, fournisseur_id, boitier, horodatage_brut, horodatage, lat, lng, motif)
      VALUES (v_commune, p_fournisseur, v_boitier, left(p->>'horodatage_brut', 120), v_horo, v_lat, v_lng, v_motif);
      n_sig := n_sig + 1;
      CONTINUE;
    END IF;

    INSERT INTO traces_engins (commune_id, vehicule_id, fournisseur_id, boitier, horodatage, geom, vitesse_kmh, cap)
    VALUES (v_commune, v_engin, p_fournisseur, v_boitier, v_horo, ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326),
            CASE WHEN (p->>'vitesse') ~ '^[0-9]+(\.[0-9]+)?$' AND (p->>'vitesse')::numeric <= 300 THEN (p->>'vitesse')::numeric END,
            CASE WHEN (p->>'cap') ~ '^[0-9]+(\.[0-9]+)?$' AND (p->>'cap')::numeric < 360 THEN floor((p->>'cap')::numeric)::smallint END)
    ON CONFLICT ON CONSTRAINT uq_trace_position DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 1 THEN n_enr := n_enr + 1; ELSE n_dbl := n_dbl + 1; END IF;
  END LOOP;

  IF n_recues > 0 THEN
    UPDATE gps_fournisseurs SET dernier_releve_recu_le = now() WHERE id = p_fournisseur;
  END IF;
  RETURN QUERY SELECT n_recues, n_enr, n_dbl, n_sig;
END;
$fn$;
REVOKE ALL ON FUNCTION app.enregistrer_positions_gps(uuid, jsonb) FROM PUBLIC;
COMMENT ON FUNCTION app.enregistrer_positions_gps(uuid, jsonb) IS
  'Lot 17.4a : le seul chemin vers traces_engins. Chaque position est tracée (engin de la correspondance à sa date), comptée en doublon, ou signalée avec son motif (horodatage illisible ou impossible, coordonnées illisibles, hors de Tunisie, boîtier sans engin) — jamais rattachée au hasard. Appelée par le service GPS de l''API (interrogation, webhook), pas par une route.';
