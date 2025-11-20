# Interactive Design System - Quick Reference

**Version**: 1.0
**Status**: Ready to Use
**Full Documentation**: See `CLICKABLE_UI_AUDIT.md`

---

## TL;DR - What Changed?

We now have **4 standard utility classes** for all interactive elements. Use these instead of inline Tailwind classes.

```tsx
// ❌ OLD WAY (inconsistent)
<Card className="cursor-pointer hover:shadow-md transition-shadow" />

// ✅ NEW WAY (consistent)
<Card className="clickable-card" />
```

---

## Quick Decision Tree

**Is it clickable? → Use one of these 4 patterns:**

```
┌─ Card/Large Surface? ────→ .clickable-card
│  (Agent cards, pattern cards, metric cards)
│
├─ Table Row/Log Entry? ───→ .clickable-row
│  (DataTable rows, event feed, lists)
│
├─ Menu/Navigation Item? ──→ .clickable-list-item
│  (Dropdowns, sidebar, filter chips)
│
└─ Icon/Badge/Small? ──────→ .clickable-subtle
   (Icon buttons, inline badges)
```

---

## The 4 Patterns

### 1. `clickable-card`

**Use For**: Agent cards, pattern cards, drill-down surfaces

**What It Does**:

- Hover: Subtle elevation + border glow + 2px lift
- Active: Stronger elevation + slight scale down
- Focus: Blue ring (keyboard navigation)

**Example**:

```tsx
import { Card } from '@/components/ui/card';

<Card className="clickable-card p-6" onClick={handleClick}>
  Card content
</Card>;
```

**Visual Result**:

- Cursor changes to pointer
- Hovers with blue border glow
- Lifts slightly on hover
- Clear focus ring for keyboard users

---

### 2. `clickable-row`

**Use For**: Table rows, log entries, dense lists

**What It Does**:

- Hover: Light background color
- Active: Slightly darker background
- Focus: Inset ring (doesn't break table alignment)

**Example**:

```tsx
<TableRow className="clickable-row" onClick={() => setSelectedRow(row)}>
  <TableCell>{row.name}</TableCell>
  <TableCell>{row.value}</TableCell>
</TableRow>
```

**Visual Result**:

- Subtle background highlight on hover
- No shadows (keeps table clean)
- Inset focus ring for keyboard navigation

---

### 3. `clickable-list-item`

**Use For**: Dropdown items, sidebar navigation, filter chips

**What It Does**:

- Hover: Background + text color change
- Active: Slightly darker background
- Focus: Standard ring

**Example**:

```tsx
<DropdownMenuItem className="clickable-list-item" onClick={() => handleSelect(item)}>
  {item.label}
</DropdownMenuItem>
```

---

### 4. `clickable-subtle`

**Use For**: Small icons, badges, inline actions

**What It Does**:

- Hover: Opacity to 80%
- Active: No visual change (intentionally subtle)
- Focus: Standard ring

**Example**:

```tsx
<Badge className="clickable-subtle" onClick={() => removeTag(tag)}>
  {tag} <X className="w-3 h-3 ml-1" />
</Badge>
```

---

## Combining with Other Classes

These utilities work with all Tailwind classes:

```tsx
// ✅ GOOD - Add spacing, colors, etc.
<Card className="clickable-card p-6 bg-muted" />

// ✅ GOOD - Use with cn() utility
<Card className={cn("clickable-card", isSelected && "ring-2")} />

// ✅ GOOD - Conditional clickability
<Card className={onClick ? "clickable-card" : ""} />
```

---

## Disabled State

Add `.clickable-disabled` to any interactive element that should appear disabled:

```tsx
<Card
  className={cn('clickable-card', isDisabled && 'clickable-disabled')}
  onClick={isDisabled ? undefined : handleClick}
>
  Content
</Card>
```

---

## Accessibility Built-In

All 4 patterns include:

- ✅ Cursor pointer indicator
- ✅ Smooth transitions (200ms for cards, 150ms for rows)
- ✅ Focus-visible ring for keyboard navigation
- ✅ Active state feedback

**For non-semantic elements** (divs, spans), add keyboard support:

```tsx
import { createKeyboardHandler, getInteractiveAriaProps } from '@/lib/utils/interactive-classes';

<div
  className="clickable-card"
  onClick={handleClick}
  onKeyDown={createKeyboardHandler(handleClick)}
  {...getInteractiveAriaProps({ role: 'button' })}
>
  Content
</div>;
```

---

## Migration Guide

### Before (Inconsistent)

```tsx
// AgentRegistry.tsx - 4 different patterns in one file!
<Card className="cursor-pointer hover:shadow-md transition-all" />
<Card className="cursor-pointer hover:shadow-md transition-shadow" />
<Card className="hover:bg-accent cursor-pointer transition-colors" />
<Card className="cursor-pointer hover:shadow-md transition-shadow" />
```

### After (Consistent)

```tsx
// All cards use same pattern
<Card className="clickable-card" />
<Card className="clickable-card" />
<Card className="clickable-card" />
<Card className="clickable-card" />
```

---

## Common Mistakes to Avoid

### ❌ Don't Mix Patterns

```tsx
// BAD - Mixing utility with inline classes
<Card className="clickable-card hover:shadow-xl" />
```

The utility already includes hover effects. Adding more creates conflicts.

### ❌ Don't Use on Non-Interactive Elements

```tsx
// BAD - Visual only, not actually clickable
<Card className="clickable-card">Read-only content</Card>
```

If it doesn't have `onClick` or `href`, don't make it look clickable.

### ❌ Don't Forget Keyboard Navigation

```tsx
// BAD - Div is clickable but not keyboard accessible
<div className="clickable-card" onClick={handleClick}>
  Content
</div>

// GOOD - Includes keyboard support
<div
  className="clickable-card"
  onClick={handleClick}
  onKeyDown={createKeyboardHandler(handleClick)}
  tabIndex={0}
  role="button"
>
  Content
</div>
```

---

## Examples from the Codebase

### AgentStatusGrid (Good Example)

**Before**:

```tsx
<Card
  className="hover-elevate active-elevate-2 cursor-pointer transition-all"
  onClick={() => onAgentClick?.(agent)}
/>
```

**After**:

```tsx
<Card className="clickable-card" onClick={() => onAgentClick?.(agent)} />
```

Same visual effect, cleaner code, includes focus states.

### DataTable (Row Selection)

**Before**:

```tsx
<TableHead
  className={cn(
    column.className,
    column.sortable && 'cursor-pointer select-none hover:bg-muted/50'
  )}
/>
```

**After**:

```tsx
<TableHead className={cn(column.className, column.sortable && 'clickable-row select-none')} />
```

### ChatInterface (Message Selection)

**Before**:

```tsx
<div
  className="p-3 rounded-lg cursor-pointer hover-elevate active-elevate-2 border"
  onClick={handleSelect}
>
```

**After**:

```tsx
<div
  className="clickable-card p-3 rounded-lg border"
  onClick={handleSelect}
>
```

---

## Testing Checklist

For each interactive element:

- [ ] Has appropriate utility class (`.clickable-card`, etc.)
- [ ] Cursor changes to pointer on hover
- [ ] Visual feedback on hover (shadow/background/opacity)
- [ ] Visual feedback on active state (press down)
- [ ] Focus ring visible when navigating with keyboard
- [ ] Keyboard accessible (Enter/Space triggers onClick)
- [ ] Works in both light and dark themes
- [ ] Disabled state works correctly (if applicable)

---

## Browser DevTools Tip

**Find elements missing cursor affordance**:

```javascript
// Paste in browser console
document.querySelectorAll('[onclick], [role="button"]').forEach((el) => {
  const style = window.getComputedStyle(el);
  if (style.cursor !== 'pointer') {
    console.warn('Missing cursor-pointer:', el);
  }
});
```

---

## When to Ask for Help

**Not sure which pattern to use?**

- Cards/large surfaces → `clickable-card`
- Rows/dense lists → `clickable-row`
- When in doubt → `clickable-card`

**Need a custom interaction?**

- Check if it can be solved with utility combinations
- If truly unique, document why inline classes are needed
- Consider adding a new utility class if pattern repeats

**Accessibility concerns?**

- Use `createKeyboardHandler()` helper for divs/spans
- Add appropriate ARIA attributes with `getInteractiveAriaProps()`
- Test with keyboard-only navigation (Tab, Enter, Space)

---

## Resources

- **Full Audit**: See `CLICKABLE_UI_AUDIT.md`
- **Utility Functions**: `client/src/lib/utils/interactive-classes.ts`
- **Global CSS**: `client/src/index.css` (lines 276-316)
- **Carbon Design**: https://carbondesignsystem.com/

---

**Questions?** Check the full audit document or ask the team.

**Ready to implement?** The utilities are already in `index.css` and ready to use!
