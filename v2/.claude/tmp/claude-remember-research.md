# Claude-Remember Deep Dive Research

## Executive Summary

Claude-Remember is a **session-aware continuous memory system** for Claude Code that captures conversations into hierarchical, time-decaying markdown files. It uses Haiku for LLM-powered summarization and compression, with a **multi-layer strategy** (now → today → recent → archive) that reduces context window while preserving recency and relevance.

**Key insight for Phantom**: Claude-Remember patterns apply best to **conversational/session memory**, while Phantom's architecture focuses on **decision history + strategy patterns**. The approaches are complementary.

---

## Architecture Overview

### Claude-Remember: Session-to-Archive Pipeline

```
Session JSONL (raw turns)
    ↓ [extract.py] — filters metadata, system reminders, tool summaries
    ↓
now.md (current session buffer, appended each turn)
    ↓ [hourly NDC] — compress same-day entries
    ↓
today-YYYY-MM-DD.md (dated daily summaries)
    ↓ [daily consolidation] — merge week's days + archive old
    ↓
recent.md (last ~7 days, detailed, ~5-10KB)
archive.md (older history, deeply compressed, unlimited size)
```

**Trigger points**:
- **Post-tool hook** (every tool use): extract & save incrementally
- **120s cooldown**: prevents thrashing from rapid tool calls
- **Min 3 human messages**: threshold before save (configurable)
- **50+ output lines**: auto-save when tool output is large
- **Hourly NDC**: background compression (now.md → today)
- **Daily consolidation**: triggered at session start (past-day → recent/archive)

### Phantom: Pattern-Centric Architecture

```
Decision Store (SQLite: session → outcomes)
    ↓ [Compactor.synthesizePatterns()] — (5+ samples → pattern)
    ↓
ai_patterns table (active/deprecated strategies)
    ↓ [VectorStore embeddings] — semantic search
    ↓
ReasoningBank (Phantom's vector search)
    ↓ [Composer injects] → agent system prompt
```

**Trigger points**:
- Decision logged after each outcome
- Compaction runs on schedule (not on every turn)
- 7-day TTL on unsuccessful decisions (PruneTTL)
- Deprecation at 40% success rate threshold

---

## Key Patterns to Steal (Ranked by Impact)

### 1. HIERARCHICAL TIME-DECAY COMPRESSION (9/10 impact)

**Claude-Remember approach**:
- Layer 1: now.md — raw session in execution order
- Layer 2: today-*.md — daily summaries (1-2 sentences per entry)
- Layer 3: recent.md — weekly digests (detailed, 7 days)
- Layer 4: archive.md — monthly+ (heavily compressed)

**Why it works**:
- Recency bias: hot memory stays detailed
- Cost control: old data becomes progressively denser
- Retrieval ergonomics: "recent" is where answers live
- Deduplication happens at merge boundaries (daily → recent)

**Phantom mapping**:
- Layer 1: active_decisions table (current session)
- Layer 2: ai_patterns (synthesized strategies)
- Layer 3: global.db patterns (cross-project)
- **Gap**: Phantom has no time-based decay in global.db

**Action**: Add discovered_at timestamp to global_patterns, implement time-window queries in GlobalPatternStore to surface recent discoveries.

### 2. LLM-POWERED COMPRESSION WITH STRUCTURED OUTPUT (8/10 impact)

**Claude-Remember approach**:
- Extraction: removes metadata, system reminders, tool use summaries
- Summarization (Haiku): one-liner per exchange + time/branch
- Consolidation: Haiku outputs two sections (===RECENT=== / ===ARCHIVE===)

**Why it works**:
- Haiku is cheap (~$0.0008 per compression run)
- Structured format (delimiters) makes parsing deterministic
- Token counting built in (input, output, cache usage)
- SKIP response = no new information today
- Cost transparency: logs every Haiku call cost

**Phantom mapping**:
- Compactor.synthesizePatterns() manually aggregates (no LLM)
- Global.db merges are append-only (no compression)
- **Gap**: Phantom doesn't use LLM to identify truly novel patterns

**Action**: Consider Haiku-powered pattern deduplication in GlobalPatternStore during consolidation—detect if new pattern is semantically equivalent to existing ones.

### 3. INCREMENTAL EXTRACTION WITH POSITION TRACKING (7/10 impact)

**Claude-Remember approach**:
```
last-save.json:
{
  "session": "abc123-uuid",
  "line": 42
}
```
- Extract only lines after saved position (skip_lines=42)
- Write new position after success
- Recover missed saves on session start

**Why it works**:
- Avoids re-summarizing old turns
- Handles crashes gracefully (resume from last known safe point)
- Session mismatch = start fresh (no stale position bleed)
- Sub-second overhead

**Phantom mapping**:
- DecisionStore has no "last logged position"
- No recovery mechanism if compaction fails mid-run
- **Gap**: Phantom could lose decisions if orchestrator crashes during batch logging

**Action**: Add LastProcessedDecision checkpoint to DecisionStore; compactor reads it and only synthesizes patterns from decisions after that mark.

### 4. ATOMIC FILE OPERATIONS + COOLDOWNS (6/10 impact)

**Claude-Remember approach**:
```bash
# Atomic lock via noclobber
set -C
> "$LOCK_FILE" || { echo "lock held"; exit 0; }
trap "rm -f $LOCK_FILE" EXIT

# Cooldown check
if [ -f "$COOLDOWN_MARKER" ]; then
  ELAPSED=$(($(date +%s) - $(cat "$COOLDOWN_MARKER")))
  [ "$ELAPSED" -lt 120 ] && { exit 0; }
fi
```

**Why it works**:
- Prevents concurrent saves (shell noclobber = atomic mkdir)
- Cooldown avoids thrashing: 120s between saves
- Log rotation: keeps /remember/logs/ bounded (~10 rotations)
- Background NDC doesn't block session

**Phantom mapping**:
- Compactor uses SQL transaction for atomicity (good)
- No cooldown between synthesization runs
- **Gap**: If user triggers compaction twice rapidly, work duplicates

**Action**: Add cooldown_seconds config to Phantom's compactor; track last-run timestamp in a .run-marker file.

### 5. MULTI-TIER MEMORY INJECTION (7/10 impact)

**Claude-Remember approach** (SessionStart hook):
1. identity.md (who the agent is)
2. remember.md (one-shot handoff from prior session)
3. now.md (current session buffer)
4. today-*.md (today's summaries)
5. recent.md (last 7 days)
6. archive.md (older)

Injected as:
```
=== MEMORY ===
--- identity.md ---
...
--- remember.md ---
...
```

**Why it works**:
- All memory loads BEFORE first prompt (zero latency during turns)
- Structured markers let agent navigate memory mentally
- Handoff is one-shot (cleared after read)—prevents repetition
- Archive is available but low-priority

**Phantom mapping**:
- Composer injects aiEngineDirective (strategy, not memory)
- No automatic memory load at session start
- Knowledge queries happen per-turn (slight latency)
- **Gap**: No semantic memory loaded upfront

**Action**: Add SessionMemory to Phantom's orchestrator.Dependencies; load recent patterns + global patterns at session init; inject as context block in composer system prompt.

---

## Architecture Comparison Table

| Feature | Claude-Remember | Phantom | Gap |
|---------|-----------------|---------|-----|
| Storage | Markdown + JSON | SQLite (2 DBs) | CR: human-readable; P: queryable |
| Extraction | JSONL → role-labeled text | Decision → outcome log | P: lacks human/agent text filter |
| Retrieval | Time-based layers | Query-based (success_rate) | P: no semantic search on text |
| Compression | Haiku (LLM) | Manual aggregation | P: could use Haiku for dedup |
| Memory types | Session buffer, daily, weekly, archive | Decisions, patterns, global patterns | P: lacks conversational memory |
| Injection | Automatic (SessionStart hook) | Per-query (composer) | P: batch load could be faster |
| Decay | Time-based (old → archive) | Success-based (deprecated at 40%) | Different philosophies |
| Cooldown | 120s, configurable | None | P: needs throttling |
| Recovery | Position tracking + force flag | None (truncation loss) | P: vulnerable to crashes |
| Cost tracking | Per-Haiku call logged | None | P: no cost visibility |
| Test coverage | 323 tests, 99% | Per-module unit tests | CR is more comprehensive |

---

## Implementation Effort Estimates

### High Priority

**1. Time-decay in GlobalPatternStore** (2-3 days)
- Add created_at, last_seen_at to global_patterns
- Window queries: patterns discovered in [now-30d, now]
- Deprecate patterns older than 90 days
- Files: knowledge/global_patterns.go

**2. Compaction cooldown + checkpointing** (1-2 days)
- Track LastProcessedDecision in decision store
- Add cooldown_seconds config (default: 3600)
- Skip re-synthesizing decisions seen before
- Files: knowledge/compactor.go, config schema

**3. SessionMemory injection in Composer** (2-3 days)
- Load active patterns at session start
- Load global patterns (top-5 by success_rate)
- Format as structured blocks (like identity.md)
- Inject into system prompt
- Files: composer/service.go, orchestrator/dependencies.go

### Medium Priority

**4. Haiku-powered pattern deduplication** (3-4 days)
- During consolidation: cluster new patterns against old ones
- Haiku decides: "is this semantically equivalent?"
- Merge equivalent patterns (fold success_rate)
- Requires Haiku calls during compaction (cost: ~$0.001/cluster)
- Files: knowledge/consolidate.go (new)

**5. Incremental extraction checkpoint** (1-2 days)
- Save position after each decision batch
- Extract only unseen decisions on compaction
- Similar to CR's last-save.json
- Files: knowledge/decisions.go, knowledge/types.go

### Low Priority

**6. Semantic search + embeddings injection** (4-5 days)
- Index pattern descriptions in VectorStore
- Retrieve top-3 similar patterns per query
- Inject into system prompt (like CR's recent.md)
- Requires retraining embeddings pipeline
- Files: embedding/store.go, orchestrator/context.go

---

## Code Examples

### Example 1: Time-Window Query (Phantom GlobalPatternStore)

Current: no time awareness in pattern queries

Proposed:
```go
// RecentPatterns returns strategies discovered in the last N days
func (s *GlobalPatternStore) RecentPatterns(ctx context.Context, days int) ([]GlobalPattern, error) {
  cutoff := time.Now().AddDate(0, 0, -days)
  rows, err := s.db.QueryContext(ctx, `
    SELECT strategy_id, success_rate, discovered_at, project_count
    FROM global_patterns
    WHERE discovered_at > ?
    ORDER BY success_rate DESC
    LIMIT 20
  `, cutoff)
  // ... scan and return
}
```

### Example 2: Cooldown Check (Phantom Compactor)

Current: runs every time without cooldown

Proposed:
```go
const DefaultCompactionCooldown = 3600 * time.Second

func (c *Compactor) RunIfNeeded(cooldownSecs int) error {
  marker := filepath.Join(c.dataDir, ".compactor-lastrun")
  data, _ := ioutil.ReadFile(marker)
  if len(data) > 0 {
    lastRun, _ := time.Parse(time.RFC3339, string(data))
    elapsed := time.Since(lastRun)
    if elapsed < time.Duration(cooldownSecs)*time.Second {
      return nil  // cooldown active
    }
  }
  
  // Run compaction
  if err := c.Run(); err != nil {
    return err
  }
  
  // Mark success
  now := time.Now().Format(time.RFC3339)
  return ioutil.WriteFile(marker, []byte(now), 0644)
}
```

### Example 3: SessionMemory Injection (Phantom Composer)

Current: only injects aiEngineDirective

Proposed:
```go
func (s *Service) buildSystemPrompt(ctx context.Context, indexer *filegraph.Indexer) (string, error) {
  var blocks []string
  
  // AI engine tooling
  blocks = append(blocks, aiEngineDirective)
  
  // Session memory: recent patterns
  recentPatterns, _ := indexer.Knowledge.GlobalPatterns.RecentPatterns(ctx, 7)
  if len(recentPatterns) > 0 {
    blocks = append(blocks, formatMemoryBlock("Recent Strategies", recentPatterns))
  }
  
  // Session memory: active decisions from today
  todayDecisions, _ := indexer.Knowledge.Decisions.SinceHours(ctx, 24)
  if len(todayDecisions) > 0 {
    blocks = append(blocks, formatMemoryBlock("Today's Decisions", todayDecisions))
  }
  
  return strings.Join(blocks, "\n\n"), nil
}

func formatMemoryBlock(title string, data interface{}) string {
  return fmt.Sprintf("=== MEMORY: %s ===\n%v", title, data)
}
```

---

## What Phantom Already Does Better

1. **Strategy pattern synthesis** — Phantom's Compactor aggregates decisions into reusable patterns. Claude-Remember has no equivalent (it only compresses conversations).

2. **Success-rate ranking** — Phantom tracks outcome data (success_rate, sample_size). Claude-Remember tracks recency, not effectiveness.

3. **Complexity/Risk tuples** — Phantom dimensions strategies by complexity + risk. Claude-Remember has no schema for this.

4. **Embedding-based retrieval** — Phantom's VectorStore does semantic matching on pattern descriptions. Claude-Remember uses time-based ranking only.

5. **Cross-project knowledge aggregation** — Phantom's GlobalPatternStore unifies patterns across projects. Claude-Remember is per-project.

---

## Risks & Caveats

### Cost

- Claude-Remember runs Haiku for every save (~$0.0008/call). With 120s cooldown + hourly compression, ~1-2 calls/hour = ~$0.02/day/agent.
- Phantom adding Haiku dedup during consolidation would add ~$0.001 per compaction cycle (hourly).

### Latency

- Claude-Remember's SessionStart hook injects memory synchronously (blocks session start by ~500ms for file reads).
- Phantom's per-turn knowledge queries add ~200ms latency per orchestrator call.

### Loss of Information

- Claude-Remember's summarization is lossy (one sentence per exchange). Long sessions compress to ~100 lines/day.
- Phantom's pattern synthesis requires 5+ samples (decisions are dropped until threshold).

### Concurrency

- Claude-Remember uses shell noclobber (atomic). Works cross-process but not thread-safe.
- Phantom uses SQL transactions (thread-safe but slower on contention).

---

## Recommendations for Phantom

**Short term (1-2 sprints)**:
1. Add time-window queries to GlobalPatternStore
2. Implement compaction cooldown + checkpointing
3. Inject recent patterns into Composer system prompt at session start

**Medium term (2-3 sprints)**:
4. Add Haiku-powered pattern deduplication during consolidation
5. Implement incremental extraction checkpoints in DecisionStore

**Long term (research)**:
6. Explore semantic memory (conversational context) alongside decision memory
7. Consider per-agent memory (like Claude-Remember's identity.md)

---

## Files & Line References

**Claude-Remember**:
- /tmp/claude-remember/pipeline/extract.py — extraction logic
- /tmp/claude-remember/pipeline/consolidate.py — consolidation with Haiku
- /tmp/claude-remember/scripts/save-session.sh — hook orchestration
- /tmp/claude-remember/scripts/session-start-hook.sh — memory injection
- /tmp/claude-remember/prompts/save-session.prompt.txt — summarization template
- /tmp/claude-remember/prompts/compress-ndc.prompt.txt — NDC compression template

**Phantom**:
- /Users/subash.karki/phantom-os/v2/internal/ai/knowledge/global_patterns.go — where time-decay should go
- /Users/subash.karki/phantom-os/v2/internal/ai/knowledge/compactor.go — where cooldown should go
- /Users/subash.karki/phantom-os/v2/internal/composer/service.go — where memory injection happens

---

## Conclusion

Claude-Remember's core strength is **session-centric hierarchical compression**—a pattern Phantom could adopt for decision history. The multi-layer time-decay (now → today → recent → archive) is elegant and cost-effective.

Phantom's advantage is **outcome-oriented pattern synthesis**—tracking what works and ranking by success rate. Combining both approaches would yield:
- Fast retrieval (semantic + time-based)
- Cost efficiency (layered compression)
- Interpretability (success rates as signals)
- Cross-project generalization (global patterns)

**Start with pattern #1 + #2 + #3**: time-decay + cooldown + SessionMemory injection. This unlocks 70% of the value in ~1 sprint.
