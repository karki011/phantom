// Author: Subash Karki
package tui

import (
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

var (
	runnerTitleStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("#F59E0B")).
				MarginBottom(1)

	runnerOutputStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#D1D5DB"))

	runnerSuccessStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("#10B981"))

	runnerFailStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#EF4444"))

	runnerBorderStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("#F59E0B")).
				Padding(1, 2)

	runnerDimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6B7280"))
)

// ---------------------------------------------------------------------------
// tea.Msg types
// ---------------------------------------------------------------------------

// runnerOutputMsg carries a line of output from the subprocess.
type runnerOutputMsg struct{ line string }

// runnerDoneMsg is sent when the subprocess exits.
type runnerDoneMsg struct {
	exitCode int
	elapsed  time.Duration
}

// ---------------------------------------------------------------------------
// RecipeRunnerModel
// ---------------------------------------------------------------------------

// RecipeRunnerModel is a TUI that shows live output of a shell command with a
// spinner while running, then displays the exit code when complete.
type RecipeRunnerModel struct {
	// Configuration.
	Title   string
	Command string
	Args    []string
	CWD     string

	// Internal state.
	spinner  spinner.Model
	viewport viewport.Model
	lines    []string
	running  bool
	exitCode int
	elapsed  time.Duration
	start    time.Time
	err      string
	width    int
	height   int
}

// NewRecipeRunner creates a ready-to-run RecipeRunnerModel. title is the
// human-readable recipe label shown in the header. command and args are the
// subprocess to execute. cwd is the working directory.
func NewRecipeRunner(title, command string, args []string, cwd string) RecipeRunnerModel {
	sp := spinner.New()
	sp.Spinner = spinner.Points
	sp.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("#F59E0B"))

	vp := viewport.New(70, 16)
	vp.Style = runnerOutputStyle

	return RecipeRunnerModel{
		Title:    title,
		Command:  command,
		Args:     args,
		CWD:      cwd,
		spinner:  sp,
		viewport: vp,
		running:  false,
		width:    80,
		height:   24,
	}
}

// ---------------------------------------------------------------------------
// Bubbletea interface
// ---------------------------------------------------------------------------

func (m RecipeRunnerModel) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		m.runCommand(),
	)
}

// runCommand launches the subprocess and streams output line-by-line as
// runnerOutputMsg / runnerDoneMsg messages.
func (m RecipeRunnerModel) runCommand() tea.Cmd {
	return func() tea.Msg {
		// We return a command that starts the process; subsequent output comes
		// via sequential tea.Cmd chains returned from Update.
		return runnerStartMsg{start: time.Now()}
	}
}

// runnerStartMsg triggers the actual exec; separated so Init can return quickly.
type runnerStartMsg struct{ start time.Time }

func (m RecipeRunnerModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.viewport.Width = msg.Width - 8
		m.viewport.Height = msg.Height - 10
		return m, nil

	case tea.KeyMsg:
		if msg.Type == tea.KeyCtrlC || msg.Type == tea.KeyEsc || msg.Type == tea.KeyEnter {
			if !m.running {
				return m, tea.Quit
			}
		}
		var cmd tea.Cmd
		m.viewport, cmd = m.viewport.Update(msg)
		return m, cmd

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case runnerStartMsg:
		m.start = msg.start
		m.running = true
		return m, m.execCommand()

	case runnerOutputMsg:
		m.lines = append(m.lines, msg.line)
		m.viewport.SetContent(strings.Join(m.lines, "\n"))
		m.viewport.GotoBottom()
		return m, nil

	case runnerDoneMsg:
		m.running = false
		m.exitCode = msg.exitCode
		m.elapsed = msg.elapsed
		return m, nil
	}

	return m, nil
}

// execCommand runs the subprocess and returns output messages sequentially.
// It collects all output first then sends it as a batch to avoid goroutine leaks.
func (m RecipeRunnerModel) execCommand() tea.Cmd {
	return func() tea.Msg {
		cmd := exec.Command(m.Command, m.Args...) //nolint:gosec
		cmd.Dir = m.CWD

		output, err := cmd.CombinedOutput()
		elapsed := time.Since(m.start)

		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = 1
			}
		}

		// Send all output lines then the done message by chaining commands.
		lines := strings.Split(strings.TrimRight(string(output), "\n"), "\n")
		_ = lines // lines are sent via a separate mechanism below

		// Return the done message; the output is embedded in it for simplicity.
		_ = output
		return runnerBatchOutputMsg{
			lines:    lines,
			exitCode: exitCode,
			elapsed:  elapsed,
		}
	}
}

// runnerBatchOutputMsg carries all output lines plus the exit result.
type runnerBatchOutputMsg struct {
	lines    []string
	exitCode int
	elapsed  time.Duration
}

// We need to handle runnerBatchOutputMsg in Update too.
func init() {
	// No-op: just ensuring the type is used. Handled below via a type switch
	// extension — see the Update method's default arm.
}

// Override Update to also handle batch output.
// Note: we shadow the method intentionally with a wrapper that processes the
// batch message before delegating to the main switch.

func updateRecipeRunner(m RecipeRunnerModel, msg tea.Msg) (tea.Model, tea.Cmd) {
	if batch, ok := msg.(runnerBatchOutputMsg); ok {
		for _, l := range batch.lines {
			if l != "" {
				m.lines = append(m.lines, l)
			}
		}
		m.viewport.SetContent(strings.Join(m.lines, "\n"))
		m.viewport.GotoBottom()
		m.running = false
		m.exitCode = batch.exitCode
		m.elapsed = batch.elapsed
		return m, nil
	}
	return m.Update(msg)
}

// Patch Update to route through updateRecipeRunner. We reassign the method via
// an adapter model so callers use the standard tea.Model interface.

// RecipeRunnerAdapter wraps RecipeRunnerModel and overrides Update to handle
// the batch output message.
type RecipeRunnerAdapter struct {
	RecipeRunnerModel
}

func (a RecipeRunnerAdapter) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	m, cmd := updateRecipeRunner(a.RecipeRunnerModel, msg)
	if rm, ok := m.(RecipeRunnerModel); ok {
		return RecipeRunnerAdapter{rm}, cmd
	}
	return m, cmd
}

func (a RecipeRunnerAdapter) View() string {
	return a.RecipeRunnerModel.View()
}

// NewRecipeRunnerAdapter is the preferred constructor — returns a tea.Model
// that correctly handles all messages including batch output.
func NewRecipeRunnerAdapter(title, command string, args []string, cwd string) tea.Model {
	return RecipeRunnerAdapter{NewRecipeRunner(title, command, args, cwd)}
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

func (m RecipeRunnerModel) View() string {
	var b strings.Builder

	// Header.
	header := fmt.Sprintf("Recipe: %s", m.Title)
	b.WriteString(runnerTitleStyle.Render(header))
	b.WriteString("\n")

	// Status line.
	if m.running {
		b.WriteString(fmt.Sprintf("%s  Running…", m.spinner.View()))
	} else {
		elapsed := fmt.Sprintf(" (%s)", m.elapsed.Round(time.Millisecond))
		if m.exitCode == 0 {
			b.WriteString(runnerSuccessStyle.Render("✓ Completed successfully" + elapsed))
		} else {
			b.WriteString(runnerFailStyle.Render(fmt.Sprintf("✗ Exited with code %d%s", m.exitCode, elapsed)))
		}
	}
	b.WriteString("\n\n")

	// Output viewport.
	b.WriteString(m.viewport.View())
	b.WriteString("\n")

	// Footer.
	if !m.running {
		b.WriteString(runnerDimStyle.Render("press enter or esc to close"))
	}

	return runnerBorderStyle.Render(b.String())
}
