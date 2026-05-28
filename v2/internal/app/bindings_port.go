// bindings_port.go — Port process management for the Kill Port pane
// Author: Subash Karki
package app

import (
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"syscall"

	"github.com/charmbracelet/log"
)

// PortProcess represents a process listening on or connected to a network port.
type PortProcess struct {
	PID     int    `json:"pid"`
	Command string `json:"command"`
	User    string `json:"user"`
	Port    int    `json:"port"`
	Type    string `json:"type"` // "TCP" or "UDP"
	Node    string `json:"node"` // "IPv4" or "IPv6"
}

// GetListeningPorts returns all processes with TCP ports in LISTEN state.
func (a *App) GetListeningPorts() []PortProcess {
	out, err := exec.Command("lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n", "-F", "pcuPn").Output()
	if err != nil {
		log.Debug("GetListeningPorts: lsof failed", "err", err)
		return []PortProcess{}
	}
	procs := parseLsofFieldOutput(string(out))
	sort.Slice(procs, func(i, j int) bool {
		return procs[i].Port < procs[j].Port
	})
	return procs
}

// GetProcessesOnPort returns all processes (LISTEN and ESTABLISHED) on a specific port.
func (a *App) GetProcessesOnPort(port int) []PortProcess {
	out, err := exec.Command("lsof", "-i", ":"+strconv.Itoa(port), "-P", "-n", "-F", "pcuPn").Output()
	if err != nil {
		log.Debug("GetProcessesOnPort: lsof failed", "port", port, "err", err)
		return []PortProcess{}
	}
	procs := parseLsofFieldOutput(string(out))
	sort.Slice(procs, func(i, j int) bool {
		return procs[i].Port < procs[j].Port
	})
	return procs
}

// KillPortProcess sends SIGTERM to the given PID.
func (a *App) KillPortProcess(pid int) error {
	if pid <= 0 {
		return syscall.EINVAL
	}
	log.Debug("KillPortProcess", "pid", pid)
	return syscall.Kill(pid, syscall.SIGTERM)
}

// parseLsofFieldOutput parses lsof -F pcuPn output into PortProcess entries.
// Field-format lines start with a single-char prefix:
//
//	p = PID, c = command, u = user, P = protocol, n = name (contains address:port)
//
// A new process group begins with each 'p' line. Multiple 'n' lines under
// one process produce separate PortProcess entries (one per port/connection).
func parseLsofFieldOutput(output string) []PortProcess {
	var result []PortProcess
	var pid int
	var command, user, protocol string

	for _, line := range strings.Split(output, "\n") {
		if len(line) < 2 {
			continue
		}
		prefix := line[0]
		value := line[1:]

		switch prefix {
		case 'p':
			pid, _ = strconv.Atoi(value)
			// Reset per-process fields
			command = ""
			user = ""
			protocol = ""
		case 'c':
			command = value
		case 'u':
			user = value
		case 'P':
			protocol = strings.ToUpper(value)
		case 'n':
			port := parsePortFromName(value)
			if port <= 0 {
				continue
			}
			node := "IPv4"
			if strings.HasPrefix(value, "[") || strings.Contains(value, "]:") {
				node = "IPv6"
			}
			result = append(result, PortProcess{
				PID:     pid,
				Command: command,
				User:    user,
				Port:    port,
				Type:    protocol,
				Node:    node,
			})
		}
	}
	return result
}

// parsePortFromName extracts the port number from an lsof name field.
// Formats: "*:3000", "127.0.0.1:8080", "[::1]:443", "localhost:9090"
func parsePortFromName(name string) int {
	idx := strings.LastIndex(name, ":")
	if idx < 0 || idx >= len(name)-1 {
		return 0
	}
	port, err := strconv.Atoi(name[idx+1:])
	if err != nil {
		return 0
	}
	return port
}
