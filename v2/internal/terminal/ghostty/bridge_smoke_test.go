// Author: Subash Karki
package ghostty

import "testing"

func TestLibghosttyLinks(t *testing.T) {
	if !Available() {
		t.Skip("libghostty not available on this platform")
	}
	if err := Init(); err != nil {
		t.Fatalf("Init: %v", err)
	}
	info, err := GetInfo()
	if err != nil {
		t.Fatalf("GetInfo: %v", err)
	}
	if info.Version == "" {
		t.Fatalf("empty version — link broken or struct mismatch")
	}
	t.Logf("libghostty %s (%s) linked ok", info.Version, info.BuildMode)
}
