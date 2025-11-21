# Refactoring to Interactive Components - Quick Reference

This document shows before/after examples for refactoring existing clickable elements to use the new reusable interactive components.

---

## Pattern 1: Clickable Metric Cards

### Before

```tsx
// client/src/components/AgentOperations.tsx
<Card
  className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all hover:-translate-y-0.5"
  onClick={() => handleAgentClick(agent.id)}
>
  <CardHeader>
    <CardTitle>{agent.name}</CardTitle>
    <CardDescription>Status: {agent.status}</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">{agent.successRate}%</div>
  </CardContent>
</Card>
```

### After

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';

<ClickableCard onClick={() => handleAgentClick(agent.id)}>
  <CardHeader>
    <CardTitle>{agent.name}</CardTitle>
    <CardDescription>Status: {agent.status}</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">{agent.successRate}%</div>
  </CardContent>
</ClickableCard>;
```

**Benefits:**

- ✅ Removes 4 className props
- ✅ Adds keyboard accessibility automatically
- ✅ Adds ARIA attributes
- ✅ Consistent hover/focus behavior

---

## Pattern 2: Pattern Cards with Detail Modals

### Before

```tsx
// client/src/components/PatternLearning.tsx
<Card
  className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all hover:-translate-y-0.5"
  onClick={() => setSelectedPattern(pattern)}
>
  <CardHeader>
    <CardTitle>{pattern.name}</CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">{pattern.description}</p>
    <div className="mt-4">
      <span className="text-xs">Used {pattern.count} times</span>
    </div>
  </CardContent>
</Card>
```

### After

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';

<ClickableCard onClick={() => setSelectedPattern(pattern)}>
  <CardHeader>
    <CardTitle>{pattern.name}</CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">{pattern.description}</p>
    <div className="mt-4">
      <span className="text-xs">Used {pattern.count} times</span>
    </div>
  </CardContent>
</ClickableCard>;
```

---

## Pattern 3: Table Rows with Click Handlers

### Before

```tsx
// client/src/components/EventFeed.tsx
<TableRow
  className="cursor-pointer hover:bg-accent/50 transition-colors"
  onClick={() => handleEventClick(event.id)}
>
  <TableCell>{event.timestamp}</TableCell>
  <TableCell>{event.type}</TableCell>
  <TableCell>{event.agent}</TableCell>
</TableRow>
```

### After (Option 1: Using CSS Class)

```tsx
<TableRow
  className="clickable-row"
  onClick={() => handleEventClick(event.id)}
  tabIndex={0}
  role="button"
  onKeyDown={createKeyboardHandler(() => handleEventClick(event.id))}
>
  <TableCell>{event.timestamp}</TableCell>
  <TableCell>{event.type}</TableCell>
  <TableCell>{event.agent}</TableCell>
</TableRow>
```

### After (Option 2: Using Utility Function)

```tsx
import { clickableRowClasses, createKeyboardHandler } from '@/lib/utils/interactive-classes';

<TableRow
  className={clickableRowClasses}
  onClick={() => handleEventClick(event.id)}
  tabIndex={0}
  role="button"
  onKeyDown={createKeyboardHandler(() => handleEventClick(event.id))}
>
  <TableCell>{event.timestamp}</TableCell>
  <TableCell>{event.type}</TableCell>
  <TableCell>{event.agent}</TableCell>
</TableRow>;
```

**Benefits:**

- ✅ Consistent hover behavior across all table rows
- ✅ Keyboard navigation support
- ✅ Focus indicators for accessibility

---

## Pattern 4: Cards with Disabled State

### Before

```tsx
// client/src/components/CodeIntelligence.tsx
<Card
  className={cn(
    'cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all',
    isProcessing && 'opacity-50 cursor-not-allowed'
  )}
  onClick={isProcessing ? undefined : handleAnalyze}
>
  <CardHeader>
    <CardTitle>Code Analysis</CardTitle>
  </CardHeader>
  <CardContent>{isProcessing ? 'Processing...' : 'Click to analyze'}</CardContent>
</Card>
```

### After

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';

<ClickableCard disabled={isProcessing} onClick={handleAnalyze}>
  <CardHeader>
    <CardTitle>Code Analysis</CardTitle>
  </CardHeader>
  <CardContent>{isProcessing ? 'Processing...' : 'Click to analyze'}</CardContent>
</ClickableCard>;
```

**Benefits:**

- ✅ Simplified conditional logic
- ✅ Automatic handling of disabled state
- ✅ Prevents onClick when disabled (no manual check needed)

---

## Pattern 5: List Items in Dropdowns/Menus

### Before

```tsx
// client/src/components/FilterDropdown.tsx
<div
  className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
  onClick={() => handleFilterSelect(filter)}
>
  {filter.label}
</div>
```

### After

```tsx
import { clickableListItemClasses } from '@/lib/utils/interactive-classes';

<div
  className={cn('px-3 py-2', clickableListItemClasses)}
  onClick={() => handleFilterSelect(filter)}
  role="menuitem"
  tabIndex={0}
>
  {filter.label}
</div>;
```

---

## Pattern 6: Conditional Interactivity

### Before

```tsx
// Sometimes clickable, sometimes not
{
  isClickable ? (
    <Card
      className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all"
      onClick={handleClick}
    >
      <CardContent>{content}</CardContent>
    </Card>
  ) : (
    <Card>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
```

### After

```tsx
import { Card } from '@/components/ui/card';
import { ClickableCard } from '@/components/ui/clickable-card';

const CardComponent = isClickable ? ClickableCard : Card;

<CardComponent onClick={isClickable ? handleClick : undefined}>
  <CardContent>{content}</CardContent>
</CardComponent>;
```

**Benefits:**

- ✅ No duplication of card structure
- ✅ Single component instance
- ✅ Cleaner conditional logic

---

## Pattern 7: Custom Interactive Elements

### Before

```tsx
// client/src/components/CustomCard.tsx
<div
  className="p-4 rounded-lg border cursor-pointer hover:shadow-lg transition-all"
  onClick={handleClick}
>
  <h3>Custom Card</h3>
  <p>Content here</p>
</div>
```

### After

```tsx
import { interactiveClasses } from '@/lib/utils/interactive-classes';

<div
  className={interactiveClasses('p-4 rounded-lg border', 'card')}
  onClick={handleClick}
  tabIndex={0}
  role="button"
>
  <h3>Custom Card</h3>
  <p>Content here</p>
</div>;
```

---

## Pattern 8: Grid of Clickable Cards

### Before

```tsx
// client/src/components/Dashboard.tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map((item) => (
    <Card
      key={item.id}
      className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all hover:-translate-y-0.5"
      onClick={() => handleItemClick(item)}
    >
      <CardHeader>
        <CardTitle>{item.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{item.description}</p>
      </CardContent>
    </Card>
  ))}
</div>
```

### After

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map((item) => (
    <ClickableCard key={item.id} onClick={() => handleItemClick(item)}>
      <CardHeader>
        <CardTitle>{item.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{item.description}</p>
      </CardContent>
    </ClickableCard>
  ))}
</div>;
```

---

## Pattern 9: Nested Interactive Elements

### Before

```tsx
// Card with internal button - need to prevent event bubbling
<Card
  className="cursor-pointer hover:shadow-lg transition-all"
  onClick={() => handleCardClick(item)}
>
  <CardHeader>
    <CardTitle>{item.title}</CardTitle>
  </CardHeader>
  <CardContent>
    <p>{item.description}</p>
    <Button
      onClick={(e) => {
        e.stopPropagation();
        handleDelete(item.id);
      }}
    >
      Delete
    </Button>
  </CardContent>
</Card>
```

### After

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';

<ClickableCard onClick={() => handleCardClick(item)}>
  <CardHeader>
    <CardTitle>{item.title}</CardTitle>
  </CardHeader>
  <CardContent>
    <p>{item.description}</p>
    <Button
      onClick={(e) => {
        e.stopPropagation();
        handleDelete(item.id);
      }}
    >
      Delete
    </Button>
  </CardContent>
</ClickableCard>;
```

**Note:** Event bubbling pattern remains the same, but the card behavior is now consistent.

---

## Pattern 10: Custom Styling Override

### Before

```tsx
<Card
  className="cursor-pointer hover:shadow-lg hover:border-destructive transition-all"
  onClick={handleDangerousAction}
>
  <CardContent>Dangerous action</CardContent>
</Card>
```

### After

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';

<ClickableCard onClick={handleDangerousAction} className="hover:border-destructive">
  <CardContent>Dangerous action</CardContent>
</ClickableCard>;
```

**Benefits:**

- ✅ Base interactive behavior from `ClickableCard`
- ✅ Custom border color on hover via className override
- ✅ Maintains all other interactive features

---

## Migration Checklist

When refactoring to use interactive components:

- [ ] Replace manual hover/transition classes with `ClickableCard` or utilities
- [ ] Add keyboard event handlers for accessibility
- [ ] Add ARIA attributes (`role`, `tabIndex`, `aria-disabled`)
- [ ] Test keyboard navigation (Tab, Enter, Space)
- [ ] Test disabled states
- [ ] Test focus indicators
- [ ] Verify nested interactive elements handle event bubbling correctly
- [ ] Update any tests that check for specific className strings

---

## Quick Decision Guide

**Use `ClickableCard` when:**

- Element is a card (using shadcn Card component)
- Need full interactive behavior (hover, focus, keyboard, ARIA)
- Want simplest API

**Use utility classes when:**

- Need quick styling without component overhead
- Working with existing components
- Building custom interactive elements

**Use utility functions when:**

- Need programmatic class composition
- Complex conditional styling
- Reusable helper functions (keyboard handlers, ARIA props)

---

## Testing After Refactoring

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Test click handler
test('triggers onClick when card is clicked', async () => {
  const handleClick = vi.fn();
  render(
    <ClickableCard onClick={handleClick}>
      <CardContent>Click me</CardContent>
    </ClickableCard>
  );

  await userEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalledOnce();
});

// Test keyboard navigation
test('triggers onClick when Enter is pressed', async () => {
  const handleClick = vi.fn();
  render(
    <ClickableCard onClick={handleClick}>
      <CardContent>Click me</CardContent>
    </ClickableCard>
  );

  const card = screen.getByRole('button');
  card.focus();
  await userEvent.keyboard('{Enter}');

  expect(handleClick).toHaveBeenCalledOnce();
});

// Test disabled state
test('does not trigger onClick when disabled', async () => {
  const handleClick = vi.fn();
  render(
    <ClickableCard onClick={handleClick} disabled>
      <CardContent>Click me</CardContent>
    </ClickableCard>
  );

  await userEvent.click(screen.getByRole('button'));
  expect(handleClick).not.toHaveBeenCalled();
});
```

---

## Performance Notes

All refactored components maintain the same performance characteristics:

- CSS-only animations (no JS-based transitions)
- No additional re-renders
- Minimal bundle size increase (tree-shakable utilities)

---

## Next Steps

1. Audit existing components for clickable patterns (use grep/search)
2. Start with high-traffic components (AgentOperations, PatternLearning)
3. Refactor in small batches with tests
4. Update component tests to verify new behavior
5. Document any custom patterns unique to your components
