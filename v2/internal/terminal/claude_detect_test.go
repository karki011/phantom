// Author: Subash Karki
package terminal

import "testing"

func TestDetectClaudeOSC(t *testing.T) {
	tests := []struct {
		name      string
		data      []byte
		wantArgs  string
		wantFound bool
	}{
		{
			name:      "simple command",
			data:      []byte("\x1b]633;Claude;fix the bug\a"),
			wantArgs:  "fix the bug",
			wantFound: true,
		},
		{
			name:      "no args",
			data:      []byte("\x1b]633;Claude;\a"),
			wantArgs:  "",
			wantFound: true,
		},
		{
			name:      "embedded in other output",
			data:      []byte("some output\x1b]633;Claude;refactor auth.ts\amore output"),
			wantArgs:  "refactor auth.ts",
			wantFound: true,
		},
		{
			name:      "not present",
			data:      []byte("\x1b]633;A\a\x1b]633;B\a"),
			wantArgs:  "",
			wantFound: false,
		},
		{
			name:      "incomplete sequence no terminator",
			data:      []byte("\x1b]633;Claude;partial"),
			wantArgs:  "",
			wantFound: false,
		},
		{
			name:      "empty data",
			data:      nil,
			wantArgs:  "",
			wantFound: false,
		},
		{
			name:      "mixed OSC sequences",
			data:      []byte("\x1b]633;P;Cwd=/home\a\x1b]633;Claude;write tests\a\x1b]633;D;0\a"),
			wantArgs:  "write tests",
			wantFound: true,
		},
		{
			name:      "args with special characters",
			data:      []byte("\x1b]633;Claude;fix auth.ts --verbose -p /tmp/foo\a"),
			wantArgs:  "fix auth.ts --verbose -p /tmp/foo",
			wantFound: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			args, found := DetectClaudeOSC(tt.data)
			if found != tt.wantFound {
				t.Errorf("found = %v, want %v", found, tt.wantFound)
			}
			if args != tt.wantArgs {
				t.Errorf("args = %q, want %q", args, tt.wantArgs)
			}
		})
	}
}
