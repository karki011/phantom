// Author: Subash Karki
//
// HaikuClient calls Anthropic's Messages API with Claude Haiku for lightweight
// LLM tasks such as pattern consolidation. Uses direct HTTP — no SDK dependency.
package knowledge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	anthropicAPIURL     = "https://api.anthropic.com/v1/messages"
	anthropicAPIVersion = "2023-06-01"
	haikuModel          = "claude-haiku-4-5-20251001"
	haikuMaxTokens      = 1024
	haikuTimeout        = 30 * time.Second
)

// HaikuClient sends prompts to the Anthropic Messages API using Haiku.
type HaikuClient struct {
	apiKey     string
	httpClient *http.Client
}

// NewHaikuClient creates a client. Returns nil if apiKey is empty (graceful skip).
func NewHaikuClient(apiKey string) *HaikuClient {
	if apiKey == "" {
		return nil
	}
	return &HaikuClient{
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: haikuTimeout},
	}
}

// haikuRequest is the Anthropic Messages API request body.
type haikuRequest struct {
	Model     string     `json:"model"`
	MaxTokens int        `json:"max_tokens"`
	System    string     `json:"system,omitempty"`
	Messages  []haikuMsg `json:"messages"`
}

// haikuMsg is a single message in the conversation.
type haikuMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// haikuResponse is the Anthropic Messages API response body.
type haikuResponse struct {
	Content []haikuContentBlock `json:"content"`
	Usage   haikuUsage          `json:"usage"`
}

type haikuContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type haikuUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// Call sends a prompt to Haiku and returns the text response plus token counts.
func (h *HaikuClient) Call(ctx context.Context, system, userPrompt string) (text string, inTok, outTok int, err error) {
	reqBody := haikuRequest{
		Model:     haikuModel,
		MaxTokens: haikuMaxTokens,
		System:    system,
		Messages:  []haikuMsg{{Role: "user", Content: userPrompt}},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", 0, 0, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", anthropicAPIURL, bytes.NewReader(body))
	if err != nil {
		return "", 0, 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("x-api-key", h.apiKey)
	req.Header.Set("anthropic-version", anthropicAPIVersion)
	req.Header.Set("content-type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return "", 0, 0, fmt.Errorf("http call: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", 0, 0, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", 0, 0, fmt.Errorf("haiku API %d: %s", resp.StatusCode, string(respBody))
	}

	var hResp haikuResponse
	if err := json.Unmarshal(respBody, &hResp); err != nil {
		return "", 0, 0, fmt.Errorf("parse response: %w", err)
	}

	if len(hResp.Content) == 0 {
		return "", 0, 0, fmt.Errorf("empty response from haiku")
	}

	return hResp.Content[0].Text, hResp.Usage.InputTokens, hResp.Usage.OutputTokens, nil
}

// --- Consolidation types and parsing ---

// ConsolidatedPattern is the LLM-produced merged pattern from a cluster.
type ConsolidatedPattern struct {
	StrategyID   string   `json:"strategy_id"`
	Description  string   `json:"description"`
	SuccessRate  float64  `json:"success_rate"`
	Conditions   []string `json:"conditions"`
	FailureModes []string `json:"failure_modes"`
	SampleSize   int      `json:"sample_size"`
}

// ConsolidationResult wraps the pattern and the IDs of consumed decisions.
type ConsolidationResult struct {
	Pattern           ConsolidatedPattern `json:"consolidated_pattern"`
	DecisionsConsumed []string            `json:"decisions_consumed"`
}

// parseConsolidation extracts a ConsolidationResult from Haiku's text output.
// Tries direct JSON parse first, then falls back to extracting JSON from
// markdown code fences or raw braces.
func parseConsolidation(text string) (*ConsolidationResult, error) {
	text = strings.TrimSpace(text)

	// Direct parse.
	var result ConsolidationResult
	if err := json.Unmarshal([]byte(text), &result); err == nil {
		if err := validateConsolidation(&result); err != nil {
			return nil, err
		}
		return &result, nil
	}

	// Fallback: extract JSON block from markdown fences or bare braces.
	extracted := extractJSON(text)
	if extracted == "" {
		return nil, fmt.Errorf("no valid JSON in haiku response")
	}

	if err := json.Unmarshal([]byte(extracted), &result); err != nil {
		return nil, fmt.Errorf("parse extracted JSON: %w", err)
	}
	if err := validateConsolidation(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

// extractJSON finds the outermost { ... } block in text.
func extractJSON(text string) string {
	start := strings.Index(text, "{")
	if start < 0 {
		return ""
	}
	end := strings.LastIndex(text, "}")
	if end <= start {
		return ""
	}
	return text[start : end+1]
}

// validateConsolidation sanity-checks the parsed result.
func validateConsolidation(r *ConsolidationResult) error {
	if r.Pattern.StrategyID == "" {
		return fmt.Errorf("consolidation missing strategy_id")
	}
	if r.Pattern.SuccessRate < 0 || r.Pattern.SuccessRate > 1 {
		return fmt.Errorf("consolidation success_rate %.2f out of [0,1]", r.Pattern.SuccessRate)
	}
	if r.Pattern.SampleSize <= 0 {
		return fmt.Errorf("consolidation sample_size %d must be > 0", r.Pattern.SampleSize)
	}
	if len(r.DecisionsConsumed) == 0 {
		return fmt.Errorf("consolidation consumed no decisions")
	}
	return nil
}
