// Package collector provides filesystem collectors that watch Claude Code's
// artifacts and populate the Phantom SQLite database.
// Author: Subash Karki
package collector

import "context"

// Collector is the interface every filesystem collector must implement.
// Start begins watching in background goroutines; Stop gracefully shuts down.
type Collector interface {
	Name() string
	Start(ctx context.Context) error
	Stop() error
}
