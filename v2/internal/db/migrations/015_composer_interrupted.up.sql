-- 015_composer_interrupted.up.sql — Track interrupted (crashed) composer sessions
-- Author: Subash Karki
--
-- When the app crashes or is force-quit, turns that were still "running" are
-- orphaned. On next boot, reapZombieSessions marks them as interrupted so the
-- sidebar can prompt the user to resume where they left off.

ALTER TABLE composer_turns ADD COLUMN was_interrupted INTEGER NOT NULL DEFAULT 0;
