-- 002_users.sql
-- Comptes et rôles (RBAC). Remplace le sélecteur de rôle "libre" du prototype.

CREATE TABLE IF NOT EXISTS users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            TEXT NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    full_name        TEXT NOT NULL,
    phone            TEXT,
    role             TEXT NOT NULL CHECK (role IN (
                        'national_admin',    -- FNCT / ANGeD
                        'municipal_manager',  -- Directeur des services municipaux
                        'citizen',
                        'field_agent',
                        'gdma_actor'
                     )),
    commune_id       TEXT REFERENCES communes(id) ON DELETE SET NULL, -- requis pour municipal_manager / field_agent
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_commune ON users (commune_id);
