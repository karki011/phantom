// Author: Subash Karki
package perf

import (
	"fmt"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

type histogram struct {
	mu      sync.Mutex
	samples []time.Duration
}

func (h *histogram) record(d time.Duration) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.samples) >= 1024 {
		h.samples = h.samples[len(h.samples)-512:]
	}
	h.samples = append(h.samples, d)
}

func (h *histogram) snapshot() Snapshot {
	h.mu.Lock()
	cp := make([]time.Duration, len(h.samples))
	copy(cp, h.samples)
	h.mu.Unlock()
	if len(cp) == 0 {
		return Snapshot{}
	}
	sort.Slice(cp, func(i, j int) bool { return cp[i] < cp[j] })
	pct := func(p float64) time.Duration {
		idx := int(float64(len(cp)) * p)
		if idx >= len(cp) {
			idx = len(cp) - 1
		}
		return cp[idx]
	}
	var sum time.Duration
	for _, d := range cp {
		sum += d
	}
	return Snapshot{
		Count:  len(cp),
		Min:    cp[0],
		Max:    cp[len(cp)-1],
		Mean:   sum / time.Duration(len(cp)),
		P50:    pct(0.5),
		P95:    pct(0.95),
		P99:    pct(0.99),
	}
}

type Snapshot struct {
	Count int           `json:"count"`
	Min   time.Duration `json:"min_ns"`
	Max   time.Duration `json:"max_ns"`
	Mean  time.Duration `json:"mean_ns"`
	P50   time.Duration `json:"p50_ns"`
	P95   time.Duration `json:"p95_ns"`
	P99   time.Duration `json:"p99_ns"`
}

type Report struct {
	BootDuration       time.Duration       `json:"boot_duration_ns"`
	GitStatus          Snapshot            `json:"git_status"`
	ProjectSwitch      Snapshot            `json:"project_switch"`
	SidebarRefresh     Snapshot            `json:"sidebar_refresh"`
	MemRSSBytes        uint64              `json:"mem_rss_bytes"`
	HeapAllocBytes     uint64              `json:"heap_alloc_bytes"`
	GoroutineCount     int                 `json:"goroutine_count"`
	WorktreeCount      int                 `json:"worktree_count"`
}

var (
	bootDuration   atomic.Int64
	gitStatusHist  = &histogram{}
	switchHist     = &histogram{}
	sidebarHist    = &histogram{}
	worktreeCount  atomic.Int32
)

func RecordBoot(d time.Duration) {
	bootDuration.Store(int64(d))
}

func RecordGitStatus(d time.Duration) {
	gitStatusHist.record(d)
}

func RecordProjectSwitch(d time.Duration) {
	switchHist.record(d)
}

func RecordSidebarRefresh(d time.Duration) {
	sidebarHist.record(d)
}

func SetWorktreeCount(n int) {
	worktreeCount.Store(int32(n))
}

func Time(record func(time.Duration)) func() {
	start := time.Now()
	return func() { record(time.Since(start)) }
}

func GetReport() Report {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	return Report{
		BootDuration:    time.Duration(bootDuration.Load()),
		GitStatus:       gitStatusHist.snapshot(),
		ProjectSwitch:   switchHist.snapshot(),
		SidebarRefresh:  sidebarHist.snapshot(),
		MemRSSBytes:     ms.Sys,
		HeapAllocBytes:  ms.HeapAlloc,
		GoroutineCount:  runtime.NumGoroutine(),
		WorktreeCount:   int(worktreeCount.Load()),
	}
}

func Targets() map[string]TargetCheck {
	r := GetReport()
	return map[string]TargetCheck{
		"boot_under_2s":           {Target: "<2s", Actual: r.BootDuration.String(), Met: r.BootDuration > 0 && r.BootDuration < 2*time.Second},
		"git_status_p50_under_100ms": {Target: "<100ms (p50)", Actual: r.GitStatus.P50.String(), Met: r.GitStatus.P50 > 0 && r.GitStatus.P50 < 100*time.Millisecond},
		"project_switch_p50_under_200ms": {Target: "<200ms (p50)", Actual: r.ProjectSwitch.P50.String(), Met: r.ProjectSwitch.P50 > 0 && r.ProjectSwitch.P50 < 200*time.Millisecond},
		"sidebar_p50_under_100ms": {Target: "<100ms (p50)", Actual: r.SidebarRefresh.P50.String(), Met: r.SidebarRefresh.P50 > 0 && r.SidebarRefresh.P50 < 100*time.Millisecond},
		"memory_go_runtime_under_60mb": {Target: "<60MB Go runtime (WebKit RSS accepted)", Actual: humanBytes(r.MemRSSBytes), Met: r.MemRSSBytes > 0 && r.MemRSSBytes < 60*1024*1024},
	}
}

type TargetCheck struct {
	Target string `json:"target"`
	Actual string `json:"actual"`
	Met    bool   `json:"met"`
}

func humanBytes(b uint64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)
	switch {
	case b >= GB:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(GB))
	case b >= MB:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(MB))
	case b >= KB:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(KB))
	default:
		return fmt.Sprintf("%d B", b)
	}
}
