-- 011_tickets_workflow_cdc.sql
--
-- Workflow de traitement des réclamations conforme au cahier des charges FNCT/ANGeD :
-- l'Admin Commune peut accepter ou refuser une réclamation citoyenne, et la
-- transférer à un Gestionnaire Prestataire (privé) ; ce dernier peut uniquement la
-- traiter (passer en cours / résolue) mais jamais la refuser. La logique de
-- permissions vit dans l'API (backend/src/routes/tickets.routes.ts) ; cette
-- migration ajoute les colonnes nécessaires pour la tracer correctement :
--
--   - assigned_prestataire_id : le compte Gestionnaire Prestataire précis auquel
--     le ticket a été transféré (permet de vérifier qu'un prestataire n'agit que
--     sur SES tickets, pas ceux transférés à un confrère).
--   - rejection_reason : motif obligatoire quand l'Admin Commune refuse un ticket.
--   - accepted_at : horodatage de la prise en charge par l'Admin Commune.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_prestataire_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_prestataire ON tickets (assigned_prestataire_id);

COMMENT ON COLUMN tickets.assigned_prestataire_id IS
  'Gestionnaire Prestataire (privé) auquel le ticket a été transféré par l''Admin Commune — cf. CDC, workflow réclamations.';
COMMENT ON COLUMN tickets.rejection_reason IS
  'Motif du refus, saisi par l''Admin Commune (le Gestionnaire Prestataire ne peut jamais refuser un ticket).';
