// Author: Subash Karki
package composer

import (
	"os/exec"
	"testing"
)

func TestCheckCLIVersion_Valid(t *testing.T) {
	cases := []struct {
		name    string
		version string
	}{
		{"exact minimum", MinCLIVersion},
		{"above minimum", "1.0.33"},
		{"major bump", "2.0.0"},
		{"minor bump", "1.1.0"},
		{"patch bump", "1.0.1"},
		{"known good", KnownGoodCLIVersion},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := CheckCLIVersion(tc.version); err != nil {
				t.Fatalf("version %q should be valid, got error: %v", tc.version, err)
			}
		})
	}
}

func TestCheckCLIVersion_TooOld(t *testing.T) {
	cases := []struct {
		name    string
		version string
	}{
		{"zero version", "0.0.0"},
		{"old patch", "0.99.99"},
		{"pre-release minor", "0.9.0"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := CheckCLIVersion(tc.version)
			if err == nil {
				t.Fatalf("version %q should be rejected", tc.version)
			}
			// Verify the error contains upgrade instructions.
			if got := err.Error(); !contains(got, "too old") || !contains(got, "claude update") {
				t.Fatalf("error should mention 'too old' and 'claude update', got: %s", got)
			}
		})
	}
}

func TestCheckCLIVersion_InvalidFormat(t *testing.T) {
	cases := []struct {
		name    string
		version string
	}{
		{"empty string", ""},
		{"garbage", "not-a-version"},
		{"incomplete", "1.0"},
		{"letters only", "abc.def.ghi"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := CheckCLIVersion(tc.version)
			if err == nil {
				t.Fatalf("version %q should fail parsing", tc.version)
			}
			if got := err.Error(); !contains(got, "invalid") {
				t.Fatalf("error should mention 'invalid', got: %s", got)
			}
		})
	}
}

func TestDetectClaudeBinary(t *testing.T) {
	// Integration test — skip if claude is not installed.
	if _, err := exec.LookPath("claude"); err != nil {
		t.Skip("claude not on PATH — skipping integration test")
	}

	path, err := DetectClaudeBinary()
	if err != nil {
		t.Fatalf("DetectClaudeBinary failed: %v", err)
	}
	if path == "" {
		t.Fatal("expected non-empty path")
	}
}

func TestParseSemver(t *testing.T) {
	cases := []struct {
		input   string
		major   int
		minor   int
		patch   int
		wantErr bool
	}{
		{"1.0.0", 1, 0, 0, false},
		{"1.0.33", 1, 0, 33, false},
		{"10.20.30", 10, 20, 30, false},
		{"1.0.33-beta.1", 1, 0, 33, false}, // pre-release suffix ignored
		{"", 0, 0, 0, true},
		{"nope", 0, 0, 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			sv, err := parseSemver(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for %q", tc.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error for %q: %v", tc.input, err)
			}
			if sv.Major != tc.major || sv.Minor != tc.minor || sv.Patch != tc.patch {
				t.Fatalf("expected %d.%d.%d, got %d.%d.%d",
					tc.major, tc.minor, tc.patch,
					sv.Major, sv.Minor, sv.Patch)
			}
		})
	}
}

func TestCompareSemver(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"1.0.0", "1.0.0", 0},
		{"1.0.1", "1.0.0", 1},
		{"1.0.0", "1.0.1", -1},
		{"2.0.0", "1.99.99", 1},
		{"0.1.0", "0.0.99", 1},
	}
	for _, tc := range cases {
		t.Run(tc.a+"_vs_"+tc.b, func(t *testing.T) {
			a, _ := parseSemver(tc.a)
			b, _ := parseSemver(tc.b)
			got := compareSemver(a, b)
			if got != tc.want {
				t.Fatalf("compareSemver(%s, %s) = %d, want %d", tc.a, tc.b, got, tc.want)
			}
		})
	}
}

// contains is a test helper — avoids importing strings for one call.
func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
