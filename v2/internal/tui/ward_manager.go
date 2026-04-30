// ward_manager.go is a Bubbletea TUI for managing Phantom ward rules.
// Author: Subash Karki
package tui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// WardRule is the TUI's view of a safety rule (decoupled from the safety package).
type WardRule struct {
	ID        string
	Name      string
	Level     string
	Tool      string
	Pattern   string
	Message   string
	EventType string
	Enabled   bool
}

// WardAction is a callback the TUI uses to modify rules.
type WardAction struct {
	Toggle func(ruleID string, enabled bool) error
	Delete func(ruleID string) error
	Save   func(rule WardRule) error
	Preset func(presetID string) error
}

// WardManagerModel is the Bubbletea model for the ward manager TUI.
type WardManagerModel struct {
	rules   []WardRule
	actions WardAction
	cursor  int
	mode    string // "list" | "create" | "presets"
	width   int
	height  int
	message string

	// Create form fields
	formField   int
	formID      string
	formName    string
	formLevel   int // 0=block, 1=confirm, 2=warn, 3=log
	formTool    int // 0=Any, 1=Bash, 2=Edit, 3=Write
	formEvent   int // 0=All, 1=tool_use, 2=user, 3=assistant
	formPattern string
	formMessage string
}

var (
	wardTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#F59E0B")).
			MarginBottom(1)

	wardActiveStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F59E0B")).
			Bold(true)

	wardDimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6B7280"))

	wardEnabledStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#10B981"))

	wardDisabledStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#EF4444"))

	wardBlockStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#EF4444")).Bold(true)

	wardConfirmStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#F59E0B")).Bold(true)

	wardWarnStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FBBF24"))

	wardLogStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6B7280"))

	wardBorderStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#F59E0B")).
			Padding(1, 2)

	wardInputStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#D1D5DB"))

	wardInputActiveStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#F59E0B")).
				Underline(true)
)

var levels      = []string{"block", "confirm", "warn", "log"}
var tools       = []string{"", "Bash", "Edit", "Write"}
var toolLabels  = []string{"Any", "Bash", "Edit", "Write"}
var events      = []string{"", "tool_use", "user", "assistant"}
var eventLabels = []string{"All", "Tool calls", "User prompts", "Responses"}

// NewWardManager returns a new WardManagerModel ready to run.
func NewWardManager(rules []WardRule, actions WardAction) WardManagerModel {
	return WardManagerModel{
		rules:   rules,
		actions: actions,
		mode:    "list",
		width:   80,
		height:  24,
	}
}

func (m WardManagerModel) Init() tea.Cmd {
	return nil
}

func (m WardManagerModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m WardManagerModel) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if msg.Type == tea.KeyCtrlC {
		return m, tea.Quit
	}

	switch m.mode {
	case "list":
		return m.handleListKey(msg)
	case "create":
		return m.handleCreateKey(msg)
	case "presets":
		return m.handlePresetsKey(msg)
	}
	return m, nil
}

func (m WardManagerModel) handleListKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyUp, tea.KeyShiftTab:
		if m.cursor > 0 {
			m.cursor--
		}
	case tea.KeyDown, tea.KeyTab:
		if m.cursor < len(m.rules)-1 {
			m.cursor++
		}
	case tea.KeyEsc:
		return m, tea.Quit
	}

	switch msg.String() {
	case "q":
		return m, tea.Quit
	case "n":
		m.mode = "create"
		m.formField = 0
		m.formID = ""
		m.formName = ""
		m.formLevel = 2 // warn
		m.formTool = 0
		m.formEvent = 0
		m.formPattern = ""
		m.formMessage = ""
	case "p":
		m.mode = "presets"
		m.cursor = 0
	case " ", "t":
		if m.cursor < len(m.rules) {
			r := m.rules[m.cursor]
			if m.actions.Toggle != nil {
				if err := m.actions.Toggle(r.ID, !r.Enabled); err != nil {
					m.message = fmt.Sprintf("Error: %v", err)
				} else {
					m.rules[m.cursor].Enabled = !r.Enabled
					m.message = fmt.Sprintf("%s %s", r.Name, map[bool]string{true: "enabled", false: "disabled"}[!r.Enabled])
				}
			}
		}
	case "d":
		if m.cursor < len(m.rules) {
			r := m.rules[m.cursor]
			if m.actions.Delete != nil {
				if err := m.actions.Delete(r.ID); err != nil {
					m.message = fmt.Sprintf("Error: %v", err)
				} else {
					m.rules = append(m.rules[:m.cursor], m.rules[m.cursor+1:]...)
					if m.cursor >= len(m.rules) && m.cursor > 0 {
						m.cursor--
					}
					m.message = fmt.Sprintf("Deleted %s", r.Name)
				}
			}
		}
	}
	return m, nil
}

func (m WardManagerModel) handleCreateKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEsc:
		m.mode = "list"
		return m, nil
	case tea.KeyTab, tea.KeyDown:
		if m.formField < 6 {
			m.formField++
		}
	case tea.KeyShiftTab, tea.KeyUp:
		if m.formField > 0 {
			m.formField--
		}
	case tea.KeyEnter:
		if m.formField == 6 { // Save button
			return m.saveForm()
		}
		if m.formField < 6 {
			m.formField++
		}
	case tea.KeyLeft:
		switch m.formField {
		case 2: // level
			if m.formLevel > 0 {
				m.formLevel--
			}
		case 3: // tool
			if m.formTool > 0 {
				m.formTool--
			}
		case 4: // event
			if m.formEvent > 0 {
				m.formEvent--
			}
		}
	case tea.KeyRight:
		switch m.formField {
		case 2:
			if m.formLevel < 3 {
				m.formLevel++
			}
		case 3:
			if m.formTool < 3 {
				m.formTool++
			}
		case 4:
			if m.formEvent < 3 {
				m.formEvent++
			}
		}
	case tea.KeyBackspace:
		switch m.formField {
		case 0:
			if len(m.formID) > 0 {
				m.formID = m.formID[:len(m.formID)-1]
			}
		case 1:
			if len(m.formName) > 0 {
				m.formName = m.formName[:len(m.formName)-1]
			}
		case 5:
			if len(m.formPattern) > 0 {
				m.formPattern = m.formPattern[:len(m.formPattern)-1]
			}
		case 6:
			if len(m.formMessage) > 0 {
				m.formMessage = m.formMessage[:len(m.formMessage)-1]
			}
		}
	default:
		if msg.Type == tea.KeyRunes {
			ch := msg.String()
			switch m.formField {
			case 0:
				m.formID += ch
			case 1:
				m.formName += ch
			case 5:
				m.formPattern += ch
			case 6:
				m.formMessage += ch
			}
		}
	}
	return m, nil
}

func (m WardManagerModel) saveForm() (tea.Model, tea.Cmd) {
	if m.formID == "" || m.formName == "" {
		m.message = "ID and Name are required"
		return m, nil
	}
	rule := WardRule{
		ID:        m.formID,
		Name:      m.formName,
		Level:     levels[m.formLevel],
		Tool:      tools[m.formTool],
		EventType: events[m.formEvent],
		Pattern:   m.formPattern,
		Message:   m.formMessage,
		Enabled:   true,
	}
	if m.actions.Save != nil {
		if err := m.actions.Save(rule); err != nil {
			m.message = fmt.Sprintf("Error: %v", err)
			return m, nil
		}
	}
	m.rules = append(m.rules, rule)
	m.message = fmt.Sprintf("Created rule: %s", rule.Name)
	m.mode = "list"
	m.cursor = len(m.rules) - 1
	return m, nil
}

var presetNames = []string{"strict", "permissive", "git-safe", "data-safe"}
var presetDescs = []string{
	"Blocks deletes, force push, DROP TABLE, deploys",
	"Warns on risky ops but never blocks",
	"Blocks force push, reset --hard, branch -D",
	"Blocks data file writes, warns on DB commands",
}

func (m WardManagerModel) handlePresetsKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEsc:
		m.mode = "list"
	case tea.KeyUp:
		if m.cursor > 0 {
			m.cursor--
		}
	case tea.KeyDown:
		if m.cursor < len(presetNames)-1 {
			m.cursor++
		}
	case tea.KeyEnter:
		if m.actions.Preset != nil {
			if err := m.actions.Preset(presetNames[m.cursor]); err != nil {
				m.message = fmt.Sprintf("Error: %v", err)
			} else {
				m.message = fmt.Sprintf("Applied preset: %s", presetNames[m.cursor])
				m.mode = "list"
			}
		}
	}
	return m, nil
}

func (m WardManagerModel) View() string {
	var b strings.Builder

	b.WriteString(wardTitleStyle.Render("⛊ WARD MANAGER"))
	b.WriteString("\n")

	switch m.mode {
	case "list":
		m.renderList(&b)
	case "create":
		m.renderCreate(&b)
	case "presets":
		m.renderPresets(&b)
	}

	if m.message != "" {
		b.WriteString("\n")
		b.WriteString(wardDimStyle.Render(m.message))
	}

	return wardBorderStyle.Render(b.String())
}

func (m WardManagerModel) renderList(b *strings.Builder) {
	if len(m.rules) == 0 {
		b.WriteString(wardDimStyle.Render("  No rules defined. Press [n] to create or [p] for presets.\n"))
	} else {
		for i, r := range m.rules {
			cursor := "  "
			if i == m.cursor {
				cursor = wardActiveStyle.Render("▸ ")
			}

			status := wardEnabledStyle.Render("●")
			if !r.Enabled {
				status = wardDisabledStyle.Render("○")
			}

			var lvl string
			switch r.Level {
			case "block":
				lvl = wardBlockStyle.Render("BLOCK")
			case "confirm":
				lvl = wardConfirmStyle.Render("CONFIRM")
			case "warn":
				lvl = wardWarnStyle.Render("WARN")
			default:
				lvl = wardLogStyle.Render("LOG")
			}

			name := r.Name
			if len(name) > 30 {
				name = name[:27] + "..."
			}

			line := fmt.Sprintf("%s%s %-8s %-30s", cursor, status, lvl, name)
			if r.Tool != "" {
				line += wardDimStyle.Render(fmt.Sprintf(" [%s]", r.Tool))
			}
			b.WriteString(line + "\n")
		}
	}

	b.WriteString("\n")
	b.WriteString(wardDimStyle.Render("[n]ew  [t]oggle  [d]elete  [p]resets  [q]uit"))
}

func (m WardManagerModel) renderCreate(b *strings.Builder) {
	b.WriteString(wardActiveStyle.Render("New Rule") + "\n\n")

	fields := []struct{ label, value string }{
		{"ID", m.formID},
		{"Name", m.formName},
		{"Level", levels[m.formLevel]},
		{"Tool", toolLabels[m.formTool]},
		{"Event", eventLabels[m.formEvent]},
		{"Pattern", m.formPattern},
		{"Message", m.formMessage},
	}

	for i, f := range fields {
		label := wardDimStyle.Render(fmt.Sprintf("  %-10s", f.label))
		value := wardInputStyle.Render(f.value)
		if f.value == "" {
			value = wardDimStyle.Render("(empty)")
		}
		if i == m.formField {
			label = wardActiveStyle.Render(fmt.Sprintf("▸ %-10s", f.label))
			if i >= 2 && i <= 4 {
				value = wardInputActiveStyle.Render(fmt.Sprintf("◀ %s ▶", f.value))
			} else {
				value = wardInputActiveStyle.Render(f.value + "█")
			}
		}
		b.WriteString(fmt.Sprintf("%s %s\n", label, value))
	}

	// Save button rendered on the last field row.
	if m.formField == 6 {
		b.WriteString("\n" + wardActiveStyle.Render("  [ Save Rule ]"))
	}

	b.WriteString("\n\n")
	b.WriteString(wardDimStyle.Render("[tab] next  [←/→] change  [enter] save  [esc] cancel"))
}

func (m WardManagerModel) renderPresets(b *strings.Builder) {
	b.WriteString(wardActiveStyle.Render("Presets") + "\n\n")

	for i, name := range presetNames {
		cursor := "  "
		if i == m.cursor {
			cursor = wardActiveStyle.Render("▸ ")
		}
		b.WriteString(fmt.Sprintf("%s%-14s %s\n", cursor, wardActiveStyle.Render(name), wardDimStyle.Render(presetDescs[i])))
	}

	b.WriteString("\n")
	b.WriteString(wardDimStyle.Render("[enter] apply  [esc] back"))
}
