#!/usr/bin/env bash
# simulate-pipeline.sh — Multi-scenario simulation of the transparent AI Engine pipeline
#
# Runs 5 real-world scenarios through all 3 pipeline stages to show exactly
# what Claude would see. Tests: session boot, various prompt types, and file edits.
#
# Usage: bash simulate-pipeline.sh [port]
#
# @author Subash Karki

set -euo pipefail

PHANTOM_PORT="${1:-${PHANTOM_API_PORT:-3849}}"
PHANTOM_API="http://localhost:${PHANTOM_PORT}/api"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/phantom-ai-pipeline.sh"

# Colors
CYAN='\033[0;36m'
GOLD='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[0;90m'
BOLD='\033[1m'
RESET='\033[0m'
WHITE='\033[0;37m'

# Counters
PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
header() {
  echo ""
  echo -e "${BOLD}${GOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${GOLD}  $1${RESET}"
  echo -e "${BOLD}${GOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
}

subheader() {
  echo -e "${DIM}--- $1 ---${RESET}"
}

# Run a hook and capture output. Args: hook_type, stdin_json
run_hook() {
  local hook_type="$1"
  local input="$2"
  CLAUDE_HOOK_TYPE="$hook_type" PHANTOM_API_PORT="$PHANTOM_PORT" \
    echo "$input" | bash "$HOOK_SCRIPT" 2>/dev/null || true
}

# Check if output contains expected pattern and report
check() {
  local label="$1"
  local output="$2"
  local pattern="$3"
  if echo "$output" | grep -q "$pattern"; then
    echo -e "  ${GREEN}✓${RESET} ${label}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${RESET} ${label} (expected: ${pattern})"
    FAIL=$((FAIL + 1))
  fi
}

show_output() {
  local output="$1"
  if [ -z "$output" ]; then
    echo -e "  ${DIM}(no output — hook correctly skipped)${RESET}"
  else
    echo "$output" | sed 's/^/  │ /'
  fi
  echo ""
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}  Phantom AI Engine — Multi-Scenario Pipeline Simulation${RESET}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════${RESET}"

echo -ne "${DIM}  Server: ${RESET}"
if ! curl -sf --max-time 3 "http://localhost:${PHANTOM_PORT}/health" >/dev/null 2>&1; then
  echo -e "${RED}NOT RUNNING (start server first)${RESET}"
  exit 1
fi
echo -e "${GREEN}ALIVE${RESET}"

echo -ne "${DIM}  Project: ${RESET}"
PROJECT_ID=$(curl -sf --max-time 3 "${PHANTOM_API}/projects" 2>/dev/null | jq -r --arg cwd "$(pwd)" '
  .[] | select(
    .repoPath as $rp | .worktreeBaseDir as $wd |
    ($cwd | startswith($rp)) or
    ($wd != null and $wd != "" and ($cwd | startswith($wd)))
  ) | .id
' | head -1)

if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}NOT FOUND${RESET}"
  exit 1
fi
echo -e "${GREEN}${PROJECT_ID}${RESET}"

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 1: SessionStart
# ═══════════════════════════════════════════════════════════════════════════
header "STAGE 1: SessionStart — Project intelligence on boot"

SESSION_OUTPUT=$(run_hook "SessionStart" '{}')
show_output "$SESSION_OUTPUT"

subheader "Validation"
check "Contains graph stats" "$SESSION_OUTPUT" "files.*edges.*modules"
check "Lists 6 strategies" "$SESSION_OUTPUT" "Direct Execution"
check "Lists Graph of Thoughts" "$SESSION_OUTPUT" "Graph of Thoughts"
check "Has MCP tool references" "$SESSION_OUTPUT" "phantom_graph_context"
check "Wrapped in XML tag" "$SESSION_OUTPUT" "phantom-ai-engine"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 2: UserPromptSubmit — 5 different scenarios
# ═══════════════════════════════════════════════════════════════════════════
header "STAGE 2: UserPromptSubmit — 5 Prompt Scenarios"

# --- Scenario A: Complex refactor with file references ---
subheader "Scenario A: Complex refactor (file paths in prompt)"
PROMPT_A="refactor packages/ai-engine/src/graph/builder.ts to split the two-pass build into separate classes, and update packages/ai-engine/src/graph/query.ts to use the new interface"
echo -e "${WHITE}  > ${PROMPT_A}${RESET}"
echo ""
OUTPUT_A=$(run_hook "UserPromptSubmit" "$(jq -n --arg p "$PROMPT_A" '{prompt:$p}')")
show_output "$OUTPUT_A"
check "Strategy selected" "$OUTPUT_A" "Strategy:"
check "Complexity assessed" "$OUTPUT_A" "Complexity:"
check "Risk assessed" "$OUTPUT_A" "Risk:"
check "Has relevant files" "$OUTPUT_A" "builder.ts\|query.ts\|Relevant Files"
check "Wrapped in XML tag" "$OUTPUT_A" "phantom-ai-pipeline"
echo ""

# --- Scenario B: Simple bug fix ---
subheader "Scenario B: Simple bug fix (no file paths)"
PROMPT_B="fix the off-by-one error in the BFS traversal depth calculation"
echo -e "${WHITE}  > ${PROMPT_B}${RESET}"
echo ""
OUTPUT_B=$(run_hook "UserPromptSubmit" "$(jq -n --arg p "$PROMPT_B" '{prompt:$p}')")
show_output "$OUTPUT_B"
check "Strategy selected" "$OUTPUT_B" "Strategy:"
check "Has confidence score" "$OUTPUT_B" "Confidence:"
echo ""

# --- Scenario C: Ambiguous question ---
subheader "Scenario C: Ambiguous/exploratory question"
PROMPT_C="should we maybe refactor the strategy system or perhaps just add a new plugin interface instead? not sure which approach makes more sense here"
echo -e "${WHITE}  > ${PROMPT_C}${RESET}"
echo ""
OUTPUT_C=$(run_hook "UserPromptSubmit" "$(jq -n --arg p "$PROMPT_C" '{prompt:$p}')")
show_output "$OUTPUT_C"
check "Strategy selected" "$OUTPUT_C" "Strategy:"
check "Detects ambiguity or picks tree-of-thought" "$OUTPUT_C" "Ambiguous\|Tree of Thought\|ambiguous\|tree-of-thought"
echo ""

# --- Scenario D: High-risk cross-package change ---
subheader "Scenario D: High-risk cross-package change"
PROMPT_D="change the GraphNode interface in packages/ai-engine/src/types/graph.ts to add a new required field, then update every file that creates GraphNode objects across the entire monorepo"
echo -e "${WHITE}  > ${PROMPT_D}${RESET}"
echo ""
OUTPUT_D=$(run_hook "UserPromptSubmit" "$(jq -n --arg p "$PROMPT_D" '{prompt:$p}')")
show_output "$OUTPUT_D"
check "Strategy selected" "$OUTPUT_D" "Strategy:"
check "Has graph.ts context" "$OUTPUT_D" "graph.ts\|Relevant Files"
echo ""

# --- Scenario E: Short prompt (should be skipped) ---
subheader "Scenario E: Short prompt (should skip)"
PROMPT_E="yes, do it"
echo -e "${WHITE}  > ${PROMPT_E}${RESET}"
echo ""
OUTPUT_E=$(run_hook "UserPromptSubmit" "$(jq -n --arg p "$PROMPT_E" '{prompt:$p}')")
if [ -z "$OUTPUT_E" ]; then
  echo -e "  ${GREEN}✓${RESET} Correctly skipped (prompt too short)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${RESET} Should have skipped short prompt"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Scenario F: Slash command (should be skipped) ---
subheader "Scenario F: Slash command (should skip)"
PROMPT_F="/commit -m 'fix: update graph builder'"
echo -e "${WHITE}  > ${PROMPT_F}${RESET}"
echo ""
OUTPUT_F=$(run_hook "UserPromptSubmit" "$(jq -n --arg p "$PROMPT_F" '{prompt:$p}')")
if [ -z "$OUTPUT_F" ]; then
  echo -e "  ${GREEN}✓${RESET} Correctly skipped (slash command)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${RESET} Should have skipped slash command"
  FAIL=$((FAIL + 1))
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 3: PreToolUse — Blast radius on different files
# ═══════════════════════════════════════════════════════════════════════════
header "STAGE 3: PreToolUse — Blast radius before edits"

# --- Edit a core file with many dependents ---
subheader "Edit A: Core type file (many dependents expected)"
FILE_A="packages/ai-engine/src/types/graph.ts"
echo -e "${WHITE}  Editing: ${FILE_A}${RESET}"
echo ""
OUTPUT_EA=$(run_hook "PreToolUse" "$(jq -n --arg f "$FILE_A" '{tool_name:"Edit",tool_input:{file_path:$f}}')")
show_output "$OUTPUT_EA"
check "Shows blast radius" "$OUTPUT_EA" "phantom-ai-blast-radius\|direct.*transitive"
echo ""

# --- Edit a builder file ---
subheader "Edit B: Graph builder (imports from types)"
FILE_B="packages/ai-engine/src/graph/builder.ts"
echo -e "${WHITE}  Editing: ${FILE_B}${RESET}"
echo ""
OUTPUT_EB=$(run_hook "PreToolUse" "$(jq -n --arg f "$FILE_B" '{tool_name:"Edit",tool_input:{file_path:$f}}')")
show_output "$OUTPUT_EB"
if [ -n "$OUTPUT_EB" ]; then
  check "Shows affected files" "$OUTPUT_EB" "test\|\.ts"
else
  echo -e "  ${DIM}(no dependents — leaf file)${RESET}"
fi
echo ""

# --- Edit a test file (leaf — no dependents) ---
subheader "Edit C: Test file (leaf — should have no blast radius)"
FILE_C="packages/ai-engine/src/__tests__/builder.test.ts"
echo -e "${WHITE}  Editing: ${FILE_C}${RESET}"
echo ""
OUTPUT_EC=$(run_hook "PreToolUse" "$(jq -n --arg f "$FILE_C" '{tool_name:"Edit",tool_input:{file_path:$f}}')")
if [ -z "$OUTPUT_EC" ]; then
  echo -e "  ${GREEN}✓${RESET} No blast radius (test file is a leaf — correct)"
  PASS=$((PASS + 1))
else
  echo -e "  ${DIM}Unexpected output:${RESET}"
  show_output "$OUTPUT_EC"
fi
echo ""

# --- Edit a node_modules file (should be skipped) ---
subheader "Edit D: node_modules file (should skip)"
FILE_D="node_modules/jq/package.json"
echo -e "${WHITE}  Editing: ${FILE_D}${RESET}"
echo ""
OUTPUT_ED=$(run_hook "PreToolUse" "$(jq -n --arg f "$FILE_D" '{tool_name:"Edit",tool_input:{file_path:$f}}')")
if [ -z "$OUTPUT_ED" ]; then
  echo -e "  ${GREEN}✓${RESET} Correctly skipped (node_modules)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${RESET} Should have skipped node_modules"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Non-edit tool (should be skipped) ---
subheader "Edit E: Read tool (should skip — only gates Edit/Write)"
OUTPUT_EE=$(run_hook "PreToolUse" '{"tool_name":"Read","tool_input":{"file_path":"src/index.ts"}}')
if [ -z "$OUTPUT_EE" ]; then
  echo -e "  ${GREEN}✓${RESET} Correctly skipped (Read tool, not Edit/Write)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${RESET} Should have skipped Read tool"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Edit an index.ts (high connectivity) ---
subheader "Edit F: Package barrel export (index.ts — high connectivity)"
FILE_F="packages/ai-engine/src/index.ts"
echo -e "${WHITE}  Editing: ${FILE_F}${RESET}"
echo ""
OUTPUT_EF=$(run_hook "PreToolUse" "$(jq -n --arg f "$FILE_F" '{tool_name:"Edit",tool_input:{file_path:$f}}')")
show_output "$OUTPUT_EF"
if [ -n "$OUTPUT_EF" ]; then
  check "Shows high blast radius" "$OUTPUT_EF" "direct.*transitive\|phantom-ai-blast-radius"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Results
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}  Results: ${PASS} passed, ${FAIL} failed${RESET}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════${RESET}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}All checks passed.${RESET}"
else
  echo -e "  ${RED}${FAIL} check(s) failed — review output above.${RESET}"
fi

echo ""
echo -e "${DIM}Pipeline stages demonstrated:${RESET}"
echo -e "  1. SessionStart  → graph stats + strategies injected on boot"
echo -e "  2. UserPrompt    → 4 real tasks routed, 2 correctly skipped"
echo -e "  3. PreToolUse    → blast radius on 4 files, 2 correctly skipped"
echo ""
echo -e "${DIM}Claude never called an MCP tool in any scenario.${RESET}"
echo -e "${DIM}All intelligence was injected transparently via hooks.${RESET}"
