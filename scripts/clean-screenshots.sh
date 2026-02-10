#!/bin/bash
# clean-screenshots.sh
#
# Removes Playwright MCP screenshot artifacts from the repository root.
# Runs automatically as a pre-push hook via Husky.
#
# Targets:
#   - .playwright-mcp/ directory (MCP screenshot cache)
#   - Untracked *.png and *.jpeg files in the repo root
#
# Safety: git-tracked images are never deleted (checked via git ls-files).

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
count=0

# Remove .playwright-mcp directory
if [ -d "$REPO_ROOT/.playwright-mcp" ]; then
  rm -rf "$REPO_ROOT/.playwright-mcp"
  echo "Removed .playwright-mcp directory"
fi

# Remove untracked root-level .png and .jpeg files (Playwright MCP drops these)
for f in "$REPO_ROOT"/*.png "$REPO_ROOT"/*.jpeg; do
  [ -f "$f" ] || continue
  rel="${f#"$REPO_ROOT"/}"
  if git -C "$REPO_ROOT" ls-files --error-unmatch -- "$rel" >/dev/null 2>&1; then
    continue
  fi
  rm "$f"
  count=$((count + 1))
done

if [ "$count" -gt 0 ]; then
  echo "Cleaned $count screenshot(s) from repo root"
fi
