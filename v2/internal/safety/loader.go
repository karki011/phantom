// loader.go implements YAML-based rule loading with fsnotify hot-reload.
// Author: Subash Karki
package safety

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"gopkg.in/yaml.v3"
)

// wardFile is the top-level YAML structure for a ward file.
type wardFile struct {
	Rules []Rule `yaml:"rules"`
}

// Loader reads ward YAML files from a directory and hot-reloads on changes.
type Loader struct {
	dir      string
	rules    []Rule
	mu       sync.RWMutex
	watcher  *fsnotify.Watcher
	ctx      context.Context
	cancel   context.CancelFunc
	onChange func()
}

// NewLoader creates a Loader for the given directory.
// onChange is called (in a goroutine) each time rules are reloaded.
func NewLoader(dir string, onChange func()) *Loader {
	return &Loader{
		dir:      dir,
		onChange: onChange,
	}
}

// Load reads all .yaml and .yml files in the directory and parses rules.
// Existing rules are replaced atomically.
func (l *Loader) Load() error {
	entries, err := os.ReadDir(l.dir)
	if err != nil {
		// If the directory doesn't exist yet, start with empty rules.
		if os.IsNotExist(err) {
			l.mu.Lock()
			l.rules = nil
			l.mu.Unlock()
			return nil
		}
		return err
	}

	var loaded []Rule
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := filepath.Ext(name)
		if ext != ".yaml" && ext != ".yml" {
			continue
		}

		path := filepath.Join(l.dir, name)
		data, err := os.ReadFile(path)
		if err != nil {
			log.Printf("safety/loader: read %s: %v", path, err)
			continue
		}

		var wf wardFile
		if err := yaml.Unmarshal(data, &wf); err != nil {
			log.Printf("safety/loader: parse %s: %v", path, err)
			continue
		}

		for i := range wf.Rules {
			r := &wf.Rules[i]
			if err := r.Compile(); err != nil {
				log.Printf("safety/loader: compile rule %s: %v", r.ID, err)
				continue
			}
			loaded = append(loaded, *r)
		}
	}

	l.mu.Lock()
	l.rules = loaded
	l.mu.Unlock()
	return nil
}

// Start begins watching the directory for file changes and reloads rules on change.
// Debounce window is 500 ms to coalesce rapid save events.
func (l *Loader) Start(ctx context.Context) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	l.watcher = w

	// Ensure directory exists before watching.
	if err := os.MkdirAll(l.dir, 0o755); err != nil {
		return err
	}

	if err := w.Add(l.dir); err != nil {
		return err
	}

	l.ctx, l.cancel = context.WithCancel(ctx)

	go l.watchLoop()
	return nil
}

// Stop shuts down the file watcher.
func (l *Loader) Stop() {
	if l.cancel != nil {
		l.cancel()
	}
	if l.watcher != nil {
		_ = l.watcher.Close()
	}
}

// Rules returns the current loaded rule set (thread-safe).
func (l *Loader) Rules() []Rule {
	l.mu.RLock()
	defer l.mu.RUnlock()
	out := make([]Rule, len(l.rules))
	copy(out, l.rules)
	return out
}

// RuleByID returns a pointer to the rule with the given ID, or nil.
func (l *Loader) RuleByID(id string) *Rule {
	l.mu.RLock()
	defer l.mu.RUnlock()
	for i := range l.rules {
		if l.rules[i].ID == id {
			r := l.rules[i]
			return &r
		}
	}
	return nil
}

// SaveRule adds or updates a rule in custom.yaml.
func (l *Loader) SaveRule(rule Rule) error {
	path := filepath.Join(l.dir, "custom.yaml")

	var wf wardFile
	data, err := os.ReadFile(path)
	if err == nil {
		_ = yaml.Unmarshal(data, &wf)
	}

	// Update existing or append.
	updated := false
	for i, r := range wf.Rules {
		if r.ID == rule.ID {
			wf.Rules[i] = rule
			updated = true
			break
		}
	}
	if !updated {
		wf.Rules = append(wf.Rules, rule)
	}

	return l.writeWardFile(path, wf)
}

// DeleteRule removes a rule by ID from custom.yaml.
func (l *Loader) DeleteRule(ruleID string) error {
	path := filepath.Join(l.dir, "custom.yaml")

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var wf wardFile
	if err := yaml.Unmarshal(data, &wf); err != nil {
		return err
	}

	filtered := make([]Rule, 0, len(wf.Rules))
	for _, r := range wf.Rules {
		if r.ID != ruleID {
			filtered = append(filtered, r)
		}
	}
	wf.Rules = filtered

	return l.writeWardFile(path, wf)
}

// ToggleRule enables or disables a rule. Works across all ward files.
func (l *Loader) ToggleRule(ruleID string, enabled bool) error {
	// Search all ward files for the rule.
	entries, err := os.ReadDir(l.dir)
	if err != nil {
		return err
	}

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := filepath.Ext(e.Name())
		if ext != ".yaml" && ext != ".yml" {
			continue
		}

		path := filepath.Join(l.dir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		var wf wardFile
		if err := yaml.Unmarshal(data, &wf); err != nil {
			continue
		}

		for i, r := range wf.Rules {
			if r.ID == ruleID {
				wf.Rules[i].Enabled = enabled
				return l.writeWardFile(path, wf)
			}
		}
	}

	return fmt.Errorf("rule %s not found", ruleID)
}

func (l *Loader) writeWardFile(path string, wf wardFile) error {
	data, err := yaml.Marshal(wf)
	if err != nil {
		return fmt.Errorf("safety/loader: marshal: %w", err)
	}
	return os.WriteFile(path, data, 0o644)
}

const debounce = 500 * time.Millisecond

func (l *Loader) watchLoop() {
	var timer *time.Timer

	for {
		select {
		case <-l.ctx.Done():
			if timer != nil {
				timer.Stop()
			}
			return

		case event, ok := <-l.watcher.Events:
			if !ok {
				return
			}
			ext := filepath.Ext(event.Name)
			if ext != ".yaml" && ext != ".yml" {
				continue
			}

			// Debounce: reset timer on each event.
			if timer != nil {
				timer.Stop()
			}
			timer = time.AfterFunc(debounce, func() {
				if err := l.Load(); err != nil {
					log.Printf("safety/loader: reload: %v", err)
					return
				}
				if l.onChange != nil {
					go l.onChange()
				}
			})

		case err, ok := <-l.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("safety/loader: watcher error: %v", err)
		}
	}
}
