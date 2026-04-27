// Package pricing provides shared model pricing tables and cost calculation
// for the PhantomOS collector and stream packages.
// Author: Subash Karki
package pricing

import (
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// ModelPricing holds the token rates for a Claude model tier.
// All prices are in US dollars per one million tokens.
//
// Cost formula (microdollars):
//
//	micros = tokens * pricePerMillion
//
// (because tokens/1M * price * 1M_micros = tokens * price).
type ModelPricing struct {
	InputPerM      float64 // $/1M input tokens
	OutputPerM     float64 // $/1M output tokens
	CacheReadPerM  float64 // $/1M cache-read tokens
	CacheWritePerM float64 // $/1M cache-write tokens
}

var pricingTable = map[string]ModelPricing{
	"sonnet": {InputPerM: 3, OutputPerM: 15, CacheReadPerM: 0.30, CacheWritePerM: 3.75},
	"opus":   {InputPerM: 15, OutputPerM: 75, CacheReadPerM: 1.50, CacheWritePerM: 18.75},
	"haiku":  {InputPerM: 0.80, OutputPerM: 4, CacheReadPerM: 0.08, CacheWritePerM: 1},
}

// defaultPricing falls back to Sonnet for unrecognised model strings.
var defaultPricing = pricingTable["sonnet"]

// Resolve returns the pricing tier for the given model string.
// Matching is case-insensitive substring search against the tier keys
// ("sonnet", "opus", "haiku"). Falls back to Sonnet pricing when unknown.
func Resolve(model string) ModelPricing {
	lower := strings.ToLower(model)
	for key, p := range pricingTable {
		if strings.Contains(lower, key) {
			return p
		}
	}
	return defaultPricing
}

// CalculateCostMicros returns the estimated cost in microdollars for the
// provided token counts. It resolves pricing via Resolve(model).
func CalculateCostMicros(model string, input, output, cacheRead, cacheWrite int64) int64 {
	p := Resolve(model)
	cost := float64(input)*p.InputPerM +
		float64(output)*p.OutputPerM +
		float64(cacheRead)*p.CacheReadPerM +
		float64(cacheWrite)*p.CacheWritePerM
	return int64(cost)
}

// CalculateCostMicrosWithProvider delegates cost calculation to the given
// provider.CostCalculator. This allows callers that have a provider to use
// the provider's YAML-driven pricing configuration instead of the hardcoded
// pricing table. When prov is nil, it falls back to CalculateCostMicros.
func CalculateCostMicrosWithProvider(prov provider.CostCalculator, model string, input, output, cacheRead, cacheWrite int64) int64 {
	if prov == nil {
		return CalculateCostMicros(model, input, output, cacheRead, cacheWrite)
	}
	usage := provider.TokenUsage{
		Input:      input,
		Output:     output,
		CacheRead:  cacheRead,
		CacheWrite: cacheWrite,
	}
	return prov.CalculateCost(model, usage)
}
