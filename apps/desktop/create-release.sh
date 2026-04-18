#!/usr/bin/env bash
# PhantomOS Desktop Release Script
# Author: Subash Karki
#
# Usage:
#   ./create-release.sh [--publish] [--merge]
#
# Creates a desktop release by:
#   1. Bumping version in package.json
#   2. Committing + pushing the version bump
#   3. Creating a desktop-v* tag to trigger the release workflow
#   4. Optionally monitoring the workflow run
#
# Flags:
#   --publish   Promote the draft release to published after workflow completes
#   --merge     Merge the version-bump branch into main (if on a branch)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PACKAGE_JSON="$SCRIPT_DIR/package.json"
TAG_PREFIX="desktop-v"
PRODUCT_NAME="PhantomOS"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

FLAG_PUBLISH=false
FLAG_MERGE=false

for arg in "$@"; do
  case "$arg" in
    --publish) FLAG_PUBLISH=true ;;
    --merge)   FLAG_MERGE=true ;;
    --help|-h)
      echo "Usage: $0 [--publish] [--merge]"
      echo ""
      echo "  --publish   Promote draft release to published after workflow completes"
      echo "  --merge     Merge version-bump branch into main"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown flag: $arg${RESET}"
      exit 1
      ;;
  esac
done

log()  { echo -e "${CYAN}[release]${RESET} $*"; }
ok()   { echo -e "${GREEN}[  ok  ]${RESET} $*"; }
warn() { echo -e "${YELLOW}[ warn ]${RESET} $*"; }
fail() { echo -e "${RED}[failed]${RESET} $*"; exit 1; }

# --- Prerequisites -----------------------------------------------------------

check_prerequisites() {
  log "Checking prerequisites..."

  command -v git >/dev/null 2>&1 || fail "git is not installed"
  command -v gh  >/dev/null 2>&1 || fail "gh CLI is not installed"
  command -v jq  >/dev/null 2>&1 || fail "jq is not installed"

  gh auth status >/dev/null 2>&1 || fail "gh is not authenticated. Run: gh auth login"

  cd "$REPO_ROOT"
  if [ -n "$(git status --porcelain)" ]; then
    fail "Working directory is not clean. Commit or stash changes first."
  fi

  ok "Prerequisites met"
}

# --- Version selection --------------------------------------------------------

get_current_version() {
  jq -r '.version' "$PACKAGE_JSON"
}

bump_version() {
  local current="$1" part="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$current"

  case "$part" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    patch) echo "$major.$minor.$((patch + 1))" ;;
    *)     echo "$part" ;;  # custom version passed directly
  esac
}

select_version() {
  local current
  current=$(get_current_version)
  log "Current version: ${BOLD}$current${RESET}"

  local v_patch v_minor v_major
  v_patch=$(bump_version "$current" patch)
  v_minor=$(bump_version "$current" minor)
  v_major=$(bump_version "$current" major)

  echo ""
  echo "  1) patch  → $v_patch"
  echo "  2) minor  → $v_minor"
  echo "  3) major  → $v_major"
  echo "  4) custom"
  echo ""
  read -rp "Select version bump [1]: " choice
  choice="${choice:-1}"

  case "$choice" in
    1) NEXT_VERSION="$v_patch" ;;
    2) NEXT_VERSION="$v_minor" ;;
    3) NEXT_VERSION="$v_major" ;;
    4)
      read -rp "Enter version (e.g. 2.0.0-beta.1): " custom
      [[ "$custom" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || fail "Invalid version format: $custom"
      NEXT_VERSION="$custom"
      ;;
    *) fail "Invalid choice: $choice" ;;
  esac

  TAG_NAME="${TAG_PREFIX}${NEXT_VERSION}"
  log "Next version: ${BOLD}$NEXT_VERSION${RESET} (tag: $TAG_NAME)"
}

# --- Handle existing tag/release --------------------------------------------

handle_existing_release() {
  cd "$REPO_ROOT"

  if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    warn "Tag $TAG_NAME already exists"
    read -rp "Delete existing tag and release? [y/N]: " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
      # Delete remote tag
      git push origin ":refs/tags/$TAG_NAME" 2>/dev/null || true
      # Delete local tag
      git tag -d "$TAG_NAME" 2>/dev/null || true
      # Delete GitHub release
      gh release delete "$TAG_NAME" --yes 2>/dev/null || true
      ok "Cleaned up existing tag/release"
    else
      fail "Aborted. Choose a different version."
    fi
  fi
}

# --- Update version ----------------------------------------------------------

update_version() {
  log "Updating package.json to $NEXT_VERSION..."

  cd "$SCRIPT_DIR"
  local tmp
  tmp=$(mktemp)
  jq --arg v "$NEXT_VERSION" '.version = $v' "$PACKAGE_JSON" > "$tmp"
  mv "$tmp" "$PACKAGE_JSON"

  ok "Version updated in package.json"
}

# --- Commit + push -----------------------------------------------------------

commit_and_push() {
  cd "$REPO_ROOT"
  local branch
  branch=$(git branch --show-current)

  git add apps/desktop/package.json
  git commit -m "release(desktop): $PRODUCT_NAME v$NEXT_VERSION"

  if [ "$branch" = "main" ]; then
    log "On main — pushing directly..."
    git push origin main
  else
    log "On branch $branch — pushing..."
    git push origin "$branch"
    warn "You are not on main. Consider creating a PR to merge this version bump."

    read -rp "Create a PR for this version bump? [Y/n]: " create_pr
    if [[ ! "$create_pr" =~ ^[Nn]$ ]]; then
      gh pr create \
        --title "release(desktop): $PRODUCT_NAME v$NEXT_VERSION" \
        --body "Version bump for $PRODUCT_NAME $NEXT_VERSION release." \
        --base main
      ok "PR created"
    fi
  fi

  ok "Changes pushed"
}

# --- Tag + trigger workflow --------------------------------------------------

create_tag() {
  cd "$REPO_ROOT"
  log "Creating tag $TAG_NAME..."
  git tag -a "$TAG_NAME" -m "$PRODUCT_NAME v$NEXT_VERSION"
  git push origin "$TAG_NAME"
  ok "Tag $TAG_NAME pushed — release workflow triggered"
}

# --- Monitor workflow --------------------------------------------------------

monitor_workflow() {
  log "Waiting for workflow to start..."
  sleep 5

  local run_id
  run_id=$(gh run list --workflow=release-desktop.yml --limit=1 --json databaseId --jq '.[0].databaseId')

  if [ -z "$run_id" ]; then
    warn "Could not find workflow run. Check GitHub Actions manually."
    return
  fi

  log "Monitoring workflow run $run_id..."
  echo ""
  gh run watch "$run_id" --exit-status || {
    fail "Workflow failed. Check: gh run view $run_id --web"
  }

  ok "Workflow completed successfully"
}

# --- Post-release actions ----------------------------------------------------

publish_release() {
  if $FLAG_PUBLISH; then
    log "Promoting draft release to published..."
    gh release edit "$TAG_NAME" --draft=false
    ok "Release $TAG_NAME published"
  else
    log "Release is a draft. Promote with: gh release edit $TAG_NAME --draft=false"
  fi
}

merge_branch() {
  if $FLAG_MERGE; then
    local branch
    branch=$(git branch --show-current)
    if [ "$branch" != "main" ]; then
      log "Merging $branch into main..."
      git checkout main
      git pull origin main
      git merge "$branch"
      git push origin main
      ok "Merged $branch into main"
    fi
  fi
}

# --- Main --------------------------------------------------------------------

main() {
  echo ""
  echo -e "${BOLD}$PRODUCT_NAME Desktop Release${RESET}"
  echo "─────────────────────────────────"
  echo ""

  check_prerequisites
  select_version
  handle_existing_release
  update_version
  commit_and_push
  create_tag
  monitor_workflow
  publish_release
  merge_branch

  echo ""
  echo -e "${GREEN}${BOLD}Release $TAG_NAME complete.${RESET}"
  echo ""
  echo "  Release URL: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/$TAG_NAME"
  echo ""
}

main
