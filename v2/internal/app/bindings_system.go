// bindings_system.go — System resource stats for the header bar
// Author: Subash Karki
package app

import (
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"

	"github.com/charmbracelet/log"
)

// SystemStats holds CPU, memory, disk, and battery information for the UI header.
type SystemStats struct {
	CPUPercent      float64 `json:"cpu_percent"`
	MemUsedGB       float64 `json:"mem_used_gb"`
	MemTotalGB      float64 `json:"mem_total_gb"`
	DiskUsedGB      float64 `json:"disk_used_gb"`
	DiskTotalGB     float64 `json:"disk_total_gb"`
	BatteryPercent  int     `json:"battery_percent"`
	BatteryCharging bool    `json:"battery_charging"`
}

// GetSystemStats returns current system resource usage.
// Called from the frontend every ~3 seconds.
func (a *App) GetSystemStats() SystemStats {
	stats := SystemStats{BatteryPercent: -1}
	stats.CPUPercent = getCPUPercent()
	stats.MemTotalGB, stats.MemUsedGB = getMemoryStats()
	stats.DiskTotalGB, stats.DiskUsedGB = getDiskStats()
	stats.BatteryPercent, stats.BatteryCharging = getBatteryStats()
	return stats
}

// getDiskStats returns total and used disk space in GB for the root volume.
func getDiskStats() (totalGB, usedGB float64) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err != nil {
		log.Debug("getDiskStats failed", "err", err)
		return 0, 0
	}
	totalBytes := stat.Blocks * uint64(stat.Bsize)
	freeBytes := stat.Bavail * uint64(stat.Bsize)
	totalGB = float64(totalBytes) / (1024 * 1024 * 1024)
	usedGB = totalGB - float64(freeBytes)/(1024*1024*1024)
	return
}

// getCPUPercent aggregates per-process CPU via `ps` and normalises by core count.
func getCPUPercent() float64 {
	out, err := exec.Command("sh", "-c", "ps -A -o %cpu | awk '{s+=$1} END {print s}'").Output()
	if err != nil {
		log.Debug("getCPUPercent failed", "err", err)
		return 0
	}
	val, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	cpus := float64(runtime.NumCPU())
	if cpus > 0 {
		val = val / cpus
	}
	if val > 100 {
		val = 100
	}
	return val
}

// getMemoryStats returns total and used memory in GB.
// Uses sysctl for total and vm_stat for active/wired/speculative pages.
func getMemoryStats() (totalGB, usedGB float64) {
	// Total memory
	out, err := exec.Command("sysctl", "-n", "hw.memsize").Output()
	if err == nil {
		bytes, _ := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
		totalGB = float64(bytes) / (1024 * 1024 * 1024)
	} else {
		log.Debug("sysctl hw.memsize failed", "err", err)
	}

	// Used memory via vm_stat
	out, err = exec.Command("vm_stat").Output()
	if err == nil {
		usedGB = parseVmStat(string(out), totalGB)
	} else {
		log.Debug("vm_stat failed", "err", err)
	}
	return
}

// parseVmStat extracts active + wired + speculative + compressor pages from vm_stat output.
// Page size is parsed from the vm_stat header (16KB on Apple Silicon, 4KB on Intel).
func parseVmStat(output string, totalGB float64) float64 {
	var pageSize int64 = 16384 // default for Apple Silicon
	var activePages, wiredPages, speculativePages, compressorPages int64

	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		// Parse page size from header: "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
		if strings.Contains(line, "page size of") {
			start := strings.Index(line, "page size of") + len("page size of ")
			end := strings.Index(line[start:], " ")
			if end > 0 {
				if ps, err := strconv.ParseInt(line[start:start+end], 10, 64); err == nil && ps > 0 {
					pageSize = ps
				}
			}
		} else if strings.HasPrefix(line, "Pages active:") {
			activePages = parseVmStatLine(line)
		} else if strings.HasPrefix(line, "Pages wired down:") {
			wiredPages = parseVmStatLine(line)
		} else if strings.HasPrefix(line, "Pages speculative:") {
			speculativePages = parseVmStatLine(line)
		} else if strings.HasPrefix(line, "Pages occupied by compressor:") {
			compressorPages = parseVmStatLine(line)
		}
	}

	usedBytes := (activePages + wiredPages + speculativePages + compressorPages) * pageSize
	return float64(usedBytes) / (1024 * 1024 * 1024)
}

// parseVmStatLine extracts the numeric value from a vm_stat line like "Pages active:   123456."
func parseVmStatLine(line string) int64 {
	parts := strings.SplitN(line, ":", 2)
	if len(parts) < 2 {
		return 0
	}
	s := strings.TrimSpace(parts[1])
	s = strings.TrimSuffix(s, ".")
	val, _ := strconv.ParseInt(s, 10, 64)
	return val
}

// getBatteryStats returns battery percentage and charging state via pmset.
// Returns -1 for percent when no battery is present (desktop Mac).
func getBatteryStats() (percent int, charging bool) {
	out, err := exec.Command("pmset", "-g", "batt").Output()
	if err != nil {
		return -1, false
	}
	s := string(out)
	for _, line := range strings.Split(s, "\n") {
		if !strings.Contains(line, "%") {
			continue
		}
		idx := strings.Index(line, "%")
		if idx <= 0 {
			continue
		}
		// Walk back from '%' to find the start of the number
		start := idx - 1
		for start > 0 && line[start] >= '0' && line[start] <= '9' {
			start--
		}
		pctStr := strings.TrimSpace(line[start+1 : idx])
		percent, _ = strconv.Atoi(pctStr)
		charging = strings.Contains(line, "charging") && !strings.Contains(line, "discharging")
		return
	}
	return -1, false
}
