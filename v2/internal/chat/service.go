// Package chat provides the chat service for Phantom OS v2.
// It manages conversations and messages, spawns the claude CLI
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
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

const (
	defaultModel    = "sonnet"
	defaultMaxTokens = 8192
)

// Service manages chat conversations, message persistence, and streaming
// responses via the claude CLI.
type Service struct {
	queries   *db.Queries
	writer    *sql.DB
	emitEvent func(name string, data interface{})
}

// NewService creates a chat Service backed by the given DB connections.
// emitEvent should be wailsRuntime.EventsEmit (or a test stub).
func NewService(writer *sql.DB, emitEvent func(string, interface{})) *Service {
	return &Service{
		queries:   db.New(writer),
		writer:    writer,
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

	// 1. Verify the claude binary is available.
	claudePath, err := exec.LookPath("claude")
	if err != nil {
		s.emitEvent("chat:stream", StreamEvent{
			Type:    "error",
			Content: "claude CLI not found in PATH. Please install it with: npm install -g @anthropic-ai/claude-code",
		})
		return nil, fmt.Errorf("chat: claude CLI not found: %w", err)
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

	// 4. Spawn the claude CLI process.
	fullContent, err := s.streamFromClaude(ctx, claudePath, model, prompt, conversationID)
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
// Claude CLI streaming
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

// streamFromClaude spawns the claude CLI with stream-json output, reads
// NDJSON from stdout, emits "chat:stream" events, and returns the full
// concatenated response text.
func (s *Service) streamFromClaude(
	ctx context.Context,
	claudePath, model, prompt, conversationID string,
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
	cmd := exec.CommandContext(ctx, claudePath, args...)
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
		return "", fmt.Errorf("start claude process: %w", err)
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

		s.handleStreamEvent(&event, &fullContent, conversationID)
	}

	if err := scanner.Err(); err != nil {
		return fullContent.String(), fmt.Errorf("read claude stdout: %w", err)
	}

	// Wait for the process to finish.
	if err := cmd.Wait(); err != nil {
		// If we got content, the process may have exited non-zero but still
		// produced valid output. Return the content with the error.
		if fullContent.Len() > 0 {
			log.Warn("chat: claude process exited with error but produced content", "err", err)
			return fullContent.String(), nil
		}
		errMsg := stderrContent.String()
		if errMsg == "" {
			errMsg = err.Error()
		}
		return "", fmt.Errorf("claude process failed: %s", errMsg)
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
func (s *Service) handleStreamEvent(event *cliStreamEvent, fullContent *strings.Builder, conversationID string) {
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
					s.emitEvent("chat:stream", StreamEvent{
						Type:    "delta",
						Content: block.Text,
					})
				}
			case "thinking":
				if block.Thinking != "" {
					s.emitEvent("chat:stream", StreamEvent{
						Type:    "thinking",
						Content: block.Thinking,
					})
				}
			case "tool_use":
				inputJSON, _ := json.Marshal(block.Input)
				s.emitEvent("chat:stream", StreamEvent{
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
			s.emitEvent("chat:stream", StreamEvent{
				Type:    "delta",
				Content: event.ResultText,
			})
		}

	case "error":
		errMsg := "unknown streaming error"
		if event.Error != nil {
			errMsg = event.Error.Message
		}
		s.emitEvent("chat:stream", StreamEvent{
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
