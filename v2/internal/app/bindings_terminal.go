// Wails bindings for terminal session management.
// Author: Subash Karki
package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/project"
	"github.com/subashkarki/phantom-os-v2/internal/terminal"
	"github.com/subashkarki/phantom-os-v2/internal/tui"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// terminalWSMessage is the JSON envelope sent over WebSocket for terminal data.
type terminalWSMessage struct {
	Type      string `json:"type"`
	SessionID string `json:"session_id"`
	Payload   string `json:"payload"`
}

// CreateTerminal spawns a new PTY session and wires its output to Wails events
// so the frontend receives live terminal data. The Wails event bridge
// (SubscribeTerminal) is the primary transport; no separate WS goroutine is
// created to avoid duplicate subscriptions and untracked goroutine leaks.
func (a *App) CreateTerminal(id, cwd string, cols, rows int) error {
	_, err := a.Terminal.Create(a.ctx, id, cwd, uint16(cols), uint16(rows))
	if err != nil {
		return fmt.Errorf("CreateTerminal: %w", err)
	}

	// Bridge PTY output to Wails events immediately so the frontend can
	// listen on terminal:{id}:data without a separate SubscribeTerminal call.
	a.SubscribeTerminal(id)

	return nil
}

// WriteTerminal sends raw text data to the terminal's PTY input.
func (a *App) WriteTerminal(id string, data string) error {
	return a.Terminal.Write(id, []byte(data))
}

// RunTerminalCommand writes a command string to the terminal's PTY stdin,
// followed by a newline to execute it.
// Author: Subash Karki
func (a *App) RunTerminalCommand(sessionId string, command string) error {
	return a.Terminal.Write(sessionId, []byte(command+"\n"))
}

// ResizeTerminal updates the PTY window size.
func (a *App) ResizeTerminal(id string, cols, rows int) error {
	return a.Terminal.Resize(id, uint16(cols), uint16(rows))
}

// DestroyTerminal closes and removes a terminal session.
func (a *App) DestroyTerminal(id string) error {
	return a.Terminal.Destroy(id)
}

// GetTerminalScrollback returns the ring buffer contents as a base64-encoded string.
// This allows the frontend to restore terminal history when re-attaching to a session.
func (a *App) GetTerminalScrollback(id string) string {
	sess, ok := a.Terminal.Get(id)
	if !ok {
		return ""
	}
	return string(sess.Scrollback.Bytes())
}

// SubscribeTerminal starts a Wails event bridge for the given session. PTY
// output is emitted as "terminal:{sessionId}:data" events with a base64-encoded
// payload. Calling this multiple times for the same session cancels the
// previous subscription first to avoid duplicate listeners.
func (a *App) SubscribeTerminal(sessionID string) {
	sess, ok := a.Terminal.Get(sessionID)
	if !ok {
		log.Printf("app/bindings_terminal: SubscribeTerminal: session %q not found", sessionID)
		return
	}

	listenerID := "wails-" + sessionID
	ch := sess.Subscribe(listenerID)

	subCtx, cancel := context.WithCancel(a.ctx)

	// Cancel any existing subscription for this session before replacing it.
	a.terminalSubsMu.Lock()
	if prev, exists := a.terminalSubs[sessionID]; exists {
		prev()
	}
	a.terminalSubs[sessionID] = cancel
	a.terminalSubsMu.Unlock()

	eventName := fmt.Sprintf("terminal:%s:data", sessionID)

	go func() {
		defer func() {
			sess.Unsubscribe(listenerID)
		}()

		for {
			select {
			case <-subCtx.Done():
				return
			case data, ok := <-ch:
				if !ok {
					// Channel closed — session ended.
					return
				}
				wailsRuntime.EventsEmit(a.ctx, eventName, base64.StdEncoding.EncodeToString(data))
			}
		}
	}()
}

// UnsubscribeTerminal stops the Wails event bridge for the given session and
// removes the listener from the session's fan-out set.
func (a *App) UnsubscribeTerminal(sessionID string) {
	a.terminalSubsMu.Lock()
	cancel, exists := a.terminalSubs[sessionID]
	if exists {
		delete(a.terminalSubs, sessionID)
	}
	a.terminalSubsMu.Unlock()

	if exists {
		cancel()
	}
}

// ListTerminals returns metadata snapshots for all active terminal sessions.
func (a *App) ListTerminals() []terminal.SessionInfo {
	return a.Terminal.List()
}

// RunRecipe looks up a project recipe by ID, creates a terminal session in the
// project's repo directory, and runs the recipe command via the shell. It
// auto-subscribes the session so the frontend receives output events immediately.
// Returns the session ID (format: "recipe-{recipeId}-{uuid}") on success.
func (a *App) RunRecipe(projectId string, recipeId string) (string, error) {
	// 1. Fetch the project record to get its repo_path and profile.
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		return "", fmt.Errorf("RunRecipe: GetProject(%s): %w", projectId, err)
	}

	// 2. Parse the project profile to locate the requested recipe.
	if !proj.Profile.Valid || proj.Profile.String == "" {
		return "", fmt.Errorf("RunRecipe: project %s has no profile", projectId)
	}

	var profile project.Profile
	if err := json.Unmarshal([]byte(proj.Profile.String), &profile); err != nil {
		return "", fmt.Errorf("RunRecipe: unmarshal profile for project %s: %w", projectId, err)
	}

	var recipe *project.Recipe
	for i := range profile.Recipes {
		if profile.Recipes[i].ID == recipeId {
			recipe = &profile.Recipes[i]
			break
		}
	}
	if recipe == nil {
		return "", fmt.Errorf("RunRecipe: recipe %q not found in project %s", recipeId, projectId)
	}

	// 3. Build a unique session ID and create the terminal.
	sessionID := fmt.Sprintf("recipe-%s-%s", recipeId, uuid.New().String())

	if err := a.CreateTerminal(sessionID, proj.RepoPath, 220, 50); err != nil {
		return "", fmt.Errorf("RunRecipe: CreateTerminal: %w", err)
	}

	// 4. Send the recipe command to the shell via PTY input.
	// Using "sh -c" ensures shell built-ins and compound commands work correctly.
	cmd := fmt.Sprintf("sh -c %q\n", recipe.Command)
	if err := a.WriteTerminal(sessionID, cmd); err != nil {
		// Non-fatal: log and continue — the terminal is already open.
		log.Printf("app/bindings_terminal: RunRecipe: WriteTerminal(%s): %v", sessionID, err)
	}

	return sessionID, nil
}

// ---------------------------------------------------------------------------
// Bubbletea TUI programs
// ---------------------------------------------------------------------------

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
				log.Printf("app/bindings_terminal: RunBubbleteaProgram: marshal wizard result: %v", err)
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
					log.Printf("app/bindings_terminal: RunBubbleteaProgram(%s): read error: %v", sessionID, err)
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

