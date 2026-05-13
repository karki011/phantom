// Author: Subash Karki
//go:build perf

package app

import (
	"testing"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/perf"
)

// Times the parallelized BootScan against actual system binaries.
// This is the dominant cost of app startup — wave 2 parallelized 5
// sequential subprocess probes into goroutines, target <2s worst case.
func BenchmarkBootScan(b *testing.B) {
	a := &App{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := a.BootScan()
		if err != nil {
			b.Fatalf("BootScan: %v", err)
		}
	}
}

// Single-call measurement (not amortized) — what the user actually sees on launch.
func TestBootScanLatency(t *testing.T) {
	a := &App{}
	start := time.Now()
	_, err := a.BootScan()
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("BootScan: %v", err)
	}
	perf.RecordBoot(elapsed)
	target := 2 * time.Second
	if elapsed > target {
		t.Fatalf("BootScan took %v, want <%v", elapsed, target)
	}
	t.Logf("BootScan: %v (target <%v) ✓", elapsed, target)
}
