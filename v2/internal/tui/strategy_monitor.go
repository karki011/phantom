// Author: Subash Karki
// strategy_monitor.go is a Bubbletea TUI that visualises the AI strategy
// engine's decisions in real time. It subscribes to strategy events emitted
// by the composer orchestrator and renders a live dashboard showing the
// active strategy, assessment metrics, performance scoreboard, and
// auto-tune status.
package tui

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// StrategyEvent is the message the TUI receives when the orchestrator
// selects a strategy. The caller pushes these into the Events channel.
type StrategyEvent struct {
	StrategyName string
	Confidence   float64
	Complexity   string
	Risk         string
	BlastRadius  int
	FileCount    int
	Ambiguity    float64
	Timestamp    time.Time
}

// PerformanceEntry is a snapshot of one strategy's aggregate performance.
type PerformanceEntry struct {
	StrategyID string
	Successes  int
	Total      int
}

// AutoTuneStatus is a snapshot of the auto-tune state.
type AutoTuneStatus struct {
	DecisionCount     int
	NextRecalibrate   int
	SimpleThreshold   int
	ModerateThreshold int
	ComplexThreshold  int
}

// StrategyMonitorConfig holds the initial state and event channel.
type StrategyMonitorConfig struct {
	Events      <-chan StrategyEvent
	Performance []PerformanceEntry
	AutoTune    AutoTuneStatus
	Strategies  []string // registered strategy names
}

// strategyMonitorModel is the Bubbletea model.
type strategyMonitorModel struct {
	events      <-chan StrategyEvent
	width       int
	height      int
	tab         int // 0=live, 1=scoreboard, 2=history
	history     []StrategyEvent
	performance map[string]PerformanceEntry
	autoTune    AutoTuneStatus
	strategies  []string
}

// NewStrategyMonitor returns a model ready for RunInPTY.
func NewStrategyMonitor(cfg StrategyMonitorConfig) strategyMonitorModel {
	perf := make(map[string]PerformanceEntry, len(cfg.Performance))
	for _, p := range cfg.Performance {
		perf[p.StrategyID] = p
	}
	return strategyMonitorModel{
		events:      cfg.Events,
		width:       80,
		height:      24,
		performance: perf,
		autoTune:    cfg.AutoTune,
		strategies:  cfg.Strategies,
	}
}

// waitForEvent returns a tea.Cmd that blocks on the event channel and
// yields a StrategyEvent message when one arrives.
func waitForEvent(ch <-chan StrategyEvent) tea.Cmd {
	return func() tea.Msg {
		ev, ok := <-ch
		if !ok {
			return tea.Quit()
		}
		return ev
	}
}

func (m strategyMonitorModel) Init() tea.Cmd {
	if m.events != nil {
		return waitForEvent(m.events)
	}
	return nil
}

func (m strategyMonitorModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "1":
			m.tab = 0
		case "2":
			m.tab = 1
		case "3":
			m.tab = 2
		case "tab":
			m.tab = (m.tab + 1) % 3
		}
		return m, nil

	case StrategyEvent:
		m.history = append(m.history, msg)
		// Keep last 50 events.
		if len(m.history) > 50 {
			m.history = m.history[len(m.history)-50:]
		}
		return m, waitForEvent(m.events)
	}
	return m, nil
}

func (m strategyMonitorModel) View() string {
	var b strings.Builder

	b.WriteString(smTitleStyle.Render("⚡ STRATEGY MONITOR"))
	b.WriteString("\n")

	// Tab bar
	tabs := []string{"Live", "Scoreboard", "History"}
	var tabRow strings.Builder
	for i, t := range tabs {
		if i == m.tab {
			tabRow.WriteString(smActiveTabStyle.Render(fmt.Sprintf(" [%d] %s ", i+1, t)))
		} else {
			tabRow.WriteString(smDimTabStyle.Render(fmt.Sprintf("  %d  %s  ", i+1, t)))
		}
	}
	b.WriteString(tabRow.String())
	b.WriteString("\n\n")

	switch m.tab {
	case 0:
		m.renderLive(&b)
	case 1:
		m.renderScoreboard(&b)
	case 2:
		m.renderHistory(&b)
	}

	b.WriteString("\n")
	b.WriteString(smDimStyle.Render("[1]live [2]scoreboard [3]history [tab]cycle [q]uit"))

	return smBorderStyle.Width(min(m.width-4, 60)).Render(b.String())
}

func (m strategyMonitorModel) renderLive(b *strings.Builder) {
	if len(m.history) == 0 {
		b.WriteString(smDimStyle.Render("  Waiting for strategy events...\n"))
		b.WriteString(smDimStyle.Render("  Send a message in the composer to see decisions.\n"))
		return
	}

	latest := m.history[len(m.history)-1]

	// Strategy name + confidence
	confBar := renderBar(latest.Confidence, 10)
	confPct := fmt.Sprintf("%.0f%%", latest.Confidence*100)
	b.WriteString(fmt.Sprintf("  Strategy: %s  %s %s\n",
		smStrategyStyle.Render(latest.StrategyName),
		confBar,
		smAccentStyle.Render(confPct),
	))

	// Assessment metrics
	compStyle := complexityStyle(latest.Complexity)
	riskStyle := riskColorStyle(latest.Risk)
	b.WriteString(fmt.Sprintf("  Complexity: %s  Risk: %s  Ambiguity: %.2f\n",
		compStyle.Render(latest.Complexity),
		riskStyle.Render(latest.Risk),
		latest.Ambiguity,
	))
	b.WriteString(fmt.Sprintf("  Blast Radius: %s files  File Count: %d\n",
		smAccentStyle.Render(fmt.Sprintf("%d", latest.BlastRadius)),
		latest.FileCount,
	))

	// Timestamp
	b.WriteString(fmt.Sprintf("  Last: %s\n",
		smDimStyle.Render(latest.Timestamp.Format("15:04:05")),
	))

	// Auto-tune status
	b.WriteString("\n")
	b.WriteString(smSectionStyle.Render("── Auto-Tune ──"))
	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("  Decisions: %d  Next recalibrate: %d left\n",
		m.autoTune.DecisionCount,
		m.autoTune.NextRecalibrate,
	))
	b.WriteString(fmt.Sprintf("  Thresholds: S≤%d  M≤%d  C≤%d\n",
		m.autoTune.SimpleThreshold,
		m.autoTune.ModerateThreshold,
		m.autoTune.ComplexThreshold,
	))
}

func (m strategyMonitorModel) renderScoreboard(b *strings.Builder) {
	b.WriteString(smSectionStyle.Render("── Strategy Performance ──"))
	b.WriteString("\n\n")

	if len(m.performance) == 0 {
		b.WriteString(smDimStyle.Render("  No performance data yet.\n"))
		return
	}

	// Find the latest strategy name from history for highlighting.
	var activeName string
	if len(m.history) > 0 {
		activeName = m.history[len(m.history)-1].StrategyName
	}

	for _, name := range m.strategies {
		entry, ok := m.performance[name]
		if !ok {
			b.WriteString(fmt.Sprintf("  %-18s %s\n", name, smDimStyle.Render("no data")))
			continue
		}
		rate := float64(0)
		if entry.Total > 0 {
			rate = float64(entry.Successes) / float64(entry.Total)
		}
		bar := renderBar(rate, 10)
		pct := fmt.Sprintf("%.0f%%", rate*100)
		count := fmt.Sprintf("(%d/%d)", entry.Successes, entry.Total)

		marker := "  "
		nameStyle := smDimStyle
		if name == activeName {
			marker = smAccentStyle.Render("▸ ")
			nameStyle = smStrategyStyle
		}

		b.WriteString(fmt.Sprintf("%s%-18s %s %s %s\n",
			marker,
			nameStyle.Render(name),
			bar,
			smAccentStyle.Render(pct),
			smDimStyle.Render(count),
		))
	}
}

func (m strategyMonitorModel) renderHistory(b *strings.Builder) {
	b.WriteString(smSectionStyle.Render("── Recent Decisions ──"))
	b.WriteString("\n\n")

	if len(m.history) == 0 {
		b.WriteString(smDimStyle.Render("  No decisions yet.\n"))
		return
	}

	// Show last 10 events, most recent first.
	start := len(m.history) - 10
	if start < 0 {
		start = 0
	}
	for i := len(m.history) - 1; i >= start; i-- {
		ev := m.history[i]
		ts := ev.Timestamp.Format("15:04:05")
		confPct := fmt.Sprintf("%.0f%%", ev.Confidence*100)
		compStyle := complexityStyle(ev.Complexity)

		marker := "  "
		if i == len(m.history)-1 {
			marker = smAccentStyle.Render("▸ ")
		}

		b.WriteString(fmt.Sprintf("%s%s  %-16s %s  %s  blast:%d\n",
			marker,
			smDimStyle.Render(ts),
			smStrategyStyle.Render(ev.StrategyName),
			smAccentStyle.Render(confPct),
			compStyle.Render(ev.Complexity),
			ev.BlastRadius,
		))
	}
}

// --- Styles ---

var (
	smTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#7C3AED")).
			MarginBottom(1)

	smBorderStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#7C3AED")).
			Padding(1, 2)

	smStrategyStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#7C3AED")).
			Bold(true)

	smAccentStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F59E0B"))

	smDimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6B7280"))

	smSectionStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#9CA3AF")).
			Bold(true)

	smActiveTabStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#7C3AED")).
				Bold(true).
				Underline(true)

	smDimTabStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6B7280"))

	smGreenStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#10B981"))
	smRedStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#EF4444"))
)

func renderBar(ratio float64, width int) string {
	filled := int(ratio * float64(width))
	if filled > width {
		filled = width
	}
	empty := width - filled
	bar := smGreenStyle.Render(strings.Repeat("█", filled)) +
		smDimStyle.Render(strings.Repeat("░", empty))
	return bar
}

func complexityStyle(c string) lipgloss.Style {
	switch c {
	case "critical":
		return smRedStyle.Bold(true)
	case "complex":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#F59E0B")).Bold(true)
	case "moderate":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#FBBF24"))
	default:
		return smGreenStyle
	}
}

func riskColorStyle(r string) lipgloss.Style {
	switch r {
	case "critical":
		return smRedStyle.Bold(true)
	case "high":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#EF4444"))
	case "medium":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#F59E0B"))
	default:
		return smGreenStyle
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
