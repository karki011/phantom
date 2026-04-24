//go:build !windows

// process.go provides process suspension via SIGTSTP/SIGCONT for Claude session management.
// Author: Subash Karki
package session

import (
	"fmt"
	"syscall"
)

// SuspendProcess sends SIGTSTP to the process group of the given PID,
// causing all processes in the group (including child shells) to suspend.
func SuspendProcess(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("session/process: invalid PID %d", pid)
	}
	pgid, err := syscall.Getpgid(pid)
	if err != nil {
		// Fallback: send to PID directly if PGID lookup fails.
		pgid = pid
	}
	if err := syscall.Kill(-pgid, syscall.SIGTSTP); err != nil {
		return fmt.Errorf("session/process: SIGTSTP pid=%d pgid=%d: %w", pid, pgid, err)
	}
	return nil
}

// ResumeProcess sends SIGCONT to the process group of the given PID.
func ResumeProcess(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("session/process: invalid PID %d", pid)
	}
	pgid, err := syscall.Getpgid(pid)
	if err != nil {
		pgid = pid
	}
	if err := syscall.Kill(-pgid, syscall.SIGCONT); err != nil {
		return fmt.Errorf("session/process: SIGCONT pid=%d pgid=%d: %w", pid, pgid, err)
	}
	return nil
}

// KillProcess sends SIGTERM to the process group.
func KillProcess(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("session/process: invalid PID %d", pid)
	}
	pgid, err := syscall.Getpgid(pid)
	if err != nil {
		pgid = pid
	}
	return syscall.Kill(-pgid, syscall.SIGTERM)
}
