// Author: Subash Karki
package detect

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
)

// ─── FileComplexityDetector ──────────────────────────────────────────────────

// FileComplexityDetector counts active files and derives a complexity tier.
// It produces two hints: "file_count" and "complexity".
type FileComplexityDetector struct{}

func (d *FileComplexityDetector) Name() string { return "file_complexity" }

func (d *FileComplexityDetector) Detect(_ context.Context, input *DetectorInput) ([]Hint, error) {
	n := len(input.Files)
	complexity, conf := fileComplexityTier(n)
	return []Hint{
		{
			Key:        "file_count",
			Value:      strconv.Itoa(n),
			Confidence: 1.0, // always certain — it's a direct count
			Source:     d.Name(),
		},
		{
			Key:        "complexity",
			Value:      complexity,
			Confidence: conf,
			Source:     d.Name(),
		},
	}, nil
}

// fileComplexityTier maps a file count to a (tier, confidence) pair.
// Confidence decreases near tier boundaries where classification is less clear.
func fileComplexityTier(n int) (string, float64) {
	switch {
	case n <= 3:
		return "low", 0.9
	case n <= 10:
		return "medium", 0.75
	case n <= 25:
		return "high", 0.8
	default:
		return "critical", 0.9
	}
}

// ─── BlastRadiusDetector ─────────────────────────────────────────────────────

// BlastRadiusDetector uses the file-graph indexer to estimate how many files
// would be affected by changing the active files. It produces two hints:
// "blast_radius" (file count as string) and "risk" (low/medium/high/critical).
type BlastRadiusDetector struct {
	// Indexers maps project root → filegraph.Indexer. The detector picks the
	// first indexer whose RootDir is a prefix of WorkDir.
	Indexers map[string]*filegraph.Indexer
}

func (d *BlastRadiusDetector) Name() string { return "blast_radius" }

func (d *BlastRadiusDetector) Detect(_ context.Context, input *DetectorInput) ([]Hint, error) {
	ix := d.indexerFor(input.WorkDir)
	if ix == nil || len(input.Files) == 0 {
		return nil, nil
	}

	g := ix.Graph()
	directSet := make(map[string]struct{})
	transSet := make(map[string]struct{})

	for _, f := range input.Files {
		node := g.Get(f)
		if node == nil {
			continue
		}
		for _, p := range node.ImportedBy {
			directSet[p] = struct{}{}
		}
		frontier := append([]string(nil), node.ImportedBy...)
		for len(frontier) > 0 {
			next := frontier[:0]
			for _, p := range frontier {
				up := g.Get(p)
				if up == nil {
					continue
				}
				for _, parent := range up.ImportedBy {
					if _, ok := directSet[parent]; ok {
						continue
					}
					if _, ok := transSet[parent]; ok {
						continue
					}
					transSet[parent] = struct{}{}
					next = append(next, parent)
				}
			}
			frontier = append([]string(nil), next...)
		}
	}

	radius := len(directSet) + len(transSet)
	risk, conf := blastRiskTier(radius)

	return []Hint{
		{
			Key:        "blast_radius",
			Value:      fmt.Sprintf("%d files", radius),
			Confidence: 0.85,
			Source:     d.Name(),
		},
		{
			Key:        "risk",
			Value:      risk,
			Confidence: conf,
			Source:     d.Name(),
		},
	}, nil
}

func (d *BlastRadiusDetector) indexerFor(workDir string) *filegraph.Indexer {
	if d.Indexers == nil {
		return nil
	}
	// Exact match first.
	if ix, ok := d.Indexers[workDir]; ok {
		return ix
	}
	// Prefix match — pick longest root that is a prefix of workDir.
	var bestRoot string
	var bestIx *filegraph.Indexer
	for root, ix := range d.Indexers {
		if strings.HasPrefix(workDir, root) && len(root) > len(bestRoot) {
			bestRoot = root
			bestIx = ix
		}
	}
	return bestIx
}

func blastRiskTier(radius int) (string, float64) {
	switch {
	case radius <= 5:
		return "low", 0.9
	case radius <= 15:
		return "medium", 0.75
	case radius <= 40:
		return "high", 0.8
	default:
		return "critical", 0.9
	}
}

// ─── PriorOutcomeDetector ────────────────────────────────────────────────────

// PriorOutcomeDetector queries the decision store for historical outcomes on
// goals similar to the current one. It produces two hints:
// "prior_success_rate" and "prior_strategy".
type PriorOutcomeDetector struct {
	Decisions *knowledge.DecisionStore
}

func (d *PriorOutcomeDetector) Name() string { return "prior_outcome" }

func (d *PriorOutcomeDetector) Detect(_ context.Context, input *DetectorInput) ([]Hint, error) {
	if d.Decisions == nil || strings.TrimSpace(input.Goal) == "" {
		return nil, nil
	}

	similar, err := d.Decisions.FindSimilar(input.Goal, 0.3)
	if err != nil || len(similar) == 0 {
		return nil, nil //nolint:nilerr // no similar decisions is not an error
	}

	// Tally the most recent similar decision's strategy.
	latest := similar[0]
	rate, count, err := d.Decisions.GetSuccessRate(latest.StrategyID, latest.Complexity)
	if err != nil || count == 0 {
		return nil, nil //nolint:nilerr
	}

	rateStr := fmt.Sprintf("%.0f%%", rate*100)
	conf := 0.5 + (float64(min(count, 10)) / 20.0) // more samples → more confident

	return []Hint{
		{
			Key:        "prior_success_rate",
			Value:      rateStr,
			Confidence: conf,
			Source:     d.Name(),
		},
		{
			Key:        "prior_strategy",
			Value:      latest.StrategyID,
			Confidence: conf,
			Source:     d.Name(),
		},
	}, nil
}

// ─── WorkTypeDetector ────────────────────────────────────────────────────────

// WorkTypeDetector classifies the goal into a work type by scanning for
// keywords. Produces a single "work_type" hint.
type WorkTypeDetector struct{}

func (d *WorkTypeDetector) Name() string { return "work_type" }

// workTypeRule maps a set of keywords to a work type label and confidence.
type workTypeRule struct {
	keywords   []string
	workType   string
	confidence float64
}

var workTypeRules = []workTypeRule{
	{
		keywords:   []string{"fix", "bug", "broken", "error", "crash", "regression", "issue", "patch"},
		workType:   "bugfix",
		confidence: 0.85,
	},
	{
		keywords:   []string{"refactor", "clean", "rename", "restructure", "reorganise", "reorganize", "simplify", "move"},
		workType:   "refactor",
		confidence: 0.8,
	},
	{
		keywords:   []string{"add", "feature", "implement", "build", "create", "new", "introduce"},
		workType:   "feature",
		confidence: 0.75,
	},
	{
		keywords:   []string{"test", "spec", "coverage", "unit", "integration", "e2e"},
		workType:   "test",
		confidence: 0.85,
	},
	{
		keywords:   []string{"doc", "docs", "comment", "readme", "changelog", "jsdoc", "godoc"},
		workType:   "docs",
		confidence: 0.85,
	},
	{
		keywords:   []string{"perf", "performance", "optimize", "optimise", "speed", "latency", "memory", "benchmark"},
		workType:   "perf",
		confidence: 0.8,
	},
	{
		keywords:   []string{"deploy", "release", "publish", "ship", "ci", "cd", "pipeline", "infra"},
		workType:   "devops",
		confidence: 0.8,
	},
}

func (d *WorkTypeDetector) Detect(_ context.Context, input *DetectorInput) ([]Hint, error) {
	lower := strings.ToLower(input.Goal)

	var bestType string
	var bestConf float64

	for _, rule := range workTypeRules {
		for _, kw := range rule.keywords {
			if strings.Contains(lower, kw) {
				if rule.confidence > bestConf {
					bestType = rule.workType
					bestConf = rule.confidence
				}
				break
			}
		}
	}

	if bestType == "" {
		return nil, nil
	}

	return []Hint{{
		Key:        "work_type",
		Value:      bestType,
		Confidence: bestConf,
		Source:     d.Name(),
	}}, nil
}

// ─── BranchContextDetector ───────────────────────────────────────────────────

// BranchContextDetector extracts context clues from the branch name.
// Produces up to two hints: "ticket" (if a Jira/GitHub issue pattern is found)
// and "branch_type" (feature/fix/hotfix/chore/etc).
type BranchContextDetector struct{}

func (d *BranchContextDetector) Name() string { return "branch_context" }

// ticketPattern matches common ticket patterns: ABC-123, PROJ-4567, gh-89, #42.
var ticketPattern = regexp.MustCompile(`(?i)([A-Z]{2,10}-\d+|gh-\d+|#\d+)`)

// branchPrefixRules maps common branch prefix conventions to a type label.
var branchPrefixRules = []struct {
	prefix    string
	label     string
}{
	{"feature/", "feature"},
	{"feat/", "feature"},
	{"fix/", "fix"},
	{"bugfix/", "fix"},
	{"hotfix/", "hotfix"},
	{"chore/", "chore"},
	{"refactor/", "refactor"},
	{"docs/", "docs"},
	{"test/", "test"},
	{"release/", "release"},
}

func (d *BranchContextDetector) Detect(_ context.Context, input *DetectorInput) ([]Hint, error) {
	branch := strings.TrimSpace(input.BranchName)
	if branch == "" || branch == "main" || branch == "master" || branch == "HEAD" {
		return nil, nil
	}

	var hints []Hint

	// Ticket extraction.
	if m := ticketPattern.FindString(branch); m != "" {
		hints = append(hints, Hint{
			Key:        "ticket",
			Value:      strings.ToUpper(m),
			Confidence: 0.95,
			Source:     d.Name(),
		})
	}

	// Branch type from prefix.
	lower := strings.ToLower(branch)
	for _, rule := range branchPrefixRules {
		if strings.HasPrefix(lower, rule.prefix) {
			hints = append(hints, Hint{
				Key:        "branch_type",
				Value:      rule.label,
				Confidence: 0.9,
				Source:     d.Name(),
			})
			break
		}
	}

	return hints, nil
}

// min returns the smaller of two ints. Inlined to avoid importing math.
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
