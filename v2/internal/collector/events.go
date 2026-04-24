// Package collector — event name constants to replace stringly-typed literals.
// Author: Subash Karki
package collector

// Collector event name constants. Use these instead of raw string literals
// when calling emitEvent so the compiler catches typos.
const (
	EventSessionNew     = "session:new"
	EventSessionUpdate  = "session:update"
	EventSessionEnd     = "session:end"
	EventSessionStale   = "session:stale"
	EventSessionContext = "session:context"
	EventActivity       = "activity"
	EventJSONLRescan    = "jsonl:rescan"
	EventJSONLScanDone  = "jsonl:scan-complete"
	EventTaskNew        = "task:new"
	EventTaskUpdate     = "task:update"

	// Terminal lifecycle events (emitted by linker, listed here for discoverability).
	EventTerminalLinked   = "terminal:linked"
	EventTerminalUnlinked = "terminal:unlinked"
)
