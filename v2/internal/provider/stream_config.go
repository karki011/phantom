// Package provider — StreamConfig: a lightweight struct for passing provider
// configuration to the stream parser without requiring a full Provider dependency.
//
// Author: Subash Karki
// Date: 2026-04-26
package provider

// StreamConfig holds the subset of provider configuration needed by the
// stream parser for message type classification, usage extraction, and
// content block handling.
type StreamConfig struct {
	// MessageTypeRules maps normalized type names (e.g. "user", "assistant")
	// to the matching rules from the provider's YAML config.
	MessageTypeRules map[string][]MatchRule

	// UsageLocations lists dot-separated JSON paths where token usage
	// blocks may appear (e.g. "usage", "message.usage", "result.usage").
	UsageLocations []string

	// UsageFields maps normalized field names (e.g. "input", "output")
	// to the provider-specific JSON field names (e.g. "input_tokens").
	UsageFields map[string]string

	// ContentExtraction identifies the content block strategy used by
	// this provider (e.g. "claude-blocks", "openai-events", "gemini-messages").
	ContentExtraction string
}

// NewStreamConfig creates a StreamConfig from a ProviderConfig, extracting
// the relevant conversation parsing configuration.
func NewStreamConfig(cfg *ProviderConfig) *StreamConfig {
	if cfg == nil {
		return nil
	}

	rules := make(map[string][]MatchRule, len(cfg.Conversations.MessageTypes))
	for typeName, typeConfig := range cfg.Conversations.MessageTypes {
		rules[typeName] = typeConfig.Match
	}

	return &StreamConfig{
		MessageTypeRules:  rules,
		UsageLocations:    cfg.Conversations.Usage.Locations,
		UsageFields:       cfg.Conversations.Usage.Fields,
		ContentExtraction: cfg.Conversations.ContentExtraction,
	}
}
