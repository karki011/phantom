// Package gamification implements the XP engine, achievement checker,
// quest generator, and stat system for PhantomOS.
// Author: Subash Karki
package gamification

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// XP amounts per trigger.
const (
	XPSessionStart        = 5
	XPTaskCreate          = 2
	XPTaskComplete        = 10
	XPSessionCompleteBonus = 25
	XPFirstSessionOfDay   = 10
	XPDailyStreak         = 15
	XPSpeedTask           = 5
	XPLongSession         = 30
	XPNewRepo             = 20
)

// Trigger names match the v1 TypeScript XP keys.
const (
	TriggerSessionStart        = "SESSION_START"
	TriggerTaskCreate          = "TASK_CREATE"
	TriggerTaskComplete        = "TASK_COMPLETE"
	TriggerSessionCompleteBonus = "SESSION_COMPLETE_BONUS"
	TriggerFirstSessionOfDay   = "FIRST_SESSION_OF_DAY"
	TriggerDailyStreak         = "DAILY_STREAK"
	TriggerSpeedTask           = "SPEED_TASK"
	TriggerLongSession         = "LONG_SESSION"
	TriggerNewRepo             = "NEW_REPO"
	TriggerQuestComplete       = "QUEST_COMPLETE"
	TriggerAchievement         = "ACHIEVEMENT"
)

// DefaultXP maps triggers to their base XP amount.
var DefaultXP = map[string]int64{
	TriggerSessionStart:        XPSessionStart,
	TriggerTaskCreate:          XPTaskCreate,
	TriggerTaskComplete:        XPTaskComplete,
	TriggerSessionCompleteBonus: XPSessionCompleteBonus,
	TriggerFirstSessionOfDay:   XPFirstSessionOfDay,
	TriggerDailyStreak:         XPDailyStreak,
	TriggerSpeedTask:           XPSpeedTask,
	TriggerLongSession:         XPLongSession,
	TriggerNewRepo:             XPNewRepo,
}

// StatBoost maps triggers to the stat they increase (empty = no boost).
var StatBoost = map[string]string{
	TriggerSessionStart:        "intelligence",
	TriggerTaskComplete:        "strength",
	TriggerSessionCompleteBonus: "sense",
	TriggerDailyStreak:         "vitality",
	TriggerSpeedTask:           "agility",
	TriggerNewRepo:             "perception",
}

// rankThreshold defines a rank boundary.
type rankThreshold struct {
	MinLevel int64
	Rank     string
	Title    string
}

var rankThresholds = []rankThreshold{
	{1, "F", "Awakened"},
	{5, "E", "Novice Hunter"},
	{10, "D", "Apprentice Hunter"},
	{25, "C", "Skilled Hunter"},
	{50, "B", "Veteran Hunter"},
	{75, "A", "Elite Hunter"},
	{100, "S", "National Level Hunter"},
	{125, "SS", "Shadow Monarch"},
	{150, "SSS", "Absolute Being"},
}

// rankForLevel returns the rank and title for a given level.
func rankForLevel(level int64) (string, string) {
	rank, title := "F", "Awakened"
	for i := len(rankThresholds) - 1; i >= 0; i-- {
		if level >= rankThresholds[i].MinLevel {
			return rankThresholds[i].Rank, rankThresholds[i].Title
		}
	}
	return rank, title
}

// levelXPRequired returns XP needed to advance from the given level.
func levelXPRequired(level int64) int64 {
	return int64(math.Floor(100 * math.Pow(float64(level), 1.5)))
}

// ---------------------------------------------------------------------------
// Achievement Definitions
// ---------------------------------------------------------------------------

type achievementDef struct {
	ID          string
	Name        string
	Description string
	Icon        string
	Category    string
	XPReward    int64
	// check receives the profile and returns true if the condition is met.
	check func(p *db.HunterProfile) bool
}

// achievementDef with profile-only check (no DB queries needed).
var achievementDefs = []achievementDef{
	// ── Combat (Rank Promotions) ────────────────────────────────────────────
	{"rank_e", "E-Rank Promotion", "Reach E-Rank — Novice Hunter", "📊", "Combat", 25,
		func(p *db.HunterProfile) bool { return nullInt(p.Level) >= 5 }},
	{"rank_d", "D-Rank Promotion", "Reach D-Rank", "📈", "Combat", 50,
		func(p *db.HunterProfile) bool { return nullInt(p.Level) >= 10 }},
	{"rank_c", "C-Rank Promotion", "Reach C-Rank", "📈", "Combat", 100,
		func(p *db.HunterProfile) bool { return nullInt(p.Level) >= 25 }},
	{"rank_b", "B-Rank Promotion", "Reach B-Rank", "⭐", "Combat", 200,
		func(p *db.HunterProfile) bool { return nullInt(p.Level) >= 50 }},
	{"rank_a", "A-Rank Promotion", "Reach A-Rank", "🌟", "Combat", 300,
		func(p *db.HunterProfile) bool { return nullInt(p.Level) >= 75 }},
	{"rank_s", "S-Rank Promotion", "Reach S-Rank — National Level Hunter", "💫", "Combat", 500,
		func(p *db.HunterProfile) bool { return nullInt(p.Level) >= 100 }},
	{"rank_ss", "Shadow Monarch Ascension", "Reach SS-Rank", "👑", "Combat", 750,
		func(p *db.HunterProfile) bool { return nullInt(p.Level) >= 125 }},
	{"rank_sss", "Absolute Being", "Reach SSS-Rank — Transcend all limits", "✨", "Combat", 1000,
		func(p *db.HunterProfile) bool { return nullInt(p.Level) >= 150 }},

	// ── Mastery (Task-based) ────────────────────────────────────────────────
	{"first_blood", "First Blood", "Complete your first task", "⚔️", "Mastery", 50,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalTasks) >= 1 }},
	{"shadow_army_10", "Shadow Army", "Complete 10 tasks", "👤", "Mastery", 100,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalTasks) >= 10 }},
	{"task_apprentice_25", "Task Apprentice", "Complete 25 tasks", "🔨", "Mastery", 75,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalTasks) >= 25 }},
	{"task_veteran_50", "Task Veteran", "Complete 50 tasks", "⚒️", "Mastery", 150,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalTasks) >= 50 }},
	{"shadow_monarch_100", "Shadow Monarch", "Complete 100 tasks", "👑", "Mastery", 500,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalTasks) >= 100 }},
	{"task_legend_250", "Task Legend", "Complete 250 tasks", "🗡️", "Mastery", 750,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalTasks) >= 250 }},
	{"task_god_500", "Task God", "Complete 500 tasks", "⚡", "Mastery", 1000,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalTasks) >= 500 }},

	// ── Exploration (Repo-based) ────────────────────────────────────────────
	{"explorer_3", "World Explorer", "Work in 3 different repositories", "🌍", "Exploration", 100,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalRepos) >= 3 }},
	{"code_nomad_5", "Code Nomad", "Work in 5 different repositories", "🧭", "Exploration", 150,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalRepos) >= 5 }},
	{"code_wanderer_10", "Code Wanderer", "Work in 10 different repositories", "🗺️", "Exploration", 250,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalRepos) >= 10 }},
	{"code_cartographer_25", "Code Cartographer", "Work in 25 different repositories", "🌐", "Exploration", 500,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalRepos) >= 25 }},

	// ── Dedication (Session-based) ──────────────────────────────────────────
	{"arise_sessions_5", "Arise!", "Start 5 sessions", "🌑", "Dedication", 75,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalSessions) >= 5 }},
	{"session_rookie_10", "Session Rookie", "Start 10 sessions", "🌒", "Dedication", 50,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalSessions) >= 10 }},
	{"session_warrior_25", "Session Warrior", "Start 25 sessions", "🌓", "Dedication", 100,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalSessions) >= 25 }},
	{"dungeon_master_50", "Dungeon Master", "Start 50 sessions", "🏰", "Dedication", 250,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalSessions) >= 50 }},
	{"session_master_100", "Session Master", "Start 100 sessions", "🌕", "Dedication", 300,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalSessions) >= 100 }},
	{"session_legendary_250", "Session Legendary", "Start 250 sessions", "🔱", "Dedication", 500,
		func(p *db.HunterProfile) bool { return nullInt(p.TotalSessions) >= 250 }},

	// ── Streak ──────────────────────────────────────────────────────────────
	{"streak_3", "Getting Started", "Maintain a 3-day streak", "🌱", "Streak", 50,
		func(p *db.HunterProfile) bool { return nullInt(p.StreakBest) >= 3 }},
	{"streak_7", "Iron Will", "Maintain a 7-day streak", "🔥", "Streak", 150,
		func(p *db.HunterProfile) bool { return nullInt(p.StreakBest) >= 7 }},
	{"streak_14", "Consistent", "Maintain a 14-day streak", "🔗", "Streak", 200,
		func(p *db.HunterProfile) bool { return nullInt(p.StreakBest) >= 14 }},
	{"streak_30", "Unstoppable Force", "Maintain a 30-day streak", "💎", "Streak", 500,
		func(p *db.HunterProfile) bool { return nullInt(p.StreakBest) >= 30 }},
	{"streak_60", "Relentless", "Maintain a 60-day streak", "💠", "Streak", 750,
		func(p *db.HunterProfile) bool { return nullInt(p.StreakBest) >= 60 }},
}

// dbAchievementDef requires a DB query in addition to the profile.
// check receives the context and reader queries, returns true if the condition is met.
type dbAchievementDef struct {
	ID          string
	Name        string
	Description string
	Icon        string
	Category    string
	XPReward    int64
	check       func(ctx context.Context, q *db.Queries) bool
}

// Achievements that need DB queries (Milestone, Speed categories).
var dbAchievementDefs = []dbAchievementDef{
	// ── Milestone (XP-based) ────────────────────────────────────────────────
	{"milestone_1k", "First Thousand", "Earn 1,000 total XP", "💰", "Milestone", 100,
		func(ctx context.Context, q *db.Queries) bool { xp, _ := q.GetTotalXPEarned(ctx); return xp >= 1000 }},
	{"milestone_5k", "Five Thousand Club", "Earn 5,000 total XP", "💳", "Milestone", 200,
		func(ctx context.Context, q *db.Queries) bool { xp, _ := q.GetTotalXPEarned(ctx); return xp >= 5000 }},
	{"milestone_10k", "XP Hoarder", "Earn 10,000 total XP", "💎", "Milestone", 300,
		func(ctx context.Context, q *db.Queries) bool { xp, _ := q.GetTotalXPEarned(ctx); return xp >= 10000 }},
	{"milestone_25k", "XP Titan", "Earn 25,000 total XP", "🏆", "Milestone", 500,
		func(ctx context.Context, q *db.Queries) bool { xp, _ := q.GetTotalXPEarned(ctx); return xp >= 25000 }},
	{"milestone_50k", "XP Overlord", "Earn 50,000 total XP", "👁️", "Milestone", 1000,
		func(ctx context.Context, q *db.Queries) bool { xp, _ := q.GetTotalXPEarned(ctx); return xp >= 50000 }},

	// ── Speed ───────────────────────────────────────────────────────────────
	{"speed_5", "Quick Draw", "Complete 5 speed tasks (under 2 min)", "⚡", "Speed", 75,
		func(ctx context.Context, q *db.Queries) bool { cnt, _ := q.GetTotalSpeedTasks(ctx); return cnt >= 5 }},
	{"speed_20", "Lightning Hands", "Complete 20 speed tasks", "🌩️", "Speed", 200,
		func(ctx context.Context, q *db.Queries) bool { cnt, _ := q.GetTotalSpeedTasks(ctx); return cnt >= 20 }},
	{"speed_50", "Flash", "Complete 50 speed tasks", "💨", "Speed", 400,
		func(ctx context.Context, q *db.Queries) bool { cnt, _ := q.GetTotalSpeedTasks(ctx); return cnt >= 50 }},
}

// ---------------------------------------------------------------------------
// Quest Pool
// ---------------------------------------------------------------------------

type questTemplate struct {
	QuestType string
	Label     string
	Target    int64
	XPReward  int64
}

var questPool = []questTemplate{
	{"tasks_completed", "Complete 3 tasks", 3, 25},
	{"tasks_completed", "Complete 5 tasks", 5, 40},
	{"tasks_completed", "Complete 10 tasks", 10, 75},
	{"sessions_started", "Start 2 sessions", 2, 20},
	{"sessions_started", "Start 5 sessions", 5, 50},
	{"speed_tasks", "Complete 2 tasks in under 2 minutes each", 2, 30},
	{"repos_worked", "Work in 2 different repos", 2, 35},
	{"long_session", "Run a session for over 1 hour", 1, 30},
	{"perfect_session", "Complete a session with all tasks done", 1, 40},
	{"streak_day", "Maintain your daily streak", 1, 20},
}

// ---------------------------------------------------------------------------
// EmitFn type
// ---------------------------------------------------------------------------

// EmitFn is the Wails event emitter signature.
type EmitFn func(name string, data interface{})

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// Service is the gamification engine.
type Service struct {
	writer *sql.DB
	reader *sql.DB
	emit   EmitFn
	seeded bool
}

// NewService creates a new gamification service.
func NewService(writer, reader *sql.DB, emit EmitFn) *Service {
	return &Service{
		writer: writer,
		reader: reader,
		emit:   emit,
	}
}

// Init ensures the hunter profile, stats, and achievement seed rows exist.
func (s *Service) Init(ctx context.Context) error {
	q := db.New(s.writer)

	if err := q.EnsureHunterProfile(ctx); err != nil {
		return fmt.Errorf("ensure hunter profile: %w", err)
	}
	if err := q.EnsureHunterStats(ctx); err != nil {
		return fmt.Errorf("ensure hunter stats: %w", err)
	}

	// Migrate existing users from E-Rank default to F-Rank.
	// The DB migration 001 seeds rank as 'E'. New progression starts at 'F'.
	rq := db.New(s.reader)
	profile, err := rq.GetHunterProfile(ctx)
	if err == nil && nullStr(profile.Rank) == "E" && nullInt(profile.Level) < 5 {
		rank, title := rankForLevel(nullInt(profile.Level))
		_ = q.UpdateHunterXP(ctx, db.UpdateHunterXPParams{
			Xp:      profile.Xp,
			Level:   profile.Level,
			XpToNext: profile.XpToNext,
			Rank:    sql.NullString{String: rank, Valid: true},
			Title:   sql.NullString{String: title, Valid: true},
		})
	}

	// Seed all achievement definitions (locked).
	if err := s.seedAchievements(ctx); err != nil {
		return fmt.Errorf("seed achievements: %w", err)
	}

	s.seeded = true
	return nil
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

// ProfileResponse is the combined profile + stats returned to the frontend.
type ProfileResponse struct {
	Profile db.HunterProfile `json:"profile"`
	Stats   *db.HunterStat   `json:"stats"`
}

// GetProfile returns the hunter profile joined with stats.
func (s *Service) GetProfile(ctx context.Context) (*ProfileResponse, error) {
	q := db.New(s.reader)

	profile, err := q.GetHunterProfile(ctx)
	if err != nil {
		return nil, fmt.Errorf("get hunter profile: %w", err)
	}

	stats, err := q.GetHunterStats(ctx)
	if err != nil {
		if err == sql.ErrNoRows {
			return &ProfileResponse{Profile: profile, Stats: nil}, nil
		}
		return nil, fmt.Errorf("get hunter stats: %w", err)
	}

	return &ProfileResponse{Profile: profile, Stats: &stats}, nil
}

// UpdateName updates the hunter's display name.
func (s *Service) UpdateName(ctx context.Context, name string) error {
	q := db.New(s.writer)
	return q.UpdateHunterName(ctx, sql.NullString{String: name, Valid: true})
}

// ---------------------------------------------------------------------------
// XP Engine
// ---------------------------------------------------------------------------

// AwardResult holds the outcome of an XP award.
type AwardResult struct {
	Amount    int64  `json:"amount"`
	Total     int64  `json:"total"`
	Trigger   string `json:"trigger"`
	LeveledUp bool   `json:"leveled_up"`
	NewLevel  int64  `json:"new_level,omitempty"`
	RankedUp  bool   `json:"ranked_up"`
	NewRank   string `json:"new_rank,omitempty"`
	NewTitle  string `json:"new_title,omitempty"`
}

// AwardXP adds XP to the hunter, handles level-ups and rank-ups,
// applies stat boosts, and emits frontend events.
func (s *Service) AwardXP(ctx context.Context, trigger string, amount int64) (*AwardResult, error) {
	if amount <= 0 {
		// Use default if not specified.
		if def, ok := DefaultXP[trigger]; ok {
			amount = def
		} else {
			amount = 0
		}
	}
	if amount == 0 {
		return &AwardResult{Trigger: trigger}, nil
	}

	q := db.New(s.writer)

	profile, err := q.GetHunterProfile(ctx)
	if err != nil {
		return nil, fmt.Errorf("get profile for xp award: %w", err)
	}

	newXP := nullInt(profile.Xp) + amount
	currentLevel := nullInt(profile.Level)
	if currentLevel < 1 {
		currentLevel = 1
	}
	oldRank := nullStr(profile.Rank)
	leveledUp := false

	// Check for level-ups (can level multiple times in one award).
	for newXP >= levelXPRequired(currentLevel) {
		newXP -= levelXPRequired(currentLevel)
		currentLevel++
		leveledUp = true
	}

	rank, title := rankForLevel(currentLevel)
	xpToNext := levelXPRequired(currentLevel)

	if err := q.UpdateHunterXP(ctx, db.UpdateHunterXPParams{
		Xp:      sql.NullInt64{Int64: newXP, Valid: true},
		Level:   sql.NullInt64{Int64: currentLevel, Valid: true},
		XpToNext: sql.NullInt64{Int64: xpToNext, Valid: true},
		Rank:    sql.NullString{String: rank, Valid: true},
		Title:   sql.NullString{String: title, Valid: true},
	}); err != nil {
		return nil, fmt.Errorf("update hunter xp: %w", err)
	}

	// Apply stat boost if this trigger has one.
	if stat, ok := StatBoost[trigger]; ok {
		if err := q.IncrementStat(ctx, db.IncrementStatParams{
			Stat:   stat,
			Amount: sql.NullInt64{Int64: 1, Valid: true},
		}); err != nil {
			slog.Warn("gamification: increment stat failed", "stat", stat, "err", err)
		}
	}

	// Log activity.
	now := time.Now().UnixMilli()
	_ = q.LogActivity(ctx, db.LogActivityParams{
		Timestamp: now,
		Type:      trigger,
		SessionID: sql.NullString{},
		Metadata:  sql.NullString{},
		XpEarned:  sql.NullInt64{Int64: amount, Valid: true},
	})

	// Emit events.
	result := &AwardResult{
		Amount:    amount,
		Total:     newXP,
		Trigger:   trigger,
		LeveledUp: leveledUp,
	}

	s.emit("gamification:xp_gained", map[string]interface{}{
		"amount":  amount,
		"total":   newXP,
		"trigger": trigger,
	})

	if leveledUp {
		result.NewLevel = currentLevel
		s.emit("gamification:level_up", map[string]interface{}{
			"level":    currentLevel,
			"xpToNext": xpToNext,
		})
	}

	rankedUp := rank != oldRank
	if rankedUp {
		result.RankedUp = true
		result.NewRank = rank
		result.NewTitle = title
		s.emit("gamification:rank_up", map[string]interface{}{
			"rank":  rank,
			"title": title,
		})
	}

	return result, nil
}

// ---------------------------------------------------------------------------
// Session / Task Hooks
// ---------------------------------------------------------------------------

// OnSessionStart handles a new session: awards XP, updates totals, checks
// first-of-day, streak, and new repo.
func (s *Service) OnSessionStart(ctx context.Context, sessionID string) {
	q := db.New(s.writer)

	// Award session start XP.
	if _, err := s.AwardXP(ctx, TriggerSessionStart, XPSessionStart); err != nil {
		slog.Warn("gamification: session start xp failed", "err", err)
	}

	// Increment total sessions.
	if err := q.IncrementTotalSessions(ctx); err != nil {
		slog.Warn("gamification: increment sessions failed", "err", err)
	}

	today := todayStr()
	profile, err := q.GetHunterProfile(ctx)
	if err != nil {
		slog.Warn("gamification: get profile for session start failed", "err", err)
		return
	}

	// First session of the day?
	lastActive := nullStr(profile.LastActiveDate)
	if lastActive != today {
		if _, err := s.AwardXP(ctx, TriggerFirstSessionOfDay, XPFirstSessionOfDay); err != nil {
			slog.Warn("gamification: first session xp failed", "err", err)
		}

		// Update streak.
		yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
		newStreak := int64(1)
		if lastActive == yesterday {
			newStreak = nullInt(profile.StreakCurrent) + 1
			if _, err := s.AwardXP(ctx, TriggerDailyStreak, XPDailyStreak); err != nil {
				slog.Warn("gamification: streak xp failed", "err", err)
			}
		}

		bestStreak := nullInt(profile.StreakBest)
		if newStreak > bestStreak {
			bestStreak = newStreak
		}

		if err := q.UpdateStreak(ctx, db.UpdateStreakParams{
			StreakCurrent:  sql.NullInt64{Int64: newStreak, Valid: true},
			StreakBest:     sql.NullInt64{Int64: bestStreak, Valid: true},
			LastActiveDate: sql.NullString{String: today, Valid: true},
		}); err != nil {
			slog.Warn("gamification: update streak failed", "err", err)
		}
	} else if lastActive == "" {
		// First ever session.
		if err := q.UpdateStreak(ctx, db.UpdateStreakParams{
			StreakCurrent:  sql.NullInt64{Int64: 1, Valid: true},
			StreakBest:     sql.NullInt64{Int64: 1, Valid: true},
			LastActiveDate: sql.NullString{String: today, Valid: true},
		}); err != nil {
			slog.Warn("gamification: init streak failed", "err", err)
		}
	}

	// Check for new repo.
	rq := db.New(s.reader)
	sess, err := rq.GetSession(ctx, sessionID)
	if err != nil {
		return
	}
	if sess.Repo.Valid && sess.Repo.String != "" {
		// Count how many sessions have this repo. If only 1 (this one), it is new.
		count, err := rq.GetUniqueRepoCount(ctx)
		prevProfile, _ := rq.GetHunterProfile(ctx)
		prevRepos := nullInt(prevProfile.TotalRepos)

		if err == nil && count > prevRepos {
			if _, err := s.AwardXP(ctx, TriggerNewRepo, XPNewRepo); err != nil {
				slog.Warn("gamification: new repo xp failed", "err", err)
			}
			if err := q.IncrementTotalRepos(ctx); err != nil {
				slog.Warn("gamification: increment repos failed", "err", err)
			}
		}
	}

	// Check achievements after session start.
	s.CheckAchievements(ctx)
	// Update quest progress.
	s.UpdateAllQuestProgress(ctx)
}

// OnTaskComplete handles a completed task: awards XP, updates totals, checks bonus.
func (s *Service) OnTaskComplete(ctx context.Context, sessionID, taskID string) {
	q := db.New(s.writer)

	// Award task completion XP.
	if _, err := s.AwardXP(ctx, TriggerTaskComplete, XPTaskComplete); err != nil {
		slog.Warn("gamification: task complete xp failed", "err", err)
	}

	// Increment total tasks.
	if err := q.IncrementTotalTasks(ctx); err != nil {
		slog.Warn("gamification: increment tasks failed", "err", err)
	}

	// Check achievements and update quests.
	s.CheckAchievements(ctx)
	s.UpdateAllQuestProgress(ctx)
}

// OnSessionEnd handles session end: checks long session bonus and perfect clear.
func (s *Service) OnSessionEnd(ctx context.Context, sessionID string) {
	rq := db.New(s.reader)

	sess, err := rq.GetSession(ctx, sessionID)
	if err != nil {
		return
	}

	// Long session (>2 hours).
	if sess.StartedAt.Valid && sess.EndedAt.Valid {
		duration := sess.EndedAt.Int64 - sess.StartedAt.Int64
		if duration > 2*60*60*1000 {
			if _, err := s.AwardXP(ctx, TriggerLongSession, XPLongSession); err != nil {
				slog.Warn("gamification: long session xp failed", "err", err)
			}
		}
	}

	// Perfect clear: all tasks completed.
	if sess.TaskCount.Valid && sess.TaskCount.Int64 > 0 &&
		sess.CompletedTasks.Valid && sess.CompletedTasks.Int64 == sess.TaskCount.Int64 {
		if _, err := s.AwardXP(ctx, TriggerSessionCompleteBonus, XPSessionCompleteBonus); err != nil {
			slog.Warn("gamification: session bonus xp failed", "err", err)
		}
	}

	s.CheckAchievements(ctx)
	s.UpdateAllQuestProgress(ctx)
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

// seedAchievements inserts all achievement definitions as locked rows.
func (s *Service) seedAchievements(ctx context.Context) error {
	q := db.New(s.writer)
	for _, def := range achievementDefs {
		if err := q.UpsertAchievement(ctx, db.UpsertAchievementParams{
			ID:          def.ID,
			Name:        def.Name,
			Description: sql.NullString{String: def.Description, Valid: true},
			Icon:        sql.NullString{String: def.Icon, Valid: true},
			Category:    sql.NullString{String: def.Category, Valid: true},
			XpReward:    sql.NullInt64{Int64: def.XPReward, Valid: true},
			UnlockedAt:  sql.NullInt64{}, // NULL = locked
		}); err != nil {
			return fmt.Errorf("upsert achievement %s: %w", def.ID, err)
		}
	}
	// Seed DB-query achievements (Milestone, Speed).
	for _, def := range dbAchievementDefs {
		if err := q.UpsertAchievement(ctx, db.UpsertAchievementParams{
			ID:          def.ID,
			Name:        def.Name,
			Description: sql.NullString{String: def.Description, Valid: true},
			Icon:        sql.NullString{String: def.Icon, Valid: true},
			Category:    sql.NullString{String: def.Category, Valid: true},
			XpReward:    sql.NullInt64{Int64: def.XPReward, Valid: true},
			UnlockedAt:  sql.NullInt64{}, // NULL = locked
		}); err != nil {
			return fmt.Errorf("upsert achievement %s: %w", def.ID, err)
		}
	}
	return nil
}

// UnlockedAchievement is emitted when an achievement is newly unlocked.
type UnlockedAchievement struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	XPReward    int64  `json:"xp_reward"`
}

// CheckAchievements evaluates all achievement conditions and unlocks any that are met.
func (s *Service) CheckAchievements(ctx context.Context) []UnlockedAchievement {
	rq := db.New(s.reader)
	wq := db.New(s.writer)

	profile, err := rq.GetHunterProfile(ctx)
	if err != nil {
		slog.Warn("gamification: check achievements get profile failed", "err", err)
		return nil
	}

	var unlocked []UnlockedAchievement

	// unlockHelper handles the common unlock + award + emit logic.
	unlockHelper := func(id, name, description, icon string, xpReward int64) {
		now := time.Now().UnixMilli()
		if err := wq.UnlockAchievement(ctx, db.UnlockAchievementParams{
			UnlockedAt: sql.NullInt64{Int64: now, Valid: true},
			ID:         id,
		}); err != nil {
			slog.Warn("gamification: unlock achievement failed", "id", id, "err", err)
			return
		}

		if _, err := s.AwardXP(ctx, TriggerAchievement, xpReward); err != nil {
			slog.Warn("gamification: achievement xp failed", "id", id, "err", err)
		}

		unlocked = append(unlocked, UnlockedAchievement{
			ID: id, Name: name, Description: description, Icon: icon, XPReward: xpReward,
		})

		s.emit("gamification:achievement_unlocked", map[string]interface{}{
			"id": id, "name": name, "description": description, "icon": icon, "xpReward": xpReward,
		})
	}

	// Check profile-only achievements.
	for _, def := range achievementDefs {
		existing, err := rq.GetAchievement(ctx, def.ID)
		if err == nil && existing.UnlockedAt.Valid {
			continue
		}
		if !def.check(&profile) {
			continue
		}
		unlockHelper(def.ID, def.Name, def.Description, def.Icon, def.XPReward)
	}

	// Check DB-query achievements (Milestone, Speed).
	for _, def := range dbAchievementDefs {
		existing, err := rq.GetAchievement(ctx, def.ID)
		if err == nil && existing.UnlockedAt.Valid {
			continue
		}
		if !def.check(ctx, rq) {
			continue
		}
		unlockHelper(def.ID, def.Name, def.Description, def.Icon, def.XPReward)
	}

	return unlocked
}

// GetAchievements returns all achievements (locked + unlocked).
func (s *Service) GetAchievements(ctx context.Context) ([]db.Achievement, error) {
	q := db.New(s.reader)
	return q.ListAchievements(ctx)
}

// ---------------------------------------------------------------------------
// Daily Quests
// ---------------------------------------------------------------------------

// GetDailyQuests returns today's quests, generating them if none exist.
func (s *Service) GetDailyQuests(ctx context.Context) ([]db.DailyQuest, error) {
	today := todayStr()
	q := db.New(s.reader)

	quests, err := q.ListDailyQuests(ctx, today)
	if err != nil {
		return nil, fmt.Errorf("list daily quests: %w", err)
	}

	if len(quests) == 0 {
		if err := s.generateDailyQuests(ctx, today); err != nil {
			return nil, fmt.Errorf("generate daily quests: %w", err)
		}
		quests, err = q.ListDailyQuests(ctx, today)
		if err != nil {
			return nil, fmt.Errorf("list daily quests after gen: %w", err)
		}
	}

	return quests, nil
}

// generateDailyQuests picks 3 random quests from the pool.
func (s *Service) generateDailyQuests(ctx context.Context, date string) error {
	wq := db.New(s.writer)
	picks := pickRandom(questPool, 3)

	for i, tmpl := range picks {
		id := fmt.Sprintf("%s-%d", date, i)
		if err := wq.CreateDailyQuest(ctx, db.CreateDailyQuestParams{
			ID:        id,
			Date:      date,
			QuestType: tmpl.QuestType,
			Label:     tmpl.Label,
			Target:    tmpl.Target,
			XpReward:  sql.NullInt64{Int64: tmpl.XPReward, Valid: true},
		}); err != nil {
			return fmt.Errorf("create quest %s: %w", id, err)
		}
	}
	return nil
}

// UpdateAllQuestProgress recalculates progress for all of today's quests.
func (s *Service) UpdateAllQuestProgress(ctx context.Context) {
	today := todayStr()
	rq := db.New(s.reader)

	quests, err := rq.ListDailyQuests(ctx, today)
	if err != nil || len(quests) == 0 {
		return
	}

	startOfDay, endOfDay := dayBounds(today)
	wq := db.New(s.writer)

	for _, quest := range quests {
		if quest.Completed.Valid && quest.Completed.Int64 == 1 {
			continue
		}

		var progress int64

		startNull := sql.NullInt64{Int64: startOfDay, Valid: true}
		endNull := sql.NullInt64{Int64: endOfDay, Valid: true}

		switch quest.QuestType {
		case "sessions_started", "sessions_completed":
			cnt, err := rq.GetSessionCountForDate(ctx, db.GetSessionCountForDateParams{
				StartedAt:   startNull,
				StartedAt_2: endNull,
			})
			if err == nil {
				progress = cnt
			}

		case "tasks_completed":
			cnt, err := rq.GetCompletedTaskCountForDate(ctx, db.GetCompletedTaskCountForDateParams{
				UpdatedAt:   startNull,
				UpdatedAt_2: endNull,
			})
			if err == nil {
				progress = cnt
			}

		case "speed_tasks":
			cnt, err := rq.GetSpeedTaskCountForDate(ctx, db.GetSpeedTaskCountForDateParams{
				UpdatedAt:   startNull,
				UpdatedAt_2: endNull,
			})
			if err == nil {
				progress = cnt
			}

		case "repos_worked":
			cnt, err := rq.GetUniqueRepoCountForDate(ctx, db.GetUniqueRepoCountForDateParams{
				StartedAt:   startNull,
				StartedAt_2: endNull,
			})
			if err == nil {
				progress = cnt
			}

		case "long_session":
			cnt, err := rq.GetLongSessionCountForDate(ctx, db.GetLongSessionCountForDateParams{
				StartedAt:   startNull,
				StartedAt_2: endNull,
			})
			if err == nil {
				progress = cnt
			}

		case "perfect_session":
			cnt, err := rq.GetPerfectSessionCountForDate(ctx, db.GetPerfectSessionCountForDateParams{
				StartedAt:   startNull,
				StartedAt_2: endNull,
			})
			if err == nil {
				progress = cnt
			}

		case "streak_day":
			profile, err := rq.GetHunterProfile(ctx)
			if err == nil && nullStr(profile.LastActiveDate) == today {
				progress = 1
			}

		default:
			continue
		}

		completed := int64(0)
		if progress >= quest.Target {
			completed = 1
		}
		wasCompleted := quest.Completed.Valid && quest.Completed.Int64 == 1

		if err := wq.UpdateQuestProgress(ctx, db.UpdateQuestProgressParams{
			Progress:  sql.NullInt64{Int64: progress, Valid: true},
			Completed: sql.NullInt64{Int64: completed, Valid: true},
			ID:        quest.ID,
		}); err != nil {
			slog.Warn("gamification: update quest failed", "questID", quest.ID, "err", err)
			continue
		}

		// Award XP when newly completed.
		if completed == 1 && !wasCompleted {
			reward := int64(25)
			if quest.XpReward.Valid {
				reward = quest.XpReward.Int64
			}
			if _, err := s.AwardXP(ctx, TriggerQuestComplete, reward); err != nil {
				slog.Warn("gamification: quest complete xp failed", "questID", quest.ID, "err", err)
			}

			s.emit("gamification:quest_completed", map[string]interface{}{
				"id":       quest.ID,
				"label":    quest.Label,
				"xpReward": reward,
			})
		}
	}
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

// DashboardResponse holds data for the hunter dashboard view.
type DashboardResponse struct {
	Profile        db.HunterProfile   `json:"profile"`
	Stats          *db.HunterStat     `json:"stats"`
	Achievements   []db.Achievement   `json:"achievements"`
	DailyQuests    []db.DailyQuest    `json:"daily_quests"`
	HeatmapData    []HeatmapDay       `json:"heatmap_data"`
	LifetimeStats  *LifetimeStats     `json:"lifetime_stats"`
	ModelBreakdown []ModelBreakdownRow `json:"model_breakdown"`
}

// HeatmapDay represents a single day's activity for the heatmap.
type HeatmapDay struct {
	Date             string `json:"date"`
	SessionCount     int64  `json:"session_count"`
	TotalDurationSec int64  `json:"total_duration_secs"`
	TotalCostMicros  int64  `json:"total_cost_micros"`
}

// LifetimeStats holds aggregated lifetime statistics.
type LifetimeStats struct {
	TotalSessions int64 `json:"total_sessions"`
	TotalTokens   int64 `json:"total_tokens"`
	TotalCost     int64 `json:"total_cost"`
}

// ModelBreakdownRow represents a model usage summary.
type ModelBreakdownRow struct {
	Model    string `json:"model"`
	Sessions int64  `json:"sessions"`
	Tokens   int64  `json:"tokens"`
	Cost     int64  `json:"cost"`
}

// GetDashboard returns the full hunter dashboard data.
func (s *Service) GetDashboard(ctx context.Context) (*DashboardResponse, error) {
	rq := db.New(s.reader)

	profile, err := rq.GetHunterProfile(ctx)
	if err != nil {
		return nil, fmt.Errorf("dashboard get profile: %w", err)
	}

	stats, err := rq.GetHunterStats(ctx)
	var statsPtr *db.HunterStat
	if err == nil {
		statsPtr = &stats
	}

	achievements, err := rq.ListAchievements(ctx)
	if err != nil {
		achievements = []db.Achievement{}
	}

	quests, err := s.GetDailyQuests(ctx)
	if err != nil {
		quests = []db.DailyQuest{}
	}

	// Heatmap data from daily_stats (last 365 days).
	heatmapRows, err := rq.GetDailyActivity(ctx, 365)
	var heatmap []HeatmapDay
	if err == nil {
		for _, r := range heatmapRows {
			heatmap = append(heatmap, HeatmapDay{
				Date:             r.Date,
				SessionCount:     r.SessionCount,
				TotalDurationSec: r.TotalDurationSecs,
				TotalCostMicros:  r.TotalCostMicros,
			})
		}
	}
	if heatmap == nil {
		heatmap = []HeatmapDay{}
	}

	// Lifetime stats.
	lt, err := rq.GetLifetimeStats(ctx)
	var lifetimeStats *LifetimeStats
	if err == nil {
		lifetimeStats = &LifetimeStats{
			TotalSessions: lt.TotalSessions,
			TotalTokens:   toInt64(lt.TotalTokens),
			TotalCost:     toInt64(lt.TotalCost),
		}
	}

	// Model breakdown.
	mbRows, err := rq.GetModelBreakdown(ctx)
	var modelBreakdown []ModelBreakdownRow
	if err == nil {
		for _, r := range mbRows {
			modelBreakdown = append(modelBreakdown, ModelBreakdownRow{
				Model:    nullStr(r.Model),
				Sessions: r.Sessions,
				Tokens:   toInt64(r.Tokens),
				Cost:     toInt64(r.Cost),
			})
		}
	}
	if modelBreakdown == nil {
		modelBreakdown = []ModelBreakdownRow{}
	}

	return &DashboardResponse{
		Profile:        profile,
		Stats:          statsPtr,
		Achievements:   achievements,
		DailyQuests:    quests,
		HeatmapData:    heatmap,
		LifetimeStats:  lifetimeStats,
		ModelBreakdown: modelBreakdown,
	}, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func todayStr() string {
	return time.Now().Format("2006-01-02")
}

func nullInt(n sql.NullInt64) int64 {
	if n.Valid {
		return n.Int64
	}
	return 0
}

func nullStr(s sql.NullString) string {
	if s.Valid {
		return s.String
	}
	return ""
}

// dayBounds returns Unix millisecond timestamps for the start and end of a date string.
func dayBounds(dateStr string) (int64, int64) {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		t = time.Now().Truncate(24 * time.Hour)
	}
	start := t.UnixMilli()
	end := t.Add(24 * time.Hour).UnixMilli()
	return start, end
}

// toInt64 converts an interface{} (from sqlc COALESCE columns) to int64.
func toInt64(v interface{}) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case float64:
		return int64(x)
	case int:
		return int64(x)
	default:
		return 0
	}
}

// pickRandom selects n unique items from a slice.
func pickRandom[T any](items []T, n int) []T {
	if n >= len(items) {
		return items
	}
	shuffled := make([]T, len(items))
	copy(shuffled, items)
	rand.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})
	return shuffled[:n]
}
