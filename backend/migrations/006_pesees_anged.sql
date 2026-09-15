-- 006_pesees_anged.sql
-- Réconciliation pesée pont-bascule (ANGeD) vs estimation embarquée du camion
CREATE TABLE IF NOT EXISTS pesees_anged (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number_anged    TEXT NOT NULL UNIQUE,
    vehicule_id            TEXT REFERENCES vehicules(id) ON DELETE SET NULL,
    truck_reg              TEXT,
    commune_id             TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    landfill_site          TEXT NOT NULL,
    timestamp_in           TIMESTAMPTZ NOT NULL,
    timestamp_out          TIMESTAMPTZ,
    gross_weight_kg        NUMERIC(10,2) NOT NULL,
    tare_weight_kg         NUMERIC(10,2) NOT NULL,
    net_weight_kg          NUMERIC(10,2) GENERATED ALWAYS AS (gross_weight_kg - tare_weight_kg) STORED,
    onboard_estimate_kg    NUMERIC(10,2),
    discrepancy_kg         NUMERIC(10,2) GENERATED ALWAYS AS
                              ((gross_weight_kg - tare_weight_kg) - COALESCE(onboard_estimate_kg, gross_weight_kg - tare_weight_kg)) STORED,
    status                 TEXT NOT NULL DEFAULT 'conforme' CHECK (status IN ('conforme','ecart_acceptable','anomalie_pesee'))
);

CREATE INDEX IF NOT EXISTS idx_pesees_commune ON pesees_anged (commune_id);
CREATE INDEX IF NOT EXISTS idx_pesees_vehicule ON pesees_anged (vehicule_id);

-- Calcule automatiquement l'écart en % et le statut de conformité (>5% = anomalie, cf. spec KPI)
CREATE OR REPLACE FUNCTION pesees_set_status() RETURNS TRIGGER AS $$
DECLARE
    net NUMERIC;
    pct NUMERIC;
BEGIN
    net := NEW.gross_weight_kg - NEW.tare_weight_kg;
    IF NEW.onboard_estimate_kg IS NULL OR NEW.onboard_estimate_kg = 0 THEN
        NEW.status := 'conforme';
        RETURN NEW;
    END IF;
    pct := ABS(net - NEW.onboard_estimate_kg) / NEW.onboard_estimate_kg * 100;
    IF pct > 5 THEN
        NEW.status := 'anomalie_pesee';
    ELSIF pct > 2 THEN
        NEW.status := 'ecart_acceptable';
    ELSE
        NEW.status := 'conforme';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pesees_status ON pesees_anged;
CREATE TRIGGER trg_pesees_status
    BEFORE INSERT OR UPDATE ON pesees_anged
    FOR EACH ROW EXECUTE FUNCTION pesees_set_status();
