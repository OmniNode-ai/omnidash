# UnifiedGraph Text Rendering Fixes

## Summary of Changes

Fixed visual issues with text rendering in the UnifiedGraph component used by Pattern Dependencies and Pattern Lineage tabs.

## Problems Fixed

### 1. Text Overflow

- **Before**: Text extended beyond circle boundaries or was cut off
- **After**: Text properly fits inside circles with adequate padding

### 2. Insufficient Padding

- **Before**: No padding between text and circle edge
- **After**: Minimum 12px padding from circle edge to text

### 3. Inconsistent Node Sizing

- **Before**: Default node size was 8px (too small)
- **After**: Default node size is 30px with documented recommended ranges

## Technical Changes

### New Helper Function: `calculateTextDisplay()`

Added intelligent text fitting algorithm that:

- Calculates available width accounting for padding (12px on each side)
- Scales font size proportionally to node radius (28% of radius)
- Uses min/max font size constraints (10-14px for normal nodes, 8px+ for small nodes)
- Estimates character width based on font size (0.6 ratio)
- Truncates text with ellipsis (…) when needed
- Shows full label on hover for truncated text

### Constants

```typescript
const MIN_FONT_SIZE = 10; // Minimum readable font size
const MAX_FONT_SIZE = 14; // Maximum font size
const NODE_PADDING = 12; // Padding between text and edge
const CHAR_WIDTH_RATIO = 0.6; // Character width estimation
```

### Node Size Recommendations

Documented in `GraphNode` interface:

- **Small nodes (25-35px)**: Shows abbreviated text (1-3 chars)
- **Medium nodes (35-50px)**: Shows short labels (4-8 chars)
- **Large nodes (50-70px)**: Shows full labels (8-12 chars)
- **Default**: 30px if not specified

### Updated Rendering

Both Canvas and SVG rendering modes now use the new `calculateTextDisplay()` helper:

**Canvas Mode**: Lines 345-360

- Uses helper to calculate fontSize and displayText
- Maintains white text on colored background

**SVG Mode**: Lines 603-648

- Uses helper for consistent text rendering
- Shows full label on hover when truncated
- Proper centering with textAnchor="middle"

## Files Modified

- `client/src/components/UnifiedGraph.tsx`
  - Added `calculateTextDisplay()` helper function
  - Updated Canvas rendering (line ~346)
  - Updated SVG rendering (line ~604)
  - Updated default node size from 8px to 30px
  - Added documentation to `GraphNode.size` interface

## Testing Instructions

1. **Start the development server**:

   ```bash
   PORT=3000 npm run dev
   ```

2. **Visit Pattern Lineage**:
   - Navigate to: **http://localhost:3000/preview/code-intelligence-suite**
   - Click on "Pattern Lineage" tab in the Code Intelligence Suite
   - Select different patterns from dropdown
   - Switch to "Tree View" to see the graph visualization
   - Verify:
     - Version labels (e.g., "v2.1.0") fit inside circles with visible padding
     - Text has 12px padding from circle edges
     - Hover shows full label below node for truncated text
     - Font size scales appropriately with node size

3. **Visit Pattern Dependencies**:
   - Same page: **http://localhost:3000/preview/code-intelligence-suite**
   - Click on "Dependencies" tab
   - View the pattern dependency graph
   - Verify:
     - Pattern names (e.g., "Authentication Pattern") fit inside nodes
     - Different node sizes display appropriate text lengths
     - Text remains readable at all sizes (25-70px radius)
     - Larger nodes show more text than smaller nodes

4. **Test Different Scenarios**:
   - **Small nodes** (25-35px): Should show abbreviated text
   - **Medium nodes** (35-50px): Should show short labels
   - **Large nodes** (50-70px): Should show full labels
   - **Hover interaction**: Should display full text below node

## Before/After Comparison

### Before

- Text calculation: `maxChars = Math.floor(radius / 3)` (inaccurate)
- Font size: `Math.max(8, Math.min(12, radius * 0.3))` (too large for small nodes)
- Padding: None
- Default size: 8px (too small)

### After

- Text calculation: Character-width-based with padding consideration
- Font size: Dynamic scaling with proper min/max (10-14px, 8px for tiny nodes)
- Padding: 12px minimum from edge
- Default size: 30px (optimal readability)

## Performance Impact

Minimal - the `calculateTextDisplay()` function is a simple calculation with no external dependencies or async operations. It runs once per node per render.

## Browser Compatibility

Works in all modern browsers. Uses standard JavaScript string methods and CSS properties.

## Future Enhancements

Potential improvements for future consideration:

1. **Canvas Text Measurement**: Use `ctx.measureText()` for more accurate width calculation
2. **Multi-line Text**: Support line wrapping for very large nodes
3. **Font Weight Variation**: Adjust font weight based on node size
4. **Adaptive Padding**: Scale padding proportionally with node size
5. **Custom Fonts**: Support for different font families per node type

## Notes

- The component now properly handles edge cases (very small nodes, very long labels)
- Hover interaction provides full context for truncated labels
- Both Canvas and SVG rendering modes have consistent behavior
- Default node size change (8→30px) may affect layouts that don't specify explicit sizes
