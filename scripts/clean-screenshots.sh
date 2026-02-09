#!/bin/bash
# Clean all Playwright screenshots from repo root and .playwright-mcp/

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
count=0

# Remove .playwright-mcp directory
if [ -d "$REPO_ROOT/.playwright-mcp" ]; then
  rm -rf "$REPO_ROOT/.playwright-mcp"
  echo "Removed .playwright-mcp directory"
fi

# Remove all root-level .png and .jpeg files (Playwright MCP drops these)
for f in "$REPO_ROOT"/*.png "$REPO_ROOT"/*.jpeg; do
  [ -f "$f" ] || continue
  rm "$f"
  count=$((count + 1))
done

if [ "$count" -gt 0 ]; then
  echo "Cleaned $count screenshot(s) from repo root"
fi
