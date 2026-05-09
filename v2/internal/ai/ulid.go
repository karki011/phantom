// Author: Subash Karki
package ai

import (
	"crypto/rand"
	"sync"
	"time"

	"github.com/oklog/ulid/v2"
)

var (
	entropy     = ulid.Monotonic(rand.Reader, 0)
	entropyLock sync.Mutex
)

// NewEventID generates a time-ordered ULID for AI events.
// ULIDs are lexicographically sortable and embed a millisecond timestamp,
// making them ideal for event streams where ordering matters.
func NewEventID() string {
	entropyLock.Lock()
	defer entropyLock.Unlock()
	return ulid.MustNew(ulid.Timestamp(time.Now()), entropy).String()
}
