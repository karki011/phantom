// Author: Subash Karki
package app

import "github.com/subashkarki/phantom-os-v2/internal/perf"

func (a *App) PerfReport() perf.Report {
	return perf.GetReport()
}

func (a *App) PerfTargets() map[string]perf.TargetCheck {
	return perf.Targets()
}
