// Wails bindings for gamification — XP engine, achievements, quests, dashboard.
// Author: Subash Karki
package app

import (
	"log/slog"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/gamification"
)

// GetHunterProfile returns the hunter profile joined with stats.
func (a *App) GetHunterProfile() *gamification.ProfileResponse {
	if a.Gamification == nil {
		slog.Warn("GetHunterProfile: gamification service not initialized")
		return nil
	}
	resp, err := a.Gamification.GetProfile(a.ctx)
	if err != nil {
		slog.Error("GetHunterProfile failed", "err", err)
		return nil
	}
	return resp
}

// UpdateHunterName updates the hunter's display name.
func (a *App) UpdateHunterName(name string) bool {
	if a.Gamification == nil || name == "" {
		return false
	}
	if err := a.Gamification.UpdateName(a.ctx, name); err != nil {
		slog.Error("UpdateHunterName failed", "err", err)
		return false
	}
	return true
}

// GetAchievements returns all achievements (locked + unlocked).
func (a *App) GetAchievements() []db.Achievement {
	if a.Gamification == nil {
		return []db.Achievement{}
	}
	achievements, err := a.Gamification.GetAchievements(a.ctx)
	if err != nil {
		slog.Error("GetAchievements failed", "err", err)
		return []db.Achievement{}
	}
	return achievements
}

// GetDailyQuests returns today's quests, auto-generating if none exist.
func (a *App) GetDailyQuests() []db.DailyQuest {
	if a.Gamification == nil {
		return []db.DailyQuest{}
	}
	quests, err := a.Gamification.GetDailyQuests(a.ctx)
	if err != nil {
		slog.Error("GetDailyQuests failed", "err", err)
		return []db.DailyQuest{}
	}
	return quests
}

// GetHunterDashboard returns the full dashboard: profile, stats, heatmap, lifetime, model breakdown.
func (a *App) GetHunterDashboard() *gamification.DashboardResponse {
	if a.Gamification == nil {
		return nil
	}
	dash, err := a.Gamification.GetDashboard(a.ctx)
	if err != nil {
		slog.Error("GetHunterDashboard failed", "err", err)
		return nil
	}
	return dash
}

// AwardXP triggers an XP award from the frontend (e.g., manual trigger or internal hook).
func (a *App) AwardXP(trigger string) *gamification.AwardResult {
	if a.Gamification == nil || trigger == "" {
		return nil
	}
	result, err := a.Gamification.AwardXP(a.ctx, trigger, 0)
	if err != nil {
		slog.Error("AwardXP failed", "trigger", trigger, "err", err)
		return nil
	}
	return result
}
