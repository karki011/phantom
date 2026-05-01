-- 011_ai_outcomes_phase.down.sql
-- Drop the phase tag from ai_outcomes. We don't drop the index for
-- ai_outcomes(phase) explicitly — SQLite drops indexes on dropped columns
-- when ALTER TABLE DROP COLUMN runs (3.35+).
--
-- Author: Subash Karki

DROP INDEX IF EXISTS idx_outcomes_phase;
ALTER TABLE ai_outcomes DROP COLUMN phase;
