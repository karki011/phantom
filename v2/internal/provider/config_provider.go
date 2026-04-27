// Package provider — ConfigProvider: generic Provider implementation driven by YAML config.
//
// ConfigProvider implements the full Provider interface using only a ProviderConfig.
// AI tool adapters (Claude, Codex, Gemini) embed ConfigProvider and override only
// the methods that need custom logic (listed in adapter.overrides in the YAML).
//
// Author: Subash Karki
// Date: 2026-04-26
package provider

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// ConfigProvider is the config-driven implementation of Provider.
// Embed this in Go adapters and override methods as needed.
type ConfigProvider struct {
	Cfg *ProviderConfig
}

// NewConfigProvider creates a ConfigProvider from a loaded ProviderConfig.
func NewConfigProvider(cfg *ProviderConfig) *ConfigProvider {
	return &ConfigProvider{Cfg: cfg}
}

// ---------------------------------------------------------------------------
// PathResolver
// ---------------------------------------------------------------------------

// SessionsDir returns the expanded path to the sessions directory.
func (p *ConfigProvider) SessionsDir() string {
	return ExpandPath(p.Cfg.Paths.Sessions)
}

// ConversationsDir returns the expanded path to the conversations directory.
func (p *ConfigProvider) ConversationsDir() string {
	return ExpandPath(p.Cfg.Paths.Conversations)
}

// TodosDir returns the expanded path to the todos directory.
func (p *ConfigProvider) TodosDir() string {
	return ExpandPath(p.Cfg.Paths.Todos)
}

// TasksDir returns the expanded path to the tasks directory.
func (p *ConfigProvider) TasksDir() string {
	return ExpandPath(p.Cfg.Paths.Tasks)
}

// ContextDir returns the expanded path to the context directory.
func (p *ConfigProvider) ContextDir() string {
	return ExpandPath(p.Cfg.Paths.Context)
}

// SettingsFile returns the expanded path to the settings file.
func (p *ConfigProvider) SettingsFile() string {
	return ExpandPath(p.Cfg.Paths.Settings)
}

// ---------------------------------------------------------------------------
// ProviderIdentity
// ---------------------------------------------------------------------------

// Name returns the provider's machine name (e.g. "claude", "codex").
func (p *ConfigProvider) Name() string {
	return p.Cfg.Provider
}

// DisplayName returns the human-readable name (e.g. "Claude Code").
func (p *ConfigProvider) DisplayName() string {
	return p.Cfg.DisplayName_
}

// Icon returns the icon identifier for this provider.
func (p *ConfigProvider) Icon() string {
	return p.Cfg.Icon_
}

// Enabled returns whether this provider is enabled in config.
func (p *ConfigProvider) Enabled() bool {
	return p.Cfg.Enabled_
}

// IsInstalled checks if the provider binary exists on PATH and if
// at least one of the configured artifact paths exists.
func (p *ConfigProvider) IsInstalled() bool {
	_, err := exec.LookPath(p.Cfg.Detection.Binary)
	if err != nil {
		return false
	}
	// Check at least one artifact path exists
	for _, raw := range p.Cfg.Detection.Paths {
		resolved := ExpandPath(raw)
		if _, err := os.Stat(resolved); err == nil {
			return true
		}
	}
	return false
}

// DetectedVersion runs the configured version command and extracts the
// version string using the configured regex pattern.
func (p *ConfigProvider) DetectedVersion() string {
	cmd := p.Cfg.Detection.VersionCommand
	if len(cmd) == 0 {
		return ""
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, cmd[0], cmd[1:]...).CombinedOutput()
	if err != nil {
		return ""
	}

	pattern := p.Cfg.Detection.VersionPattern
	if pattern == "" {
		return strings.TrimSpace(string(out))
	}

	re, err := regexp.Compile(pattern)
	if err != nil {
		return ""
	}

	matches := re.FindStringSubmatch(string(out))
	if len(matches) < 2 {
		return ""
	}
	return matches[1]
}

// ---------------------------------------------------------------------------
// SessionDiscoverer
// ---------------------------------------------------------------------------

// DiscoverSessions finds sessions using the configured discovery method.
// For "glob", it walks the sessions directory matching the glob pattern
// and parses each file as JSON using the field mappings.
// For "sqlite", the Go adapter should override this method.
func (p *ConfigProvider) DiscoverSessions(_ context.Context) ([]RawSession, error) {
	if p.Cfg.Sessions.DiscoveryMethod != "glob" {
		return nil, fmt.Errorf("ConfigProvider only supports glob discovery; %q requires a Go adapter", p.Cfg.Sessions.DiscoveryMethod)
	}

	sessDir := ExpandPath(p.Cfg.Paths.Sessions)
	pattern := filepath.Join(sessDir, p.Cfg.Sessions.Glob)

	matches, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("glob sessions: %w", err)
	}

	excludeSet := make(map[string]bool, len(p.Cfg.Sessions.Exclude))
	for _, ex := range p.Cfg.Sessions.Exclude {
		excludeSet[ex] = true
	}

	var sessions []RawSession
	for _, path := range matches {
		base := filepath.Base(path)
		skip := false
		for pattern := range excludeSet {
			if matched, _ := filepath.Match(pattern, base); matched {
				skip = true
				break
			}
		}
		if skip {
			continue
		}

		raw, err := p.parseSessionFile(path)
		if err != nil {
			continue // skip unparseable files
		}
		raw.Provider = p.Cfg.Provider
		sessions = append(sessions, *raw)
	}

	return sessions, nil
}

// parseSessionFile reads a JSON file and extracts fields using the config mappings.
func (p *ConfigProvider) parseSessionFile(path string) (*RawSession, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	sess := &RawSession{}
	fields := p.Cfg.Sessions.Fields

	if v, ok := extractString(raw, fields["id"]); ok {
		sess.ID = v
	}
	if v, ok := extractInt(raw, fields["pid"]); ok {
		sess.PID = v
	}
	if v, ok := extractString(raw, fields["cwd"]); ok {
		sess.CWD = v
	}
	if v, ok := extractString(raw, fields["model"]); ok {
		sess.Model = v
	}
	if v, ok := extractString(raw, fields["name"]); ok {
		sess.Name = v
	}
	if v, ok := extractString(raw, fields["started_at"]); ok {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			sess.StartedAt = t
		}
	}
	if v, ok := extractString(raw, fields["updated_at"]); ok {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			sess.UpdatedAt = t
		}
	}

	// Fall back to filename-based ID if field mapping yielded nothing
	if sess.ID == "" {
		base := filepath.Base(path)
		sess.ID = strings.TrimSuffix(base, filepath.Ext(base))
	}

	return sess, nil
}

// IsSessionAlive checks if a session is still running.
// For alive_check "pid", sends signal 0 to the PID.
// For "none", always returns false (sessions are not tracked live).
func (p *ConfigProvider) IsSessionAlive(session RawSession) bool {
	switch p.Cfg.Sessions.AliveCheck {
	case "pid":
		if session.PID <= 0 {
			return false
		}
		err := syscall.Kill(session.PID, 0)
		return err == nil
	default:
		return false
	}
}

// ---------------------------------------------------------------------------
// ConversationParser
// ---------------------------------------------------------------------------

// FindConversationFile locates the conversation file for a given session.
// This base implementation handles the "flat" path convention where the
// conversation file is simply <conversations-dir>/<sessionID>.<ext>.
// Adapters should override for "encoded", "date-nested", and "hash" conventions.
func (p *ConfigProvider) FindConversationFile(sessionID, _ string) (string, error) {
	convDir := ExpandPath(p.Cfg.Paths.Conversations)
	ext := p.Cfg.Conversations.FileExtension
	if ext == "" {
		ext = ".jsonl"
	}

	path := filepath.Join(convDir, sessionID+ext)
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("conversation file not found: %s", path)
	}
	return path, nil
}

// ParseConversation reads a conversation from the given reader.
// This base implementation handles JSONL encoding (one JSON object per line).
// Adapters should override for JSON encoding or complex content structures.
func (p *ConfigProvider) ParseConversation(r io.Reader) (*ConversationData, error) {
	if p.Cfg.Conversations.Encoding == "json" {
		return p.parseJSONConversation(r)
	}
	return p.parseJSONLConversation(r)
}

// parseJSONLConversation reads JSONL line by line.
func (p *ConfigProvider) parseJSONLConversation(r io.Reader) (*ConversationData, error) {
	scanner := bufio.NewScanner(r)
	// Increase buffer for large JSONL lines (1MB)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	conv := &ConversationData{
		Provider: p.Cfg.Provider,
	}

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var raw map[string]any
		if err := json.Unmarshal(line, &raw); err != nil {
			continue // skip malformed lines
		}

		msg := p.rawToMessage(raw)
		if msg != nil {
			conv.Messages = append(conv.Messages, *msg)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan JSONL: %w", err)
	}

	return conv, nil
}

// parseJSONConversation reads the entire reader as a single JSON object.
func (p *ConfigProvider) parseJSONConversation(r io.Reader) (*ConversationData, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("read JSON conversation: %w", err)
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse JSON conversation: %w", err)
	}

	conv := &ConversationData{
		Provider: p.Cfg.Provider,
	}

	// Extract sessionId if present
	if id, ok := extractString(raw, "sessionId"); ok {
		conv.SessionID = id
	}

	// Look for a messages array
	if msgs, ok := raw["messages"]; ok {
		if arr, ok := msgs.([]any); ok {
			for _, item := range arr {
				if m, ok := item.(map[string]any); ok {
					msg := p.rawToMessage(m)
					if msg != nil {
						conv.Messages = append(conv.Messages, *msg)
					}
				}
			}
		}
	}

	return conv, nil
}

// rawToMessage converts a raw JSON map to a normalized Message using the
// configured message type matching rules.
func (p *ConfigProvider) rawToMessage(raw map[string]any) *Message {
	msgType := p.matchMessageType(raw)
	if msgType == "" {
		return nil
	}

	msg := &Message{
		Type: msgType,
	}

	// Extract common fields
	if v, ok := extractString(raw, "id"); ok {
		msg.ID = v
	}
	if v, ok := extractString(raw, "content"); ok {
		msg.Content = v
	}
	if v, ok := extractString(raw, "timestamp"); ok {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			msg.Timestamp = t
		}
	}
	if v, ok := extractString(raw, "model"); ok {
		msg.Model = v
	}

	// Extract usage if present
	usage := p.ParseUsage(raw)
	if usage != nil && usage.ComputedTotal() > 0 {
		msg.Usage = usage
	}

	return msg
}

// matchMessageType checks a raw JSON map against configured message type rules.
func (p *ConfigProvider) matchMessageType(raw map[string]any) MessageType {
	for typeName, typeConfig := range p.Cfg.Conversations.MessageTypes {
		for _, rule := range typeConfig.Match {
			if v, ok := extractString(raw, rule.Field); ok && v == rule.Value {
				return normalizeMessageType(typeName)
			}
		}
	}
	return ""
}

// normalizeMessageType maps a config type name to the MessageType constants.
func normalizeMessageType(name string) MessageType {
	switch name {
	case "user":
		return MessageUser
	case "assistant":
		return MessageAssistant
	case "tool_use":
		return MessageToolUse
	case "tool_result":
		return MessageToolResult
	case "system":
		return MessageSystem
	case "thinking":
		return MessageThinking
	case "error":
		return MessageError
	default:
		// Unknown types get passed through as-is
		return MessageType(name)
	}
}

// ---------------------------------------------------------------------------
// CostCalculator
// ---------------------------------------------------------------------------

// ParseUsage extracts a normalized TokenUsage from a raw JSON map
// by traversing the configured usage locations and field mappings.
func (p *ConfigProvider) ParseUsage(raw map[string]any) *TokenUsage {
	usageCfg := p.Cfg.Conversations.Usage

	// Try each configured location to find the usage object
	var usageObj map[string]any
	for _, loc := range usageCfg.Locations {
		if obj := navigatePath(raw, loc); obj != nil {
			usageObj = obj
			break
		}
	}

	if usageObj == nil {
		return nil
	}

	usage := &TokenUsage{}
	fields := usageCfg.Fields

	if v, ok := extractInt64(usageObj, fields["input"]); ok {
		usage.Input = v
	}
	if v, ok := extractInt64(usageObj, fields["output"]); ok {
		usage.Output = v
	}
	if f, ok := fields["cache_read"]; ok {
		if v, ok := extractInt64(usageObj, f); ok {
			usage.CacheRead = v
		}
	}
	if f, ok := fields["cache_write"]; ok {
		if v, ok := extractInt64(usageObj, f); ok {
			usage.CacheWrite = v
		}
	}
	if f, ok := fields["thinking"]; ok {
		if v, ok := extractInt64(usageObj, f); ok {
			usage.Thinking = v
		}
	}
	if f, ok := fields["tool"]; ok {
		if v, ok := extractInt64(usageObj, f); ok {
			usage.Tool = v
		}
	}
	if f, ok := fields["total"]; ok {
		if v, ok := extractInt64(usageObj, f); ok {
			usage.Total = v
		}
	}

	return usage
}

// CalculateCost computes cost in microdollars by matching the model string
// against pricing tiers using substring matching.
// 1 USD = 1_000_000 microdollars.
func (p *ConfigProvider) CalculateCost(model string, usage TokenUsage) int64 {
	tier := p.findPricingTier(model)
	if tier == nil {
		return 0
	}

	// Cost per token = rate_per_million / 1_000_000
	// Microdollars per token = rate_per_million * 1_000_000 / 1_000_000 = rate_per_million
	// But rate is per million tokens, so: microdollars = tokens * rate / 1_000_000 * 1_000_000
	// Simplified: microdollars = tokens * rate
	// Wait — let's be precise:
	//   cost_dollars = (tokens / 1_000_000) * rate_per_m
	//   cost_microdollars = cost_dollars * 1_000_000 = tokens * rate_per_m
	// So microdollars = tokens * rate_per_m (because rate is already per-million).

	var total float64
	total += float64(usage.Input) * tier.InputPerM
	total += float64(usage.Output) * tier.OutputPerM
	total += float64(usage.CacheRead) * tier.CacheReadPerM
	total += float64(usage.CacheWrite) * tier.CacheWritePerM

	return int64(total)
}

// findPricingTier finds the best matching pricing tier for a model string.
// Uses case-insensitive substring matching.
func (p *ConfigProvider) findPricingTier(model string) *PriceTier {
	lower := strings.ToLower(model)

	for _, tier := range p.Cfg.Pricing.Tiers {
		if strings.Contains(lower, strings.ToLower(tier.Match)) {
			t := tier // copy to avoid loop variable capture
			return &t
		}
	}

	// Fall back to default tier
	if def, ok := p.Cfg.Pricing.Tiers[p.Cfg.Pricing.DefaultTier]; ok {
		return &def
	}

	return nil
}

// ---------------------------------------------------------------------------
// CommandRunner
// ---------------------------------------------------------------------------

// ResumeCommand returns the CLI command to resume an existing session.
func (p *ConfigProvider) ResumeCommand(sessionID string) string {
	cmd := p.Cfg.Commands.Resume
	cmd = strings.ReplaceAll(cmd, "${SESSION_ID}", sessionID)
	return cmd
}

// NewSessionCommand returns the CLI command to start a new session.
func (p *ConfigProvider) NewSessionCommand(cwd string) string {
	cmd := p.Cfg.Commands.NewSession
	cmd = strings.ReplaceAll(cmd, "${CWD}", cwd)
	return cmd
}

// AIGenerateCommand returns the CLI command for AI generation.
func (p *ConfigProvider) AIGenerateCommand(prompt string) string {
	cmd := p.Cfg.Commands.AIGenerate
	cmd = strings.ReplaceAll(cmd, "${PROMPT}", prompt)
	return cmd
}

// PromptTransport returns how prompts are passed to the CLI.
func (p *ConfigProvider) PromptTransport() PromptTransport {
	switch p.Cfg.Commands.PromptTransport {
	case "stdin":
		return PromptStdin
	case "file":
		return PromptFile
	case "socket":
		return PromptSocket
	default:
		return PromptArgv
	}
}

// ---------------------------------------------------------------------------
// HealthCheck
// ---------------------------------------------------------------------------

// HealthCheck performs a full liveness probe combining installation check,
// version detection, and basic credential verification.
func (p *ConfigProvider) HealthCheck(_ context.Context) HealthStatus {
	status := HealthStatus{}

	// Check binary exists
	_, err := exec.LookPath(p.Cfg.Detection.Binary)
	if err != nil {
		status.Error = fmt.Sprintf("binary %q not found on PATH", p.Cfg.Detection.Binary)
		return status
	}
	status.Installed = true

	// Check version
	version := p.DetectedVersion()
	if version != "" {
		status.Reachable = true
		status.Version = version
	}

	// Check credentials by looking for settings/config file
	settings := ExpandPath(p.Cfg.Paths.Settings)
	if _, err := os.Stat(settings); err == nil {
		status.HasAuth = true
	}

	return status
}

// ---------------------------------------------------------------------------
// JSON navigation helpers
// ---------------------------------------------------------------------------

// extractString gets a string value from a map by key.
func extractString(m map[string]any, key string) (string, bool) {
	if key == "" {
		return "", false
	}
	// Support dot-separated paths
	if strings.Contains(key, ".") {
		parts := strings.SplitN(key, ".", 2)
		if sub, ok := m[parts[0]]; ok {
			if subMap, ok := sub.(map[string]any); ok {
				return extractString(subMap, parts[1])
			}
		}
		return "", false
	}
	v, ok := m[key]
	if !ok {
		return "", false
	}
	switch val := v.(type) {
	case string:
		return val, true
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64), true
	default:
		return fmt.Sprintf("%v", val), true
	}
}

// extractInt gets an int value from a map by key.
func extractInt(m map[string]any, key string) (int, bool) {
	if key == "" {
		return 0, false
	}
	v, ok := m[key]
	if !ok {
		return 0, false
	}
	switch val := v.(type) {
	case float64:
		return int(val), true
	case int:
		return val, true
	case string:
		if n, err := strconv.Atoi(val); err == nil {
			return n, true
		}
	}
	return 0, false
}

// extractInt64 gets an int64 value from a map by key.
func extractInt64(m map[string]any, key string) (int64, bool) {
	if key == "" {
		return 0, false
	}
	v, ok := m[key]
	if !ok {
		return 0, false
	}
	switch val := v.(type) {
	case float64:
		return int64(val), true
	case int:
		return int64(val), true
	case int64:
		return val, true
	case string:
		if n, err := strconv.ParseInt(val, 10, 64); err == nil {
			return n, true
		}
	}
	return 0, false
}

// navigatePath traverses a dot-separated path in a JSON map to find
// a nested map[string]any. Returns nil if the path doesn't resolve.
func navigatePath(m map[string]any, path string) map[string]any {
	if path == "" {
		return nil
	}

	parts := strings.Split(path, ".")
	current := m

	for i, part := range parts {
		v, ok := current[part]
		if !ok {
			return nil
		}
		sub, ok := v.(map[string]any)
		if !ok {
			// If this is the last part and we can't get a map, return nil
			return nil
		}
		if i == len(parts)-1 {
			return sub
		}
		current = sub
	}

	return current
}
