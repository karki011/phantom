// Author: Subash Karki
package persona

import "time"

type PillState string

const (
	PillIdle      PillState = "idle"
	PillObserving PillState = "observing"
	PillAttention PillState = "attention"
	PillListening PillState = "listening"
	PillSpeaking  PillState = "speaking"
)

type TrustTier int

const (
	TierObserve  TrustTier = 0
	TierTerminal TrustTier = 1
	TierClaude   TrustTier = 2
	TierGit      TrustTier = 3
)

type Lane string

const (
	LaneStateLookup    Lane = "state_lookup"
	LaneLocalReasoning Lane = "local_reasoning"
	LaneClaudeTask     Lane = "claude_task"
	LaneSystemAction   Lane = "system_action"
)

type Intent struct {
	Lane    Lane
	Handler string
	Method  string
	Args    map[string]string
	Raw     string
}

type Response struct {
	Text         string        `json:"text"`
	Speak        string        `json:"speak"`
	QuickActions []QuickAction `json:"quickActions,omitempty"`
}

type QuickAction struct {
	Label  string            `json:"label"`
	Action string            `json:"action"`
	Args   map[string]string `json:"args,omitempty"`
}

type PersonaState struct {
	PillState     PillState `json:"pillState"`
	StatusText    string    `json:"statusText"`
	ActiveProject string    `json:"activeProject"`
	Expanded      bool      `json:"expanded"`
}

type ClaudeSessionStatus struct {
	SessionID    string    `json:"sessionId"`
	ProjectPath  string    `json:"projectPath"`
	LiveState    string    `json:"liveState"`
	LastTool     string    `json:"lastTool"`
	FilesChanged int       `json:"filesChanged"`
	StartedAt    time.Time `json:"startedAt"`
}

type TerminalStatus struct {
	ID       string `json:"id"`
	CWD      string `json:"cwd"`
	Attached bool   `json:"attached"`
	Title    string `json:"title"`
}

type GitSummary struct {
	Branch        string          `json:"branch"`
	IsClean       bool            `json:"isClean"`
	Staged        int             `json:"staged"`
	Unstaged      int             `json:"unstaged"`
	Untracked     int             `json:"untracked"`
	RecentCommits []CommitSummary `json:"recentCommits"`
}

type CommitSummary struct {
	Hash    string    `json:"hash"`
	Message string    `json:"message"`
	Author  string    `json:"author"`
	When    time.Time `json:"when"`
}

type GraphSummary struct {
	FileCount   int `json:"fileCount"`
	SymbolCount int `json:"symbolCount"`
	EdgeCount   int `json:"edgeCount"`
}

type PersonaContext struct {
	ActiveProject    string                `json:"activeProject"`
	ClaudeSessions   []ClaudeSessionStatus `json:"claudeSessions"`
	TerminalSessions []TerminalStatus      `json:"terminalSessions"`
	RecentGit        GitSummary            `json:"recentGit"`
	FileGraph        GraphSummary          `json:"fileGraph"`
}

type Message struct {
	Role      string    `json:"role"`
	Text      string    `json:"text"`
	Timestamp time.Time `json:"timestamp"`
}
