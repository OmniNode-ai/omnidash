# Clickable UI Patterns Audit & Design System Specification

**Date**: 2025-11-06
**Status**: Audit Complete - Ready for Implementation

---

## Executive Summary

Users report unclear clickable affordances in the Omnidash dashboard. This audit identifies **significant inconsistencies** across 100+ interactive elements and proposes a unified interaction design system based on the existing Carbon Design System principles.

**Key Findings**:
- ✅ **Good Foundation**: Custom elevation system (`hover-elevate`, `active-elevate-2`) is well-designed
- ✅ **Utilities Exist**: `interactive-classes.ts` provides reusable patterns (currently unused)
- ❌ **Inconsistent Application**: 6+ different hover patterns in use across codebase
- ❌ **Missing Affordances**: Many clickable elements lack visual indicators

---

## Current State Analysis

### 1. Existing Infrastructure (Well-Designed)

#### A. Custom Elevation System (`client/src/index.css`)

**Location**: Lines 247-392

```css
/* CSS Custom Properties */
:root {
  --elevate-1: rgba(0,0,0, .03);  /* Subtle hover */
  --elevate-2: rgba(0,0,0, .08);  /* Strong active */
}

.dark {
  --elevate-1: rgba(255,255,255, .04);
  --elevate-2: rgba(255,255,255, .09);
}

/* Utility Classes */
.hover-elevate:hover::after {
  background-color: var(--elevate-1);
}

.active-elevate-2:active::after {
  background-color: var(--elevate-2);
}
```

**Strengths**:
- Automatic theme adjustment (light/dark)
- Compound effects (works with borders, backgrounds)
- Optimized for data-dense UIs

#### B. Interactive Utilities (`client/src/lib/utils/interactive-classes.ts`)

**Status**: ✅ Created, ❌ Not Yet Used

**Available Exports**:
- `clickableCardClasses` - Card hover effects
- `clickableRowClasses` - Table row hover effects
- `clickableListItemClasses` - List item hover effects
- `interactiveClasses()` - Utility function
- `createKeyboardHandler()` - Accessibility helper
- `getInteractiveAriaProps()` - ARIA attribute helper

**Example Pattern**:
```typescript
export const clickableCardClasses = cn(
  "cursor-pointer transition-all duration-200",
  "hover:shadow-lg hover:border-primary/50 hover:-translate-y-0.5",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  "active:scale-[0.98]"
);
```

#### C. Global Cursor Affordances (`client/src/index.css`)

**Location**: Lines 295-307

```css
/* Already applies cursor-pointer to common interactive elements */
[role="button"],
button:not(:disabled),
a[href],
[onclick],
.clickable {
  cursor: pointer;
}
```

### 2. Inconsistencies Found

#### A. Multiple Hover Shadow Patterns

| Pattern | Usage Count | Example Files |
|---------|-------------|---------------|
| `hover:shadow-md` | ~15 | AgentRegistry.tsx, ContractBuilder.tsx |
| `hover:shadow-lg` | ~3 | PatternLineage.tsx (multiple instances) |
| `hover:shadow-xl` | ~6 | PatternLineage.tsx |
| `hover-elevate` | ~4 | TopPatternsList.tsx, AgentStatusGrid.tsx |
| No hover effect | ~20+ | MetricCard.tsx, Various modals |

**Example Inconsistency**:

```tsx
// AgentRegistry.tsx:361
<Card className="cursor-pointer hover:shadow-md transition-all" />

// AgentRegistry.tsx:422
<Card className="cursor-pointer hover:shadow-md transition-shadow" />

// AgentRegistry.tsx:598
<Card className="cursor-pointer hover:shadow-md transition-shadow" />
```

Three cards in the same file with different transition patterns!

#### B. Multiple Hover Background Patterns

| Pattern | Usage Count | Example Files |
|---------|-------------|---------------|
| `hover:bg-muted/50` | ~12 | DataTable.tsx, IntelligenceAnalytics.tsx |
| `hover:bg-accent` | ~5 | AgentRegistry.tsx |
| `hover:bg-accent/50` | ~3 | Various |
| `hover:bg-accent/70` | ~2 | interactive-classes.ts (unused) |
| `hover:bg-accent/80` | ~1 | interactive-classes.ts (unused) |

#### C. Transition Duration Inconsistencies

| Duration | Usage Count | Files |
|----------|-------------|-------|
| No duration specified | ~30+ | Various |
| `duration-150` | ~8 | interactive-classes.ts |
| `duration-200` | ~15 | AgentStatusGrid.tsx, AlertPill.tsx |
| `duration-300` | ~2 | App.tsx |
| `duration-500` | ~1 | PatternLearning.tsx |

#### D. Missing Cursor Indicators

**Files with onClick but no cursor-pointer**:

1. **RoutingDecisionDetailModal.tsx**:
   - Line 64: Button with onClick (shadcn Button handles this)
   - Line 237-240: Button variant="outline" (handled by Button component)

2. **Multiple Modal Components**:
   - Most modals rely on Button component to handle cursor
   - No issues here - buttons handle this correctly

3. **MetricCard.tsx**:
   - No onClick handler defined
   - Card is NOT clickable (correct - no issue)

**Files with clickable divs/cards missing affordances**:
- Most are handled via `cursor-pointer` class
- Some rely on global `[onclick]` selector

#### E. Focus State Inconsistencies

**Good Examples** (from interactive-classes.ts):
```typescript
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
```

**Inconsistent Application**:
- Only applied in Button component and interactive-classes.ts
- Not consistently applied to clickable cards/rows
- Global CSS has some focus states (lines 310-316) but incomplete

### 3. Component-Specific Patterns

#### A. Well-Implemented Components

**AgentStatusGrid.tsx** (Lines 100-111):
```tsx
<Card
  className={cn(
    "hover-elevate active-elevate-2 cursor-pointer transition-all",
    "border border-border/80"
  )}
  onClick={() => onAgentClick?.(agent)}
/>
```
✅ Uses elevation system
✅ Has cursor-pointer
✅ Has onClick handler
✅ Consistent pattern

**TopPatternsList.tsx** (Line 40):
```tsx
<div className="hover-elevate active-elevate-2 cursor-pointer" />
```
✅ Uses elevation system
✅ Has cursor-pointer

#### B. Inconsistently Implemented Components

**AgentRegistry.tsx** - Three different patterns in one file:

```tsx
// Line 361
className="cursor-pointer hover:shadow-md transition-all"

// Line 422
className="cursor-pointer hover:shadow-md transition-shadow"

// Line 500
className="hover:bg-accent cursor-pointer transition-colors"

// Line 598
className="cursor-pointer hover:shadow-md transition-shadow"
```

**PatternLineage.tsx** - Multiple shadow variations:
```tsx
// Line 469
className="cursor-pointer hover:shadow-xl transition-shadow"

// Lines 484, 498, 513, 527, 541
// All use hover:shadow-xl but with different border colors
```

#### C. Components Using Inline Tailwind (Not Reusable)

**IntelligenceAnalytics.tsx** (Line 373):
```tsx
className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
```

**AgentManagement.tsx** (Line 332):
```tsx
className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
```

Both use same pattern but defined inline - not reusable.

#### D. DataTable Component

**DataTable.tsx** (Line 199):
```tsx
column.sortable && "cursor-pointer select-none hover:bg-muted/50"
```

✅ Correctly applies cursor only when sortable
✅ Uses consistent hover pattern
❌ Should use predefined utility class

---

## Proposed Design System

### 1. Core Principles

Based on Carbon Design System and existing Omnidash patterns:

1. **Clarity Over Subtlety**: Users should immediately recognize clickable elements
2. **Consistency**: Same element types use same hover/active states
3. **Layered Feedback**: Cursor → Hover → Focus → Active
4. **Performance**: Smooth transitions (200ms standard)
5. **Accessibility**: All interactive elements keyboard-navigable

### 2. Standard Interaction Patterns

#### A. Cards (Primary Interactive Surface)

**Use Case**: Agent cards, pattern cards, metric cards with drill-down

**Pattern**: Elevation + Border Glow + Subtle Lift
```tsx
className={cn(
  "cursor-pointer",
  "hover-elevate active-elevate-2",
  "hover:border-primary/50 hover:-translate-y-0.5",
  "transition-all duration-200",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
)}
```

**Visual Result**:
- Resting: Normal card appearance
- Hover: Subtle elevation overlay + border glows blue + lifts 2px
- Active: Stronger elevation overlay + scales slightly down
- Focus: Blue ring around card (keyboard navigation)

**When to Use**:
- Agent status cards
- Pattern list items
- Routing decision cards
- Any card representing a discrete entity that opens a modal/navigates

#### B. Table Rows (Dense Data Display)

**Use Case**: DataTable rows, log entries, list items

**Pattern**: Background Change Only
```tsx
className={cn(
  "cursor-pointer",
  "hover:bg-accent/50",
  "transition-colors duration-150",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
)}
```

**Visual Result**:
- Resting: Transparent background
- Hover: Subtle accent background
- Active: Slightly darker accent
- Focus: Inset ring (doesn't disrupt table alignment)

**When to Use**:
- DataTable rows
- Event feed items
- Log entries
- Any dense list where elevation would be visually noisy

#### C. List Items (Navigation/Selection)

**Use Case**: Dropdown items, sidebar items, filter chips

**Pattern**: Background + Text Color Change
```tsx
className={cn(
  "cursor-pointer",
  "hover:bg-accent/80 hover:text-accent-foreground",
  "transition-colors duration-150",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
)}
```

**When to Use**:
- Dropdown menu items
- Sidebar navigation items
- Filter pills/chips
- Any item in a selection list

#### D. Subtle Interactive Elements

**Use Case**: Icons, badges, small inline actions

**Pattern**: Opacity Change Only
```tsx
className={cn(
  "cursor-pointer",
  "hover:opacity-80",
  "transition-opacity duration-150",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
)}
```

**When to Use**:
- Icon buttons (without Button component)
- Inline badges that trigger actions
- Small decorative interactive elements

### 3. Accessibility Requirements

All interactive elements MUST include:

1. **Cursor Affordance**: `cursor-pointer` (or handled by global CSS)
2. **Keyboard Navigation**: `tabIndex={0}` (unless using semantic elements)
3. **Focus Indicator**: `focus-visible:ring-2 ring-primary`
4. **ARIA Attributes**: role, aria-label, aria-disabled as needed
5. **Keyboard Handlers**: Enter/Space key support for non-button elements

**Helper Function** (from interactive-classes.ts):
```typescript
import { createKeyboardHandler, getInteractiveAriaProps } from "@/lib/utils/interactive-classes";

<div
  onClick={handleClick}
  onKeyDown={createKeyboardHandler(handleClick)}
  {...getInteractiveAriaProps({ role: "button" })}
  className={clickableCardClasses}
>
  Content
</div>
```

---

## Implementation Plan

### Phase 1: Global Utility Classes (Immediate)

Add to `client/src/index.css` in the `@layer utilities` section:

```css
@layer utilities {
  /* Existing typography utilities... */

  /* === Clickable Card Pattern === */
  .clickable-card {
    @apply cursor-pointer;
    @apply hover-elevate active-elevate-2;
    @apply hover:border-primary/50 hover:-translate-y-0.5;
    @apply transition-all duration-200;
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2;
  }

  /* === Clickable Row Pattern === */
  .clickable-row {
    @apply cursor-pointer;
    @apply hover:bg-accent/50;
    @apply transition-colors duration-150;
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset;
  }

  /* === Clickable List Item Pattern === */
  .clickable-list-item {
    @apply cursor-pointer;
    @apply hover:bg-accent/80 hover:text-accent-foreground;
    @apply transition-colors duration-150;
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary;
  }

  /* === Subtle Interactive Pattern === */
  .clickable-subtle {
    @apply cursor-pointer;
    @apply hover:opacity-80;
    @apply transition-opacity duration-150;
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary;
  }

  /* === Disabled State Override === */
  .clickable-disabled {
    @apply opacity-50 cursor-not-allowed;
    @apply hover:shadow-none hover:translate-y-0 hover:border-card-border hover:bg-transparent hover:opacity-50;
  }
}
```

### Phase 2: Component Refactoring (Parallel)

Update components to use new utilities:

#### High Priority Files (Most Inconsistencies)
1. **AgentRegistry.tsx** - 4 different patterns → use `clickable-card`
2. **PatternLineage.tsx** - Multiple shadow variations → use `clickable-card`
3. **IntelligenceAnalytics.tsx** - Inline classes → use `clickable-row`
4. **AgentManagement.tsx** - Inline classes → use `clickable-row`
5. **ContractBuilder.tsx** - Mixed patterns → use `clickable-card`

#### Medium Priority (Good Patterns, Just Need Standardization)
1. **AgentStatusGrid.tsx** - Already uses elevation, just needs focus states
2. **TopPatternsList.tsx** - Already uses elevation, just needs focus states
3. **DataTable.tsx** - Replace inline hover with `clickable-row`

#### Example Refactor

**Before**:
```tsx
<Card
  className="cursor-pointer hover:shadow-md transition-shadow"
  onClick={handleClick}
>
```

**After**:
```tsx
<Card
  className="clickable-card"
  onClick={handleClick}
>
```

Or with additional classes:
```tsx
<Card
  className={cn("clickable-card", "p-6", customClass)}
  onClick={handleClick}
>
```

### Phase 3: Testing & Validation

**Checklist for Each Interactive Element**:

- [ ] Has `cursor-pointer` (or utility class with it)
- [ ] Has consistent hover state (via utility class)
- [ ] Has focus-visible ring for keyboard navigation
- [ ] Has active state feedback
- [ ] Transition is smooth (200ms for cards, 150ms for rows)
- [ ] Works in both light and dark themes
- [ ] Keyboard accessible (tabIndex, Enter/Space handlers)
- [ ] Has appropriate ARIA attributes

**Testing Script** (run in browser console):
```javascript
// Find all clickable elements without cursor-pointer
document.querySelectorAll('[onclick], [role="button"]').forEach(el => {
  const style = window.getComputedStyle(el);
  if (style.cursor !== 'pointer') {
    console.warn('Missing cursor-pointer:', el);
  }
});
```

---

## Visual Reference Guide

### Before & After Examples

#### Example 1: Agent Card

**Before** (AgentRegistry.tsx:361):
```tsx
<Card className="cursor-pointer hover:shadow-md transition-all" />
```

**Visual Issues**:
- Shadow transition is abrupt
- No focus indicator for keyboard users
- Inconsistent with other cards in same file

**After**:
```tsx
<Card className="clickable-card" />
```

**Visual Improvements**:
- Consistent elevation overlay (matches AgentStatusGrid)
- Border glow on hover
- Focus ring for accessibility
- Subtle lift animation

#### Example 2: Table Row

**Before** (IntelligenceAnalytics.tsx:373):
```tsx
<div className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors" />
```

**Visual Issues**:
- Long inline class list (not reusable)
- Missing focus indicator
- Inconsistent with DataTable rows

**After**:
```tsx
<div className="clickable-row p-4 border rounded-lg" />
```

**Visual Improvements**:
- Reusable utility class
- Consistent with other table patterns
- Includes focus indicator

### Color Reference (Already in Design System)

```css
/* From client/src/index.css - Light Mode */
--primary: 211 92% 42%;              /* Blue - hover borders, focus rings */
--accent: 210 12% 88%;               /* Light gray - row hover backgrounds */
--muted: 210 8% 90%;                 /* Lighter gray - subtle backgrounds */

/* Dark Mode */
--primary: 211 88% 48%;              /* Brighter blue */
--accent: 210 12% 18%;               /* Dark gray */
--muted: 210 8% 18%;                 /* Darker gray */
```

---

## Carbon Design System Alignment

This proposal aligns with IBM Carbon Design System principles already in use:

| Carbon Principle | Omnidash Implementation |
|------------------|-------------------------|
| **Productive** | Fast transitions (150-200ms), minimal animation |
| **Clarity** | Clear visual hierarchy, distinct hover states |
| **Consistency** | Utility classes ensure uniform behavior |
| **Focus on Data** | Subtle effects don't distract from content |
| **Accessible** | WCAG 2.1 AA compliant focus indicators |

**Carbon Resources Referenced**:
- [Motion Guidelines](https://carbondesignsystem.com/guidelines/motion/overview/)
- [Interaction States](https://carbondesignsystem.com/components/button/style/#states)

---

## Migration Strategy

### Step 1: Add Utilities (5 minutes)
Add utility classes to `client/src/index.css` as specified above.

### Step 2: Create Migration Script (Optional)
```bash
# Find all files with inline interactive patterns
grep -r "cursor-pointer.*hover:" client/src/pages
grep -r "cursor-pointer.*hover:" client/src/components
```

### Step 3: Parallel Component Updates (Team-Based)
Divide components by category:
- **Team A**: Pages (AgentRegistry, PatternLineage, etc.)
- **Team B**: Components (DataTable, AgentStatusGrid, etc.)
- **Team C**: Modals (All modal components)

### Step 4: Deprecation Plan (Future)
After migration is complete:
1. Add ESLint rule to flag inline hover patterns
2. Create codemod to auto-fix remaining instances
3. Update component documentation

---

## Success Metrics

**Quantitative**:
- [ ] Reduce from 6+ hover patterns to 4 standard patterns
- [ ] 100% of clickable elements have cursor-pointer
- [ ] 100% of clickable elements have focus indicators
- [ ] 0 inline interactive class strings (use utilities)

**Qualitative**:
- [ ] User reports confirm clarity improvement
- [ ] Developers report faster implementation with utilities
- [ ] Accessibility audit passes WCAG 2.1 AA

---

## Appendix: File-by-File Recommendations

### Pages

**AgentOperations.tsx**:
- Lines 427, 433, 447: Buttons already handle this correctly ✅

**AgentRegistry.tsx** (High Priority):
- Line 361: Replace with `clickable-card`
- Line 422: Replace with `clickable-card`
- Line 500: Replace with `clickable-list-item`
- Line 598: Replace with `clickable-card`

**PatternLineage.tsx** (High Priority):
- Lines 469, 484, 498, 513, 527, 541: Replace all with `clickable-card`

**IntelligenceAnalytics.tsx** (Medium Priority):
- Line 373: Replace with `clickable-row`

**AgentManagement.tsx** (Medium Priority):
- Line 332: Replace with `clickable-row`

**ContractBuilder.tsx** (Medium Priority):
- Line 717: Replace with `clickable-card`

**DuplicateDetection.tsx**:
- Line 613: Replace with `clickable-card`

### Components

**AgentStatusGrid.tsx** (Low Priority - Already Good):
- Line 104: Add focus-visible classes to existing pattern

**TopPatternsList.tsx** (Low Priority - Already Good):
- Line 40: Add focus-visible classes to existing pattern

**DataTable.tsx** (Medium Priority):
- Line 199: Replace inline classes with `clickable-row`

**AlertPill.tsx**:
- Lines 46, 62: Custom component - leave as-is (specialized behavior)

**ChatInterface.tsx**:
- Line 139: Replace with `clickable-list-item`

### Modals

All modal components (RoutingDecisionDetailModal, PatternDetailModal, etc.):
- ✅ Rely on Button component for interactions
- ✅ No changes needed (Buttons handle cursor/focus correctly)

---

## Questions & Decisions Needed

1. **Should MetricCard become clickable?**
   - Current: Not clickable (no onClick handler)
   - Proposal: Add optional `onClick` prop + `clickable-card` when provided
   - Decision: Defer to product team

2. **Should we animate the lift on hover?**
   - Current proposal: `hover:-translate-y-0.5` (2px lift)
   - Alternative: No lift, just elevation/border
   - Decision: **Keep lift** - provides stronger affordance

3. **Focus ring offset for cards vs rows?**
   - Cards: `ring-offset-2` (offset from border)
   - Rows: `ring-inset` (inside table cell)
   - Decision: **Use both** - context-dependent

4. **Migration timeline?**
   - Recommended: 2-3 days for high priority files
   - Optional: Spread over 1-2 weeks as maintenance
   - Decision: Team to decide based on sprint capacity

---

## References

- **Existing Code**: `client/src/index.css` (lines 247-392)
- **Utilities**: `client/src/lib/utils/interactive-classes.ts`
- **Carbon Design**: https://carbondesignsystem.com/
- **WCAG 2.1**: https://www.w3.org/WAI/WCAG21/quickref/

---

**Document prepared by**: Claude Code Agent (Polymorphic)
**Review recommended**: Design team, Engineering leads
**Implementation ready**: Yes - utilities defined, patterns documented
