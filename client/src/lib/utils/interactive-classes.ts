import { cn } from "@/lib/utils";

/**
 * Interactive Styling Utilities
 *
 * Reusable utility functions and class strings for consistent
 * interactive element styling across the application.
 *
 * These utilities follow the Carbon Design System principles
 * optimized for data-dense enterprise dashboards.
 */

/**
 * Standard clickable card classes
 *
 * Use this for any card-like element that should be interactive.
 * Includes hover effects, focus states, and smooth transitions.
 *
 * @example
 * <div className={clickableCardClasses}>
 *   Card content
 * </div>
 */
export const clickableCardClasses = cn(
  // Cursor and transitions
  "cursor-pointer transition-all duration-200",
  // Hover effects
  "hover:shadow-lg hover:border-primary/50 hover:-translate-y-0.5",
  // Focus styles for accessibility
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
  // Active state
  "active:scale-[0.98]"
);

/**
 * Clickable table row classes
 *
 * Use this for table rows that should be interactive.
 * More subtle than card hover effects to maintain table density.
 *
 * @example
 * <tr className={clickableRowClasses} onClick={handleRowClick}>
 *   <td>Cell content</td>
 * </tr>
 */
export const clickableRowClasses = cn(
  "cursor-pointer transition-colors duration-150",
  "hover:bg-accent/50",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
  "active:bg-accent/70"
);

/**
 * Clickable list item classes
 *
 * Use this for list items in dropdowns, navigation menus, etc.
 *
 * @example
 * <li className={clickableListItemClasses} onClick={handleSelect}>
 *   Item text
 * </li>
 */
export const clickableListItemClasses = cn(
  "cursor-pointer transition-colors duration-150",
  "hover:bg-accent/80 hover:text-accent-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
  "active:bg-accent"
);

/**
 * Disabled interactive element classes
 *
 * Apply these to any interactive element that should appear disabled.
 *
 * @example
 * <button className={cn(clickableCardClasses, disabledClasses)}>
 *   Disabled button
 * </button>
 */
export const disabledClasses = cn(
  "opacity-50 cursor-not-allowed",
  "hover:shadow-sm hover:translate-y-0 hover:border-card-border hover:bg-transparent"
);

/**
 * Utility function to create interactive element classes
 *
 * Combines base classes with standard interactive behavior.
 * Useful when you need to add interactive behavior to custom elements.
 *
 * @param baseClasses - Base CSS classes for the element
 * @param variant - Interactive variant ('card' | 'row' | 'list' | 'subtle')
 * @param disabled - Whether the element is disabled
 *
 * @example
 * // Card-style interactive element
 * <div className={interactiveClasses("p-4 rounded-lg", "card")}>
 *   Content
 * </div>
 *
 * @example
 * // Disabled state
 * <div className={interactiveClasses("p-4", "card", true)}>
 *   Disabled content
 * </div>
 */
export function interactiveClasses(
  baseClasses: string,
  variant: "card" | "row" | "list" | "subtle" = "card",
  disabled: boolean = false
): string {
  const variantClasses = {
    card: clickableCardClasses,
    row: clickableRowClasses,
    list: clickableListItemClasses,
    subtle: cn(
      "cursor-pointer transition-opacity duration-150",
      "hover:opacity-80",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    ),
  };

  return cn(
    baseClasses,
    variantClasses[variant],
    disabled && disabledClasses
  );
}

/**
 * Utility function to create keyboard event handlers
 *
 * Handles Enter and Space key presses for accessibility.
 *
 * @param callback - Function to call when Enter or Space is pressed
 *
 * @example
 * <div
 *   onClick={handleClick}
 *   onKeyDown={createKeyboardHandler(handleClick)}
 *   tabIndex={0}
 * >
 *   Clickable content
 * </div>
 */
export function createKeyboardHandler(
  callback: (event: React.KeyboardEvent) => void
): (event: React.KeyboardEvent) => void {
  return (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      callback(event);
    }
  };
}

/**
 * Utility function to get ARIA attributes for interactive elements
 *
 * Returns appropriate ARIA attributes based on element type and state.
 *
 * @param options - Configuration options
 *
 * @example
 * <div {...getInteractiveAriaProps({ role: "button", disabled: false })}>
 *   Button content
 * </div>
 */
export function getInteractiveAriaProps(options: {
  role?: "button" | "link" | "menuitem";
  disabled?: boolean;
  pressed?: boolean;
  expanded?: boolean;
}): Record<string, any> {
  const { role = "button", disabled = false, pressed, expanded } = options;

  return {
    role,
    tabIndex: disabled ? -1 : 0,
    "aria-disabled": disabled || undefined,
    "aria-pressed": pressed,
    "aria-expanded": expanded,
  };
}
