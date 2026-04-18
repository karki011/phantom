#!/usr/bin/env bash
# Retag and push: pushes main, deletes old tag, re-creates it on HEAD, pushes tag.
# Usage: bash scripts/retag-and-push.sh desktop-v1.0.1
set -euo pipefail

TAG="${1:?Usage: $0 <tag-name>}"

echo "Pushing main..."
git push origin main

echo "Deleting remote tag $TAG..."
git push origin ":refs/tags/$TAG" 2>/dev/null || true

echo "Deleting local tag $TAG..."
git tag -d "$TAG" 2>/dev/null || true

echo "Creating tag $TAG on HEAD..."
git tag "$TAG"

echo "Pushing tag $TAG..."
git push origin "$TAG"

echo "Done. Check: https://github.com/HMK-Solutions/Phantom-OS/actions"
