-- 005_tickets.sql
-- Signalements citoyens (réclamations)
CREATE TABLE IF NOT EXISTS tickets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number       TEXT NOT NULL UNIQUE,
    commune_id          TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    category            TEXT NOT NULL CHECK (category IN ('point_noir','conteneur_plein','conteneur_deteriore','encombrants','dechets_verts','gravats','autre')),
    status              TEXT NOT NULL DEFAULT 'recu' CHECK (status IN ('recu','assigne','en_cours','resolu','rejete')),
    priority            TEXT NOT NULL DEFAULT 'moyenne' CHECK (priority IN ('basse','moyenne','haute','urgente')),
    title               TEXT NOT NULL,
    description         TEXT,
    citizen_id          UUID, -- FK ajoutée après création de la table citoyens (voir 007)
    citizen_name        TEXT,
    citizen_phone       TEXT,
    location_name       TEXT,
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    geom                GEOMETRY(Point, 4326),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ,
    assigned_team       TEXT,
    photo_url           TEXT,
    resolved_photo_url  TEXT,
    qr_code             TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_commune ON tickets (commune_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_geom ON tickets USING GIST (geom);

CREATE OR REPLACE FUNCTION tickets_set_geom() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_geom ON tickets;
CREATE TRIGGER trg_tickets_geom
    BEFORE INSERT OR UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION tickets_set_geom();
