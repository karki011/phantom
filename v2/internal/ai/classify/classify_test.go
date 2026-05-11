// Author: Subash Karki
package classify

import (
	"strings"
	"testing"
)

func TestExtractAndStrip_TagPresent(t *testing.T) {
	text := "<phantom:task_type>refactor</phantom:task_type>\nHere is my plan."
	cleaned, tt, found := ExtractAndStrip(text)
	if !found {
		t.Fatal("expected found=true")
	}
	if tt != TaskTypeRefactor {
		t.Errorf("got task type %q, want %q", tt, TaskTypeRefactor)
	}
	if strings.Contains(cleaned, "<phantom:task_type>") {
		t.Errorf("tag not stripped from output: %q", cleaned)
	}
	if !strings.Contains(cleaned, "Here is my plan.") {
		t.Errorf("expected remaining text preserved, got: %q", cleaned)
	}
}

func TestExtractAndStrip_NoTag(t *testing.T) {
	text := "Just a normal response with no classification."
	cleaned, tt, found := ExtractAndStrip(text)
	if found {
		t.Fatal("expected found=false")
	}
	if tt != TaskTypeUnknown {
		t.Errorf("got %q, want %q", tt, TaskTypeUnknown)
	}
	if cleaned != text {
		t.Errorf("text should be unchanged when no tag present")
	}
}

func TestExtractAndStrip_InvalidTaskType(t *testing.T) {
	text := "<phantom:task_type>cooking</phantom:task_type>\nSome content."
	cleaned, tt, found := ExtractAndStrip(text)
	if found {
		t.Fatal("expected found=false for invalid type")
	}
	if tt != TaskTypeUnknown {
		t.Errorf("got %q, want unknown", tt)
	}
	// Tag should still be stripped even when type is unknown.
	if strings.Contains(cleaned, "<phantom:task_type>") {
		t.Errorf("tag should be stripped even when type is invalid, got: %q", cleaned)
	}
}

func TestExtractAndStrip_MultipleTags_OnlyFirstExtracted(t *testing.T) {
	text := "<phantom:task_type>feature</phantom:task_type>\nSome text.\n<phantom:task_type>bugfix</phantom:task_type>\nMore text."
	cleaned, tt, found := ExtractAndStrip(text)
	if !found {
		t.Fatal("expected found=true")
	}
	if tt != TaskTypeFeature {
		t.Errorf("got %q, want feature", tt)
	}
	// Second tag must remain in text (only first extracted).
	if !strings.Contains(cleaned, "<phantom:task_type>bugfix</phantom:task_type>") {
		t.Errorf("second tag should be preserved in output, got: %q", cleaned)
	}
}

func TestExtractAndStrip_TagInMiddleOfText(t *testing.T) {
	text := "I will help you.\n<phantom:task_type>debug</phantom:task_type>\nLet me trace the issue."
	cleaned, tt, found := ExtractAndStrip(text)
	if !found {
		t.Fatal("expected found=true")
	}
	if tt != TaskTypeDebug {
		t.Errorf("got %q, want debug", tt)
	}
	if strings.Contains(cleaned, "<phantom:task_type>") {
		t.Errorf("tag not stripped: %q", cleaned)
	}
	// Should not leave a blank line in the middle.
	if strings.Contains(cleaned, "\n\n") {
		t.Errorf("blank line artifact found in cleaned output: %q", cleaned)
	}
	if !strings.Contains(cleaned, "I will help you.") {
		t.Errorf("content before tag missing: %q", cleaned)
	}
	if !strings.Contains(cleaned, "Let me trace the issue.") {
		t.Errorf("content after tag missing: %q", cleaned)
	}
}

func TestExtractAndStrip_AllValidTypes(t *testing.T) {
	cases := []struct {
		raw      string
		expected TaskType
	}{
		{"feature", TaskTypeFeature},
		{"bugfix", TaskTypeBugfix},
		{"refactor", TaskTypeRefactor},
		{"exploration", TaskTypeExploration},
		{"debug", TaskTypeDebug},
		{"test", TaskTypeTest},
		{"docs", TaskTypeDocs},
	}
	for _, c := range cases {
		text := "<phantom:task_type>" + c.raw + "</phantom:task_type>\nResponse."
		_, tt, found := ExtractAndStrip(text)
		if !found {
			t.Errorf("type %q: expected found=true", c.raw)
		}
		if tt != c.expected {
			t.Errorf("type %q: got %q, want %q", c.raw, tt, c.expected)
		}
	}
}

func TestExtractAndStrip_CaseInsensitive(t *testing.T) {
	text := "<phantom:task_type>REFACTOR</phantom:task_type>\nDoing a refactor."
	_, tt, found := ExtractAndStrip(text)
	if !found {
		t.Fatal("expected found=true for uppercase type")
	}
	if tt != TaskTypeRefactor {
		t.Errorf("got %q, want refactor", tt)
	}
}

func TestExtractAndStrip_TagAtEndNoTrailingNewline(t *testing.T) {
	text := "Some response.\n<phantom:task_type>docs</phantom:task_type>"
	cleaned, tt, found := ExtractAndStrip(text)
	if !found {
		t.Fatal("expected found=true")
	}
	if tt != TaskTypeDocs {
		t.Errorf("got %q, want docs", tt)
	}
	if strings.Contains(cleaned, "<phantom:task_type>") {
		t.Errorf("tag not stripped: %q", cleaned)
	}
}

func TestValidTaskType(t *testing.T) {
	valid := []string{"feature", "bugfix", "refactor", "exploration", "debug", "test", "docs"}
	for _, v := range valid {
		if !ValidTaskType(v) {
			t.Errorf("expected %q to be valid", v)
		}
	}
	for _, v := range []string{"unknown", "cooking", ""} {
		if ValidTaskType(v) {
			t.Errorf("expected %q to be invalid", v)
		}
	}
}
