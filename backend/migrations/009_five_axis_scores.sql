-- 009_five_axis_scores.sql
-- Historique des évaluations "5 Axes" par commune (module KpiAndFleetCalculator)
CREATE TABLE IF NOT EXISTS five_axis_scores (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id            TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    governance            NUMERIC(5,2) NOT NULL,
    coverage              NUMERIC(5,2) NOT NULL,
    fleet                 NUMERIC(5,2) NOT NULL,
    citizen_engagement    NUMERIC(5,2) NOT NULL,
    financial             NUMERIC(5,2) NOT NULL,
    overall_score         NUMERIC(5,2) GENERATED ALWAYS AS
                             ((governance + coverage + fleet + citizen_engagement + financial) / 5.0) STORED,
    computed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_five_axis_commune ON five_axis_scores (commune_id, computed_at DESC);
