// Author: Subash Karki
package app

import (
	"context"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	EventAppReady    = "app:ready"
	EventHealthPulse = "health:pulse"
	EventWSStatus    = "ws:status"

	EventSessionNew     = "session:new"
	EventSessionUpdate  = "session:update"
	EventSessionEnd     = "session:end"
	EventSessionStale   = "session:stale"
	EventSessionContext = "session:context"

	EventTaskNew    = "task:new"
	EventTaskUpdate = "task:update"

	EventActivity = "activity"

	EventJSONLScan   = "jsonl:scan-complete"
	EventJSONLRescan = "jsonl:rescan"

	EventTerminalData = "terminal:data"
	EventTerminalExit = "terminal:exit"

	EventGitStatus        = "git:status"
	EventGitBranchChanged = "git:branch-changed"
	EventWorktreeCreated = "worktree:created"
	EventWorktreeRemoved = "worktree:removed"
	EventWorktreeUpdated = "worktree:updated"

	EventPrCreated = "pr:created"

	EventPrUpdated      = "pr:updated"       // payload: *git.PrStatus (nil if no PR)
	EventCiUpdated      = "ci:updated"       // payload: []git.CiRun
	EventPrsListUpdated = "prs:list-updated" // payload: []git.PrStatus

	// Ship-It (merge action) lifecycle events.
	EventPrMerging    = "pr:merging"     // payload: { worktreeId, prNumber, autoMerge bool }
	EventPrMerged     = "pr:merged"      // payload: { worktreeId, prNumber }
	EventMergeFailed  = "pr:merge-failed" // payload: { worktreeId, prNumber, message }

	EventGamificationXPGained           = "gamification:xp_gained"            // payload: {amount, total, trigger}
	EventGamificationLevelUp            = "gamification:level_up"             // payload: {level, xpToNext}
	EventGamificationRankUp             = "gamification:rank_up"              // payload: {rank, title}
	EventGamificationAchievementUnlocked = "gamification:achievement_unlocked" // payload: {id, name, description, icon, xpReward}
	EventGamificationQuestCompleted     = "gamification:quest_completed"      // payload: {id, label, xpReward}
)

func EmitEvent(ctx context.Context, name string, data interface{}) {
	wailsRuntime.EventsEmit(ctx, name, data)
}
