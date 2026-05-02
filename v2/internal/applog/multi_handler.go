// Author: Subash Karki
// MultiHandler fans a single slog.Record out to multiple slog.Handler backends.
package applog

import (
	"context"
	"log/slog"
)

// MultiHandler distributes log records to every handler in the slice.
// Enabled returns true if any child handler is enabled for the given level.
type MultiHandler struct {
	handlers []slog.Handler
}

// NewMultiHandler creates a handler that writes to all provided handlers.
func NewMultiHandler(handlers ...slog.Handler) *MultiHandler {
	return &MultiHandler{handlers: handlers}
}

func (m *MultiHandler) Enabled(_ context.Context, level slog.Level) bool {
	for _, h := range m.handlers {
		if h.Enabled(context.Background(), level) {
			return true
		}
	}
	return false
}

func (m *MultiHandler) Handle(ctx context.Context, r slog.Record) error {
	for _, h := range m.handlers {
		if h.Enabled(ctx, r.Level) {
			if err := h.Handle(ctx, r.Clone()); err != nil {
				return err
			}
		}
	}
	return nil
}

func (m *MultiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	cloned := make([]slog.Handler, len(m.handlers))
	for i, h := range m.handlers {
		cloned[i] = h.WithAttrs(attrs)
	}
	return &MultiHandler{handlers: cloned}
}

func (m *MultiHandler) WithGroup(name string) slog.Handler {
	cloned := make([]slog.Handler, len(m.handlers))
	for i, h := range m.handlers {
		cloned[i] = h.WithGroup(name)
	}
	return &MultiHandler{handlers: cloned}
}
