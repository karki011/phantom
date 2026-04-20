// pii.go implements PII detection and masking for the PhantomOS Safety Rules Engine.
// Author: Subash Karki
package safety

import (
	"regexp"
	"strings"
)

// PIIType classifies the kind of sensitive data detected.
type PIIType string

const (
	PIIEmail    PIIType = "email"
	PIIAPIKey   PIIType = "api_key"
	PIIAWSKey   PIIType = "aws_key"
	PIIPassword PIIType = "password"
	PIIToken    PIIType = "token"
)

// PIIMatch represents a single detected piece of PII.
type PIIMatch struct {
	Type     PIIType `json:"type"`
	Value    string  `json:"value"` // masked version
	Position int     `json:"position"`
}

// piiPattern ties a PIIType to a compiled regex and a masker function.
type piiPattern struct {
	ptype   PIIType
	re      *regexp.Regexp
	maskFn  func(s string) string
}

// defaultMask replaces all but the first 4 chars with asterisks.
func defaultMask(s string) string {
	if len(s) <= 4 {
		return strings.Repeat("*", len(s))
	}
	return s[:4] + strings.Repeat("*", len(s)-4)
}

// emailMask hides the local part: user@example.com → u***@example.com
func emailMask(s string) string {
	at := strings.Index(s, "@")
	if at <= 1 {
		return strings.Repeat("*", len(s))
	}
	return s[:1] + strings.Repeat("*", at-1) + s[at:]
}

var piiPatterns = []piiPattern{
	{
		ptype:  PIIEmail,
		re:     regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`),
		maskFn: emailMask,
	},
	{
		ptype:  PIIAWSKey,
		re:     regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
		maskFn: defaultMask,
	},
	{
		ptype:  PIIToken,
		re:     regexp.MustCompile(`(ghp_|gho_|github_pat_|xoxb-|xoxp-)[a-zA-Z0-9_\-]{10,}`),
		maskFn: defaultMask,
	},
	{
		ptype:  PIIAPIKey,
		re:     regexp.MustCompile(`(sk|key)-[a-zA-Z0-9]{20,}`),
		maskFn: defaultMask,
	},
	// AWS secret: 40-char base64-ish strings preceded by "secret" keyword within 30 chars.
	{
		ptype:  PIIAWSKey,
		re:     regexp.MustCompile(`(?i)secret[^=\n]{0,30}=\s*([A-Za-z0-9+/]{40})`),
		maskFn: defaultMask,
	},
	// Passwords in key=value context.
	{
		ptype:  PIIPassword,
		re:     regexp.MustCompile(`(?i)(password|passwd|secret)\s*[=:]\s*\S+`),
		maskFn: func(s string) string {
			idx := strings.IndexAny(s, "=:")
			if idx < 0 {
				return defaultMask(s)
			}
			prefix := s[:idx+1]
			val := strings.TrimSpace(s[idx+1:])
			return prefix + defaultMask(val)
		},
	},
}

// ScanForPII scans text for common PII patterns and returns all matches.
// The Value field contains the masked version of the detected string.
func ScanForPII(text string) []PIIMatch {
	var matches []PIIMatch
	for _, p := range piiPatterns {
		locs := p.re.FindAllStringIndex(text, -1)
		for _, loc := range locs {
			raw := text[loc[0]:loc[1]]
			matches = append(matches, PIIMatch{
				Type:     p.ptype,
				Value:    p.maskFn(raw),
				Position: loc[0],
			})
		}
	}
	return matches
}

// MaskPII replaces all detected PII in text with masked versions.
func MaskPII(text string) string {
	for _, p := range piiPatterns {
		text = p.re.ReplaceAllStringFunc(text, p.maskFn)
	}
	return text
}
