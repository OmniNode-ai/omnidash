# Icon Standardization Guide

## Overview

This document defines the standard icon vocabulary for the Omnidash application. All dashboards should use icons from the centralized `standardIcons.ts` file to ensure visual consistency and maintainability.

## Key Principles

1. **Semantic Consistency**: The same concept should always use the same icon across all dashboards
2. **Color Conventions**: Icons should follow consistent color coding based on status
3. **Single Source of Truth**: Import all icons from `@/lib/standardIcons` instead of directly from `lucide-react`

## Color Conventions

| Color      | Usage                    | CSS Class                                    | Example Use Cases                                |
| ---------- | ------------------------ | -------------------------------------------- | ------------------------------------------------ |
| **Green**  | Success, growth, healthy | `text-status-healthy` or `bg-status-healthy` | Success rates, new items, healthy services       |
| **Yellow** | Warnings, degraded       | `text-status-warning` or `bg-status-warning` | Warnings, degraded performance, attention needed |
| **Red**    | Errors, critical         | `text-status-error` or `bg-status-error`     | Errors, failures, down services                  |
| **Blue**   | Neutral, info            | `text-primary` or `bg-primary`               | General metrics, information                     |

## Icon Vocabulary

### Activity & Status Icons

| Icon                      | Name          | When to Use                                     | Example Metrics                                      |
| ------------------------- | ------------- | ----------------------------------------------- | ---------------------------------------------------- |
| `STANDARD_ICONS.active`   | Activity      | Active processes, running agents, live activity | "Active Agents", "Running Now", pulse animations     |
| `STANDARD_ICONS.speed`    | Zap           | Speed, throughput, operations per second        | "Events/min", "Operations/Min"                       |
| `STANDARD_ICONS.trending` | TrendingUp    | Growth, trending up, new items                  | "New Today", "Trending Patterns", growth metrics     |
| `STANDARD_ICONS.success`  | CheckCircle   | Success, completion, passing quality gates      | "Success Rate", "Tests Passed", completion status    |
| `STANDARD_ICONS.warning`  | AlertTriangle | Warnings, attention needed, degraded            | "Code Smells", "Active Alerts", warnings             |
| `STANDARD_ICONS.error`    | AlertCircle   | Errors, failures, critical issues               | Error counts, failed operations                      |
| `STANDARD_ICONS.time`     | Clock         | Time, duration, latency                         | "Avg Response Time", "Avg Latency", duration metrics |

### Infrastructure Icons

| Icon                      | Name     | When to Use                     | Example Metrics                       |
| ------------------------- | -------- | ------------------------------- | ------------------------------------- |
| `STANDARD_ICONS.server`   | Server   | Server instances, microservices | "Services Online", backend services   |
| `STANDARD_ICONS.database` | Database | Database systems, storage       | "Total Patterns", database operations |
| `STANDARD_ICONS.network`  | Network  | Connections, relationships      | Network graphs, connection metrics    |
| `STANDARD_ICONS.web`      | Globe    | Web services, external APIs     | External API calls, internet services |

### Development Icons

| Icon                      | Name     | When to Use                       | Example Metrics                       |
| ------------------------- | -------- | --------------------------------- | ------------------------------------- |
| `STANDARD_ICONS.code`     | Code     | Code files, development work      | "Code Generated", development metrics |
| `STANDARD_ICONS.codeFile` | FileCode | Individual code files             | "Files Analyzed", file-level metrics  |
| `STANDARD_ICONS.cpu`      | Cpu      | Processing, computational work    | CPU usage, processing metrics         |
| `STANDARD_ICONS.gauge`    | Gauge    | Performance metrics, measurements | "Avg Complexity", performance scores  |
| `STANDARD_ICONS.security` | Shield   | Security, compliance              | "Security Issues", compliance metrics |

### Quality & Team Icons

| Icon                    | Name   | When to Use                    | Example Metrics                        |
| ----------------------- | ------ | ------------------------------ | -------------------------------------- |
| `STANDARD_ICONS.award`  | Award  | Quality, achievements          | "Avg Quality", "Pattern Reuse", awards |
| `STANDARD_ICONS.users`  | Users  | Human users, developers        | "Active Developers", team metrics      |
| `STANDARD_ICONS.bot`    | Bot    | AI agents, automated processes | Agent counts, bot activity             |
| `STANDARD_ICONS.target` | Target | Goals, targets, thresholds     | Target metrics, goal tracking          |
| `STANDARD_ICONS.search` | Search | Search, discovery, queries     | "Semantic Search", query metrics       |

### UI & Navigation Icons

| Icon                          | Name         | When to Use                    |
| ----------------------------- | ------------ | ------------------------------ |
| `STANDARD_ICONS.download`     | Download     | Export, download functionality |
| `STANDARD_ICONS.close`        | X            | Close, remove, delete actions  |
| `STANDARD_ICONS.info`         | Info         | Information, help, details     |
| `STANDARD_ICONS.chevronRight` | ChevronRight | Navigation, expansion          |
| `STANDARD_ICONS.chevronDown`  | ChevronDown  | Dropdowns, collapse            |
| `STANDARD_ICONS.arrowRight`   | ArrowRight   | Flow, progression              |

## Migration Guide

### Before (Old Pattern)

```tsx
// ❌ DON'T: Import directly from lucide-react
import { Activity, CheckCircle, Clock } from "lucide-react";

<MetricCard
  label="Active Agents"
  value={42}
  icon={Activity}
  status="healthy"
/>

<MetricCard
  label="Success Rate"
  value="95%"
  icon={CheckCircle}
  status="healthy"
/>

<MetricCard
  label="Avg Latency"
  value="85ms"
  icon={Clock}
  status="healthy"
/>
```

### After (Standard Pattern)

```tsx
// ✅ DO: Import from standardIcons
import { STANDARD_ICONS } from "@/lib/standardIcons";

<MetricCard
  label="Active Agents"
  value={42}
  icon={STANDARD_ICONS.active}
  status="healthy"
/>

<MetricCard
  label="Success Rate"
  value="95%"
  icon={STANDARD_ICONS.success}
  status="healthy"
/>

<MetricCard
  label="Avg Latency"
  value="85ms"
  icon={STANDARD_ICONS.time}
  status="healthy"
/>
```

### Loading States

```tsx
// Loading spinner
<STANDARD_ICONS.active className="h-12 w-12 animate-spin text-primary" />

// Error state
<STANDARD_ICONS.active className="h-12 w-12 text-destructive" />
```

## Dashboard-Specific Examples

### AgentOperations Dashboard

```tsx
import { STANDARD_ICONS } from "@/lib/standardIcons";

// Metrics
<MetricCard label="Active Agents" icon={STANDARD_ICONS.active} />
<MetricCard label="Total Requests" icon={STANDARD_ICONS.active} />
<MetricCard label="Avg Response Time" icon={STANDARD_ICONS.time} />
<MetricCard label="Success Rate" icon={STANDARD_ICONS.success} />
```

### PatternLearning Dashboard

```tsx
import { STANDARD_ICONS } from "@/lib/standardIcons";

// Metrics
<MetricCard label="Total Patterns" icon={STANDARD_ICONS.database} />
<MetricCard label="New Today" icon={STANDARD_ICONS.trending} />
<MetricCard label="Avg Quality" icon={STANDARD_ICONS.award} />
<MetricCard label="Active Learning" icon={STANDARD_ICONS.database} />
```

### IntelligenceOperations Dashboard

```tsx
import { STANDARD_ICONS } from "@/lib/standardIcons";

// Metrics
<MetricCard label="Active Operations" icon={STANDARD_ICONS.speed} />
<MetricCard label="Running Now" icon={STANDARD_ICONS.speed} />
<MetricCard label="Operations/Min" icon={STANDARD_ICONS.active} />
<MetricCard label="Avg Quality Impact" icon={STANDARD_ICONS.trending} />
<MetricCard label="Success Rate" icon={STANDARD_ICONS.success} />
<MetricCard label="Avg Latency" icon={STANDARD_ICONS.time} />
```

### CodeIntelligence Dashboard

```tsx
import { STANDARD_ICONS } from "@/lib/standardIcons";

// Metrics
<MetricCard label="Files Analyzed" icon={STANDARD_ICONS.codeFile} />
<MetricCard label="Avg Complexity" icon={STANDARD_ICONS.gauge} />
<MetricCard label="Code Smells" icon={STANDARD_ICONS.warning} />
<MetricCard label="Security Issues" icon={STANDARD_ICONS.warning} />
```

### PlatformHealth Dashboard

```tsx
import { STANDARD_ICONS } from "@/lib/standardIcons";

// Metrics
<MetricCard label="Services Online" icon={STANDARD_ICONS.server} />
<MetricCard label="Avg Uptime" icon={STANDARD_ICONS.active} />
<MetricCard label="Active Alerts" icon={STANDARD_ICONS.warning} />
<MetricCard label="Avg Latency" icon={STANDARD_ICONS.time} />
```

### DeveloperExperience Dashboard

```tsx
import { STANDARD_ICONS } from "@/lib/standardIcons";

// Metrics
<MetricCard label="Active Developers" icon={STANDARD_ICONS.users} />
<MetricCard label="Code Generated" icon={STANDARD_ICONS.code} />
<MetricCard label="Productivity Gain" icon={STANDARD_ICONS.trending} />
<MetricCard label="Pattern Reuse" icon={STANDARD_ICONS.award} />
```

### EventFlow Dashboard

```tsx
import { STANDARD_ICONS } from "@/lib/standardIcons";

// Metrics
<MetricCard label="Total Events" icon={STANDARD_ICONS.active} />
<MetricCard label="Event Types" icon={STANDARD_ICONS.database} />
<MetricCard label="Events/min" icon={STANDARD_ICONS.speed} />
<MetricCard label="Avg Processing" icon={STANDARD_ICONS.time} />
```

## Adding New Icons

When you need to add a new icon to the standard vocabulary:

1. **Check existing icons first**: Make sure there isn't already an appropriate icon in the standard set
2. **Import from lucide-react**: Add the import at the top of `standardIcons.ts`
3. **Add to appropriate category**: Place it in the right category object (ACTIVITY_ICONS, INFRASTRUCTURE_ICONS, etc.)
4. **Add JSDoc comment**: Explain when to use this icon
5. **Update this documentation**: Add an entry to the relevant table above
6. **Update STANDARD_ICONS**: The icon will automatically be included in the consolidated export

Example:

```typescript
// In standardIcons.ts
import { NewIcon } from 'lucide-react';

export const ACTIVITY_ICONS = {
  // ... existing icons

  /** Description of when to use this icon */
  newIconName: NewIcon,
} as const;
```

## Best Practices

1. **Always use semantic names**: Choose icons based on what they represent, not how they look
2. **Be consistent**: If one dashboard uses `trending` for "New Today", all should
3. **Follow color conventions**: Green for positive, red for negative, yellow for warnings
4. **Use tooltips**: Add tooltips to explain metrics and thresholds
5. **Test in context**: Make sure icons make sense with their labels and values

## Benefits of Standardization

1. **Visual Consistency**: Users can recognize concepts instantly across different dashboards
2. **Maintainability**: Changing an icon requires editing one file instead of searching all dashboards
3. **Type Safety**: TypeScript autocomplete helps you choose the right icon
4. **Documentation**: Single source of truth for what each icon means
5. **Scalability**: New dashboards can easily adopt the standard vocabulary

## Validation Checklist

When reviewing code that uses icons:

- [ ] Icons imported from `@/lib/standardIcons` instead of `lucide-react`
- [ ] Semantic names used (e.g., `STANDARD_ICONS.active` not `STANDARD_ICONS.Activity`)
- [ ] Color status matches metric type (success=green, warning=yellow, error=red)
- [ ] Consistent with existing dashboards for similar concepts
- [ ] JSDoc comments explain icon usage in standardIcons.ts

## Questions?

If you're unsure which icon to use:

1. Check this documentation first
2. Look at similar metrics in existing dashboards
3. Ask: "What does this metric represent?" (not "What should it look like?")
4. Consult the team if you need to add a new icon to the standard set
