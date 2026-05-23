// Author: Subash Karki
package app

import (
	"github.com/subashkarki/phantom-os-v2/internal/persona"
)

// SetPersona injects the persona service before Wails calls Startup.
func (a *App) SetPersona(p *persona.Persona) { a.Persona = p }

// PersonaAsk sends user input to the persona and returns the response.
// Returns text/speak/quickActions as a generic map for Wails serialisation.
func (a *App) PersonaAsk(input string) map[string]interface{} {
	if a.Persona == nil {
		return map[string]interface{}{
			"text":         "Persona is not available.",
			"speak":        "",
			"quickActions": []interface{}{},
		}
	}

	// Ensure the active project path is set before each ask. If the path is
	// empty (e.g. SetActiveWorktree was never called), try resolving it from
	// the currently watched worktree so git queries don't return empty results.
	if state := a.Persona.GetState(); state.ActiveProject == "" {
		a.watchedMu.RLock()
		wID := a.watchedWorktree
		a.watchedMu.RUnlock()
		if wID != "" {
			if p, err := a.resolveWorkspacePath(wID); err == nil && p != "" {
				a.Persona.SetProjectPath(p)
			}
		}
	}

	resp := a.Persona.Ask(a.ctx, input)
	qa := make([]interface{}, 0, len(resp.QuickActions))
	for _, action := range resp.QuickActions {
		qa = append(qa, map[string]interface{}{
			"label":  action.Label,
			"action": action.Action,
			"args":   action.Args,
		})
	}
	return map[string]interface{}{
		"text":         resp.Text,
		"speak":        resp.Speak,
		"quickActions": qa,
	}
}

// PersonaGetState returns the current persona state (pillState, statusText, etc.).
func (a *App) PersonaGetState() map[string]interface{} {
	if a.Persona == nil {
		return map[string]interface{}{
			"pillState":     "idle",
			"statusText":    "Not available",
			"activeProject": "",
			"expanded":      false,
		}
	}
	s := a.Persona.GetState()
	return map[string]interface{}{
		"pillState":     string(s.PillState),
		"statusText":    s.StatusText,
		"activeProject": s.ActiveProject,
		"expanded":      s.Expanded,
	}
}

// PersonaGetHistory returns conversation history as a serialisable slice.
func (a *App) PersonaGetHistory() interface{} {
	if a.Persona == nil {
		return []interface{}{}
	}
	msgs := a.Persona.GetHistory()
	out := make([]map[string]interface{}, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, map[string]interface{}{
			"role":      m.Role,
			"text":      m.Text,
			"timestamp": m.Timestamp.UnixMilli(),
		})
	}
	return out
}

// PersonaGetContext returns the assembled persona context for the active project.
func (a *App) PersonaGetContext() interface{} {
	if a.Persona == nil {
		return map[string]interface{}{
			"activeProject":    "",
			"claudeSessions":   []interface{}{},
			"terminalSessions": []interface{}{},
			"recentGit":        map[string]interface{}{},
			"fileGraph":        map[string]interface{}{},
		}
	}
	return a.Persona.GetContext(a.ctx)
}

// PersonaSetTrust sets the trust tier for a project.
func (a *App) PersonaSetTrust(projectID string, tier int) error {
	if a.Persona == nil {
		return nil
	}
	return a.Persona.SetTrust(projectID, persona.TrustTier(tier))
}

// PersonaGetTrust returns the trust tier (int) for a project.
func (a *App) PersonaGetTrust(projectID string) int {
	if a.Persona == nil {
		return 0
	}
	return int(a.Persona.GetTrust(projectID))
}
