#!/usr/bin/env bash
# phantom-ai-pipeline.sh — Transparent AI Engine injection for Claude sessions
#
# Hook types supported:
#   SessionStart     → Inject project graph intelligence on session boot
#   UserPromptSubmit → Route every prompt through the orchestrator pipeline
#   PreToolUse       → Inject blast radius before Edit/Write operations
#
# The Phantom OS desktop app installs this hook during onboarding Phase 4.
# Team members get it automatically from the .dmg — zero configuration.
#
# @author Subash Karki

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PHANTOM_PORT="${PHANTOM_API_PORT:-3849}"
PHANTOM_API="http://localhost:${PHANTOM_PORT}/api"
TIMEOUT_MS=5  # curl timeout in seconds (hooks have 10s budget)

# ---------------------------------------------------------------------------
# Read hook input from stdin
# ---------------------------------------------------------------------------
INPUT=$(cat)
HOOK_TYPE="${CLAUDE_HOOK_TYPE:-}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Detect project from cwd by querying the Phantom OS server
detect_project() {
  local cwd="${1:-$(pwd)}"
  local result
  result=$(curl -sf --max-time "$TIMEOUT_MS" "${PHANTOM_API}/projects" 2>/dev/null) || return 1

  # Find the project whose repoPath or worktreeBaseDir is a prefix of cwd
  # Note: must capture fields as jq vars before piping into startswith
  echo "$result" | jq -r --arg cwd "$cwd" '
    .[] | select(
      .repoPath as $rp | .worktreeBaseDir as $wd |
      ($cwd | startswith($rp)) or
      ($wd != null and $wd != "" and ($cwd | startswith($wd)))
    ) | .id
  ' | head -1
}

# Check if the Phantom OS server is running
server_alive() {
  curl -sf --max-time 2 "http://localhost:${PHANTOM_PORT}/health" >/dev/null 2>&1
}

# Extract file paths from user prompt text (best-effort regex)
extract_file_refs() {
  local text="$1"
  echo "$text" | grep -oE '[a-zA-Z0-9_./-]+\.(ts|tsx|js|jsx|py|go|rs|java|css|json|md)' | sort -u
}

# ---------------------------------------------------------------------------
# SESSION START — Inject project intelligence when Claude boots
# ---------------------------------------------------------------------------
handle_session_start() {
  # Bail fast if server isn't running
  server_alive || exit 0

  local project_id
  project_id=$(detect_project) || exit 0
  [ -z "$project_id" ] && exit 0

  # Fetch graph stats
  local stats
  stats=$(curl -sf --max-time "$TIMEOUT_MS" \
    "${PHANTOM_API}/graph/${project_id}/stats" 2>/dev/null) || exit 0

  # Fetch recent orchestrator history (last 5 decisions)
  local history
  history=$(curl -sf --max-time "$TIMEOUT_MS" \
    "${PHANTOM_API}/orchestrator/${project_id}/history?limit=5" 2>/dev/null) || true

  # Fetch available strategies
  local strategies
  strategies=$(curl -sf --max-time "$TIMEOUT_MS" \
    "${PHANTOM_API}/orchestrator/${project_id}/strategies" 2>/dev/null) || true

  # Build the injection payload (field names match graph-engine.ts stats response)
  local file_count edge_count module_count layer2_count coverage
  file_count=$(echo "$stats" | jq -r '.fileCount // "unknown"')
  edge_count=$(echo "$stats" | jq -r '.totalEdges // "unknown"')
  module_count=$(echo "$stats" | jq -r '.moduleCount // "unknown"')
  layer2_count=$(echo "$stats" | jq -r '.layer2Count // 0')
  coverage=$(echo "$stats" | jq -r '.coverage // "unknown"')

  # Format recent decisions for context (truncate goal with jq slice, not python-style [0:80])
  local recent_decisions=""
  if [ -n "$history" ] && [ "$history" != "null" ]; then
    recent_decisions=$(echo "$history" | jq -r '
      .decisions[:5] | if length == 0 then empty else
        map(
          "  - \((.goal // "unknown") | .[0:80]) → strategy: \(.strategy // "unknown"), confidence: \(.confidence // "unknown")"
        ) | join("\n")
      end
    ' 2>/dev/null) || true
  fi

  # Format available strategies
  local strategy_list=""
  if [ -n "$strategies" ] && [ "$strategies" != "null" ]; then
    strategy_list=$(echo "$strategies" | jq -r '
      .strategies | map("  - \(.name): \(.description)") | join("\n")
    ' 2>/dev/null) || true
  fi

  cat <<EOF
<phantom-ai-engine>
## Phantom AI Engine — Project Intelligence (auto-injected at session start)

**Project ID:** ${project_id}
**Graph:** ${file_count} files, ${edge_count} edges, ${module_count} external modules, ${layer2_count} AST nodes, ${coverage}% coverage

### Available Reasoning Strategies
${strategy_list:-"  (strategies loading...)"}

### Recent AI Decisions
${recent_decisions:-"  (no recent decisions)"}

### How To Use This Intelligence
You are connected to the Phantom AI Engine. It has already analyzed this codebase's
full dependency graph. Your prompts are automatically routed through the AI Engine's
orchestrator pipeline — you will receive strategy recommendations, blast radius
analysis, and context-aware file suggestions with every task.

**You do NOT need to call MCP tools manually.** The pipeline injects intelligence
automatically. However, for deep queries you can still use:
- \`mcp__phantom-ai__phantom_graph_context\` — detailed file dependencies
- \`mcp__phantom-ai__phantom_graph_blast_radius\` — what breaks if you change a file
- \`mcp__phantom-ai__phantom_orchestrator_process\` — full strategy pipeline for complex goals
</phantom-ai-engine>
EOF

  exit 0
}

# ---------------------------------------------------------------------------
# USER PROMPT — Route through orchestrator pipeline transparently
# ---------------------------------------------------------------------------
handle_user_prompt() {
  # Bail fast if server isn't running
  server_alive || exit 0

  local prompt
  prompt=$(echo "$INPUT" | jq -r '.prompt // empty')
  [ -z "$prompt" ] && exit 0

  # Skip short prompts (likely confirmations, yes/no, slash commands)
  local prompt_len=${#prompt}
  [ "$prompt_len" -lt 20 ] && exit 0

  # Skip slash commands
  [[ "$prompt" == /* ]] && exit 0

  local project_id
  project_id=$(detect_project) || exit 0
  [ -z "$project_id" ] && exit 0

  # Extract file references from the prompt for active files
  local active_files
  active_files=$(extract_file_refs "$prompt" | jq -R -s 'split("\n") | map(select(length > 0))') || active_files="[]"

  # Fallback: if no files in prompt, use recently modified files from git
  if [ "$active_files" = "[]" ] || [ "$active_files" = "[\"\"]" ]; then
    active_files=$(git diff --name-only HEAD 2>/dev/null | head -5 | \
      jq -R -s 'split("\n") | map(select(length > 0))') || active_files="[]"
  fi

  # Route through the orchestrator
  local orchestrator_result
  orchestrator_result=$(curl -sf --max-time "$TIMEOUT_MS" \
    -X POST "${PHANTOM_API}/orchestrator/process" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg pid "$project_id" \
      --arg goal "$prompt" \
      --argjson files "$active_files" \
      '{projectId: $pid, goal: $goal, activeFiles: $files}'
    )" 2>/dev/null) || exit 0

  # Parse the orchestrator response (field names match orchestrator.ts output)
  local strategy strategy_reason complexity risk confidence ambiguous
  strategy=$(echo "$orchestrator_result" | jq -r '.strategy.name // .strategy.id // "direct"')
  strategy_reason=$(echo "$orchestrator_result" | jq -r '.strategy.reason // ""')
  complexity=$(echo "$orchestrator_result" | jq -r '.taskContext.complexity // "unknown"')
  risk=$(echo "$orchestrator_result" | jq -r '.taskContext.risk // "unknown"')
  confidence=$(echo "$orchestrator_result" | jq -r '.output.confidence // .confidence // "unknown"')
  ambiguous=$(echo "$orchestrator_result" | jq -r '.taskContext.isAmbiguous // false')

  # Extract context files (top 10 by relevance)
  local context_files
  context_files=$(echo "$orchestrator_result" | jq -r '
    .context.files[:10] | map("  - \(.path) (relevance: \(.relevance // "?"))") | join("\n")
  ' 2>/dev/null) || context_files=""

  # Extract blast radius (actual shape: .context.blastRadius.direct[] is FileNode objects with .path)
  local blast_direct impact_score
  blast_direct=$(echo "$orchestrator_result" | jq -r '
    .context.blastRadius.direct // [] |
    map("  - \(.path // .)") | join("\n")
  ' 2>/dev/null) || blast_direct=""
  impact_score=$(echo "$orchestrator_result" | jq -r '.context.blastRadius.impactScore // "n/a"' 2>/dev/null) || impact_score="n/a"

  # Extract prior failures if any (guard every field against null)
  local prior_failures
  prior_failures=$(echo "$orchestrator_result" | jq -r '
    (.taskContext.signals.priorFailures // []) |
    map(select(.goal != null and .strategy != null)) |
    if length == 0 then empty else
      map("  - \((.goal // "") | .[0:60])... failed with \(.strategy // "unknown")") | join("\n")
    end
  ' 2>/dev/null) || prior_failures=""

  # Build the injection — only include sections that have data
  local output="<phantom-ai-pipeline>"
  output+=$'\n'"## AI Engine Analysis (auto-injected)"
  output+=$'\n'"**Strategy:** ${strategy} | **Complexity:** ${complexity} | **Risk:** ${risk} | **Confidence:** ${confidence}"
  if [ -n "$strategy_reason" ]; then
    output+=$'\n'"**Reasoning:** ${strategy_reason}"
  fi

  if [ "$ambiguous" = "true" ]; then
    output+=$'\n'"⚠️ **Ambiguous request detected** — consider clarifying the goal before proceeding."
  fi

  if [ -n "$context_files" ] && [ "$context_files" != "null" ]; then
    output+=$'\n'$'\n'"### Relevant Files"
    output+=$'\n'"${context_files}"
  fi

  if [ -n "$blast_direct" ] && [ "$blast_direct" != "null" ] && [ "$blast_direct" != "" ]; then
    output+=$'\n'$'\n'"### Blast Radius (impact: ${impact_score})"
    output+=$'\n'"Files that may be affected by changes:"
    output+=$'\n'"${blast_direct}"
  fi

  if [ -n "$prior_failures" ] && [ "$prior_failures" != "" ]; then
    output+=$'\n'$'\n'"### Prior Failures on Similar Goals"
    output+=$'\n'"${prior_failures}"
  fi

  output+=$'\n'"</phantom-ai-pipeline>"

  echo "$output"
  exit 0
}

# ---------------------------------------------------------------------------
# PRE TOOL USE — Inject blast radius before Edit/Write
# ---------------------------------------------------------------------------
handle_pre_tool_use() {
  # Only gate on Edit/Write
  local tool_name
  tool_name=$(echo "$INPUT" | jq -r '.tool_name // empty')

  case "$tool_name" in
    Edit|Write|MultiEdit) ;;
    *) exit 0 ;;
  esac

  # Extract file path
  local file_path
  file_path=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
  [ -z "$file_path" ] && exit 0

  # Skip non-project files
  [[ "$file_path" == *"node_modules"* ]] && exit 0
  [[ "$file_path" == *".claude/"* ]] && exit 0
  [[ "$file_path" == *".phantom-os/data"* ]] && exit 0
  [[ "$file_path" == *"/memory/"* ]] && exit 0

  # Bail if server isn't running
  server_alive || exit 0

  local project_id
  project_id=$(detect_project) || exit 0
  [ -z "$project_id" ] && exit 0

  # Get blast radius for this specific file
  local blast
  blast=$(curl -sf --max-time 3 \
    "${PHANTOM_API}/graph/${project_id}/blast-radius?file=$(echo "$file_path" | jq -Rr @uri)" \
    2>/dev/null) || exit 0

  local direct_count transitive_count impact
  direct_count=$(echo "$blast" | jq -r '(.direct // []) | length' 2>/dev/null) || direct_count=0
  transitive_count=$(echo "$blast" | jq -r '(.transitive // []) | length' 2>/dev/null) || transitive_count=0
  impact=$(echo "$blast" | jq -r '.impactScore // 0' 2>/dev/null) || impact=0

  # Only inject if there's meaningful blast radius
  [ "$direct_count" = "0" ] && [ "$transitive_count" = "0" ] && exit 0

  local affected_files
  affected_files=$(echo "$blast" | jq -r '
    .direct[:8] | map("  - \(if type == "object" then .path else . end)") | join("\n")
  ' 2>/dev/null) || affected_files=""

  cat <<EOF
<phantom-ai-blast-radius>
Editing **${file_path##*/}** — ${direct_count} direct + ${transitive_count} transitive dependents (impact: ${impact})
${affected_files}
</phantom-ai-blast-radius>
EOF

  exit 0
}

# ---------------------------------------------------------------------------
# Router — dispatch based on hook type
# ---------------------------------------------------------------------------
case "$HOOK_TYPE" in
  SessionStart)      handle_session_start ;;
  UserPromptSubmit)  handle_user_prompt ;;
  PreToolUse)        handle_pre_tool_use ;;
  *)
    # Fallback: try to detect from input shape
    if echo "$INPUT" | jq -e '.prompt' >/dev/null 2>&1; then
      handle_user_prompt
    elif echo "$INPUT" | jq -e '.tool_name' >/dev/null 2>&1; then
      handle_pre_tool_use
    else
      handle_session_start
    fi
    ;;
esac
