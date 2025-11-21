# Time Selector Pattern - Intelligence Analytics

**Extracted from**: `client/src/pages/preview/IntelligenceAnalytics.tsx`

## Overview

The time selector is a **button group** (not a dropdown) that provides quick time range selection with preset options and a custom calendar picker.

## Key Characteristics

- **Position**: Page header level, NOT inside a Card component
- **Layout**: Horizontal flex container with gap-2 spacing
- **Separator**: Border-left divider to visually separate from other header actions
- **Active State**: Button variant switches from "outline" to "default" when selected
- **Component**: Uses shadcn/ui Button component, not a custom TimeRangeSelector

## Complete Code Pattern

### Required Imports

```tsx
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, RefreshCw } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
```

### State Management

```tsx
const [timeRange, setTimeRange] = useState('30d');
const [customRange, setCustomRange] = useState<DateRange | undefined>();
const [showCustomPicker, setShowCustomPicker] = useState(false);
const [isRefreshing, setIsRefreshing] = useState(false);
```

### Complete JSX Implementation

```tsx
{
  /* TIME RANGE CONTROLS - NOW GLOBAL */
}
<div className="flex items-center gap-2 ml-2 pl-2 border-l">
  <Button
    variant={timeRange === '1h' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setTimeRange('1h')}
  >
    1H
  </Button>
  <Button
    variant={timeRange === '24h' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setTimeRange('24h')}
  >
    24H
  </Button>
  <Button
    variant={timeRange === '7d' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setTimeRange('7d')}
  >
    7D
  </Button>
  <Button
    variant={timeRange === '30d' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setTimeRange('30d')}
  >
    30D
  </Button>

  {/* Custom date range picker */}
  <Popover open={showCustomPicker} onOpenChange={setShowCustomPicker}>
    <PopoverTrigger asChild>
      <Button variant={timeRange === 'custom' ? 'default' : 'outline'} size="sm" className="gap-2">
        <CalendarIcon className="h-4 w-4" />
        Custom
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="end">
      <Calendar
        mode="range"
        selected={customRange}
        onSelect={(range) => {
          setCustomRange(range);
          if (range?.from && range?.to) {
            setTimeRange('custom');
            setShowCustomPicker(false);
          }
        }}
        numberOfMonths={2}
        initialFocus
      />
    </PopoverContent>
  </Popover>

  {/* Show selected custom range */}
  {timeRange === 'custom' && customRange?.from && customRange?.to && (
    <span className="text-sm text-muted-foreground">
      {format(customRange.from, 'MMM d')} - {format(customRange.to, 'MMM d, yyyy')}
    </span>
  )}

  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
    <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
    Refresh
  </Button>
</div>;
```

## Layout Hierarchy

```
<div className="space-y-6">                          ← Page container
  <div className="flex items-center justify-between"> ← Header section
    <div>                                             ← Title area
      <h1>Intelligence Analytics</h1>
      <p>Description...</p>
    </div>
    <div className="flex items-center gap-2">        ← Action buttons area
      <MockDataBadge />
      <Button>Configure</Button>
      <Button>Export Report</Button>

      {/* TIME SELECTOR HERE */}
      <div className="flex items-center gap-2 ml-2 pl-2 border-l">
        {/* Button group */}
      </div>
    </div>
  </div>
  {/* Rest of page content */}
</div>
```

## Styling Details

### Container

- `flex items-center gap-2` - Horizontal layout with consistent spacing
- `ml-2 pl-2` - Left margin and padding for visual separation
- `border-l` - Vertical divider line (uses theme border color)

### Buttons

- `size="sm"` - Small button size for compact header
- `variant={condition ? "default" : "outline"}` - Conditional styling
  - `"default"` - Solid background when active (primary color)
  - `"outline"` - Border only when inactive
- No additional className needed for preset buttons (1H, 24H, 7D, 30D)
- Custom button has `className="gap-2"` to space icon and text

### Custom Range Display

- Conditional render: Only shows when `timeRange === "custom"` AND range is complete
- `text-sm text-muted-foreground` - Smaller, muted text for subtle display
- Date format: `"MMM d"` for start, `"MMM d, yyyy"` for end

### Calendar Popover

- `PopoverContent` with `align="end"` - Right-aligns to button
- `w-auto p-0` - Auto width, no padding (Calendar component has its own)
- `numberOfMonths={2}` - Shows two months side-by-side
- `initialFocus` - Focuses calendar on open for keyboard navigation

## Key Differences from Dropdown Approach

| Aspect            | Button Group (Intelligence Analytics) | Dropdown (Platform Monitoring)       |
| ----------------- | ------------------------------------- | ------------------------------------ |
| **Component**     | Multiple `Button` components          | Single `TimeRangeSelector` component |
| **Visual**        | Always visible buttons                | Collapsed menu                       |
| **Active State**  | Button variant changes                | Selected option in dropdown          |
| **Position**      | Page header, flex container           | Inside Card header                   |
| **UX Pattern**    | Immediate visual feedback             | Click-to-reveal options              |
| **Space**         | Takes more horizontal space           | More compact                         |
| **Accessibility** | Each button is focusable              | Single trigger button                |

## Refresh Button Integration

The Refresh button is part of the same container, appearing after the time selector:

```tsx
<Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
  <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
  Refresh
</Button>
```

**Features**:

- `disabled={isRefreshing}` - Prevents multiple clicks
- Spinning animation on icon when refreshing
- Outline variant to match inactive time buttons

## Implementation Checklist

When adapting this pattern:

- [ ] Import all required components (Button, Calendar, Popover, icons)
- [ ] Import date utilities (DateRange type, format function)
- [ ] Add three state variables (timeRange, customRange, showCustomPicker)
- [ ] Place in page header, not inside Card
- [ ] Use flex container with border-l divider
- [ ] Implement conditional variant for each button
- [ ] Configure Calendar with `numberOfMonths={2}` for two-month view
- [ ] Add custom range display with proper date formatting
- [ ] Ensure Popover closes when date range is complete
- [ ] Add Refresh button with loading state if needed

## Best Practices

1. **State Management**: Keep timeRange as simple string ("1h", "24h", "7d", "30d", "custom")
2. **Custom Range**: Only set timeRange to "custom" when both from/to dates are selected
3. **Popover Control**: Use controlled `open`/`onOpenChange` for predictable behavior
4. **Date Formatting**: Use date-fns `format()` for consistent date display
5. **Visual Separation**: Use border-l with appropriate margin/padding
6. **Button Sizing**: Use "sm" size for header controls to maintain visual hierarchy
7. **Active Indication**: Use "default" variant for active, "outline" for inactive

## Notes

- This pattern is used at the **page level**, not per-card
- The time range selection is **global** to the entire dashboard view
- All metrics/charts on the page should respond to the selected time range
- The Custom calendar shows **two months** for easier date selection
- The selected custom range is displayed as **formatted text** next to the buttons
