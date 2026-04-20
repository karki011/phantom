// pii_test.go tests PII detection and masking.
// Author: Subash Karki
package safety

import (
	"strings"
	"testing"
)

func TestScanPII_Email(t *testing.T) {
	matches := ScanForPII("contact me at user@example.com for details")
	found := false
	for _, m := range matches {
		if m.Type == PIIEmail {
			found = true
			if !strings.Contains(m.Value, "@example.com") {
				t.Errorf("masked email should retain domain, got %q", m.Value)
			}
		}
	}
	if !found {
		t.Error("expected email PII to be detected")
	}
}

func TestScanPII_AWSKey(t *testing.T) {
	matches := ScanForPII("key: AKIAIOSFODNN7EXAMPLE here")
	found := false
	for _, m := range matches {
		if m.Type == PIIAWSKey {
			found = true
			if !strings.HasPrefix(m.Value, "AKIA") {
				t.Errorf("masked AWS key should start with AKIA, got %q", m.Value)
			}
		}
	}
	if !found {
		t.Error("expected AWS key PII to be detected")
	}
}

func TestScanPII_GitHubToken(t *testing.T) {
	matches := ScanForPII("export TOKEN=ghp_abcdefghij1234567890XYZ")
	found := false
	for _, m := range matches {
		if m.Type == PIIToken {
			found = true
		}
	}
	if !found {
		t.Error("expected GitHub token PII to be detected")
	}
}

func TestScanPII_NoMatch(t *testing.T) {
	matches := ScanForPII("hello world, this is clean text with no secrets")
	if len(matches) != 0 {
		t.Errorf("expected no PII matches, got %d", len(matches))
	}
}

func TestMaskPII(t *testing.T) {
	input := "email user@example.com and key AKIAIOSFODNN7EXAMPLE in one string"
	output := MaskPII(input)

	if strings.Contains(output, "user@example.com") {
		t.Error("MaskPII should have masked the email")
	}
	// AWS key starts AKIA but rest should be masked.
	if strings.Contains(output, "AKIAIOSFODNN7EXAMPLE") {
		t.Error("MaskPII should have masked the AWS key")
	}
}
