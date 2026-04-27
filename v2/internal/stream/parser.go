// parser.go classifies individual JSONL lines from Claude conversation logs
// into typed, structured Events.
// Author: Subash Karki
package stream

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/pricing"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

func calcCostMicros(model string, input, output, cacheRead, cacheWrite int64) int64 {
	return pricing.CalculateCostMicros(model, input, output, cacheRead, cacheWrite)
}

// Parser classifies individual JSONL lines into typed Events.
// It maintains minimal state: session identity, a monotonic sequence counter,
// and the most-recently-seen model name.
type Parser struct {
	sessionID string
	seqNum    int
	model     string
	// streamCfg holds provider-specific configuration for message type
	// classification and usage extraction. When nil, the parser falls back
	// to the hardcoded Claude-specific logic for backward compatibility.
	streamCfg *provider.StreamConfig
}

// NewParser returns a new Parser for the given session.
func NewParser(sessionID string) *Parser {
	return &Parser{sessionID: sessionID}
}

// SetStreamConfig attaches provider-specific stream configuration to the parser.
// When set, the parser uses config-driven rules for message type classification
// and usage field extraction instead of the hardcoded Claude defaults.
// Passing nil restores the hardcoded fallback behavior.
func (p *Parser) SetStreamConfig(cfg *provider.StreamConfig) {
	p.streamCfg = cfg
}

// ParseLine takes a raw JSONL line and returns a typed Event, or nil if the
// line should be skipped (empty, malformed, or unrecognised type).
func (p *Parser) ParseLine(line []byte) *Event {
	if len(line) == 0 {
		return nil
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(line, &raw); err != nil {
		return nil
	}

	// When streamCfg is set, use config-driven message type matching.
	if p.streamCfg != nil {
		return p.parseLineWithConfig(raw)
	}

	// Hardcoded Claude-specific fallback (backward compatibility).
	return p.parseLineHardcoded(raw)
}

// parseLineWithConfig classifies a raw JSONL map using the provider's
// MessageTypeRules configuration. Falls back to the hardcoded path if
// no rule matches (e.g., for "result" lines that carry usage but have
// no explicit message type rule).
func (p *Parser) parseLineWithConfig(raw map[string]interface{}) *Event {
	matched := p.matchConfigType(raw)
	switch matched {
	case "user":
		return p.parseHuman(raw)
	case "assistant":
		return p.parseAssistant(raw)
	case "tool_result":
		return p.parseTopLevelToolResult(raw)
	case "system":
		return p.parseSystem(raw)
	}
	// "result" lines are Claude-specific usage carriers — fall through
	// to hardcoded logic so existing behavior is preserved.
	return p.parseLineHardcoded(raw)
}

// matchConfigType checks the raw JSON map against all configured
// MessageTypeRules and returns the first matching type name, or "".
func (p *Parser) matchConfigType(raw map[string]interface{}) string {
	for typeName, rules := range p.streamCfg.MessageTypeRules {
		for _, rule := range rules {
			if val, ok := raw[rule.Field]; ok {
				if s, ok := val.(string); ok && s == rule.Value {
					return typeName
				}
			}
			// Also check nested fields (e.g., "message.role")
			if strings.Contains(rule.Field, ".") {
				parts := strings.SplitN(rule.Field, ".", 2)
				if nested := extractMap(raw, parts[0]); nested != nil {
					if val, ok := nested[parts[1]]; ok {
						if s, ok := val.(string); ok && s == rule.Value {
							return typeName
						}
					}
				}
			}
		}
	}
	return ""
}

// parseLineHardcoded is the original Claude-specific classification logic,
// preserved for backward compatibility when streamCfg is nil.
func (p *Parser) parseLineHardcoded(raw map[string]interface{}) *Event {
	typ, _ := raw["type"].(string)

	switch typ {
	case "human":
		return p.parseHuman(raw)
	case "assistant":
		return p.parseAssistant(raw)
	case "tool_result":
		return p.parseTopLevelToolResult(raw)
	case "result":
		// "result" lines carry final usage — update cost on a synthetic event.
		return p.parseResult(raw)
	case "system":
		return p.parseSystem(raw)
	default:
		// Some lines have role instead of type
		role, _ := raw["role"].(string)
		switch role {
		case "user":
			return p.parseHuman(raw)
		case "assistant":
			return p.parseAssistant(raw)
		}
		return nil
	}
}

// --- helpers ---

func (p *Parser) nextEvent(evType EventType) *Event {
	ev := &Event{
		ID:        uuid.New().String(),
		SessionID: p.sessionID,
		Type:      evType,
		Timestamp: time.Now().UnixMilli(),
		SeqNum:    p.seqNum,
		Model:     p.model,
	}
	p.seqNum++
	return ev
}

// parseHuman handles {"type":"human", "message":{"role":"user","content":"..."}}
func (p *Parser) parseHuman(raw map[string]interface{}) *Event {
	ev := p.nextEvent(EventUser)
	ev.Content = extractMessageContent(raw)
	return ev
}

// parseAssistant handles {"type":"assistant","message":{"role":"assistant","content":[...]}}
// It may produce multiple events (one per content block), but we return the
// primary one. For multi-block messages the caller should use ParseLineMulti.
func (p *Parser) parseAssistant(raw map[string]interface{}) *Event {
	// Update model if present at message level
	msg := extractMap(raw, "message")
	if msg != nil {
		if m, _ := msg["model"].(string); m != "" {
			p.model = m
		}
		// Nested usage in message
		if usageMap := extractMap(msg, "usage"); usageMap != nil {
			_ = usageMap // used in ParseLineMulti path
		}
	}

	blocks := extractContentBlocks(raw)
	if len(blocks) == 0 {
		// No content blocks — emit a bare assistant event
		ev := p.nextEvent(EventAssistant)
		ev.Content = extractMessageContent(raw)
		return ev
	}

	// Return the first meaningful block; ParseLineMulti handles all blocks.
	for _, block := range blocks {
		blockType, _ := block["type"].(string)
		switch blockType {
		case "thinking":
			ev := p.nextEvent(EventThinking)
			ev.Content = stringField(block, "thinking")
			if ev.Content == "" {
				ev.Content = stringField(block, "text")
			}
			return ev
		case "text":
			ev := p.nextEvent(EventAssistant)
			ev.Content = stringField(block, "text")
			return ev
		case "tool_use":
			return p.buildToolUseEvent(block)
		case "tool_result":
			return p.buildToolResultEvent(block)
		}
	}
	return nil
}

// ParseLineMulti parses a JSONL line and returns ALL events it generates.
// Use this for thorough event-level ingestion (e.g., Store.SaveBatch).
func (p *Parser) ParseLineMulti(line []byte) []Event {
	if len(line) == 0 {
		return nil
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(line, &raw); err != nil {
		return nil
	}

	typ, _ := raw["type"].(string)
	role := func() string {
		if msg := extractMap(raw, "message"); msg != nil {
			r, _ := msg["role"].(string)
			return r
		}
		r, _ := raw["role"].(string)
		return r
	}()

	switch {
	case typ == "human" || role == "user":
		ev := p.parseHuman(raw)
		if ev != nil {
			return []Event{*ev}
		}
		return nil

	case typ == "assistant" || role == "assistant":
		return p.parseAssistantMulti(raw)

	case typ == "tool_result":
		ev := p.parseTopLevelToolResult(raw)
		if ev != nil {
			return []Event{*ev}
		}
		return nil

	case typ == "result":
		ev := p.parseResult(raw)
		if ev != nil {
			return []Event{*ev}
		}
		return nil

	case typ == "system":
		ev := p.parseSystem(raw)
		if ev != nil {
			return []Event{*ev}
		}
		return nil
	}
	return nil
}

func (p *Parser) parseAssistantMulti(raw map[string]interface{}) []Event {
	// Update model
	msg := extractMap(raw, "message")
	if msg != nil {
		if m, _ := msg["model"].(string); m != "" {
			p.model = m
		}
	}

	// Gather usage for cost calculation — use config-driven extraction when available.
	var inputTok, outputTok, cacheRead, cacheWrite int64
	if usageMap := extractUsageWithConfig(raw, p.streamCfg); usageMap != nil {
		inputTok, outputTok, cacheRead, cacheWrite = parseUsageMapWithConfig(usageMap, p.streamCfg)
	}

	blocks := extractContentBlocks(raw)
	var events []Event

	for _, block := range blocks {
		blockType, _ := block["type"].(string)
		var ev *Event
		switch blockType {
		case "thinking":
			ev = p.nextEvent(EventThinking)
			ev.Content = stringField(block, "thinking")
			if ev.Content == "" {
				ev.Content = stringField(block, "text")
			}
		case "text":
			ev = p.nextEvent(EventAssistant)
			ev.Content = stringField(block, "text")
		case "tool_use":
			ev = p.buildToolUseEvent(block)
		case "tool_result":
			ev = p.buildToolResultEvent(block)
		}
		if ev != nil {
			events = append(events, *ev)
		}
	}

	// Attach usage tokens to the last event in the group
	if len(events) > 0 && inputTok > 0 {
		last := &events[len(events)-1]
		last.InputTokens = inputTok
		last.OutputTokens = outputTok
		last.CacheRead = cacheRead
		last.CacheWrite = cacheWrite
		last.CostMicros = calcCostMicros(p.model, inputTok, outputTok, cacheRead, cacheWrite)
	}

	return events
}

func (p *Parser) buildToolUseEvent(block map[string]interface{}) *Event {
	ev := p.nextEvent(EventToolUse)
	ev.ToolName = stringField(block, "name")
	ev.ID = stringField(block, "id")
	if ev.ID == "" {
		ev.ID = uuid.New().String()
	}

	inputRaw := block["input"]
	if inputRaw != nil {
		b, err := json.Marshal(inputRaw)
		if err == nil {
			ev.ToolInput = string(b)
		}
		if inputMap, ok := inputRaw.(map[string]interface{}); ok {
			p.extractToolFields(ev, inputMap)
		}
	}
	return ev
}

// extractToolFields populates file path, diff, command etc. from tool input.
func (p *Parser) extractToolFields(ev *Event, input map[string]interface{}) {
	switch ev.ToolName {
	case "Read", "Write", "Edit", "MultiEdit":
		ev.FilePath = stringField(input, "file_path")
		if ev.ToolName == "Edit" {
			old := stringField(input, "old_string")
			new_ := stringField(input, "new_string")
			ev.OldContent = old
			ev.NewContent = new_
			ev.DiffContent = buildUnifiedDiff(ev.FilePath, old, new_)
		} else if ev.ToolName == "Write" {
			ev.NewContent = stringField(input, "content")
		}
	case "Bash":
		ev.Content = stringField(input, "command")
	case "Grep":
		pattern := stringField(input, "pattern")
		path := stringField(input, "path")
		ev.Content = fmt.Sprintf("pattern=%s path=%s", pattern, path)
		ev.FilePath = path
	case "Glob":
		pattern := stringField(input, "pattern")
		path := stringField(input, "path")
		ev.Content = fmt.Sprintf("pattern=%s path=%s", pattern, path)
		ev.FilePath = path
	default:
		// For unknown tools, try to grab file_path if present
		if fp := stringField(input, "file_path"); fp != "" {
			ev.FilePath = fp
		}
	}
}

func (p *Parser) buildToolResultEvent(block map[string]interface{}) *Event {
	ev := p.nextEvent(EventToolResult)
	ev.ToolResultID = stringField(block, "tool_use_id")
	isErr, _ := block["is_error"].(bool)
	ev.IsError = isErr
	ev.Content = extractBlockContent(block)
	return ev
}

func (p *Parser) parseTopLevelToolResult(raw map[string]interface{}) *Event {
	ev := p.nextEvent(EventToolResult)
	ev.ToolResultID = stringField(raw, "tool_use_id")
	isErr, _ := raw["is_error"].(bool)
	ev.IsError = isErr
	ev.Content = extractBlockContent(raw)
	return ev
}

func (p *Parser) parseResult(raw map[string]interface{}) *Event {
	usageMap := extractUsageWithConfig(raw, p.streamCfg)
	if usageMap == nil {
		return nil
	}
	input, output, cacheRead, cacheWrite := parseUsageMapWithConfig(usageMap, p.streamCfg)
	if input == 0 && output == 0 {
		return nil
	}

	ev := p.nextEvent(EventSystem)
	ev.Content = "usage"
	ev.InputTokens = input
	ev.OutputTokens = output
	ev.CacheRead = cacheRead
	ev.CacheWrite = cacheWrite
	ev.CostMicros = calcCostMicros(p.model, input, output, cacheRead, cacheWrite)
	return ev
}

func (p *Parser) parseSystem(raw map[string]interface{}) *Event {
	ev := p.nextEvent(EventSystem)
	ev.Content = extractMessageContent(raw)
	return ev
}

// --- JSON extraction helpers ---

func extractMap(m map[string]interface{}, key string) map[string]interface{} {
	v, ok := m[key]
	if !ok {
		return nil
	}
	result, _ := v.(map[string]interface{})
	return result
}

func stringField(m map[string]interface{}, key string) string {
	s, _ := m[key].(string)
	return s
}

// extractMessageContent digs for text content in human/system messages.
func extractMessageContent(raw map[string]interface{}) string {
	msg := extractMap(raw, "message")
	if msg == nil {
		msg = raw
	}

	content, ok := msg["content"]
	if !ok {
		return ""
	}

	switch v := content.(type) {
	case string:
		return v
	case []interface{}:
		for _, item := range v {
			block, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			if t, _ := block["type"].(string); t == "text" {
				if text := stringField(block, "text"); text != "" {
					return text
				}
			}
		}
	}
	return ""
}

// extractContentBlocks returns the content array from an assistant message.
func extractContentBlocks(raw map[string]interface{}) []map[string]interface{} {
	msg := extractMap(raw, "message")
	if msg == nil {
		msg = raw
	}

	content, ok := msg["content"]
	if !ok {
		return nil
	}

	arr, ok := content.([]interface{})
	if !ok {
		return nil
	}

	var blocks []map[string]interface{}
	for _, item := range arr {
		if block, ok := item.(map[string]interface{}); ok {
			blocks = append(blocks, block)
		}
	}
	return blocks
}

// extractBlockContent returns text content from a tool_result block.
func extractBlockContent(block map[string]interface{}) string {
	switch v := block["content"].(type) {
	case string:
		return v
	case []interface{}:
		for _, item := range v {
			if b, ok := item.(map[string]interface{}); ok {
				if t, _ := b["type"].(string); t == "text" {
					if text := stringField(b, "text"); text != "" {
						return text
					}
				}
			}
		}
	}
	return ""
}

// extractUsage finds the usage block, checking both top-level and message-nested locations.
// This is the hardcoded Claude-specific version used when streamCfg is nil.
func extractUsage(raw map[string]interface{}) map[string]interface{} {
	if u := extractMap(raw, "usage"); u != nil {
		return u
	}
	if msg := extractMap(raw, "message"); msg != nil {
		if u := extractMap(msg, "usage"); u != nil {
			return u
		}
	}
	// result lines may nest under "result"
	if result := extractMap(raw, "result"); result != nil {
		if u := extractMap(result, "usage"); u != nil {
			return u
		}
	}
	return nil
}

// extractUsageWithConfig finds the usage block using the provider's configured
// UsageLocations. Falls back to the hardcoded logic if no config locations match.
func extractUsageWithConfig(raw map[string]interface{}, cfg *provider.StreamConfig) map[string]interface{} {
	if cfg == nil || len(cfg.UsageLocations) == 0 {
		return extractUsage(raw)
	}
	for _, loc := range cfg.UsageLocations {
		// Navigate dot-separated path (e.g., "message.usage" → raw["message"]["usage"])
		obj := navigateToMap(raw, loc)
		if obj != nil {
			return obj
		}
	}
	// Fall back to hardcoded if config-driven locations found nothing.
	return extractUsage(raw)
}

// navigateToMap traverses a dot-separated path in a JSON map to find a nested map.
// The last segment is the target key. Returns nil if the path doesn't resolve.
func navigateToMap(m map[string]interface{}, path string) map[string]interface{} {
	parts := strings.Split(path, ".")
	current := m
	for i, part := range parts {
		v, ok := current[part]
		if !ok {
			return nil
		}
		sub, ok := v.(map[string]interface{})
		if !ok {
			return nil
		}
		if i == len(parts)-1 {
			return sub
		}
		current = sub
	}
	return current
}

// parseUsageMap extracts token counts from a usage map using hardcoded Claude field names.
func parseUsageMap(u map[string]interface{}) (input, output, cacheRead, cacheWrite int64) {
	input = toInt64(u["input_tokens"])
	output = toInt64(u["output_tokens"])
	cacheRead = toInt64(u["cache_read_input_tokens"])
	cacheWrite = toInt64(u["cache_creation_input_tokens"])
	return
}

// parseUsageMapWithConfig extracts token counts from a usage map using the
// provider's configured UsageFields. Falls back to hardcoded field names if
// cfg is nil or the fields map is empty.
func parseUsageMapWithConfig(u map[string]interface{}, cfg *provider.StreamConfig) (input, output, cacheRead, cacheWrite int64) {
	if cfg == nil || len(cfg.UsageFields) == 0 {
		return parseUsageMap(u)
	}
	fields := cfg.UsageFields
	if f, ok := fields["input"]; ok {
		input = toInt64(u[f])
	}
	if f, ok := fields["output"]; ok {
		output = toInt64(u[f])
	}
	if f, ok := fields["cache_read"]; ok {
		cacheRead = toInt64(u[f])
	}
	if f, ok := fields["cache_write"]; ok {
		cacheWrite = toInt64(u[f])
	}
	return
}

func toInt64(v interface{}) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case int:
		return int64(n)
	}
	return 0
}

// buildUnifiedDiff produces a minimal unified diff between old and new strings.
func buildUnifiedDiff(filePath, old, new_ string) string {
	if old == new_ {
		return ""
	}
	oldLines := strings.Split(old, "\n")
	newLines := strings.Split(new_, "\n")

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("--- a/%s\n", filePath))
	sb.WriteString(fmt.Sprintf("+++ b/%s\n", filePath))
	sb.WriteString("@@ -1 +1 @@\n")
	for _, l := range oldLines {
		sb.WriteString("-")
		sb.WriteString(l)
		sb.WriteString("\n")
	}
	for _, l := range newLines {
		sb.WriteString("+")
		sb.WriteString(l)
		sb.WriteString("\n")
	}
	return sb.String()
}
