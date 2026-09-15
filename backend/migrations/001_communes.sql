-- 001_communes.sql
-- Référentiel des communes (identité + indicateurs)
-- Note : id conservé en TEXT (slug) pour rester compatible avec les données
-- existantes du front-end (communes_350.json) sans étape de mapping.

CREATE TABLE IF NOT EXISTS communes (
    id                      TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    name_ar                 TEXT NOT NULL,
    gouvernorat             TEXT NOT NULL,
    population              INTEGER NOT NULL DEFAULT 0,
    area_km2                NUMERIC(10,2),
    waste_tons_per_day      NUMERIC(10,2) DEFAULT 0,
    collection_rate         NUMERIC(5,2) DEFAULT 0,      -- %
    cleanliness_index       NUMERIC(5,2) DEFAULT 0,      -- /100
    active_trucks           INTEGER DEFAULT 0,
    total_containers        INTEGER DEFAULT 0,
    open_tickets            INTEGER DEFAULT 0,
    is_pilot                BOOLEAN DEFAULT false,
    lat                     DOUBLE PRECISION,
    lng                     DOUBLE PRECISION,
    geom                    GEOMETRY(Point, 4326),
    logo_url                TEXT,

    phone                   TEXT,
    fax                     TEXT,
    email                   TEXT,
    address                 TEXT,

    has_pcgd                BOOLEAN DEFAULT false,
    pcgd_status              TEXT CHECK (pcgd_status IN ('valide','en_cours','non_existant','a_actualiser')),
    pcgd_validation_date     TEXT,
    waste_management_mode    TEXT CHECK (waste_management_mode IN ('regie_directe','sous_traitance_privee','mixte','delegation_sp')),
    landfill_site             TEXT,
    collection_frequency      TEXT,
    tcl_recovery_rate          NUMERIC(5,2),
    responsible_officer        TEXT,
    responsible_phone          TEXT,
    notes                       TEXT,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communes_gouvernorat ON communes (gouvernorat);
CREATE INDEX IF NOT EXISTS idx_communes_geom ON communes USING GIST (geom);

-- Maintient automatiquement geom à partir de lat/lng, et updated_at à chaque écriture
CREATE OR REPLACE FUNCTION communes_set_geom_and_updated_at() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_communes_geom ON communes;
CREATE TRIGGER trg_communes_geom
    BEFORE INSERT OR UPDATE ON communes
    FOR EACH ROW EXECUTE FUNCTION communes_set_geom_and_updated_at();
