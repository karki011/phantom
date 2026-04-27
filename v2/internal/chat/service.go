// Package chat provides the chat service for Phantom OS v2.
// It manages conversations and messages, sends prompts to the Anthropic
// Messages API, and streams responses back via Wails events.
// Author: Subash Karki
package chat

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

const (
	anthropicAPIURL     = "https://api.anthropic.com/v1/messages"
	anthropicAPIVersion = "2023-06-01"
	defaultModel        = "claude-sonnet-4-20250514"
	defaultMaxTokens    = 8192
)

// Service manages chat conversations, message persistence, and streaming
// responses from the Anthropic Messages API.
type Service struct {
	queries   *db.Queries
	writer    *sql.DB
	emitEvent func(name string, data interface{})
	client    *http.Client
}

// NewService creates a chat Service backed by the given DB connections.
// emitEvent should be wailsRuntime.EventsEmit (or a test stub).
func NewService(writer *sql.DB, emitEvent func(string, interface{})) *Service {
	return &Service{
		queries:   db.New(writer),
		writer:    writer,
		emitEvent: emitEvent,
		client: &http.Client{
			Timeout: 5 * time.Minute, // streaming responses can take a while
		},
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
// SendMessage — streams an AI response via the Anthropic Messages API
// ---------------------------------------------------------------------------

// SendMessage saves the user message, calls the Anthropic Messages API with
// streaming, persists the assistant response, and emits "chat:chunk" events
// for each text delta. Returns the completed assistant message.
func (s *Service) SendMessage(ctx context.Context, conversationID, content, model string) (*Message, error) {
	if model == "" {
		model = defaultModel
	}

	// 1. Persist the user message.
	if _, err := s.SaveMessage(ctx, conversationID, "user", content, model); err != nil {
		return nil, err
	}

	// 2. Build conversation history for the API.
	history, err := s.GetHistory(ctx, conversationID)
	if err != nil {
		return nil, err
	}

	apiMessages := make([]apiMessage, 0, len(history))
	for _, m := range history {
		if m.Role == "user" || m.Role == "assistant" {
			apiMessages = append(apiMessages, apiMessage{
				Role:    m.Role,
				Content: m.Content,
			})
		}
	}

	// 3. Call the Anthropic streaming API.
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("chat: ANTHROPIC_API_KEY environment variable not set")
	}

	msgID := uuid.New().String()
	fullContent, err := s.streamFromAnthropic(ctx, apiKey, model, apiMessages, conversationID, msgID)
	if err != nil {
		// Emit an error chunk so the frontend knows.
		s.emitEvent("chat:chunk", StreamChunk{
			ConversationID: conversationID,
			MessageID:      msgID,
			Done:           true,
			Error:          err.Error(),
		})
		return nil, fmt.Errorf("chat: stream response: %w", err)
	}

	// 4. Persist the full assistant response.
	assistantMsg, err := s.SaveMessage(ctx, conversationID, "assistant", fullContent, model)
	if err != nil {
		return nil, err
	}

	// 5. Emit final done chunk.
	s.emitEvent("chat:chunk", StreamChunk{
		ConversationID: conversationID,
		MessageID:      assistantMsg.ID,
		Done:           true,
	})

	return assistantMsg, nil
}

// ---------------------------------------------------------------------------
// Anthropic API types and streaming
// ---------------------------------------------------------------------------

type apiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type apiRequest struct {
	Model     string       `json:"model"`
	MaxTokens int          `json:"max_tokens"`
	Messages  []apiMessage `json:"messages"`
	Stream    bool         `json:"stream"`
}

// streamFromAnthropic calls the Anthropic Messages API with SSE streaming,
// emits "chat:chunk" events for each text delta, and returns the full
// concatenated response text.
func (s *Service) streamFromAnthropic(
	ctx context.Context,
	apiKey, model string,
	messages []apiMessage,
	conversationID, messageID string,
) (string, error) {
	reqBody := apiRequest{
		Model:     model,
		MaxTokens: defaultMaxTokens,
		Messages:  messages,
		Stream:    true,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicAPIURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", anthropicAPIVersion)

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("api call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("api error %d: %s", resp.StatusCode, string(body))
	}

	// Parse SSE stream.
	var full strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()

		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var event sseEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			log.Debug("chat: skip malformed SSE event", "err", err)
			continue
		}

		switch event.Type {
		case "content_block_delta":
			if event.Delta != nil && event.Delta.Text != "" {
				full.WriteString(event.Delta.Text)
				s.emitEvent("chat:chunk", StreamChunk{
					ConversationID: conversationID,
					MessageID:      messageID,
					Delta:          event.Delta.Text,
				})
			}
		case "message_stop":
			// End of message — handled after loop.
		case "error":
			errMsg := "unknown streaming error"
			if event.Error != nil {
				errMsg = event.Error.Message
			}
			return full.String(), fmt.Errorf("stream error: %s", errMsg)
		}
	}

	if err := scanner.Err(); err != nil {
		return full.String(), fmt.Errorf("read SSE stream: %w", err)
	}

	return full.String(), nil
}

// sseEvent represents a parsed SSE event from the Anthropic streaming API.
type sseEvent struct {
	Type  string    `json:"type"`
	Delta *sseDelta `json:"delta,omitempty"`
	Error *sseError `json:"error,omitempty"`
}

type sseDelta struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type sseError struct {
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
