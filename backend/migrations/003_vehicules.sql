-- 003_vehicules.sql
CREATE TABLE IF NOT EXISTS vehicules (
    id                   TEXT PRIMARY KEY,
    registration         TEXT NOT NULL UNIQUE,
    commune_id           TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    type                 TEXT NOT NULL CHECK (type IN ('benne_tasseuse','camion_ampliroll','balayeuse','tracteur_remorque')),
    capacity_m3          NUMERIC(6,2),
    status               TEXT NOT NULL DEFAULT 'au_depot' CHECK (status IN ('en_tournee','au_depot','en_decharge','en_maintenance')),
    current_speed_kmh    NUMERIC(5,2) DEFAULT 0,
    fuel_level_percent   NUMERIC(5,2) DEFAULT 0,
    current_weight_tons  NUMERIC(6,2) DEFAULT 0,
    max_weight_tons      NUMERIC(6,2),
    driver_name          TEXT,
    assigned_zone        TEXT,
    lat                  DOUBLE PRECISION,
    lng                  DOUBLE PRECISION,
    geom                 GEOMETRY(Point, 4326),
    last_update          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_stops      INTEGER DEFAULT 0,
    total_stops          INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_vehicules_commune ON vehicules (commune_id);
CREATE INDEX IF NOT EXISTS idx_vehicules_geom ON vehicules USING GIST (geom);

CREATE OR REPLACE FUNCTION vehicules_set_geom() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    NEW.last_update := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vehicules_geom ON vehicules;
CREATE TRIGGER trg_vehicules_geom
    BEFORE INSERT OR UPDATE ON vehicules
    FOR EACH ROW EXECUTE FUNCTION vehicules_set_geom();
