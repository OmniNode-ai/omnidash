#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
#
# Pre-commit hook: detect hardcoded numeric fallback patterns in staged files.
# Catches ternary expressions like `? 0.87 : 0.82` that should use
# registry-driven values instead of magic numbers.
#
# Suppress a specific line by adding `// fallback-ok` comment.
# [OMN-7479] [OMN-7436]

set -euo pipefail

# Only check staged TS/TSX/JS/JSX files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' || true)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Exclude test/mock/demo/fixture files
PROD_FILES=""
for f in $STAGED_FILES; do
  if echo "$f" | grep -qE '(__test__|\.test\.|\.spec\.|mock-data|seed-demo|/test/|/tests/|/fixtures/|/demo/|\.stories\.)'; then
    continue
  fi
  PROD_FILES="$PROD_FILES $f"
done

if [ -z "$PROD_FILES" ]; then
  exit 0
fi

# Check for ternary fallback pattern: ? 0.xx : 0.xx
VIOLATIONS=""
for f in $PROD_FILES; do
  HITS=$(grep -nE '\?\s*0\.\d+\s*:\s*0\.\d+' "$f" 2>/dev/null | grep -v 'fallback-ok' || true)
  if [ -n "$HITS" ]; then
    VIOLATIONS="$VIOLATIONS
$f:
$HITS"
  fi
done

if [ -n "$VIOLATIONS" ]; then
  echo "ERROR: Hardcoded numeric fallback values detected in staged files:"
  echo ""
  echo "$VIOLATIONS"
  echo ""
  echo "FIX: Use null/undefined instead of hardcoded values."
  echo "     Add \`// fallback-ok\` to suppress a specific line."
  exit 1
fi

exit 0
