// Run with: go test -race -v ./internal/linker/...
// Author: Subash Karki
//
//go:build !windows

package linker

import (
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestIsDescendant_Self(t *testing.T) {
	t.Parallel()

	pid := os.Getpid()
	if !IsDescendant(pid, pid) {
		t.Fatalf("IsDescendant(%d, %d) = false, want true (self)", pid, pid)
	}
}

func TestIsDescendant_DirectChild(t *testing.T) {
	t.Parallel()

	cmd := exec.Command("sleep", "60")
	if err := cmd.Start(); err != nil {
		t.Fatalf("start sleep: %v", err)
	}
	t.Cleanup(func() {
		cmd.Process.Kill()
		cmd.Wait()
	})

	childPID := cmd.Process.Pid
	parentPID := os.Getpid()

	if !IsDescendant(childPID, parentPID) {
		t.Fatalf("IsDescendant(%d, %d) = false, want true (direct child)", childPID, parentPID)
	}
}

func TestIsDescendant_UnrelatedPIDs(t *testing.T) {
	t.Parallel()

	// PID 1 (launchd/init) is not a descendant of the test process.
	if IsDescendant(1, os.Getpid()) {
		t.Fatal("IsDescendant(1, self) = true, want false (PID 1 is not our child)")
	}
}

func TestIsDescendant_DeadProcess(t *testing.T) {
	t.Parallel()

	cmd := exec.Command("sleep", "60")
	if err := cmd.Start(); err != nil {
		t.Fatalf("start sleep: %v", err)
	}

	deadPID := cmd.Process.Pid
	cmd.Process.Kill()
	cmd.Wait()

	// Give the OS a moment to clean up the process entry.
	time.Sleep(50 * time.Millisecond)

	if IsDescendant(deadPID, os.Getpid()) {
		t.Fatalf("IsDescendant(%d, %d) = true, want false (dead process)", deadPID, os.Getpid())
	}
}

func TestIsDescendant_InvalidPIDs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		child int
		parent int
	}{
		{name: "zero child", child: 0, parent: 1},
		{name: "negative child", child: -1, parent: 1},
		{name: "zero parent", child: 1, parent: 0},
		{name: "negative parent", child: 1, parent: -1},
		{name: "both zero", child: 0, parent: 0},
		{name: "both negative", child: -1, parent: -1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if IsDescendant(tt.child, tt.parent) {
				t.Fatalf("IsDescendant(%d, %d) = true, want false", tt.child, tt.parent)
			}
		})
	}
}
