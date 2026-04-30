-- Drop the persisted assistant response text column.
-- Author: Subash Karki

ALTER TABLE composer_turns DROP COLUMN response_text;
