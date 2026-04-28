// Wails bindings for Bubbletea TUI programs.
// Author: Subash Karki
package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/safety"
	"github.com/subashkarki/phantom-os-v2/internal/tui"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// RunBubbleteaProgram launches a named Bubbletea TUI program inside a new PTY
// session, registers the session with the terminal manager, and starts
// forwarding output to the Wails event bus. The frontend receives data on the
// standard "terminal:{sessionId}:data" event.
//
// Supported programType values:
//   - "setup_wizard" — Project Setup Wizard; args["project_name"] sets the initial name.
//   - "recipe_runner" — Recipe progress runner; args["title"], args["command"],
//     args["cwd"] configure the subprocess.
//
// Returns the session ID on success.
func (a *App) RunBubbleteaProgram(programType string, args map[string]string) (string, error) {
	sessionID := fmt.Sprintf("tui-%s-%s", programType, uuid.New().String())

	const defaultCols uint16 = 120
	const defaultRows uint16 = 36

	var model tea.Model

	switch programType {
	case "setup_wizard":
		resultCh := make(chan tui.WizardResult, 1)
		initialName := args["project_name"]
		if initialName == "" {
			if p := args["project_path"]; p != "" {
				initialName = filepath.Base(p)
			}
		}
		wizard := tui.NewSetupWizard(initialName, resultCh)

		// Drain the result channel in background so the wizard goroutine never blocks.
		go func() {
			result, ok := <-resultCh
			if !ok {
				return
			}
			encoded, err := json.Marshal(result)
			if err != nil {
				slog.Error("RunBubbleteaProgram: marshal wizard result", "err", err)
				return
			}
			wailsRuntime.EventsEmit(a.ctx, fmt.Sprintf("tui:%s:result", sessionID), string(encoded))
		}()

		model = wizard

	case "recipe_runner":
		title := args["title"]
		command := args["command"]
		cwd := args["cwd"]
		if command == "" {
			return "", fmt.Errorf("RunBubbleteaProgram: recipe_runner requires 'command' arg")
		}
		model = tui.NewRecipeRunnerAdapter(title, command, nil, cwd)

	case "ward_manager":
		var wardRules []tui.WardRule
		if a.Safety != nil {
			for _, r := range a.Safety.GetRules() {
				wardRules = append(wardRules, tui.WardRule{
					ID: r.ID, Name: r.Name, Level: string(r.Level),
					Tool: r.Tool, Pattern: r.Pattern, Message: r.Message,
					EventType: r.EventType, Enabled: r.Enabled,
				})
			}
		}
		actions := tui.WardAction{
			Toggle: func(ruleID string, enabled bool) error {
				if a.Safety == nil {
					return fmt.Errorf("safety not available")
				}
				return a.Safety.ToggleRule(ruleID, enabled)
			},
			Delete: func(ruleID string) error {
				if a.Safety == nil {
					return fmt.Errorf("safety not available")
				}
				return a.Safety.DeleteRule(ruleID)
			},
			Save: func(rule tui.WardRule) error {
				if a.Safety == nil {
					return fmt.Errorf("safety not available")
				}
				return a.Safety.SaveRule(safety.Rule{
					ID: rule.ID, Name: rule.Name, Level: safety.Level(rule.Level),
					Tool: rule.Tool, Pattern: rule.Pattern, Message: rule.Message,
					EventType: rule.EventType, Enabled: true, Audit: true,
				})
			},
			Preset: func(presetID string) error {
				return a.ApplyWardPreset(presetID)
			},
		}
		model = tui.NewWardManager(wardRules, actions)

	default:
		return "", fmt.Errorf("RunBubbleteaProgram: unknown program type %q", programType)
	}

	// Create a pty/tty pair and wire the Bubbletea program to it.
	tuiSess, err := tui.RunInPTY(a.ctx, model, defaultCols, defaultRows)
	if err != nil {
		return "", fmt.Errorf("RunBubbleteaProgram: tui.RunInPTY: %w", err)
	}

	// Register a cancel func so DestroyBubbleteaProgram can stop the goroutine by
	// closing the PTY fd (via tuiSess.Close), which unblocks the blocking Read call.
	_, cancel := context.WithCancel(a.ctx)

	a.terminalSubsMu.Lock()
	if prev, exists := a.terminalSubs[sessionID]; exists {
		prev()
	}
	a.terminalSubs[sessionID] = cancel
	a.terminalSubsMu.Unlock()

	eventName := fmt.Sprintf("terminal:%s:data", sessionID)

	go func() {
		defer func() {
			cancel()
			// Close() is safe to call multiple times via sync.Once in tui.Session.
			tuiSess.Close()
			wailsRuntime.EventsEmit(a.ctx, EventTerminalExit, map[string]string{
				"session_id": sessionID,
			})
		}()

		buf := make([]byte, 4096)
		for {
			// PTY.Read blocks until data is available or the fd is closed.
			// Context cancellation is handled by the caller invoking tuiSess.Close(),
			// which closes the PTY fd and causes Read to return with an error.
			n, err := tuiSess.PTY.Read(buf)
			if n > 0 {
				data := make([]byte, n)
				copy(data, buf[:n])
				wailsRuntime.EventsEmit(a.ctx, eventName, base64.StdEncoding.EncodeToString(data))
			}
			if err != nil {
				if err != io.EOF {
					slog.Error("RunBubbleteaProgram: PTY read error", "sessionID", sessionID, "err", err)
				}
				return
			}
		}
	}()

	// Forward frontend keystrokes to the pty master via WriteTerminal-equivalent.
	// We store the tuiSess so ResizeBubbleteaProgram can forward resize events.
	a.tuiSessionsMu.Lock()
	a.tuiSessions[sessionID] = tuiSess
	a.tuiSessionsMu.Unlock()

	return sessionID, nil
}

// WriteBubbleteaProgram forwards user input (from xterm.js) to the running
// Bubbletea program's PTY master. Mirrors WriteTerminal for TUI sessions.
func (a *App) WriteBubbleteaProgram(sessionID string, data string) error {
	a.tuiSessionsMu.RLock()
	sess, ok := a.tuiSessions[sessionID]
	a.tuiSessionsMu.RUnlock()
	if !ok {
		return fmt.Errorf("WriteBubbleteaProgram: session %q not found", sessionID)
	}
	_, err := sess.PTY.Write([]byte(data))
	return err
}

// ResizeBubbleteaProgram updates the PTY window size of a TUI session.
func (a *App) ResizeBubbleteaProgram(sessionID string, cols, rows int) error {
	a.tuiSessionsMu.RLock()
	sess, ok := a.tuiSessions[sessionID]
	a.tuiSessionsMu.RUnlock()
	if !ok {
		return fmt.Errorf("ResizeBubbleteaProgram: session %q not found", sessionID)
	}
	return sess.Resize(uint16(cols), uint16(rows))
}

// DestroyBubbleteaProgram quits a TUI program and cleans up its session.
func (a *App) DestroyBubbleteaProgram(sessionID string) {
	a.tuiSessionsMu.Lock()
	sess, ok := a.tuiSessions[sessionID]
	if ok {
		delete(a.tuiSessions, sessionID)
	}
	a.tuiSessionsMu.Unlock()

	if ok {
		sess.Close()
	}

	a.terminalSubsMu.Lock()
	if cancel, exists := a.terminalSubs[sessionID]; exists {
		cancel()
		delete(a.terminalSubs, sessionID)
	}
	a.terminalSubsMu.Unlock()
}
