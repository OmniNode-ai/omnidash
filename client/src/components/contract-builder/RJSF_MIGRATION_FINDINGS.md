# RJSF Migration Findings: omnidash_lite vs omnidash

## Summary

The legend styling is not working in omnidash because of a **fundamental difference in the RJSF versions** used:

| Aspect | omnidash_lite (Working) | omnidash (Broken) |
|--------|-------------------------|-------------------|
| **Package** | `@rjsf/core` v5 | `@rjsf/shadcn` v6 |
| **Templates** | No built-in styling, uses our custom templates | Has built-in shadcn/ui styled templates |
| **ID Format** | `idSchema.$id` → `root_metadata_tags` (underscores) | `fieldPathId.$id` → `root.metadata.tags` (dots) |

---

## Root Cause Analysis

### 1. The @rjsf/shadcn Package Has Its Own ObjectFieldTemplate

The `@rjsf/shadcn` package provides its own `ObjectFieldTemplate` that produces **completely different HTML structure**:

**@rjsf/shadcn's built-in ObjectFieldTemplate (node_modules/@rjsf/shadcn/lib/ObjectFieldTemplate/ObjectFieldTemplate.js):**
```jsx
// Simplified structure
<>
  <TitleFieldTemplate ... />
  <DescriptionFieldTemplate ... />
  <div className='flex flex-col gap-2'>
    {properties.map(element => (
      <div className='flex'>
        <div className='w-full'>{element.content}</div>
      </div>
    ))}
  </div>
</>
```

**Our custom ObjectFieldTemplate:**
```jsx
<fieldset className="rjsf-section">
  <legend>{title}</legend>
  <div className="rjsf-fields-container">
    {properties.map(prop => prop.content)}
  </div>
</fieldset>
```

### 2. CSS Expects Specific HTML Structure

Our CSS selectors in `index.css` expect:
```css
.rjsf-form .rjsf-section > legend { /* styles */ }
.rjsf-form .rjsf-nested-section > legend { /* styles */ }
```

This requires:
1. A `.rjsf-form` wrapper ✅ (we have this on the Form component)
2. A `.rjsf-section` or `.rjsf-nested-section` class ❌ (missing if built-in template is used)
3. A `<legend>` as direct child ❌ (built-in template uses `TitleFieldTemplate` instead)

### 3. Template Override May Not Be Working

When we pass `templates={{ ObjectFieldTemplate }}` to the Form:
```typescript
<Form
  templates={templates}  // includes our ObjectFieldTemplate
  ...
>
```

The @rjsf/shadcn Form is created with `withTheme()` which applies default templates.
**Our custom templates should override the defaults**, but we need to verify this is actually happening.

---

## CSS Comparison

The CSS in both versions is **identical**. The RJSF styling section (lines 227-356 in omnidash_lite, lines 526-650 in omnidash) contains the same rules.

This confirms the issue is **not CSS** but **HTML structure**.

---

## Key Differences in Code

### ObjectFieldTemplate.tsx

| omnidash_lite (v5) | omnidash (v6) |
|--------------------|---------------|
| `idSchema?.$id` | `fieldPathId?.$id` |
| ID format: `root_metadata` | ID format: `root.metadata` |
| `isNested = id !== 'root'` | `isNested = id !== 'root' && id.startsWith('root.')` |
| Array pattern: `/^root_[a-z_]+_\d+$/i` | Array pattern: `/\.\d+$/` |

### ContractEditor.tsx

| omnidash_lite | omnidash |
|---------------|----------|
| `import Form from '@rjsf/core'` | `import Form from '@rjsf/shadcn'` |

---

## Proposed Solutions

### Solution 1: Keep @rjsf/shadcn, Ensure Templates Override (Recommended)

Add console logging to verify our template is being called:

```typescript
// In ObjectFieldTemplate.tsx
export function ObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  console.log('[ObjectFieldTemplate] Rendering:', props.fieldPathId?.$id);
  // ... rest of component
}
```

If the console.log doesn't appear, the template override is not working.

**Possible fixes:**
1. Check if there's a specific way to override templates in @rjsf/shadcn
2. Try importing `withTheme` and creating a custom themed form with our templates

### Solution 2: Use @rjsf/core Instead of @rjsf/shadcn

Change the import in ContractEditor.tsx:
```typescript
// From:
import Form from '@rjsf/shadcn';

// To:
import Form from '@rjsf/core';
```

This would match the working omnidash_lite setup exactly. However, we'd lose the built-in shadcn/ui widget styling.

### Solution 3: Hybrid Approach

Use `@rjsf/core` as the base Form but import specific widgets from `@rjsf/shadcn`:

```typescript
import Form from '@rjsf/core';
import { generateWidgets } from '@rjsf/shadcn';

const shadcnWidgets = generateWidgets();

<Form
  widgets={{ ...shadcnWidgets, ...customWidgets }}
  templates={customTemplates}  // Our templates will definitely be used
  ...
/>
```

---

## Fix Applied

Changed `ContractEditor.tsx` to import from `@rjsf/core` instead of `@rjsf/shadcn`:

```typescript
// Before:
import Form from '@rjsf/shadcn';

// After:
import Form from '@rjsf/core';
```

This matches the working omnidash_lite setup and ensures our custom templates are applied correctly.

---

## Next Steps (if issues persist)

1. **Check browser console** for `[Custom ObjectFieldTemplate]` logs to verify template is called
2. **Inspect rendered HTML** in DevTools - should see `<fieldset class="rjsf-section">` with `<legend>` children
3. If still broken, check CSS specificity or remove the debug console.log

---

## Files Reviewed

| File | Location |
|------|----------|
| ContractEditor.tsx | Both versions |
| ObjectFieldTemplate.tsx | Both versions |
| ArrayFieldTemplate.tsx | Both versions |
| FieldErrorTemplate.tsx | Both versions |
| index.css (RJSF styles) | Both versions |
| @rjsf/shadcn/lib/ObjectFieldTemplate/ObjectFieldTemplate.js | node_modules |
| @rjsf/shadcn/lib/Form/Form.js | node_modules |
| @rjsf/shadcn/lib/Theme/Theme.js | node_modules |
