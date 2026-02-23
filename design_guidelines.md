# OmniNode Code Intelligence Platform - Design Guidelines

## Design Approach

**Selected Approach**: Design System - Carbon Design System (IBM)
**Justification**: Carbon Design is purpose-built for data-dense, enterprise applications with complex information hierarchies. It excels at real-time monitoring dashboards, providing excellent data visualization patterns, grid systems, and component libraries optimized for technical users.

**Key Design Principles**:

- Information density over white space - maximize data visibility
- Scanability and quick comprehension for monitoring scenarios
- Consistent interaction patterns across all dashboards (4 category + 15+ advanced pages)
- Performance-optimized for real-time data updates

---

## Typography

**Font Stack**: IBM Plex Sans (via Google Fonts CDN)

- Primary: IBM Plex Sans for UI and data
- Monospace: IBM Plex Mono for metrics, code snippets, IDs

**Type Scale**:

- Dashboard Titles: text-3xl font-semibold (36px)
- Section Headers: text-xl font-semibold (20px)
- Card Titles: text-base font-medium (16px)
- Body/Metrics: text-sm (14px)
- Labels/Captions: text-xs (12px)
- Large Metrics: text-4xl to text-6xl font-bold for hero numbers

**Hierarchy Rules**:

- Use weight variation (medium/semibold/bold) rather than size for emphasis
- Monospace font for all numeric metrics, IDs, timestamps
- All-caps with letter-spacing for category labels (uppercase tracking-wide text-xs)

---

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, 16

- Micro spacing (within components): 2, 4
- Component internal padding: 4, 6
- Card padding: 6, 8
- Section spacing: 12, 16
- Dashboard margins: 8, 12

**Grid Structure**:

- Dashboard container: max-w-full with px-8 py-6
- Main content area: Uses CSS Grid with gap-6 for card layouts
- Responsive breakpoints: md (768px), lg (1024px), xl (1280px), 2xl (1536px)

**Dashboard Layout Pattern** (All Dashboards):

```text
Header (h-16): Logo, Dashboard Title, Global Controls
Sidebar (w-64): Navigation (4 category dashboards + collapsible Advanced section)
Main Content (flex-1): Grid of metric cards and visualizations
```

**Card Grid Patterns**:

- Hero Metrics: 3-column grid (grid-cols-3 gap-6)
- Standard Cards: 4-column grid (grid-cols-4 gap-6) at xl, 2-column at md
- Wide Visualizations: 2-column grid (grid-cols-2 gap-6)
- Full-width charts: Single column for complex visualizations

---

## Component Library

### Navigation Components

**Top Navigation Bar**:

- Fixed header (h-16) with flex layout
- Left: Logo + Dashboard title (text-xl font-semibold)
- Right: Real-time status indicator, user menu, settings icon
- Border bottom separator (border-b)

**Side Navigation**:

- Fixed sidebar (w-64) with vertical navigation list
- Each dashboard link: p-3 with hover state
- Active dashboard: Border-l-4 accent indicator
- Icons from Heroicons (24px) beside each label
- Collapsible on mobile

### Data Display Components

**Metric Cards**:

- Structure: rounded-lg border p-6
- Header: Label (text-xs uppercase tracking-wide) + Info icon
- Value: Large number (text-4xl font-bold monospace)
- Trend: Small chart or percentage change (text-sm)
- Footer: Timestamp or status indicator

**Status Indicators**:

- Agent/Service Status: Circular dot (h-3 w-3 rounded-full) + label
- Health badges: rounded-full px-3 py-1 text-xs font-medium
- Progress bars: h-2 rounded-full with animated fill

**Data Tables**:

- Sticky header row with sort indicators
- Zebra striping for row differentiation
- Monospace for numeric columns
- Row height: h-12 for scanability
- Hover state on rows

### Visualization Components

**Chart Containers**:

- Standard card wrapper (rounded-lg border p-6)
- Title bar with controls (text-base font-medium mb-4)
- Chart area: min-h-80 for consistency
- Legend placement: Top-right or bottom

**Real-time Updates**:

- Pulsing indicator (animate-pulse) for live data
- Smooth transitions for data changes (transition-all duration-300)
- No jarring reflows - fixed heights for chart areas

**Interactive Elements**:

- Tooltips on hover for detailed metrics
- Zoom/pan controls for graph visualizations
- Time range selectors (tabs: 1h, 6h, 24h, 7d)

### Graph Visualizations

**Knowledge Graph (Dashboard 6)**:

- Full viewport height canvas (h-[calc(100vh-theme(spacing.32))])
- 3D mode toggle button (top-right)
- Node detail panel (w-80 slide-in from right)
- Zoom controls (bottom-right floating buttons)

**Network Diagrams**:

- Canvas with border rounded-lg
- Legend in top-left corner
- Filter controls in toolbar above

### Alert & Status Components

**Alert Panel**:

- Absolute positioned (top-20 right-8) for system alerts
- Stack layout with gap-2
- Each alert: p-4 rounded-lg border-l-4 with icon
- Dismiss button (top-right of each alert)

**Live Event Feed**:

- Scrollable container (max-h-96 overflow-y-auto)
- Each event: flex layout, timestamp left, description right
- Newest events appear at top with slide-in animation

---

## Interaction Patterns

**Real-time Data**:

- Smooth number transitions using CSS transitions
- Chart animations: New data slides in from right
- No abrupt flashing - fade transitions (opacity changes)

**Drill-down Navigation**:

- Click metric cards to open detail modal
- Modal: max-w-4xl centered overlay with backdrop blur
- Close button (top-right) + ESC key support

**Dashboard Switching**:

- Instant switching without page reload
- Sidebar navigation with active state highlighting
- Preserve scroll position on return

**Responsive Behavior**:

- Mobile: Collapse sidebar to icon-only (w-16)
- Tablet: 2-column card grids
- Desktop: Full multi-column layouts
- Hide secondary metrics on smaller screens

---

## Accessibility

**Keyboard Navigation**:

- Tab order: Navigation → Metric cards → Interactive charts → Controls
- Focus visible states with ring-2 ring-offset-2
- Escape to close modals and detail views

**Screen Readers**:

- aria-label on all icon-only buttons
- aria-live="polite" on real-time updating metrics
- Semantic HTML: nav, main, section, article tags

**Visual Indicators**:

- Never rely solely on color for status
- Include icons + text for all states
- Sufficient contrast for all text (follow WCAG AA)

---

## Performance Optimizations

**Rendering Strategy**:

- Virtual scrolling for tables >100 rows
- Lazy load off-screen charts
- Debounced real-time updates (max 1/second for smooth animation)
- Use CSS transforms for animations (not layout properties)

**Component Reuse**:

- Single MetricCard component with props for all metrics
- Shared ChartContainer wrapper for all visualizations
- Common StatusBadge component across dashboards

---

## Dashboard-Specific Layouts

**AI Agent Operations (Dashboard 1)**:

- 52-agent grid: grid-cols-6 (at 2xl), grid-cols-4 (at xl), grid-cols-2 (at md)
- Execution timeline: Full-width Gantt-style chart
- Agent detail modal for individual agent deep-dive

**Pattern Learning (Dashboard 2)**:

- Network graph: Takes full main content area
- Side panel (w-96): Pattern detail and filters
- Discovery feed: Fixed right sidebar (w-80)

**Event Flow (Dashboard 5)**:

- Sankey diagram: Full-width, h-screen visualization
- Topic metrics: Bottom panel, h-64, scrollable horizontally

**Platform Health (Dashboard 7)**:

- Service status grid: 4x4 grid of status cards
- Large performance charts: 2-column layout below grid
- Alert ticker: Top banner if critical alerts exist
