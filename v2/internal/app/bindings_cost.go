// bindings_cost.go — Wails binding for AI cost intelligence.
// Exposes daily cost reports and the active cost model version to the frontend.
// Author: Subash Karki
package app

import (
	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/ai/cost"
)

// GetDailyCostReport returns a cost breakdown for the given date (YYYY-MM-DD).
// Reads sessions and ai_decisions tables; never returns a nil pointer.
func (a *App) GetDailyCostReport(date string) (*cost.DailyCostReport, error) {
	if a.DB == nil {
		log.Warn("app/bindings_cost: DB not initialised, returning empty report")
		return &cost.DailyCostReport{
			Date:             date,
			CostByModel:      make(map[string]float64),
			CostByStrategy:   make(map[string]float64),
			StrategyWinRates: make(map[string]float64),
			CostModelVersion: cost.CostModelVersion,
		}, nil
	}
	report, err := cost.GenerateDailyReport(a.DB.Reader, date)
	if err != nil {
		log.Error("app/bindings_cost: GenerateDailyReport", "date", date, "err", err)
	}
	return report, err
}

// GetCostModelVersion returns the current cost model version string.
// The frontend can display this to help users interpret reported costs.
func (a *App) GetCostModelVersion() string {
	return cost.CostModelVersion
}
