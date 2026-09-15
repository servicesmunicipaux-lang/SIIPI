-- 008_barbechas.sql
-- Inclusion économique des collecteurs informels (GDMA)
CREATE TABLE IF NOT EXISTS barbechas (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID REFERENCES users(id) ON DELETE SET NULL,
    code_id                     TEXT NOT NULL UNIQUE,
    name                        TEXT NOT NULL,
    cin                         TEXT,
    zone                        TEXT,
    commune_id                  TEXT REFERENCES communes(id) ON DELETE SET NULL,
    vehicle_type                TEXT CHECK (vehicle_type IN ('charette','tricycle_electrique','triporteur_moteur')),
    collected_total_kg          NUMERIC(10,2) NOT NULL DEFAULT 0,
    earnings_this_month_tnd     NUMERIC(10,2) NOT NULL DEFAULT 0,
    health_insurance_status     TEXT NOT NULL DEFAULT 'en_cours' CHECK (health_insurance_status IN ('active','en_cours')),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS barbecha_deliveries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbecha_id    UUID NOT NULL REFERENCES barbechas(id) ON DELETE CASCADE,
    delivered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    material       TEXT NOT NULL CHECK (material IN ('PET_plastique','PEHD','Carton','Aluminium','Cuivre')),
    weight_kg      NUMERIC(10,2) NOT NULL,
    amount_tnd     NUMERIC(10,2) NOT NULL,
    hub_name       TEXT
);

-- Met à jour automatiquement les totaux du barbécha à chaque nouvelle pesée
CREATE OR REPLACE FUNCTION barbecha_deliveries_apply() RETURNS TRIGGER AS $$
BEGIN
    UPDATE barbechas
       SET collected_total_kg = collected_total_kg + NEW.weight_kg,
           earnings_this_month_tnd = earnings_this_month_tnd + NEW.amount_tnd
     WHERE id = NEW.barbecha_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_barbecha_delivery ON barbecha_deliveries;
CREATE TRIGGER trg_barbecha_delivery
    AFTER INSERT ON barbecha_deliveries
    FOR EACH ROW EXECUTE FUNCTION barbecha_deliveries_apply();

CREATE INDEX IF NOT EXISTS idx_barbecha_deliveries_barbecha ON barbecha_deliveries (barbecha_id);
