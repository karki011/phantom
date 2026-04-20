// Package git provides git blame operations.
//
// Author: Subash Karki
package git

import (
	"context"
	"strconv"
	"strings"
)

// BlameLine holds blame metadata for a single source line.
type BlameLine struct {
	Commit  string `json:"commit"`
	Author  string `json:"author"`
	Date    int64  `json:"date"`
	LineNum int    `json:"line_num"`
	Content string `json:"content"`
}

// Blame returns per-line blame information for filePath using `git blame --porcelain`.
func Blame(ctx context.Context, repoPath, filePath string) ([]BlameLine, error) {
	out, err := runGit(ctx, repoPath, "blame", "--porcelain", filePath)
	if err != nil {
		return nil, err
	}
	return parsePorcelainBlame(out), nil
}

// parsePorcelainBlame parses the output of `git blame --porcelain`.
//
// Porcelain format per line-group:
//   <hash> <origLine> <finalLine> [<numLines>]
//   author <name>
//   author-time <unix>
//   ... other headers ...
//   \t<content>       <- tab-prefixed content line
func parsePorcelainBlame(out string) []BlameLine {
	if out == "" {
		return nil
	}

	type blameState struct {
		commit  string
		author  string
		date    int64
		lineNum int
	}

	var lines []BlameLine
	var cur blameState
	commitMeta := make(map[string]blameState) // cache per commit hash

	for _, raw := range strings.Split(out, "\n") {
		switch {
		case len(raw) == 0:
			continue

		case raw[0] == '\t':
			// Content line — emit a BlameLine.
			bl := BlameLine{
				Commit:  cur.commit,
				Author:  cur.author,
				Date:    cur.date,
				LineNum: cur.lineNum,
				Content: raw[1:], // strip leading tab
			}
			lines = append(lines, bl)

		case len(raw) >= 40 && isHex(raw[:40]):
			// Boundary line: "<hash> <origLine> <finalLine> [<numLines>]"
			fields := strings.Fields(raw)
			if len(fields) < 3 {
				continue
			}
			hash := fields[0]
			finalLine, _ := strconv.Atoi(fields[2])

			// Restore cached metadata if we've seen this commit before.
			if cached, ok := commitMeta[hash]; ok {
				cur = blameState{
					commit:  hash,
					author:  cached.author,
					date:    cached.date,
					lineNum: finalLine,
				}
			} else {
				cur = blameState{commit: hash, lineNum: finalLine}
			}

		case strings.HasPrefix(raw, "author "):
			cur.author = strings.TrimPrefix(raw, "author ")
			if c, ok := commitMeta[cur.commit]; ok {
				c.author = cur.author
				commitMeta[cur.commit] = c
			} else {
				commitMeta[cur.commit] = blameState{author: cur.author}
			}

		case strings.HasPrefix(raw, "author-time "):
			ts, _ := strconv.ParseInt(strings.TrimPrefix(raw, "author-time "), 10, 64)
			cur.date = ts
			if c, ok := commitMeta[cur.commit]; ok {
				c.date = ts
				commitMeta[cur.commit] = c
			} else {
				commitMeta[cur.commit] = blameState{date: ts}
			}
		}
	}

	return lines
}

// isHex returns true if all bytes in s are valid lowercase hex digits or uppercase.
func isHex(s string) bool {
	for _, b := range []byte(s) {
		if !((b >= '0' && b <= '9') || (b >= 'a' && b <= 'f') || (b >= 'A' && b <= 'F')) {
			return false
		}
	}
	return true
}
