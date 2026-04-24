// service.go coordinates stream parsing, DB persistence, and live tailing.
// Author: Subash Karki
package stream

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
)

// EventHook is called for every event during live tailing.
// Implementations may trigger side effects like safety evaluation and session pausing.
type EventHook func(ctx context.Context, ev *Event)

// Service coordinates parsing, storage, and live tailing of session JSONL files.
type Service struct {
	store     *Store
	tailers   sync.Map // sessionID (string) → context.CancelFunc
	emitEvent func(name string, data interface{})
	eventHook EventHook
}

// NewService creates a Service backed by the writer DB connection.
// emitEvent should be wailsRuntime.EventsEmit (or a test stub).
func NewService(writer *sql.DB, emitEvent func(string, interface{})) *Service {
	return &Service{
		store:     NewStore(writer),
		emitEvent: emitEvent,
	}
}

// ParseSession reads all events from a session's JSONL file, stores them, and
// returns the count of events persisted.
func (svc *Service) ParseSession(ctx context.Context, sessionID, jsonlPath string) (int, error) {
	sc := NewScanner(sessionID, jsonlPath)
	events, err := sc.ScanAll()
	if err != nil {
		return 0, fmt.Errorf("stream/service: scan %s: %w", jsonlPath, err)
	}
	if len(events) == 0 {
		return 0, nil
	}

	if err := svc.store.SaveBatch(ctx, events); err != nil {
		return 0, fmt.Errorf("stream/service: save batch: %w", err)
	}

	svc.emitEvent("stream:batch", map[string]interface{}{
		"session_id": sessionID,
		"count":      len(events),
	})

	return len(events), nil
}

// StartTailing begins live-tailing a session's JSONL file.
// Each new event is stored and emitted via a Wails event.
// Calling StartTailing for an already-tailed session is a no-op.
func (svc *Service) StartTailing(ctx context.Context, sessionID, jsonlPath string) error {
	if _, loaded := svc.tailers.LoadOrStore(sessionID, nil); loaded {
		// Already tailing this session
		return nil
	}

	tailCtx, cancel := context.WithCancel(ctx)
	svc.tailers.Store(sessionID, cancel)

	sc := NewScanner(sessionID, jsonlPath)
	ch := make(chan Event, 64)

	// Consumer: persist + emit each event.
	go func() {
		for {
			select {
			case <-tailCtx.Done():
				return
			case ev, ok := <-ch:
				if !ok {
					return
				}
				if err := svc.store.SaveEvent(tailCtx, &ev); err != nil {
					log.Printf("stream/service: save event for %s: %v", sessionID, err)
				}
				if svc.eventHook != nil {
					svc.eventHook(tailCtx, &ev)
				}
				svc.emitEvent("stream:event", ev)
			}
		}
	}()

	// Producer: tail file, send events to channel.
	go func() {
		defer close(ch)
		if err := sc.Tail(tailCtx, ch); err != nil && tailCtx.Err() == nil {
			log.Printf("stream/service: tail %s: %v", jsonlPath, err)
		}
	}()

	return nil
}

// StopTailing stops live-tailing for a single session.
func (svc *Service) StopTailing(sessionID string) {
	if v, ok := svc.tailers.LoadAndDelete(sessionID); ok {
		if cancel, ok := v.(context.CancelFunc); ok && cancel != nil {
			cancel()
		}
	}
}

// StopAll stops all active tailers. Call this during application shutdown.
func (svc *Service) StopAll() {
	svc.tailers.Range(func(key, value interface{}) bool {
		svc.tailers.Delete(key)
		if cancel, ok := value.(context.CancelFunc); ok && cancel != nil {
			cancel()
		}
		return true
	})
}

// SetEventHook registers a callback invoked for every tailed event before it is emitted.
func (svc *Service) SetEventHook(hook EventHook) {
	svc.eventHook = hook
}

// GetEvents retrieves paginated events for a session from the store.
func (svc *Service) GetEvents(ctx context.Context, sessionID string, offset, limit int) ([]Event, error) {
	return svc.store.GetEvents(ctx, sessionID, offset, limit)
}

// GetTimeline returns the condensed timeline for a session.
func (svc *Service) GetTimeline(ctx context.Context, sessionID string) (*Timeline, error) {
	return svc.store.GetTimeline(ctx, sessionID)
}
