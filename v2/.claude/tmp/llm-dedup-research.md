# LLM-Powered Deduplication for Phantom OS Knowledge System

Author: Subash Karki
Date: 2026-05-03

---

## 1. Current Compactor Analysis

### What It Does

The compactor (`internal/ai/knowledge/compactor.go`) runs a 4-step cycle:

1. **synthesizePatterns()** — Groups decisions by `(strategy_id, complexity, risk)` via SQL `GROUP BY`, counts successes from verifier-phase outcomes only, produces `CompactedPattern` rows in `ai_patterns` table. Threshold: 5+ samples minimum (`PatternMinSamples`).

2. **pruneStale()** — Deletes decisions older than 7 days (`PruneTTL`) that have NO successful verifier-phase outcome. Also cleans up associated embeddings from VectorStore.

3. **demoteFailingPatterns()** — Marks patterns with `success_rate < 0.4` as `"deprecated"`.

4. **PruneExpired()** — Delegates to VectorStore to remove expired embeddings.

### Trigger

Compaction runs opportunistically at the **end of every `orchestrator.Process()` call** (line ~314 in orchestrator.go):

```go
if deps.Compactor != nil {
    if should, err := deps.Compactor.ShouldRun(); err == nil && should {
        _ = deps.Compactor.Run()
    }
}
```

`ShouldRun()` returns true when `total_decisions - sum(sample_size) >= 100`.

### What's Missing

| Gap | Description |
|-----|-------------|
| **No semantic dedup** | Two decisions with different `strategy_id` but semantically identical goals are never consolidated. E.g., "refactor auth module" and "restructure authentication layer" are treated as completely separate. |
| **No cross-strategy learning** | If the same goal was attempted with 3 strategies, the compactor never synthesizes "strategy A wins for this goal type" — it only tracks per-strategy success rates within their complexity/risk bucket. |
| **No natural language synthesis** | Patterns are mechanical: `strategy:X complexity:Y risk:Z success:0.80`. No human-readable insights like "For auth refactors, incremental strategy works 85% of the time; direct approach fails when >5 files touched." |
| **No global dedup** | `global_patterns` table (`global_patterns.go`) aggregates across projects but uses exact `(strategy_id, complexity, risk)` matching — no fuzzy/semantic matching. |
| **Patterns grow indefinitely** | Old deprecated patterns are never consolidated or archived. The `ai_patterns` table only grows. |

---

## 2. Proposed Architecture

### Data Flow

```
                    ┌─────────────────────────────────────────┐
                    │         Compactor.Run() — Enhanced      │
                    └──────────────┬──────────────────────────┘
                                   │
         ┌─────────────────────────┼──────────────────────────┐
         │                         │                          │
    Step 1: SQL                Step 2: LLM              Step 3: SQL
    Group + Cluster            Consolidate              Replace + Embed
         │                         │                          │
    ┌────▼────┐              ┌─────▼─────┐              ┌─────▼─────┐
    │ Query    │              │  Haiku    │              │ UPSERT    │
    │ decisions│──clusters──▶│  API call │──merged────▶│ ai_patterns│
    │ + embed  │              │  (JSON)   │  patterns    │ + delete  │
    │ similarity│             └───────────┘              │ old rows  │
    └─────────┘                                         └───────────┘
```

### Clustering Strategy

Two complementary approaches, used in sequence:

**A. SQL-based grouping (existing, keep as-is)**
- Groups by exact `(strategy_id, complexity, risk)` match
- Fast, no LLM cost, handles the mechanical aggregation

**B. Embedding-based semantic clustering (NEW)**
- For decisions with the same `strategy_id` but different goals
- Use VectorStore.FindSimilar() to cluster goals with cosine similarity > 0.85
- Send clusters of 3+ similar decisions to Haiku for consolidation
- For decisions across different strategies for similar goals: cluster by goal embedding, send to Haiku to determine winner

### Cluster Formation Algorithm

```go
// Pseudocode for semantic clustering
func (c *Compactor) findSemanticClusters() []DecisionCluster {
    // 1. Load all decisions with embeddings
    decisions := c.loadDecisionsWithEmbeddings()

    // 2. For each unvisited decision, find neighbors
    clusters := []DecisionCluster{}
    visited := map[string]bool{}

    for _, d := range decisions {
        if visited[d.ID] { continue }

        // Find similar decisions (cosine > 0.85)
        similar := c.vectorStore.FindSimilar(d.Goal, 20, "decision")
        cluster := filterBySimilarity(similar, 0.85)

        if len(cluster) >= 3 { // Min cluster size for LLM consolidation
            clusters = append(clusters, DecisionCluster{
                Anchor:    d,
                Members:   cluster,
                AvgSimilarity: avgCosine(cluster),
            })
            for _, m := range cluster { visited[m.ID] = true }
        }
    }
    return clusters
}
```

---

## 3. API Integration Approach

### Option A: Direct HTTP to Anthropic API (RECOMMENDED)

No SDK needed. Haiku is a single `POST /v1/messages` call with JSON in, JSON out.

```go
// internal/ai/knowledge/haiku_client.go

type HaikuClient struct {
    apiKey     string
    httpClient *http.Client
    model      string // "claude-haiku-4-5-20250501" or latest
}

type haikuRequest struct {
    Model     string          `json:"model"`
    MaxTokens int             `json:"max_tokens"`
    System    string          `json:"system,omitempty"`
    Messages  []haikuMessage  `json:"messages"`
}

type haikuMessage struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}

type haikuResponse struct {
    Content []struct {
        Type string `json:"type"`
        Text string `json:"text"`
    } `json:"content"`
    Usage struct {
        InputTokens  int `json:"input_tokens"`
        OutputTokens int `json:"output_tokens"`
    } `json:"usage"`
}

func (h *HaikuClient) Consolidate(ctx context.Context, prompt string) (string, error) {
    req := haikuRequest{
        Model:     h.model,
        MaxTokens: 1024,
        System:    consolidationSystemPrompt,
        Messages:  []haikuMessage{{Role: "user", Content: prompt}},
    }

    body, _ := json.Marshal(req)
    httpReq, _ := http.NewRequestWithContext(ctx, "POST",
        "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
    httpReq.Header.Set("x-api-key", h.apiKey)
    httpReq.Header.Set("anthropic-version", "2023-06-01")
    httpReq.Header.Set("content-type", "application/json")

    resp, err := h.httpClient.Do(httpReq)
    // ... parse haikuResponse, extract text
}
```

**Why direct HTTP over SDK:**
- No Go SDK dependency to manage (anthropic-go is young)
- Single endpoint, single request shape — SDK is overkill
- Matches claude-remember's approach (subprocess → CLI → Haiku)
- 50 lines of code total

**API key source:** Reuse `composer.GetAnthropicAPIKey()` from keychain. Falls back to `ANTHROPIC_API_KEY` env var. If neither exists, skip LLM dedup silently (graceful degradation, same pattern as VectorStore nil-checks).

### Option B: Shell out to `claude` CLI (claude-remember's approach)

```go
cmd := exec.CommandContext(ctx, "claude", "-p", prompt,
    "--output-format", "json", "--model", "haiku", "--max-turns", "1")
```

**Pros:** No API key management (uses user's subscription).
**Cons:** Requires `claude` binary installed; subprocess overhead; harder to parse errors; 2-3x slower startup.

**Verdict:** Option A for production. Option B as fallback when no API key.

---

## 4. Structured Output Parsing

### Approach: JSON with delimited fallback

Haiku responds well to explicit JSON schema in the system prompt. Use tool_use for guaranteed structure:

```go
const consolidationSystemPrompt = `You consolidate similar AI strategy decisions into patterns.
Output ONLY valid JSON matching this schema:
{
  "consolidated_pattern": {
    "strategy_id": "winning strategy ID",
    "description": "1-2 sentence insight about when/why this works",
    "success_rate": 0.85,
    "conditions": ["complexity:medium", "risk:low"],
    "failure_modes": ["fails when >10 files touched"],
    "sample_size": 15
  },
  "decisions_consumed": ["id1", "id2", "id3"]
}`
```

### User prompt template

```
These {{N}} decisions share similar goals and strategies. Consolidate them into one pattern.

Decisions:
{{range .Cluster}}
- ID: {{.ID}}
  Goal: "{{.Goal}}"
  Strategy: {{.StrategyID}}
  Complexity: {{.Complexity}} | Risk: {{.Risk}}
  Success: {{.Success}} | Failure Reason: "{{.FailureReason}}"
{{end}}

Rules:
1. Pick the winning strategy (highest success rate, most samples)
2. Synthesize conditions that predict success vs failure
3. Aggregate the sample size
4. List the IDs being consumed so the caller can delete them
```

### Parsing the response

```go
type ConsolidatedPattern struct {
    StrategyID        string   `json:"strategy_id"`
    Description       string   `json:"description"`
    SuccessRate       float64  `json:"success_rate"`
    Conditions        []string `json:"conditions"`
    FailureModes      []string `json:"failure_modes"`
    SampleSize        int      `json:"sample_size"`
}

type ConsolidationResult struct {
    Pattern           ConsolidatedPattern `json:"consolidated_pattern"`
    DecisionsConsumed []string            `json:"decisions_consumed"`
}

func parseConsolidation(text string) (*ConsolidationResult, error) {
    // Try direct JSON parse
    var result ConsolidationResult
    if err := json.Unmarshal([]byte(text), &result); err == nil {
        return &result, nil
    }
    // Fallback: extract JSON from markdown code block
    if idx := strings.Index(text, "{"); idx >= 0 {
        end := strings.LastIndex(text, "}")
        if end > idx {
            return parseConsolidation(text[idx : end+1])
        }
    }
    return nil, fmt.Errorf("no valid JSON in response")
}
```

---

## 5. Schema Changes

### New columns on `ai_patterns`

```sql
ALTER TABLE ai_patterns ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE ai_patterns ADD COLUMN conditions TEXT DEFAULT '[]';    -- JSON array
ALTER TABLE ai_patterns ADD COLUMN failure_modes TEXT DEFAULT '[]'; -- JSON array
ALTER TABLE ai_patterns ADD COLUMN source TEXT DEFAULT 'sql';       -- 'sql' or 'llm'
ALTER TABLE ai_patterns ADD COLUMN last_consolidated_at DATETIME;
```

### New table: `ai_consolidation_log`

```sql
CREATE TABLE IF NOT EXISTS ai_consolidation_log (
    id TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL,
    decisions_consumed TEXT NOT NULL,  -- JSON array of decision IDs
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. Scheduling

### When to run LLM dedup

| Trigger | Condition | Rationale |
|---------|-----------|-----------|
| **After N new decisions** | 50+ decisions since last consolidation | Batch for cost efficiency |
| **On `ShouldRun()` check** | Extend existing check to include semantic clusters | Piggyback on existing trigger |
| **Max frequency** | 120s cooldown (matches claude-remember) | Prevent rapid-fire API calls |
| **Cost guard** | Max 10 clusters per run, max 5 Haiku calls/hour | Hard ceiling on spend |

### Implementation

```go
type Compactor struct {
    db              *sql.DB
    vectorStore     *embedding.VectorStore
    haikuClient     *HaikuClient              // nil = skip LLM dedup
    lastConsolidate time.Time
    consolidateCooldown time.Duration          // default 120s
}

func (c *Compactor) Run() error {
    // Step 1-3: existing SQL-based compaction (unchanged)
    if err := c.synthesizePatterns(); err != nil { return err }
    if err := c.pruneStale(); err != nil { return err }
    if err := c.demoteFailingPatterns(); err != nil { return err }

    // Step 4: LLM-powered semantic dedup (NEW)
    if c.haikuClient != nil && time.Since(c.lastConsolidate) > c.consolidateCooldown {
        if err := c.llmConsolidate(); err != nil {
            slog.Warn("llm consolidation skipped", "err", err)
            // Non-fatal — existing compaction still ran
        }
        c.lastConsolidate = time.Now()
    }

    // Step 5: prune expired embeddings (unchanged)
    if c.vectorStore != nil { ... }

    return nil
}
```

---

## 7. Cost Estimates

### Per-call cost

| Metric | Value |
|--------|-------|
| Haiku input price | $0.80 / 1M tokens |
| Haiku output price | $4.00 / 1M tokens |
| Avg cluster prompt | ~800 tokens input (10 decisions × ~80 tokens each) |
| Avg response | ~200 tokens output |
| **Cost per cluster** | **(800 × $0.80 + 200 × $4.00) / 1M = ~$0.0014** |

### Daily cost projection

| Usage Level | Decisions/day | Clusters/run | Runs/day | Daily Cost |
|-------------|---------------|-------------|----------|------------|
| Light (hobby) | 20 | 1-2 | 1 | $0.001 - $0.003 |
| Moderate | 100 | 5-8 | 2-3 | $0.014 - $0.034 |
| Heavy (power user) | 500 | 10 (capped) | 5 | $0.070 |
| **Maximum (hard cap)** | unlimited | 10 | 5/hour cap | **$0.070/hr, ~$0.56/day** |

**Monthly ceiling: ~$17 worst case.** In practice, $1-3/month for active users.

---

## 8. Implementation Plan

### Phase 1: HaikuClient (1-2 hours)

**File:** `internal/ai/knowledge/haiku_client.go`

- HTTP client for Anthropic Messages API
- API key from keychain with env var fallback
- Request/response types
- Timeout handling (30s per call)
- Token usage tracking

**Effort:** ~150 lines of Go

### Phase 2: Semantic Clustering (2-3 hours)

**File:** `internal/ai/knowledge/compactor.go` (extend)

- `findSemanticClusters()` using existing VectorStore.FindSimilar()
- Cluster filtering (min 3 members, similarity > 0.85)
- Dedup visited decisions across clusters

**Effort:** ~100 lines of Go

### Phase 3: LLM Consolidation Pipeline (2-3 hours)

**File:** `internal/ai/knowledge/compactor.go` (extend)

- `llmConsolidate()` — iterate clusters, call Haiku, parse, write
- Prompt template with decision context
- JSON response parsing with fallback
- Schema migration for new columns
- Consolidation log table
- Cooldown + cost guard

**Effort:** ~200 lines of Go

### Phase 4: Wiring + Tests (2-3 hours)

- Wire HaikuClient into Compactor constructor
- Wire API key retrieval
- Update orchestrator.Dependencies
- Unit tests with mock Haiku responses
- Integration test with real SQLite

**Effort:** ~200 lines of Go + tests

### Total estimate: 8-11 hours, ~650 lines of production Go

---

## 9. Code Skeleton

### haiku_client.go

```go
// Author: Subash Karki
package knowledge

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"
)

const (
    anthropicAPIURL     = "https://api.anthropic.com/v1/messages"
    anthropicAPIVersion = "2023-06-01"
    haikuModel          = "claude-haiku-4-5-20250501"
    haikuMaxTokens      = 1024
    haikuTimeout        = 30 * time.Second
)

// HaikuClient calls Anthropic's Messages API with Haiku for lightweight LLM tasks.
type HaikuClient struct {
    apiKey     string
    httpClient *http.Client
}

// NewHaikuClient creates a client. Returns nil if apiKey is empty (graceful skip).
func NewHaikuClient(apiKey string) *HaikuClient {
    if apiKey == "" {
        return nil
    }
    return &HaikuClient{
        apiKey:     apiKey,
        httpClient: &http.Client{Timeout: haikuTimeout},
    }
}

type haikuRequest struct {
    Model     string         `json:"model"`
    MaxTokens int            `json:"max_tokens"`
    System    string         `json:"system,omitempty"`
    Messages  []haikuMsg     `json:"messages"`
}

type haikuMsg struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}

type haikuResponse struct {
    Content []struct {
        Type string `json:"type"`
        Text string `json:"text"`
    } `json:"content"`
    Usage struct {
        InputTokens  int `json:"input_tokens"`
        OutputTokens int `json:"output_tokens"`
    } `json:"usage"`
}

// Call sends a prompt to Haiku and returns the text response + token counts.
func (h *HaikuClient) Call(ctx context.Context, system, userPrompt string) (text string, inTok, outTok int, err error) {
    reqBody := haikuRequest{
        Model:     haikuModel,
        MaxTokens: haikuMaxTokens,
        System:    system,
        Messages:  []haikuMsg{{Role: "user", Content: userPrompt}},
    }

    body, err := json.Marshal(reqBody)
    if err != nil {
        return "", 0, 0, fmt.Errorf("marshal request: %w", err)
    }

    req, err := http.NewRequestWithContext(ctx, "POST", anthropicAPIURL, bytes.NewReader(body))
    if err != nil {
        return "", 0, 0, fmt.Errorf("build request: %w", err)
    }
    req.Header.Set("x-api-key", h.apiKey)
    req.Header.Set("anthropic-version", anthropicAPIVersion)
    req.Header.Set("content-type", "application/json")

    resp, err := h.httpClient.Do(req)
    if err != nil {
        return "", 0, 0, fmt.Errorf("http call: %w", err)
    }
    defer resp.Body.Close()

    respBody, err := io.ReadAll(resp.Body)
    if err != nil {
        return "", 0, 0, fmt.Errorf("read response: %w", err)
    }

    if resp.StatusCode != 200 {
        return "", 0, 0, fmt.Errorf("haiku API %d: %s", resp.StatusCode, string(respBody))
    }

    var hResp haikuResponse
    if err := json.Unmarshal(respBody, &hResp); err != nil {
        return "", 0, 0, fmt.Errorf("parse response: %w", err)
    }

    if len(hResp.Content) == 0 {
        return "", 0, 0, fmt.Errorf("empty response from haiku")
    }

    return hResp.Content[0].Text, hResp.Usage.InputTokens, hResp.Usage.OutputTokens, nil
}
```

### compactor.go — new llmConsolidate method

```go
const (
    consolidateCooldown = 120 * time.Second
    maxClustersPerRun   = 10
    minClusterSize      = 3
    similarityThreshold = 0.85
)

const consolidationSystemPrompt = `You consolidate similar AI strategy decisions into one pattern.
Output ONLY valid JSON. No markdown, no explanation.
Schema:
{
  "consolidated_pattern": {
    "strategy_id": "string — the winning strategy",
    "description": "string — 1-2 sentence insight",
    "success_rate": 0.85,
    "conditions": ["when this works"],
    "failure_modes": ["when this fails"],
    "sample_size": 15
  },
  "decisions_consumed": ["id1", "id2"]
}`

// DecisionCluster groups semantically similar decisions for consolidation.
type DecisionCluster struct {
    Decisions []Decision
    Outcomes  map[string][]Outcome // keyed by decision ID
}

func (c *Compactor) llmConsolidate() error {
    if c.vectorStore == nil {
        return nil // can't cluster without embeddings
    }

    clusters := c.findSemanticClusters()
    if len(clusters) == 0 {
        return nil
    }

    if len(clusters) > maxClustersPerRun {
        clusters = clusters[:maxClustersPerRun]
    }

    ctx := context.Background()
    for _, cluster := range clusters {
        prompt := c.buildClusterPrompt(cluster)
        text, inTok, outTok, err := c.haikuClient.Call(ctx, consolidationSystemPrompt, prompt)
        if err != nil {
            slog.Warn("haiku consolidation failed", "err", err, "cluster_size", len(cluster.Decisions))
            continue
        }

        result, err := parseConsolidation(text)
        if err != nil {
            slog.Warn("haiku response unparseable", "err", err)
            continue
        }

        if err := c.applyConsolidation(result, inTok, outTok); err != nil {
            slog.Warn("apply consolidation failed", "err", err)
            continue
        }
    }

    return nil
}

func (c *Compactor) findSemanticClusters() []DecisionCluster {
    // Load decisions created in the last 30 days
    rows, err := c.db.Query(`
        SELECT d.id, d.goal, d.strategy_id, d.complexity, d.risk
        FROM ai_decisions d
        WHERE d.created_at > datetime('now', '-30 days')
        ORDER BY d.created_at DESC
        LIMIT 500
    `)
    if err != nil {
        return nil
    }
    defer rows.Close()

    var decisions []Decision
    for rows.Next() {
        var d Decision
        if rows.Scan(&d.ID, &d.Goal, &d.StrategyID, &d.Complexity, &d.Risk) == nil {
            decisions = append(decisions, d)
        }
    }

    // Cluster by embedding similarity
    visited := make(map[string]bool)
    var clusters []DecisionCluster

    for _, d := range decisions {
        if visited[d.ID] { continue }

        similar, err := c.vectorStore.FindSimilar(d.Goal, 20, "decision")
        if err != nil { continue }

        var members []Decision
        for _, mem := range similar {
            // Match back to our decision list
            for _, dd := range decisions {
                if dd.ID == mem.SourceID && !visited[dd.ID] {
                    members = append(members, dd)
                    break
                }
            }
        }

        if len(members) >= minClusterSize {
            cluster := DecisionCluster{Decisions: members}
            // Load outcomes for each
            cluster.Outcomes = c.loadOutcomes(members)
            clusters = append(clusters, cluster)
            for _, m := range members { visited[m.ID] = true }
        }
    }

    return clusters
}

func (c *Compactor) buildClusterPrompt(cluster DecisionCluster) string {
    var b strings.Builder
    fmt.Fprintf(&b, "These %d decisions share similar goals. Consolidate into one pattern.\n\n", len(cluster.Decisions))
    for _, d := range cluster.Decisions {
        fmt.Fprintf(&b, "- ID: %s\n  Goal: %q\n  Strategy: %s\n  Complexity: %s | Risk: %s\n",
            d.ID, d.Goal, d.StrategyID, d.Complexity, d.Risk)
        if outcomes, ok := cluster.Outcomes[d.ID]; ok {
            for _, o := range outcomes {
                fmt.Fprintf(&b, "  Outcome: success=%v reason=%q phase=%s\n",
                    o.Success, o.FailureReason, o.Phase)
            }
        }
        b.WriteString("\n")
    }
    return b.String()
}

func (c *Compactor) applyConsolidation(result *ConsolidationResult, inTok, outTok int) error {
    patternID := patternKey(result.Pattern.StrategyID,
        extractCondition(result.Pattern.Conditions, "complexity"),
        extractCondition(result.Pattern.Conditions, "risk"))

    condJSON, _ := json.Marshal(result.Pattern.Conditions)
    failJSON, _ := json.Marshal(result.Pattern.FailureModes)
    consumedJSON, _ := json.Marshal(result.DecisionsConsumed)

    // Upsert the consolidated pattern
    _, err := c.db.Exec(`
        INSERT INTO ai_patterns (id, strategy_id, complexity, risk, success_rate, sample_size,
                                 status, description, conditions, failure_modes, source, last_consolidated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 'llm', CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            success_rate = excluded.success_rate,
            sample_size = excluded.sample_size,
            description = excluded.description,
            conditions = excluded.conditions,
            failure_modes = excluded.failure_modes,
            source = 'llm',
            last_consolidated_at = CURRENT_TIMESTAMP
    `, patternID, result.Pattern.StrategyID,
        extractCondition(result.Pattern.Conditions, "complexity"),
        extractCondition(result.Pattern.Conditions, "risk"),
        result.Pattern.SuccessRate, result.Pattern.SampleSize,
        result.Pattern.Description, string(condJSON), string(failJSON))
    if err != nil {
        return err
    }

    // Log the consolidation
    logID := uuid.NewString()
    costUSD := float64(inTok)*0.80/1_000_000 + float64(outTok)*4.00/1_000_000
    _, _ = c.db.Exec(`
        INSERT INTO ai_consolidation_log (id, pattern_id, decisions_consumed, input_tokens, output_tokens, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?)
    `, logID, patternID, string(consumedJSON), inTok, outTok, costUSD)

    // Delete consumed decisions (they're now represented by the pattern)
    for _, id := range result.DecisionsConsumed {
        c.db.Exec("DELETE FROM ai_outcomes WHERE decision_id = ?", id)
        c.db.Exec("DELETE FROM ai_decisions WHERE id = ?", id)
        if c.vectorStore != nil {
            _ = c.vectorStore.Delete("decision", id)
        }
    }

    // Embed the new pattern
    if c.vectorStore != nil {
        text := fmt.Sprintf("pattern: %s — %s", result.Pattern.StrategyID, result.Pattern.Description)
        _ = c.vectorStore.Store("pattern", patternID, text)
    }

    return nil
}
```

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Haiku returns malformed JSON | Fallback parser strips markdown fences, retries once with simpler prompt |
| API key not available | `HaikuClient` is nil → LLM dedup silently skipped, SQL compaction still runs |
| Cost runaway | Hard cap: 10 clusters/run, 120s cooldown, 5 calls/hour max |
| Network failure mid-consolidation | Each cluster is independent; partial success is fine |
| Haiku hallucinates bad consolidation | Validate: success_rate ∈ [0,1], sample_size > 0, decisions_consumed subset of input IDs |
| Data loss from incorrect consolidation | Log all consumed decision IDs in `ai_consolidation_log` for audit/rollback |

---

## 11. Open Questions

1. **Should LLM dedup also run on `global_patterns`?** — Cross-project patterns would benefit most from semantic dedup, but the cost is higher (more data).

2. **Fallback to CLI?** — When no API key exists, should we shell out to `claude --model haiku` like claude-remember does? Adds subprocess complexity but works with user's subscription.

3. **Prompt caching?** — Anthropic supports prompt caching. The system prompt is static (~200 tokens), so caching it across cluster calls within a run would save ~10% on input costs. Worth adding from day 1?

4. **Confidence threshold for applying consolidation?** — Should we only apply if Haiku's response includes a confidence metric above some threshold? Or trust it and rely on the audit log for rollback?
