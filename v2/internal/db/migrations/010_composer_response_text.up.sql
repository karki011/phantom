-- Persist the assistant's streamed response text so re-opened sessions show
-- the full conversation (not just user prompts + edit cards).
-- Author: Subash Karki

ALTER TABLE composer_turns ADD COLUMN response_text TEXT;
