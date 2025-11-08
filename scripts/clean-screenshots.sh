#!/bin/bash
# Clean all Playwright screenshots

echo "🧹 Cleaning Playwright screenshots..."

# Remove .playwright-mcp directory
if [ -d ".playwright-mcp" ]; then
  rm -rf .playwright-mcp
  echo "✅ Removed .playwright-mcp directory"
fi

# Remove loose screenshot files
find . -name "page-*.png" -type f -delete
find . -name "*-screenshot.png" -type f -delete
find . -name "*.jpeg" -path "./.playwright-mcp/*" -delete

echo "✅ Screenshot cleanup complete!"
