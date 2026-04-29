// Package chat provides the chat service for Phantom OS v2.
// It manages conversations and messages, spawns the active provider's CLI
// for streaming responses, and emits events to the frontend.
// Author: Subash Karki
package chat

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

const (
	defaultModel    = "sonnet"
	defaultMaxTokens = 8192
)

// Service manages chat conversations, message persistence, and streaming
// responses via the active provider's CLI.
//
// `prov` is the single active provider used by SendMessage (normal chat).
// `reg` is the full provider registry used by Compare (fan-out across
// multiple providers). The single-provider path does not depend on `reg`,
// so callers may pass nil during tests that exercise SendMessage only.
type Service struct {
	queries   *db.Queries
	writer    *sql.DB
	prov      provider.Provider
	reg       *provider.Registry
	emitEvent func(name string, data interface{})
}

// NewService creates a chat Service backed by the given DB connections,
// active provider, and provider registry. emitEvent should be
// wailsRuntime.EventsEmit (or a test stub).
func NewService(writer *sql.DB, prov provider.Provider, reg *provider.Registry, emitEvent func(string, interface{})) *Service {
	return &Service{
		queries:   db.New(writer),
		writer:    writer,
		prov:      prov,
		reg:       reg,
		emitEvent: emitEvent,
	}
}

// ---------------------------------------------------------------------------
// Conversation CRUD
// ---------------------------------------------------------------------------

// CreateConversation creates a new chat conversation and returns it.
func (s *Service) CreateConversation(ctx context.Context, workspaceID, title, model string) (*Conversation, error) {
	if title == "" {
		title = "New conversation"
	}
	if model == "" {
		model = defaultModel
	}

	now := time.Now().Unix()
	id := uuid.New().String()

	if err := s.queries.CreateConversation(ctx, db.CreateConversationParams{
		ID:          id,
		WorkspaceID: sql.NullString{String: workspaceID, Valid: workspaceID != ""},
		Title:       title,
		Model:       sql.NullString{String: model, Valid: true},
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		return nil, fmt.Errorf("chat: create conversation: %w", err)
	}

	return &Conversation{
		ID:          id,
		WorkspaceID: workspaceID,
		Title:       title,
		Model:       model,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

// ListConversations returns all conversations for a workspace, newest first.
func (s *Service) ListConversations(ctx context.Context, workspaceID string) ([]Conversation, error) {
	rows, err := s.queries.ListConversationsByWorkspace(ctx, sql.NullString{
		String: workspaceID, Valid: workspaceID != "",
	})
	if err != nil {
		return nil, fmt.Errorf("chat: list conversations: %w", err)
	}

	convs := make([]Conversation, 0, len(rows))
	for _, r := range rows {
		convs = append(convs, toConversation(r))
	}
	return convs, nil
}

// DeleteConversation removes a conversation and all its messages.
func (s *Service) DeleteConversation(ctx context.Context, conversationID string) error {
	// Delete messages first (FK constraint).
	if err := s.queries.DeleteMessagesByConversation(ctx, sql.NullString{
		String: conversationID, Valid: true,
	}); err != nil {
		return fmt.Errorf("chat: delete messages: %w", err)
	}
	if err := s.queries.DeleteConversation(ctx, conversationID); err != nil {
		return fmt.Errorf("chat: delete conversation: %w", err)
	}
	return nil
}

// UpdateTitle updates the title of a conversation.
func (s *Service) UpdateTitle(ctx context.Context, conversationID, title string) error {
	now := time.Now().Unix()
	if err := s.queries.UpdateConversationTitle(ctx, db.UpdateConversationTitleParams{
		Title:     title,
		UpdatedAt: now,
		ID:        conversationID,
	}); err != nil {
		return fmt.Errorf("chat: update conversation title: %w", err)
	}
	return nil
}

// GetHistory returns all messages for a conversation in chronological order.
func (s *Service) GetHistory(ctx context.Context, conversationID string) ([]Message, error) {
	rows, err := s.queries.ListMessagesByConversation(ctx, sql.NullString{
		String: conversationID, Valid: true,
	})
	if err != nil {
		return nil, fmt.Errorf("chat: get history: %w", err)
	}

	msgs := make([]Message, 0, len(rows))
	for _, r := range rows {
		msgs = append(msgs, toMessage(r))
	}
	return msgs, nil
}

// SaveMessage persists a single message to the database.
func (s *Service) SaveMessage(ctx context.Context, conversationID, role, content, model string) (*Message, error) {
	now := time.Now().Unix()
	id := uuid.New().String()

	// Look up the conversation to get workspace_id.
	conv, err := s.queries.GetConversation(ctx, conversationID)
	if err != nil {
		return nil, fmt.Errorf("chat: get conversation for message: %w", err)
	}

	if err := s.queries.CreateMessage(ctx, db.CreateMessageParams{
		ID:             id,
		ConversationID: sql.NullString{String: conversationID, Valid: true},
		WorkspaceID:    conv.WorkspaceID,
		Role:           role,
		Content:        content,
		Model:          sql.NullString{String: model, Valid: model != ""},
		CreatedAt:      now,
	}); err != nil {
		return nil, fmt.Errorf("chat: save message: %w", err)
	}

	// Touch conversation updated_at.
	_ = s.queries.UpdateConversationTimestamp(ctx, db.UpdateConversationTimestampParams{
		UpdatedAt: now,
		ID:        conversationID,
	})

	return &Message{
		ID:             id,
		ConversationID: conversationID,
		Role:           role,
		Content:        content,
		Model:          model,
		CreatedAt:      now,
	}, nil
}

// ---------------------------------------------------------------------------
// SendMessage — streams an AI response via the claude CLI
// ---------------------------------------------------------------------------

// SendMessage saves the user message, spawns the claude CLI with streaming,
// persists the assistant response, and emits "chat:stream" events for each
// text delta. Returns the completed assistant message.
func (s *Service) SendMessage(ctx context.Context, conversationID, content, model string) (*Message, error) {
	if model == "" {
		model = defaultModel
	}

	// 1. Resolve the active provider's CLI binary.
	cliPath, err := s.prov.ExecutablePath()
	if err != nil {
		s.emitEvent("chat:stream", StreamEvent{
			Type:    "error",
			Content: fmt.Sprintf("%s CLI not found in PATH: %v", s.prov.Name(), err),
		})
		return nil, fmt.Errorf("chat: provider CLI not found: %w", err)
	}

	// 2. Persist the user message.
	if _, err := s.SaveMessage(ctx, conversationID, "user", content, model); err != nil {
		return nil, err
	}

	// 3. Build the prompt with conversation history.
	history, err := s.GetHistory(ctx, conversationID)
	if err != nil {
		return nil, err
	}

	prompt := buildPrompt(history)

	// 4. Spawn the provider CLI and stream its output to the standard
	//    "chat:stream" channel — bound to the single-provider path.
	emitStream := func(ev StreamEvent) {
		s.emitEvent("chat:stream", ev)
	}
	fullContent, err := s.streamFromCLI(ctx, cliPath, model, prompt, conversationID, emitStream)
	if err != nil {
		s.emitEvent("chat:stream", StreamEvent{
			Type:    "error",
			Content: err.Error(),
		})
		return nil, fmt.Errorf("chat: stream response: %w", err)
	}

	// 5. Persist the full assistant response.
	assistantMsg, err := s.SaveMessage(ctx, conversationID, "assistant", fullContent, model)
	if err != nil {
		return nil, err
	}

	// 6. Emit final done event.
	s.emitEvent("chat:stream", StreamEvent{Type: "done"})

	return assistantMsg, nil
}

// ---------------------------------------------------------------------------
// Compare — fan-out a single prompt to N providers in parallel
// ---------------------------------------------------------------------------

// Compare fans out the given prompt to every provider in providerIDs in
// parallel and streams each provider's response on the "chat:compare:event"
// channel. Each emitted event carries the providerID so the frontend can
// route deltas to the correct column.
//
// Behaviour:
//   - Unknown, disabled, or uninstalled providers are logged and skipped.
//   - Returns an error only if zero providers resolve.
//   - Each provider runs in its own goroutine; per-provider failures emit a
//     "error" event for that provider but do not affect siblings.
//   - Compare is ephemeral: nothing is persisted to the conversations table.
//   - Emits a per-provider "done" event when each branch finishes, then a
//     final aggregate event (ProviderID == "") when all branches have completed.
//
// We use a single Wails channel ("chat:compare:event") with a discriminated
// payload rather than per-provider channels — this matches the existing
// PhantomOS event convention (see internal/app/events.go) where one channel
// per concern carries a typed payload.
func (s *Service) Compare(ctx context.Context, conversationID, prompt string, providerIDs []string) error {
	if s.reg == nil {
		return fmt.Errorf("chat: compare requires a provider registry")
	}

	// Resolve provider IDs to live providers, skipping unknown/disabled.
	resolved := make([]provider.Provider, 0, len(providerIDs))
	resolvedIDs := make([]string, 0, len(providerIDs))
	for _, id := range providerIDs {
		p, ok := s.reg.Get(id)
		if !ok {
			log.Warn("chat: compare skipping unknown provider", "providerID", id)
			continue
		}
		if !p.Enabled() || !p.IsInstalled() {
			log.Warn("chat: compare skipping disabled or uninstalled provider", "providerID", id)
			continue
		}
		resolved = append(resolved, p)
		resolvedIDs = append(resolvedIDs, id)
	}

	if len(resolved) == 0 {
		return fmt.Errorf("chat: compare: no usable providers in %v", providerIDs)
	}

	emitCompare := func(ev CompareEvent) {
		ev.ConversationID = conversationID
		s.emitEvent("chat:compare:event", ev)
	}

	var wg sync.WaitGroup
	for i, p := range resolved {
		wg.Add(1)
		providerID := resolvedIDs[i]
		prov := p
		go func() {
			defer wg.Done()

			cliPath, err := prov.ExecutablePath()
			if err != nil {
				emitCompare(CompareEvent{
					ProviderID: providerID,
					Type:       "error",
					Content:    fmt.Sprintf("%s CLI not found: %v", prov.Name(), err),
				})
				emitCompare(CompareEvent{ProviderID: providerID, Type: "done"})
				return
			}

			// Per-provider emitter wraps StreamEvent in a CompareEvent
			// tagged with this provider's ID.
			emit := func(se StreamEvent) {
				emitCompare(CompareEvent{
					ProviderID: providerID,
					Type:       se.Type,
					Content:    se.Content,
					ToolName:   se.ToolName,
					ToolInput:  se.ToolInput,
				})
			}

			if _, err := s.streamFromCLI(ctx, cliPath, defaultModel, prompt, conversationID, emit); err != nil {
				emit(StreamEvent{Type: "error", Content: err.Error()})
			}
			emitCompare(CompareEvent{ProviderID: providerID, Type: "done"})
		}()
	}

	wg.Wait()

	// Final aggregate done — frontend uses this to know all columns finished.
	emitCompare(CompareEvent{Type: "done"})
	return nil
}

// ---------------------------------------------------------------------------
// Provider CLI streaming
// ---------------------------------------------------------------------------

// buildPrompt constructs a prompt string from conversation history.
// The latest user message is already included in history since we persist
// it before calling this function.
func buildPrompt(history []Message) string {
	if len(history) == 0 {
		return ""
	}

	// If there's only one message (the current user message), return it directly.
	if len(history) == 1 {
		return history[0].Content
	}

	var sb strings.Builder
	sb.WriteString("Previous conversation:\n")

	// All messages except the last one are history context.
	for _, m := range history[:len(history)-1] {
		switch m.Role {
		case "user":
			sb.WriteString("User: ")
		case "assistant":
			sb.WriteString("Assistant: ")
		default:
			continue
		}
		sb.WriteString(m.Content)
		sb.WriteString("\n")
	}

	sb.WriteString("\nCurrent message:\n")
	sb.WriteString(history[len(history)-1].Content)

	return sb.String()
}

// streamFromCLI spawns the provider CLI with stream-json output, reads
// NDJSON from stdout, invokes emit for each stream event, and returns the
// full concatenated response text.
//
// The emit callback lets the caller route events to a specific Wails
// channel — the single-provider path uses "chat:stream" while Compare
// uses "chat:compare:event" with a provider-tagged payload.
func (s *Service) streamFromCLI(
	ctx context.Context,
	cliPath, model, prompt, conversationID string,
	emit func(StreamEvent),
) (string, error) {
	args := []string{
		"-p", prompt,
		"--output-format", "stream-json",
		"--verbose",
		"--model", model,
		"--no-session-persistence",
		"--dangerously-skip-permissions",
		"--system-prompt", "You are a helpful AI assistant in PhantomOS. Be concise, accurate, and friendly. Format responses with markdown when helpful. Do not reference any CLAUDE.md files, settings, hooks, skills, or project configuration.",
		"--setting-sources", "",
	}

	// Use a temp directory as CWD so no CLAUDE.md or .claude/ context is discovered.
	// Each chat conversation starts clean — no workspace context leaks in.
	tmpDir, _ := os.MkdirTemp("", "phantom-chat-*")
	cmd := exec.CommandContext(ctx, cliPath, args...)
	if tmpDir != "" {
		cmd.Dir = tmpDir
		defer os.RemoveAll(tmpDir)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("start cli process: %w", err)
	}

	// Read stderr in background for error reporting.
	var stderrContent strings.Builder
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			stderrContent.WriteString(scanner.Text())
			stderrContent.WriteString("\n")
		}
	}()

	// Parse NDJSON from stdout.
	var fullContent strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var event cliStreamEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			log.Debug("chat: skip malformed NDJSON line", "err", err, "line", line)
			continue
		}

		s.handleStreamEvent(&event, &fullContent, conversationID, emit)
	}

	if err := scanner.Err(); err != nil {
		return fullContent.String(), fmt.Errorf("read cli stdout: %w", err)
	}

	// Wait for the process to finish.
	if err := cmd.Wait(); err != nil {
		// If we got content, the process may have exited non-zero but still
		// produced valid output. Return the content with the error.
		if fullContent.Len() > 0 {
			log.Warn("chat: cli process exited with error but produced content", "err", err)
			return fullContent.String(), nil
		}
		errMsg := stderrContent.String()
		if errMsg == "" {
			errMsg = err.Error()
		}
		return "", fmt.Errorf("cli process failed: %s", errMsg)
	}

	return fullContent.String(), nil
}

// handleStreamEvent maps a claude CLI stream-json event to frontend
// StreamEvent emissions and accumulates full text content.
//
// The claude CLI --output-format stream-json --verbose outputs:
//   - {"type":"assistant","message":{"content":[{"type":"thinking","thinking":"..."},{"type":"text","text":"..."}]}}
//   - {"type":"result","result":"full text",...}
//   - {"type":"system",...} — hooks, skip
//   - {"type":"rate_limit_event",...} — skip
//   - {"type":"error",...} — errors
func (s *Service) handleStreamEvent(event *cliStreamEvent, fullContent *strings.Builder, conversationID string, emit func(StreamEvent)) {
	switch event.Type {
	case "assistant":
		if event.Message == nil {
			return
		}
		var msg cliAssistantMessage
		if err := json.Unmarshal(event.Message, &msg); err != nil {
			return
		}
		for _, block := range msg.Content {
			switch block.Type {
			case "text":
				if block.Text != "" {
					fullContent.WriteString(block.Text)
					emit(StreamEvent{
						Type:    "delta",
						Content: block.Text,
					})
				}
			case "thinking":
				if block.Thinking != "" {
					emit(StreamEvent{
						Type:    "thinking",
						Content: block.Thinking,
					})
				}
			case "tool_use":
				inputJSON, _ := json.Marshal(block.Input)
				emit(StreamEvent{
					Type:      "tool_use",
					ToolName:  block.Name,
					ToolInput: string(inputJSON),
				})
			}
		}

	case "result":
		// Final result — use result text if we haven't received content from assistant events.
		if event.ResultText != "" && fullContent.Len() == 0 {
			fullContent.WriteString(event.ResultText)
			emit(StreamEvent{
				Type:    "delta",
				Content: event.ResultText,
			})
		}

	case "error":
		errMsg := "unknown streaming error"
		if event.Error != nil {
			errMsg = event.Error.Message
		}
		emit(StreamEvent{
			Type:    "error",
			Content: errMsg,
		})
	}
}

// ---------------------------------------------------------------------------
// Claude CLI NDJSON types
// ---------------------------------------------------------------------------

// cliStreamEvent represents a parsed NDJSON line from `claude --output-format stream-json --verbose`.
type cliStreamEvent struct {
	Type       string          `json:"type"`
	Message    json.RawMessage `json:"message,omitempty"`
	ResultText string          `json:"result,omitempty"`
	Error      *cliError       `json:"error,omitempty"`
}

type cliAssistantMessage struct {
	Content []cliContentBlock `json:"content"`
	Model   string            `json:"model,omitempty"`
}

type cliContentBlock struct {
	Type     string      `json:"type"`
	Text     string      `json:"text,omitempty"`
	Thinking string      `json:"thinking,omitempty"`
	Name     string      `json:"name,omitempty"`
	Input    interface{} `json:"input,omitempty"`
}

type cliError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// ---------------------------------------------------------------------------
// Model helpers
// ---------------------------------------------------------------------------

func toConversation(r db.ChatConversation) Conversation {
	return Conversation{
		ID:          r.ID,
		WorkspaceID: nullStr(r.WorkspaceID),
		Title:       r.Title,
		Model:       nullStr(r.Model),
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}
}

func toMessage(r db.ChatMessage) Message {
	return Message{
		ID:             r.ID,
		ConversationID: nullStr(r.ConversationID),
		Role:           r.Role,
		Content:        r.Content,
		Model:          nullStr(r.Model),
		CreatedAt:      r.CreatedAt,
	}
}

func nullStr(s sql.NullString) string {
	if s.Valid {
		return s.String
	}
	return ""
}
