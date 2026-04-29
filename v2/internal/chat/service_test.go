// Tests for chat.Service.Compare — fan-out across N providers.
// Author: Subash Karki
package chat

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// fakeProvider is a minimal provider.Provider implementation for Compare tests.
// ExecutablePath() can be configured to fail so we exercise the per-provider
// error path without spawning any child processes.
type fakeProvider struct {
	name        string
	enabled     bool
	installed   bool
	execPath    string
	execPathErr error
}

func (f *fakeProvider) Name() string                                      { return f.name }
func (f *fakeProvider) DisplayName() string                               { return f.name }
func (f *fakeProvider) Icon() string                                      { return "" }
func (f *fakeProvider) Enabled() bool                                     { return f.enabled }
func (f *fakeProvider) IsInstalled() bool                                 { return f.installed }
func (f *fakeProvider) DetectedVersion() string                           { return "" }
func (f *fakeProvider) ExecutablePath() (string, error)                   { return f.execPath, f.execPathErr }
func (f *fakeProvider) HealthCheck(_ context.Context) provider.HealthStatus { return provider.HealthStatus{} }
func (f *fakeProvider) DiscoverSessions(_ context.Context) ([]provider.RawSession, error) {
	return nil, nil
}
func (f *fakeProvider) IsSessionAlive(_ provider.RawSession) bool { return false }
func (f *fakeProvider) FindConversationFile(_, _ string) (string, error) {
	return "", errors.New("not used")
}
func (f *fakeProvider) ParseConversation(_ io.Reader) (*provider.ConversationData, error) {
	return nil, errors.New("not used")
}
func (f *fakeProvider) ParseUsage(_ map[string]any) *provider.TokenUsage    { return nil }
func (f *fakeProvider) CalculateCost(_ string, _ provider.TokenUsage) int64 { return 0 }
func (f *fakeProvider) ResumeCommand(_ string) string                       { return "" }
func (f *fakeProvider) NewSessionCommand(_ string) string                   { return "" }
func (f *fakeProvider) AIGenerateCommand(_ string) string                   { return "" }
func (f *fakeProvider) PromptTransport() provider.PromptTransport           { return provider.PromptArgv }
func (f *fakeProvider) SessionsDir() string                                 { return "" }
func (f *fakeProvider) ConversationsDir() string                            { return "" }
func (f *fakeProvider) TodosDir() string                                    { return "" }
func (f *fakeProvider) TasksDir() string                                    { return "" }
func (f *fakeProvider) ContextDir() string                                  { return "" }
func (f *fakeProvider) SettingsFile() string                                { return "" }

// captureEmitter records every emitted event for later assertions.
type captureEmitter struct {
	mu     sync.Mutex
	events []emittedEvent
}

type emittedEvent struct {
	channel string
	data    interface{}
}

func (c *captureEmitter) emit(name string, data interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events = append(c.events, emittedEvent{channel: name, data: data})
}

func (c *captureEmitter) snapshot() []emittedEvent {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]emittedEvent, len(c.events))
	copy(out, c.events)
	return out
}

func TestCompare_NoProvidersResolved_ReturnsError(t *testing.T) {
	reg := provider.NewRegistry()
	reg.Register("disabled", &fakeProvider{name: "disabled", enabled: false, installed: true})

	em := &captureEmitter{}
	svc := &Service{reg: reg, emitEvent: em.emit}

	err := svc.Compare(context.Background(), "conv1", "hello", []string{"disabled", "ghost"})
	if err == nil {
		t.Fatalf("expected error when no providers resolve, got nil")
	}
}

func TestCompare_RequiresRegistry(t *testing.T) {
	em := &captureEmitter{}
	svc := &Service{emitEvent: em.emit} // reg is nil

	err := svc.Compare(context.Background(), "conv1", "hello", []string{"claude"})
	if err == nil {
		t.Fatalf("expected error when registry is nil, got nil")
	}
}

func TestCompare_FanOut_EmitsPerProviderErrorAndDone_AggregateDone(t *testing.T) {
	reg := provider.NewRegistry()
	reg.Register("alpha", &fakeProvider{
		name:        "alpha",
		enabled:     true,
		installed:   true,
		execPathErr: errors.New("binary missing"),
	})
	reg.Register("beta", &fakeProvider{
		name:        "beta",
		enabled:     true,
		installed:   true,
		execPathErr: errors.New("binary missing"),
	})

	em := &captureEmitter{}
	svc := &Service{reg: reg, emitEvent: em.emit}

	if err := svc.Compare(context.Background(), "conv1", "hello", []string{"alpha", "beta"}); err != nil {
		t.Fatalf("Compare returned error: %v", err)
	}

	events := em.snapshot()

	// Expected events: per provider an error + done, plus one final aggregate done.
	// 2 providers * 2 events + 1 aggregate = 5 events on "chat:compare:event".
	if got := len(events); got != 5 {
		t.Fatalf("expected 5 emitted events, got %d: %+v", got, events)
	}

	var aggregateDone, perProviderDone, perProviderError int
	for _, ev := range events {
		if ev.channel != "chat:compare:event" {
			t.Errorf("unexpected channel %q", ev.channel)
		}
		ce, ok := ev.data.(CompareEvent)
		if !ok {
			t.Fatalf("unexpected payload type: %T", ev.data)
		}
		switch {
		case ce.ProviderID == "" && ce.Type == "done":
			aggregateDone++
		case ce.ProviderID != "" && ce.Type == "done":
			perProviderDone++
		case ce.ProviderID != "" && ce.Type == "error":
			perProviderError++
		}
		if ce.ConversationID != "conv1" {
			t.Errorf("expected conversationID=conv1, got %q", ce.ConversationID)
		}
	}

	if aggregateDone != 1 {
		t.Errorf("expected exactly 1 aggregate done event, got %d", aggregateDone)
	}
	if perProviderDone != 2 {
		t.Errorf("expected 2 per-provider done events, got %d", perProviderDone)
	}
	if perProviderError != 2 {
		t.Errorf("expected 2 per-provider error events, got %d", perProviderError)
	}
}
