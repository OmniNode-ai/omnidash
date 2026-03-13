#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT

# Validate SPDX headers on Python files in this repository.
# Checks that all .py files in scripts/ and tests/ have the required
# SPDX-FileCopyrightText and SPDX-License-Identifier lines.
#
# Usage:
#   ./scripts/validate_spdx_headers.sh [file1 file2 ...]
#   If no files given, scans scripts/ and tests/ for .py files.

set -euo pipefail

FAILED=0
FILES=()

if [ $# -gt 0 ]; then
    FILES=("$@")
else
    while IFS= read -r -d '' f; do
        FILES+=("$f")
    done < <(find scripts/ tests/ -name "*.py" -print0 2>/dev/null || true)
fi

for f in "${FILES[@]}"; do
    # Skip non-Python files if passed via pre-commit
    [[ "$f" == *.py ]] || continue
    # Skip archived directories
    [[ "$f" == archived/* || "$f" == archive/* ]] && continue

    # Check first 10 lines for SPDX markers
    HEAD=$(head -10 "$f" 2>/dev/null || true)
    if ! echo "$HEAD" | grep -q "SPDX-FileCopyrightText"; then
        echo "MISSING SPDX header: $f"
        FAILED=1
    fi
    if ! echo "$HEAD" | grep -q "SPDX-License-Identifier"; then
        echo "MISSING SPDX license: $f"
        FAILED=1
    fi
done

if [ "$FAILED" -eq 1 ]; then
    echo ""
    echo "FIX: Add these lines to the top of each file (after shebang if present):"
    echo "  # SPDX-FileCopyrightText: 2025 OmniNode.ai Inc."
    echo "  # SPDX-License-Identifier: MIT"
    exit 1
fi

exit 0
