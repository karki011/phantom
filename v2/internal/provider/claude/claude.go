// Package claude implements the ClaudeProvider adapter for Phantom OS v2.
//
// ClaudeProvider embeds ConfigProvider and overrides methods that require
// Claude-specific logic:
//   - FindConversationFile: Claude's encoded-path convention (/ -> -)
//   - ParseConversation: Claude's nested content blocks (thinking, text, tool_use)
//
// Author: Subash Karki
// Date: 2026-04-26
package claude

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// ClaudeProvider is the Claude Code adapter. It embeds ConfigProvider for
// config-driven defaults and overrides FindConversationFile and
// ParseConversation with Claude-specific logic.
type ClaudeProvider struct {
	*provider.ConfigProvider
}

// New creates a ClaudeProvider from a loaded ProviderConfig.
func New(cfg *provider.ProviderConfig) *ClaudeProvider {
	return &ClaudeProvider{ConfigProvider: provider.NewConfigProvider(cfg)}
}

// ---------------------------------------------------------------------------
// FindConversationFile — Claude's encoded-path convention
// ---------------------------------------------------------------------------

// FindConversationFile locates the JSONL conversation file for a session.
//
// Claude Code stores conversations under ~/.claude/projects/<encoded-cwd>/
// where <encoded-cwd> is the CWD path with "/" replaced by "-" and a
// leading "-" stripped.
//
// If cwd is provided, it looks in the specific encoded directory for
// <sessionID>.jsonl. If cwd is empty, it walks all subdirectories under
// the conversations root looking for <sessionID>.jsonl.
func (cp *ClaudeProvider) FindConversationFile(sessionID, cwd string) (string, error) {
	if sessionID == "" {
		return "", fmt.Errorf("sessionID is required")
	}

	convDir := cp.ConversationsDir()
	ext := cp.Cfg.Conversations.FileExtension
	if ext == "" {
		ext = ".jsonl"
	}
	filename := sessionID + ext

	if cwd != "" {
		// Encoded-path convention: replace / with -, strip leading -
		encodedPath := strings.ReplaceAll(cwd, "/", "-")
		if strings.HasPrefix(encodedPath, "-") {
			encodedPath = encodedPath[1:]
		}
		projectDir := filepath.Join(convDir, encodedPath)

		path := filepath.Join(projectDir, filename)
		if _, err := os.Stat(path); err != nil {
			return "", fmt.Errorf("conversation file not found: %s", path)
		}
		return path, nil
	}

	// No CWD — walk all subdirectories looking for the file.
	var found string
	err := filepath.WalkDir(convDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable dirs
		}
		if d.IsDir() {
			return nil
		}
		if d.Name() == filename {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("walk conversations dir: %w", err)
	}
	if found == "" {
		return "", fmt.Errorf("conversation file %s not found in %s", filename, convDir)
	}
	return found, nil
}

// ---------------------------------------------------------------------------
// ParseConversation — Claude's JSONL with nested content blocks
// ---------------------------------------------------------------------------

// claudeLine represents the raw JSON shape of a single JSONL line in Claude
// conversation logs.
type claudeLine struct {
	Type     string          `json:"type"`
	Role     string          `json:"role"`
	Model    string          `json:"model"`
	Message  json.RawMessage `json:"message"`
	ToolName string          `json:"tool_name"`
	Usage    json.RawMessage `json:"usage"`
	Content  json.RawMessage `json:"content"`
}

// claudeNestedMessage is the shape of the "message" field in assistant lines.
type claudeNestedMessage struct {
	Usage   json.RawMessage `json:"usage"`
	Model   string          `json:"model"`
	Content []contentBlock  `json:"content"`
}

// contentBlock represents an item in the content array.
type contentBlock struct {
	Type  string          `json:"type"`
	Text  string          `json:"text"`
	Name  string          `json:"name"`
	Input json.RawMessage `json:"input"`
}

// claudeUsage mirrors Claude's token usage block.
type claudeUsage struct {
	InputTokens              int64 `json:"input_tokens"`
	OutputTokens             int64 `json:"output_tokens"`
	CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
	CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
}

// ParseConversation reads a Claude JSONL conversation from the given reader
// and returns normalized ConversationData.
//
// It handles:
//   - Message type classification via the "type" field (human, assistant, tool_use, tool_result, system)
//   - Usage extraction from "usage", "message.usage", and "result.usage" locations
//   - Token fields: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
//   - Claude's nested content blocks in assistant messages (thinking, text, tool_use, tool_result)
//   - Accumulation of total usage across all messages
func (cp *ClaudeProvider) ParseConversation(r io.Reader) (*provider.ConversationData, error) {
	scanner := bufio.NewScanner(r)
	// 10MB max: Claude lines can contain thinking signatures, base64 images, large tool outputs
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	conv := &provider.ConversationData{
		Provider: cp.Name(),
	}

	var totalUsage provider.TokenUsage

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var entry claudeLine
		if err := json.Unmarshal(line, &entry); err != nil {
			continue // skip malformed lines
		}

		msg := cp.classifyLine(&entry, line)
		if msg == nil {
			continue
		}

		// Accumulate usage from this message
		if msg.Usage != nil {
			totalUsage.Input += msg.Usage.Input
			totalUsage.Output += msg.Usage.Output
			totalUsage.CacheRead += msg.Usage.CacheRead
			totalUsage.CacheWrite += msg.Usage.CacheWrite
		}

		conv.Messages = append(conv.Messages, *msg)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan JSONL: %w", err)
	}

	if totalUsage.ComputedTotal() > 0 {
		conv.TotalUsage = &totalUsage
	}

	return conv, nil
}

// classifyLine converts a raw Claude JSONL line into a normalized Message.
func (cp *ClaudeProvider) classifyLine(entry *claudeLine, rawLine []byte) *provider.Message {
	msgType := cp.resolveType(entry)
	if msgType == "" {
		return nil
	}

	msg := &provider.Message{
		Type: msgType,
	}

	switch msgType {
	case provider.MessageUser:
		msg.Content = cp.extractContent(entry, rawLine)

	case provider.MessageAssistant:
		cp.parseAssistantLine(entry, msg)

	case provider.MessageToolUse:
		if entry.ToolName != "" {
			msg.ToolCalls = []provider.ToolCall{{Name: entry.ToolName}}
		}

	case provider.MessageToolResult:
		msg.Content = cp.extractContent(entry, rawLine)

	case provider.MessageSystem:
		msg.Content = cp.extractContent(entry, rawLine)
	}

	// Extract usage from all known locations
	usage := cp.extractLineUsage(entry, rawLine)
	if usage != nil && usage.ComputedTotal() > 0 {
		msg.Usage = usage
	}

	// Extract model
	if entry.Model != "" {
		msg.Model = entry.Model
	}

	return msg
}

// resolveType determines the normalized MessageType from a Claude JSONL line.
func (cp *ClaudeProvider) resolveType(entry *claudeLine) provider.MessageType {
	switch entry.Type {
	case "human":
		return provider.MessageUser
	case "assistant":
		return provider.MessageAssistant
	case "tool_use":
		return provider.MessageToolUse
	case "tool_result":
		return provider.MessageToolResult
	case "system":
		return provider.MessageSystem
	case "thinking":
		return provider.MessageThinking
	}

	// Fallback: check role field
	switch entry.Role {
	case "user", "human":
		return provider.MessageUser
	case "assistant":
		return provider.MessageAssistant
	}

	return ""
}

// parseAssistantLine handles Claude's nested content blocks in assistant messages.
func (cp *ClaudeProvider) parseAssistantLine(entry *claudeLine, msg *provider.Message) {
	// Try to parse the nested message for model and content blocks
	if entry.Message != nil {
		var nested claudeNestedMessage
		if err := json.Unmarshal(entry.Message, &nested); err == nil {
			if nested.Model != "" {
				msg.Model = nested.Model
			}

			// Extract content from blocks
			var textParts []string
			for _, block := range nested.Content {
				switch block.Type {
				case "thinking":
					msg.Thoughts = append(msg.Thoughts, provider.Thought{
						Description: block.Text,
					})
				case "text":
					textParts = append(textParts, block.Text)
				case "tool_use":
					msg.ToolCalls = append(msg.ToolCalls, provider.ToolCall{
						Name: block.Name,
						Args: block.Input,
					})
				}
			}
			if len(textParts) > 0 {
				msg.Content = strings.Join(textParts, "\n")
			}
			return
		}
	}

	// Fallback: try top-level content blocks
	if entry.Content != nil {
		var blocks []contentBlock
		if err := json.Unmarshal(entry.Content, &blocks); err == nil {
			var textParts []string
			for _, block := range blocks {
				switch block.Type {
				case "thinking":
					msg.Thoughts = append(msg.Thoughts, provider.Thought{
						Description: block.Text,
					})
				case "text":
					textParts = append(textParts, block.Text)
				case "tool_use":
					msg.ToolCalls = append(msg.ToolCalls, provider.ToolCall{
						Name: block.Name,
						Args: block.Input,
					})
				}
			}
			if len(textParts) > 0 {
				msg.Content = strings.Join(textParts, "\n")
			}
			return
		}

		// Content might be a plain string
		var plainContent string
		if err := json.Unmarshal(entry.Content, &plainContent); err == nil {
			msg.Content = plainContent
		}
	}
}

// extractLineUsage extracts token usage from all known Claude locations:
// top-level "usage", nested "message.usage", and "result.usage".
func (cp *ClaudeProvider) extractLineUsage(entry *claudeLine, rawLine []byte) *provider.TokenUsage {
	// 1. Try top-level "usage"
	if entry.Usage != nil {
		if u := parseClaudeUsage(entry.Usage); u != nil {
			return u
		}
	}

	// 2. Try "message.usage"
	if entry.Message != nil {
		var msgMap map[string]json.RawMessage
		if err := json.Unmarshal(entry.Message, &msgMap); err == nil {
			if usageRaw, ok := msgMap["usage"]; ok {
				if u := parseClaudeUsage(usageRaw); u != nil {
					return u
				}
			}
		}
	}

	// 3. Try "result.usage" from the raw line
	var rawMap map[string]json.RawMessage
	if err := json.Unmarshal(rawLine, &rawMap); err == nil {
		if resultRaw, ok := rawMap["result"]; ok {
			var resultMap map[string]json.RawMessage
			if err := json.Unmarshal(resultRaw, &resultMap); err == nil {
				if usageRaw, ok := resultMap["usage"]; ok {
					if u := parseClaudeUsage(usageRaw); u != nil {
						return u
					}
				}
			}
		}
	}

	return nil
}

// parseClaudeUsage converts raw JSON usage bytes into a normalized TokenUsage.
func parseClaudeUsage(raw json.RawMessage) *provider.TokenUsage {
	var cu claudeUsage
	if err := json.Unmarshal(raw, &cu); err != nil {
		return nil
	}

	usage := &provider.TokenUsage{
		Input:      cu.InputTokens,
		Output:     cu.OutputTokens,
		CacheRead:  cu.CacheReadInputTokens,
		CacheWrite: cu.CacheCreationInputTokens,
	}

	if usage.ComputedTotal() == 0 {
		return nil
	}
	return usage
}

// extractContent tries to get text content from a Claude JSONL line.
func (cp *ClaudeProvider) extractContent(entry *claudeLine, rawLine []byte) string {
	// Try content field as a string
	if entry.Content != nil {
		var s string
		if err := json.Unmarshal(entry.Content, &s); err == nil {
			return s
		}

		// Try as content blocks array
		var blocks []contentBlock
		if err := json.Unmarshal(entry.Content, &blocks); err == nil {
			for _, b := range blocks {
				if b.Type == "text" && b.Text != "" {
					return b.Text
				}
			}
		}
	}

	// Try message.content
	if entry.Message != nil {
		var msgMap map[string]json.RawMessage
		if err := json.Unmarshal(entry.Message, &msgMap); err == nil {
			if contentRaw, ok := msgMap["content"]; ok {
				var s string
				if err := json.Unmarshal(contentRaw, &s); err == nil {
					return s
				}

				var blocks []contentBlock
				if err := json.Unmarshal(contentRaw, &blocks); err == nil {
					for _, b := range blocks {
						if b.Type == "text" && b.Text != "" {
							return b.Text
						}
					}
				}
			}
		}
	}

	return ""
}
