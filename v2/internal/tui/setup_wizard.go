// Author: Subash Karki
package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

var (
	wizardTitleStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("#7C3AED")).
				MarginBottom(1)

	wizardSubtitleStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#6B7280")).
				MarginBottom(1)

	wizardStepStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#9CA3AF"))

	wizardSuccessStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("#10B981"))

	wizardErrorStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#EF4444"))

	wizardBorderStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("#7C3AED")).
				Padding(1, 2)

	wizardSelectedItem = lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("#7C3AED"))
)

// ---------------------------------------------------------------------------
// Step constants
// ---------------------------------------------------------------------------

type wizardStep int

const (
	stepProjectName wizardStep = iota
	stepLanguage
	stepRecipes
	stepDone
)

// ---------------------------------------------------------------------------
// List item helpers
// ---------------------------------------------------------------------------

type wizardItem struct {
	label       string
	description string
}

func (i wizardItem) Title() string       { return i.label }
func (i wizardItem) Description() string { return i.description }
func (i wizardItem) FilterValue() string { return i.label }

// ---------------------------------------------------------------------------
// WizardResult is returned via the Result channel when the wizard completes.
// ---------------------------------------------------------------------------

// WizardResult holds the choices the user made in the setup wizard.
type WizardResult struct {
	ProjectName string   `json:"project_name"`
	Language    string   `json:"language"`
	Recipes     []string `json:"recipes"`
	Cancelled   bool     `json:"cancelled"`
}

// wizardDoneMsg is an internal tea.Msg used to signal that saving is complete.
type wizardDoneMsg struct{ result WizardResult }

// ---------------------------------------------------------------------------
// SetupWizardModel — the main Bubbletea model
// ---------------------------------------------------------------------------

// SetupWizardModel is the Project Setup Wizard. It walks the user through
// four steps: confirm project name → choose language → select recipes → done.
type SetupWizardModel struct {
	// Configuration injected by caller.
	InitialName string
	Result      chan<- WizardResult

	// Internal state.
	step            wizardStep
	projectName     textinput.Model
	langList        list.Model
	recipeList      list.Model
	spinner         spinner.Model
	saving          bool
	err             string
	width           int
	height          int
	selectedRecipes map[int]bool
}

// NewSetupWizard creates a ready-to-run SetupWizardModel. result receives the
// final WizardResult when the user finishes or cancels; the channel should be
// buffered (capacity 1) to avoid blocking the Bubbletea event loop.
func NewSetupWizard(initialName string, result chan<- WizardResult) SetupWizardModel {
	// --- text input ---
	ti := textinput.New()
	ti.Placeholder = "my-awesome-project"
	ti.SetValue(initialName)
	ti.Focus()
	ti.CharLimit = 64
	ti.Width = 40

	// --- language list ---
	langItems := []list.Item{
		wizardItem{"Go", "Fast, compiled, great for CLI & services"},
		wizardItem{"TypeScript / Node", "JavaScript with types — great for web & scripts"},
		wizardItem{"Python", "Batteries included — great for ML & data"},
		wizardItem{"Rust", "Memory safe systems programming"},
		wizardItem{"Other", "I'll configure this manually"},
	}
	langDelegate := list.NewDefaultDelegate()
	langDelegate.ShowDescription = true
	ll := list.New(langItems, langDelegate, 50, 12)
	ll.Title = "Select primary language / framework"
	ll.SetShowStatusBar(false)
	ll.SetFilteringEnabled(false)

	// --- recipe list (multi-select via toggle) ---
	recipeItems := []list.Item{
		wizardItem{"build", "Compile / build the project"},
		wizardItem{"test", "Run the test suite"},
		wizardItem{"lint", "Static analysis & formatting"},
		wizardItem{"dev", "Start dev server / hot-reload"},
		wizardItem{"clean", "Remove build artifacts"},
	}
	recipeDelegate := list.NewDefaultDelegate()
	recipeDelegate.ShowDescription = true
	rl := list.New(recipeItems, recipeDelegate, 50, 14)
	rl.Title = "Select default recipes  (space to toggle, enter to confirm)"
	rl.SetShowStatusBar(false)
	rl.SetFilteringEnabled(false)

	// --- spinner ---
	sp := spinner.New()
	sp.Spinner = spinner.Dot
	sp.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("#7C3AED"))

	return SetupWizardModel{
		InitialName:     initialName,
		Result:          result,
		step:            stepProjectName,
		projectName:     ti,
		langList:        ll,
		recipeList:      rl,
		spinner:         sp,
		width:           80,
		height:          24,
		selectedRecipes: make(map[int]bool),
	}
}

// ---------------------------------------------------------------------------
// Bubbletea interface
// ---------------------------------------------------------------------------

func (m SetupWizardModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m SetupWizardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	// ---- window resize ----
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.langList.SetWidth(msg.Width - 6)
		m.recipeList.SetWidth(msg.Width - 6)
		return m, nil

	// ---- keyboard ----
	case tea.KeyMsg:
		// Global escape / ctrl+c → cancel.
		if msg.Type == tea.KeyCtrlC || msg.Type == tea.KeyEsc {
			if m.Result != nil {
				m.Result <- WizardResult{Cancelled: true}
			}
			return m, tea.Quit
		}

		switch m.step {
		case stepProjectName:
			return m.updateProjectName(msg)
		case stepLanguage:
			return m.updateLanguage(msg)
		case stepRecipes:
			return m.updateRecipes(msg)
		}

	// ---- spinner tick ----
	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	// ---- wizard done ----
	case wizardDoneMsg:
		if m.Result != nil {
			m.Result <- msg.result
		}
		return m, tea.Quit
	}

	return m, nil
}

// updateProjectName handles key events on step 0.
func (m SetupWizardModel) updateProjectName(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEnter:
		name := strings.TrimSpace(m.projectName.Value())
		if name == "" {
			m.err = "Project name cannot be empty."
			return m, nil
		}
		m.err = ""
		m.step = stepLanguage
		return m, nil
	}

	var cmd tea.Cmd
	m.projectName, cmd = m.projectName.Update(msg)
	return m, cmd
}

// updateLanguage handles key events on step 1.
func (m SetupWizardModel) updateLanguage(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEnter:
		m.step = stepRecipes
		return m, nil
	}

	var cmd tea.Cmd
	m.langList, cmd = m.langList.Update(msg)
	return m, cmd
}

// updateRecipes handles key events on step 2.
func (m SetupWizardModel) updateRecipes(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeySpace:
		idx := m.recipeList.Index()
		m.selectedRecipes[idx] = !m.selectedRecipes[idx]
		return m, nil

	case tea.KeyEnter:
		// Build recipe slice from toggles.
		recipes := make([]string, 0, len(m.selectedRecipes))
		for i, item := range m.recipeList.Items() {
			if m.selectedRecipes[i] {
				if wi, ok := item.(wizardItem); ok {
					recipes = append(recipes, wi.label)
				}
			}
		}
		// Reset for next run.
		m.selectedRecipes = make(map[int]bool)

		lang := ""
		if sel := m.langList.SelectedItem(); sel != nil {
			if wi, ok := sel.(wizardItem); ok {
				lang = wi.label
			}
		}

		result := WizardResult{
			ProjectName: strings.TrimSpace(m.projectName.Value()),
			Language:    lang,
			Recipes:     recipes,
		}

		m.step = stepDone
		m.saving = true
		return m, tea.Batch(
			m.spinner.Tick,
			func() tea.Msg { return wizardDoneMsg{result: result} },
		)
	}

	var cmd tea.Cmd
	m.recipeList, cmd = m.recipeList.Update(msg)
	return m, cmd
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

func (m SetupWizardModel) View() string {
	var b strings.Builder

	b.WriteString(wizardTitleStyle.Render("PhantomOS Project Setup Wizard"))
	b.WriteString("\n")
	b.WriteString(wizardStepStyle.Render(m.stepIndicator()))
	b.WriteString("\n\n")

	switch m.step {
	case stepProjectName:
		b.WriteString(wizardSubtitleStyle.Render("What should we call this project?"))
		b.WriteString("\n")
		b.WriteString(m.projectName.View())
		if m.err != "" {
			b.WriteString("\n")
			b.WriteString(wizardErrorStyle.Render(m.err))
		}
		b.WriteString("\n\n")
		b.WriteString(wizardStepStyle.Render("press enter to continue • esc to cancel"))

	case stepLanguage:
		b.WriteString(m.langList.View())
		b.WriteString("\n")
		b.WriteString(wizardStepStyle.Render("↑/↓ navigate • enter to select • esc to cancel"))

	case stepRecipes:
		b.WriteString(m.recipeList.View())
		b.WriteString("\n")
		b.WriteString(wizardStepStyle.Render("space to toggle • enter to confirm • esc to cancel"))

	case stepDone:
		if m.saving {
			b.WriteString(fmt.Sprintf("%s  Saving project configuration…", m.spinner.View()))
		} else {
			b.WriteString(wizardSuccessStyle.Render("Project configured! Closing…"))
		}
	}

	return wizardBorderStyle.Render(b.String())
}

func (m SetupWizardModel) stepIndicator() string {
	steps := []string{"Name", "Language", "Recipes", "Done"}
	parts := make([]string, len(steps))
	for i, s := range steps {
		if wizardStep(i) == m.step {
			parts[i] = wizardSelectedItem.Render(fmt.Sprintf("[%s]", s))
		} else if wizardStep(i) < m.step {
			parts[i] = wizardSuccessStyle.Render(fmt.Sprintf("✓ %s", s))
		} else {
			parts[i] = wizardStepStyle.Render(s)
		}
	}
	return strings.Join(parts, "  →  ")
}
