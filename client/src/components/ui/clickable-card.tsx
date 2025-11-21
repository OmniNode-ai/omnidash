import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from './card';

/**
 * ClickableCard Component
 *
 * A reusable wrapper around the Card component that adds consistent
 * interactive behavior including hover effects, focus states, and
 * keyboard accessibility.
 *
 * @example
 * // Basic usage with onClick
 * <ClickableCard onClick={() => console.log('Clicked!')}>
 *   <CardHeader>
 *     <CardTitle>Click Me</CardTitle>
 *   </CardHeader>
 * </ClickableCard>
 *
 * @example
 * // Usage with href (link behavior)
 * <ClickableCard href="/details">
 *   <CardContent>Navigate to details</CardContent>
 * </ClickableCard>
 *
 * @example
 * // With custom styling
 * <ClickableCard
 *   onClick={handleClick}
 *   className="hover:border-primary"
 *   disabled={isLoading}
 * >
 *   <CardContent>Custom styled card</CardContent>
 * </ClickableCard>
 */

export interface ClickableCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Click handler for the card
   */
  onClick?: (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => void;

  /**
   * Optional href for link behavior (alternative to onClick)
   */
  href?: string;

  /**
   * Disabled state - prevents interaction and applies disabled styling
   */
  disabled?: boolean;

  /**
   * Additional CSS classes to apply
   */
  className?: string;

  /**
   * Card content
   */
  children?: React.ReactNode;
}

const ClickableCard = React.forwardRef<HTMLDivElement, ClickableCardProps>(
  ({ className, onClick, href, disabled = false, children, ...props }, ref) => {
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;

      if (href) {
        // If href is provided, navigate to it
        window.location.href = href;
      } else if (onClick) {
        onClick(event);
      }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      // Trigger on Enter or Space
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (href) {
          window.location.href = href;
        } else if (onClick) {
          onClick(event);
        }
      }
    };

    return (
      <Card
        ref={ref}
        className={cn(
          // Base interactive styles
          'cursor-pointer transition-all duration-200 ease-in-out',
          // Hover effects - scale up and enhance shadow/border
          'hover:shadow-lg hover:scale-[1.02] hover:border-primary/50',
          // Focus styles for keyboard navigation
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          // Active state - scale down for press feedback
          'active:scale-[0.98]',
          // Disabled state
          disabled &&
            'opacity-50 cursor-not-allowed hover:shadow-sm hover:scale-100 hover:border-card-border',
          className
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role={href ? 'link' : 'button'}
        aria-disabled={disabled}
        {...props}
      >
        {children}
      </Card>
    );
  }
);

ClickableCard.displayName = 'ClickableCard';

export { ClickableCard };
