// chat_rules.go defines default safety rules for the chat/message flow.
// These rules catch secrets in prompts, command injection attempts, and
// other chat-specific risks that the general stream wards don't cover.
//
// Author: Subash Karki
package safety

// ChatRules returns the default set of rules for evaluating chat messages.
// These are separate from the YAML ward rules — they are always active
// when safety is enabled for the chat flow.
func ChatRules() []Rule {
	rules := []Rule{
		{
			ID:          "chat-pii-secrets",
			Name:        "Secrets in chat prompt",
			Level:       LevelWarn,
			Description: "Detects API keys, AWS credentials, tokens, and passwords in user messages before they are sent to the AI provider",
			Pattern:     `(AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{20,}|xoxb-[a-zA-Z0-9\-]{10,}|xoxp-[a-zA-Z0-9\-]{10,}|sk-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,})`,
			Message:     "Possible secret or API key detected in chat message — consider removing it before sending",
			Enabled:     true,
			Audit:       true,
			Tags:        []string{"chat", "pii"},
		},
		{
			ID:          "chat-password-leak",
			Name:        "Password in chat prompt",
			Level:       LevelWarn,
			Description: "Detects password assignments or credentials in user messages",
			Pattern:     `(?i)(password|passwd|secret|credential)\s*[=:]\s*\S{4,}`,
			Message:     "Possible password or credential detected in chat message",
			Enabled:     true,
			Audit:       true,
			Tags:        []string{"chat", "pii"},
		},
		{
			ID:          "chat-command-injection",
			Name:        "Command injection in prompt",
			Level:       LevelWarn,
			Description: "Detects shell command injection patterns that could trick the AI into executing dangerous commands",
			Pattern:     `(?i)(;\s*(rm|wget|curl|chmod|chown|dd|mkfs|shutdown|reboot)\s|&&\s*(rm|wget|curl)\s|\|\s*(rm|bash|sh|zsh)\s)`,
			Message:     "Possible command injection pattern detected in prompt",
			Enabled:     true,
			Audit:       true,
			Tags:        []string{"chat", "injection"},
		},
		{
			ID:          "chat-prompt-injection",
			Name:        "Prompt injection attempt",
			Level:       LevelLog,
			Description: "Detects common prompt injection patterns like 'ignore previous instructions' or role overrides",
			Pattern:     `(?i)(ignore\s+(all\s+)?previous\s+instructions|you\s+are\s+now\s+|forget\s+(everything|all|your)\s|disregard\s+(all|your|the)\s+(previous|above))`,
			Message:     "Possible prompt injection attempt detected",
			Enabled:     true,
			Audit:       true,
			Tags:        []string{"chat", "injection"},
		},
		{
			ID:          "chat-env-file-content",
			Name:        "Environment file content in prompt",
			Level:       LevelWarn,
			Description: "Detects .env file content patterns being pasted into chat messages",
			Pattern:     `(?m)^[A-Z_]{2,}=\S+.*\n[A-Z_]{2,}=\S+`,
			Message:     "Looks like .env file content — secrets may be exposed to the AI provider",
			Enabled:     true,
			Audit:       true,
			Tags:        []string{"chat", "pii"},
		},
	}

	// Pre-compile all patterns.
	for i := range rules {
		_ = rules[i].Compile()
	}

	return rules
}
