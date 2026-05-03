-- 015_composer_interrupted.down.sql
-- Author: Subash Karki

ALTER TABLE composer_turns DROP COLUMN was_interrupted;
