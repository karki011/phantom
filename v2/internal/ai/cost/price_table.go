// Package cost provides client-side price estimation for AI model token usage.
// Prices are per million tokens in USD, using longest-prefix matching so new
// model versions get reasonable defaults without requiring table updates.
//
// Author: Subash Karki
package cost

import "strings"

// CostModelVersion stamps all reports for interpretability when pricing changes.
const CostModelVersion = "2026-05-09"

// PriceEntry holds per-model pricing in USD per million tokens.
type PriceEntry struct {
	InputPrice      float64
	OutputPrice     float64
	CacheReadPrice  float64
	CacheWritePrice float64
}

// ModelPrices maps model ID prefix to pricing.
// Keys are matched using longest-prefix so "claude-opus-4-6-20260501" hits "claude-opus-4".
var ModelPrices = map[string]PriceEntry{
	"claude-opus-4": {
		InputPrice:      15.0,
		OutputPrice:     75.0,
		CacheReadPrice:  1.5,
		CacheWritePrice: 18.75,
	},
	"claude-sonnet-4": {
		InputPrice:      3.0,
		OutputPrice:     15.0,
		CacheReadPrice:  0.3,
		CacheWritePrice: 3.75,
	},
	"claude-haiku": {
		InputPrice:      0.25,
		OutputPrice:     1.25,
		CacheReadPrice:  0.03,
		CacheWritePrice: 0.3,
	},
}

// lookupPrice finds the PriceEntry for a model string using longest-prefix matching.
// Falls back to a zero-cost entry when no prefix matches (unknown model).
func lookupPrice(model string) (PriceEntry, bool) {
	best := ""
	var entry PriceEntry
	lower := strings.ToLower(model)
	for prefix, p := range ModelPrices {
		if strings.HasPrefix(lower, prefix) && len(prefix) > len(best) {
			best = prefix
			entry = p
		}
	}
	return entry, best != ""
}

// EstimateCost returns the estimated cost in USD for a given model and token counts.
// Token counts are raw integers; pricing is applied per-million.
// Returns 0 when the model is unrecognised.
func EstimateCost(model string, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens int64) float64 {
	p, ok := lookupPrice(model)
	if !ok {
		return 0
	}
	const perMillion = 1_000_000.0
	return (float64(inputTokens)*p.InputPrice +
		float64(outputTokens)*p.OutputPrice +
		float64(cacheReadTokens)*p.CacheReadPrice +
		float64(cacheWriteTokens)*p.CacheWritePrice) / perMillion
}
