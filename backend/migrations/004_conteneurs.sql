-- 004_conteneurs.sql
CREATE TABLE IF NOT EXISTS conteneurs (
    id               TEXT PRIMARY KEY,
    code             TEXT NOT NULL UNIQUE,
    commune_id       TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    type             TEXT NOT NULL CHECK (type IN ('om_menagers','plastique','carton','verre','organique')),
    fill_level       NUMERIC(5,2) DEFAULT 0,
    battery_level    NUMERIC(5,2) DEFAULT 100,
    temperature_c    NUMERIC(5,2),
    status           TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','a_collecter','alerte_debordement','incendie_detecte')),
    location_name    TEXT,
    lat              DOUBLE PRECISION,
    lng              DOUBLE PRECISION,
    geom             GEOMETRY(Point, 4326),
    last_emptied     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conteneurs_commune ON conteneurs (commune_id);
CREATE INDEX IF NOT EXISTS idx_conteneurs_geom ON conteneurs USING GIST (geom);

CREATE OR REPLACE FUNCTION conteneurs_set_geom() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conteneurs_geom ON conteneurs;
CREATE TRIGGER trg_conteneurs_geom
    BEFORE INSERT OR UPDATE ON conteneurs
    FOR EACH ROW EXECUTE FUNCTION conteneurs_set_geom();
