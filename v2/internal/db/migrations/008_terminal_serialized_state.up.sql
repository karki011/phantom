-- 008_terminal_serialized_state.up.sql
-- Add serialized_state column for @xterm/addon-serialize snapshots.
-- Stores the full xterm visual state (cursor, alt-screen, colors, scrollback)
-- so that on restore we replay the rendered state, not just raw bytes.
-- Author: Subash Karki

ALTER TABLE terminal_sessions ADD COLUMN serialized_state TEXT;
