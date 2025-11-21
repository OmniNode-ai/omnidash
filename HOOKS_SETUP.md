# Pre-commit Hooks Setup

This document details the automated quality gate system implemented for the OmniDash project.

## Overview

Pre-commit hooks have been configured using Husky and lint-staged to automatically enforce code quality and commit message standards.

## Installed Tools

### Dependencies

```json
{
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^16.2.6",
    "eslint": "^9.39.1",
    "@typescript-eslint/parser": "^8.47.0",
    "@typescript-eslint/eslint-plugin": "^8.47.0",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^5.2.0",
    "prettier": "^3.6.2",
    "@commitlint/cli": "^20.1.0",
    "@commitlint/config-conventional": "^20.0.0"
  }
}
```

## Hook Configuration

### 1. Pre-commit Hook (`.husky/pre-commit`)

Runs before each commit to lint and format staged files:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

### 2. Commit Message Hook (`.husky/commit-msg`)

Validates commit message format:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx --no -- commitlint --edit $1
```

## Lint-staged Configuration

Located in `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --max-warnings 10", "prettier --write"]
  }
}
```

**Actions performed on staged TypeScript/TSX files:**

1. Run ESLint with automatic fixes (allows up to 10 warnings)
2. Format code with Prettier

## ESLint Configuration

File: `.eslintrc.cjs`

**Key features:**

- TypeScript support with `@typescript-eslint`
- React 18 with hooks support
- Prettier integration to avoid conflicts
- Automatic React import detection
- Unused variable warnings (prefix with `_` to ignore)

**Rules:**

- Unused variables/arguments generate warnings (can be prefixed with `_`)
- Console statements warn except `console.warn` and `console.error`
- React prop-types disabled (using TypeScript)
- No React import required (React 18+)

## Prettier Configuration

File: `.prettierrc.json`

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

**Style enforced:**

- Single quotes
- Semicolons
- 100 character line width
- 2 space indentation
- ES5 trailing commas
- LF line endings

## Commitlint Configuration

File: `.commitlintrc.json`

**Enforces Conventional Commits format:**

```
<type>: <description>

[optional body]
[optional footer]
```

**Valid types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting changes
- `refactor` - Code refactoring
- `test` - Tests
- `chore` - Maintenance
- `perf` - Performance
- `ci` - CI/CD
- `build` - Build system
- `revert` - Revert commit

**Rules:**

- Subject cannot be empty
- Subject must be lowercase (no uppercase start)
- No period at end of subject
- Header max length: 100 characters

## Usage Examples

### Normal Workflow

1. Make changes to files
2. Stage files: `git add .`
3. Commit: `git commit -m "feat: add new feature"`
4. Pre-commit hook automatically runs:
   - Lints and fixes staged files
   - Formats code
5. Commit-msg hook validates message format
6. Commit succeeds if all checks pass

### Successful Commit Examples

```bash
# Feature addition
git commit -m "feat: add event correlation tracing"

# Bug fix
git commit -m "fix: resolve WebSocket reconnection issue"

# Documentation
git commit -m "docs: update API documentation"

# Test addition
git commit -m "test: add unit tests for EventFlow component"

# Refactoring
git commit -m "refactor: simplify event processing logic"
```

### Failed Commit Examples

```bash
# Invalid: Missing type
git commit -m "Added new feature"
# Error: type may not be empty

# Invalid: Uppercase subject
git commit -m "feat: Add new feature"
# Error: subject must not be uppercase

# Invalid: Period at end
git commit -m "feat: add new feature."
# Error: subject may not end with period
```

## Manual Commands

### Linting

```bash
# Check for issues
npm run lint

# Fix issues automatically
npm run lint:fix

# TypeScript type checking
npm run check
```

### Testing Hooks

```bash
# Test commitlint with message
echo "feat: test message" | npx commitlint

# Test lint-staged
npx lint-staged
```

### Bypassing Hooks (Emergency Only)

```bash
# Skip all hooks (USE SPARINGLY!)
git commit --no-verify -m "emergency fix"
```

**⚠️ Warning:** Only bypass hooks in true emergencies. Bypassing hooks can introduce code quality issues and inconsistent commit history.

## Troubleshooting

### Hook Not Running

If hooks don't run automatically:

1. Check hook files are executable:

   ```bash
   ls -la .husky/
   chmod +x .husky/pre-commit
   chmod +x .husky/commit-msg
   ```

2. Verify Husky initialization:

   ```bash
   npm run prepare
   ```

3. Check Git hooks path:
   ```bash
   git config core.hooksPath
   # Should show: .husky
   ```

### ESLint Errors

If ESLint fails:

1. Check ESLint config is valid:

   ```bash
   npx eslint --print-config client/src/App.tsx
   ```

2. Fix issues manually:

   ```bash
   npm run lint:fix
   ```

3. If too many warnings, increase threshold temporarily in `lint-staged` config

### Prettier Conflicts

If Prettier formatting conflicts with ESLint:

1. Ensure `eslint-config-prettier` is last in `.eslintrc.cjs` extends array
2. Run Prettier manually:
   ```bash
   npx prettier --write "**/*.{ts,tsx}"
   ```

### Commitlint Failures

If commit message validation fails:

1. Check message follows format: `<type>: <description>`
2. Verify type is in allowed list
3. Ensure subject is lowercase
4. Check no period at end

## Benefits

✅ **Consistent code style** - All code follows same formatting rules
✅ **Catch errors early** - Linting catches issues before they reach CI/CD
✅ **Clean git history** - Conventional commits provide searchable, organized history
✅ **Automated fixes** - Many issues auto-fixed without manual intervention
✅ **Team alignment** - Everyone follows same standards automatically

## Performance Impact

Typical pre-commit hook execution times:

- Small changes (1-5 files): 2-5 seconds
- Medium changes (5-20 files): 5-15 seconds
- Large changes (20+ files): 15-30 seconds

Only staged files are checked, so impact is minimal for focused commits.

## Integration with CI/CD

These local hooks complement CI/CD checks:

- **Local**: Fast feedback during development
- **CI/CD**: Final validation before merge

Both use the same configuration files for consistency.

## Maintenance

### Updating Dependencies

```bash
npm update husky lint-staged eslint prettier @commitlint/cli @commitlint/config-conventional
```

### Adding New Rules

1. **ESLint**: Edit `.eslintrc.cjs`
2. **Prettier**: Edit `.prettierrc.json`
3. **Commitlint**: Edit `.commitlintrc.json`
4. **lint-staged**: Edit `package.json` → `lint-staged` section

### Disabling Specific Rules

Add to `.eslintrc.cjs`:

```javascript
{
  "rules": {
    "rule-name": "off"
  }
}
```

## Resources

- [Husky Documentation](https://typicode.github.io/husky/)
- [lint-staged Documentation](https://github.com/okonet/lint-staged)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Prettier Options](https://prettier.io/docs/en/options.html)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Commitlint Reference](https://commitlint.js.org/)

## Summary

The pre-commit hook system provides automated quality gates that:

1. Format code consistently with Prettier
2. Lint code for issues with ESLint
3. Validate commit messages with Commitlint
4. Auto-fix many issues without manual intervention
5. Provide fast feedback during development

This ensures high code quality and consistent standards across the team.
