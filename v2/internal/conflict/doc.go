// Author: Subash Karki

// Package conflict provides session conflict detection for Phantom OS.
//
// The Tracker monitors active editing sessions across the app — Composer panes,
// terminal-launched CLI sessions, and future autonomous agents. It detects when
// multiple sessions target the same git repository or edit the same files.
//
// Consumers:
//   - Composer: emits UI warnings when sessions overlap
//   - AI Engine: factors conflict state into strategy selection (risk assessment)
//   - MCP Server: exposes conflict status as a tool for Claude Code
//   - Safety/Wards: can block edits when conflicts are detected
//
// The Tracker is safe for concurrent use from multiple goroutines.
package conflict
