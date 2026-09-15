-- 007_citoyens.sql
CREATE TABLE IF NOT EXISTS citoyens (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    points            INTEGER NOT NULL DEFAULT 0,
    level             TEXT NOT NULL DEFAULT 'Éco-Citoyen',
    level_badge       TEXT DEFAULT '🌱',
    co2_saved_kg      NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS citizen_badges (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id    UUID NOT NULL REFERENCES citoyens(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    icon          TEXT,
    unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS citizen_rewards (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id     UUID NOT NULL REFERENCES citoyens(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    points_cost    INTEGER NOT NULL,
    partner        TEXT,
    claimed        BOOLEAN NOT NULL DEFAULT false,
    claimed_at     TIMESTAMPTZ
);

-- Relie maintenant tickets.citizen_id (colonne créée en 005) à citoyens
ALTER TABLE tickets
    ADD CONSTRAINT fk_tickets_citizen
    FOREIGN KEY (citizen_id) REFERENCES citoyens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_badges_citizen ON citizen_badges (citizen_id);
CREATE INDEX IF NOT EXISTS idx_rewards_citizen ON citizen_rewards (citizen_id);
