-- 012_decoupage_communal.sql
-- Module "Découpage communal" : frontières administratives réelles des communes
-- (import OSM) + secteurs/zones de collecte internes (base pour l'affectation
-- des tournées, cf. CDC).

-- 1) Frontière administrative réelle de la commune (polygone), en complément
--    du point lat/lng existant. Alimentée par backend/seed/importBoundaries.ts
--    à partir de données OpenStreetMap. Reste NULL pour les communes dont la
--    frontière n'a pas pu être appariée avec fiabilité (voir rapport d'import).
ALTER TABLE communes
    ADD COLUMN IF NOT EXISTS boundary_geom GEOMETRY(MultiPolygon, 4326);

CREATE INDEX IF NOT EXISTS idx_communes_boundary_geom ON communes USING GIST (boundary_geom);

-- 2) Secteurs / zones de collecte : découpage interne d'une commune en zones
--    opérationnelles (base pour l'affectation des tournées et du GeoTracker).
CREATE TABLE IF NOT EXISTS zones_collecte (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id              TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    code                    TEXT,
    description             TEXT,
    color                   TEXT NOT NULL DEFAULT '#2563eb',
    collection_frequency    TEXT,
    estimated_population    INTEGER,
    assigned_prestataire_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    geom                    GEOMETRY(MultiPolygon, 4326) NOT NULL,
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zones_collecte_commune ON zones_collecte (commune_id);
CREATE INDEX IF NOT EXISTS idx_zones_collecte_geom ON zones_collecte USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_zones_collecte_prestataire ON zones_collecte (assigned_prestataire_id);

CREATE OR REPLACE FUNCTION zones_collecte_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_zones_collecte_updated_at ON zones_collecte;
CREATE TRIGGER trg_zones_collecte_updated_at
    BEFORE UPDATE ON zones_collecte
    FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();

-- 3) Lien optionnel véhicule <-> zone de collecte, pour préparer l'affectation
--    réelle des tournées (remplace progressivement le champ libre assigned_zone).
ALTER TABLE vehicules
    ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones_collecte(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicules_zone ON vehicules (zone_id);
