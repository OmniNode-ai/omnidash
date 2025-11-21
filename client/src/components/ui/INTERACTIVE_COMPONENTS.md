# Interactive Components Guide

This guide documents the reusable interactive wrapper components and utilities for maintaining consistent clickable behavior across the Omnidash application.

## Overview

The interactive components system provides three main tools:

1. **`ClickableCard`** - React component wrapper with interactive behavior
2. **`interactive-classes.ts`** - Utility functions for consistent styling
3. **CSS utility classes** - Global classes for quick styling

---

## ClickableCard Component

A reusable wrapper around the shadcn `Card` component that adds consistent hover effects, focus states, and keyboard accessibility.

### Basic Usage

#### Simple Click Handler

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';
import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';

function AgentCard({ agent, onSelect }) {
  return (
    <ClickableCard onClick={() => onSelect(agent)}>
      <CardHeader>
        <CardTitle>{agent.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{agent.description}</p>
      </CardContent>
    </ClickableCard>
  );
}
```

#### With Navigation (href)

```tsx
<ClickableCard href="/agents/details/123">
  <CardHeader>
    <CardTitle>Agent Details</CardTitle>
  </CardHeader>
  <CardContent>Click to view full details</CardContent>
</ClickableCard>
```

#### With Disabled State

```tsx
<ClickableCard onClick={handleClick} disabled={isLoading} className="hover:border-destructive">
  <CardContent>{isLoading ? 'Loading...' : 'Click me'}</CardContent>
</ClickableCard>
```

### API Reference

```tsx
interface ClickableCardProps {
  onClick?: (event: React.MouseEvent | React.KeyboardEvent) => void;
  href?: string;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}
```

### Features

- **Hover Effects**: Subtle elevation and border color change
- **Focus States**: Keyboard navigation with visible focus ring
- **Active States**: Scale down on click for tactile feedback
- **Accessibility**:
  - ARIA attributes (`role`, `aria-disabled`)
  - Keyboard support (Enter/Space keys)
  - Proper tab order management
- **Disabled Support**: Visual and functional disable state

---

## Interactive Styling Utilities

Import from `@/lib/utils/interactive-classes` for programmatic class management.

### Class String Exports

#### `clickableCardClasses`

Pre-composed class string for card-like interactive elements:

```tsx
import { clickableCardClasses } from '@/lib/utils/interactive-classes';

<div className={cn('p-4 rounded-lg border', clickableCardClasses)}>Card content</div>;
```

#### `clickableRowClasses`

For table rows and list items (more subtle than cards):

```tsx
import { clickableRowClasses } from '@/lib/utils/interactive-classes';

<tr className={clickableRowClasses} onClick={handleRowClick}>
  <td>Cell 1</td>
  <td>Cell 2</td>
</tr>;
```

#### `clickableListItemClasses`

For dropdown items, navigation menus:

```tsx
import { clickableListItemClasses } from '@/lib/utils/interactive-classes';

<li className={clickableListItemClasses} onClick={handleSelect}>
  Menu item
</li>;
```

#### `disabledClasses`

Add to any interactive element for disabled styling:

```tsx
import { clickableCardClasses, disabledClasses } from '@/lib/utils/interactive-classes';

<button className={cn(clickableCardClasses, isDisabled && disabledClasses)}>Button</button>;
```

### Helper Functions

#### `interactiveClasses()`

Combines base classes with interactive behavior:

```tsx
import { interactiveClasses } from "@/lib/utils/interactive-classes";

// Card variant
<div className={interactiveClasses("p-4 rounded-lg", "card")}>
  Content
</div>

// Row variant
<tr className={interactiveClasses("border-b", "row", isDisabled)}>
  ...
</tr>

// Subtle variant (minimal hover)
<span className={interactiveClasses("text-sm", "subtle")}>
  Clickable text
</span>
```

**Signature:**

```tsx
interactiveClasses(
  baseClasses: string,
  variant: "card" | "row" | "list" | "subtle" = "card",
  disabled: boolean = false
): string
```

#### `createKeyboardHandler()`

Generate keyboard event handlers for accessibility:

```tsx
import { createKeyboardHandler } from '@/lib/utils/interactive-classes';

<div
  onClick={handleClick}
  onKeyDown={createKeyboardHandler(handleClick)}
  tabIndex={0}
  role="button"
>
  Clickable content
</div>;
```

#### `getInteractiveAriaProps()`

Get proper ARIA attributes for interactive elements:

```tsx
import { getInteractiveAriaProps } from '@/lib/utils/interactive-classes';

<div
  {...getInteractiveAriaProps({
    role: 'button',
    disabled: false,
    pressed: isSelected,
  })}
>
  Toggle button
</div>;
```

**Options:**

```tsx
{
  role?: "button" | "link" | "menuitem";
  disabled?: boolean;
  pressed?: boolean;
  expanded?: boolean;
}
```

---

## Global CSS Utility Classes

Import automatically via `index.css`. Use directly in className strings.

### `.clickable-card`

```tsx
<div className="clickable-card p-4 rounded-lg border">Card content</div>
```

### `.clickable-row`

```tsx
<tr className="clickable-row">
  <td>Cell 1</td>
  <td>Cell 2</td>
</tr>
```

### `.clickable-list-item`

```tsx
<li className="clickable-list-item px-4 py-2">Menu item</li>
```

### `.clickable-disabled`

```tsx
<button className="clickable-card clickable-disabled">Disabled button</button>
```

---

## Migration Examples

### Before (Manual Implementation)

```tsx
// PatternCard.tsx - Old pattern
<Card
  className="cursor-pointer hover:shadow-lg hover:border-primary/50
             transition-all hover:-translate-y-0.5"
  onClick={() => onPatternClick(pattern)}
>
  <CardHeader>
    <CardTitle>{pattern.name}</CardTitle>
  </CardHeader>
</Card>
```

### After (Using ClickableCard)

```tsx
// PatternCard.tsx - New pattern
import { ClickableCard } from '@/components/ui/clickable-card';

<ClickableCard onClick={() => onPatternClick(pattern)}>
  <CardHeader>
    <CardTitle>{pattern.name}</CardTitle>
  </CardHeader>
</ClickableCard>;
```

### Before (Table Row)

```tsx
<tr
  className="cursor-pointer hover:bg-accent/50 transition-colors"
  onClick={() => handleRowClick(id)}
>
  <td>{name}</td>
  <td>{value}</td>
</tr>
```

### After (Using Utility)

```tsx
import { clickableRowClasses } from '@/lib/utils/interactive-classes';

<tr className={clickableRowClasses} onClick={() => handleRowClick(id)} tabIndex={0} role="button">
  <td>{name}</td>
  <td>{value}</td>
</tr>;
```

---

## Accessibility Best Practices

### Always Include

1. **Keyboard Support**: Use `ClickableCard` or `createKeyboardHandler()`
2. **ARIA Attributes**: Use `getInteractiveAriaProps()` or component props
3. **Focus Indicators**: Included automatically in all utilities
4. **Tab Order**: Manage `tabIndex` properly (0 for interactive, -1 for disabled)

### Example: Fully Accessible Card

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

<ClickableCard onClick={handleClick} disabled={isDisabled} aria-label="Agent monitoring card">
  <CardHeader>
    <CardTitle>Agent Name</CardTitle>
    <CardDescription>Click to view details</CardDescription>
  </CardHeader>
</ClickableCard>;
```

---

## Design System Alignment

All interactive components follow Carbon Design System principles:

- **Hover Effects**: Subtle elevation (shadow + translate)
- **Focus States**: 2px primary ring with offset
- **Active States**: Scale down for tactile feedback
- **Transitions**: 150-200ms duration for smooth feel
- **Disabled State**: 50% opacity with no-interaction cursor

---

## Testing Interactive Components

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClickableCard } from '@/components/ui/clickable-card';

test('calls onClick when clicked', async () => {
  const handleClick = vi.fn();

  render(
    <ClickableCard onClick={handleClick}>
      <div>Click me</div>
    </ClickableCard>
  );

  await userEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('calls onClick when Enter is pressed', async () => {
  const handleClick = vi.fn();

  render(
    <ClickableCard onClick={handleClick}>
      <div>Click me</div>
    </ClickableCard>
  );

  const card = screen.getByRole('button');
  card.focus();
  await userEvent.keyboard('{Enter}');

  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('does not call onClick when disabled', async () => {
  const handleClick = vi.fn();

  render(
    <ClickableCard onClick={handleClick} disabled>
      <div>Click me</div>
    </ClickableCard>
  );

  await userEvent.click(screen.getByRole('button'));
  expect(handleClick).not.toHaveBeenCalled();
});
```

---

## Performance Considerations

- **CSS-Only Animations**: All hover/focus effects use CSS transitions (no JS)
- **Minimal Re-renders**: Components use `React.forwardRef` and minimal state
- **Tree-Shakable**: Import only what you need from utilities

---

## Common Patterns

### Metric Cards Dashboard

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';

const metrics = [
  { id: 1, name: 'Active Agents', value: 42 },
  { id: 2, name: 'Total Patterns', value: 1250 },
];

return (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {metrics.map((metric) => (
      <ClickableCard key={metric.id} onClick={() => handleMetricClick(metric)}>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold">{metric.value}</div>
          <p className="text-sm text-muted-foreground">{metric.name}</p>
        </CardContent>
      </ClickableCard>
    ))}
  </div>
);
```

### Conditional Interactivity

```tsx
import { Card } from '@/components/ui/card';
import { ClickableCard } from '@/components/ui/clickable-card';

// Use different components based on condition
const CardComponent = isClickable ? ClickableCard : Card;

<CardComponent onClick={isClickable ? handleClick : undefined}>
  <CardContent>Content</CardContent>
</CardComponent>;
```

### Nested Interactions

```tsx
import { ClickableCard } from '@/components/ui/clickable-card';

<ClickableCard onClick={handleCardClick}>
  <CardHeader>
    <CardTitle>Pattern Details</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Pattern information</p>

    {/* Prevent event bubbling for nested button */}
    <Button
      onClick={(e) => {
        e.stopPropagation();
        handleButtonClick();
      }}
    >
      Delete
    </Button>
  </CardContent>
</ClickableCard>;
```

---

## Related Components

- **Card** (`@/components/ui/card`) - Base card component
- **Button** (`@/components/ui/button`) - For explicit buttons
- **Dialog** (`@/components/ui/dialog`) - For modal interactions
- **DropdownMenu** (`@/components/ui/dropdown-menu`) - For menus

---

## Questions?

For implementation questions or suggestions, see:

- Component source: `client/src/components/ui/clickable-card.tsx`
- Utilities source: `client/src/lib/utils/interactive-classes.ts`
- CSS source: `client/src/index.css` (look for "Interactive Element Utility Classes")
