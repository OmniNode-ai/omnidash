/**
 * ContractBanner Component
 *
 * A dismissible informational banner with localStorage persistence.
 * Used to display contract-driven architecture information on dashboards.
 *
 * Features:
 * - Gradient background with primary color accent
 * - Dismissible with X button
 * - Persists dismissed state to localStorage
 * - Customizable icon, title, and description
 * - Reusable across different dashboards
 */

import { useState, useCallback, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, X, type LucideIcon } from 'lucide-react';

/**
 * Props for the ContractBanner component
 */
export interface ContractBannerProps {
  /** Unique key for localStorage persistence */
  storageKey: string;
  /** Icon to display (defaults to Zap) */
  icon?: LucideIcon;
  /** Bold title text */
  title: string;
  /** Description text after the title */
  description: string;
  /** Optional className for additional styling */
  className?: string;
  /** Optional children to render instead of default content */
  children?: ReactNode;
}

/**
 * Hook for managing banner dismissed state with localStorage persistence
 */
export function useBannerDismissed(storageKey: string): [boolean, () => void] {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(storageKey) === 'true';
    }
    return false;
  });

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    localStorage.setItem(storageKey, 'true');
  }, [storageKey]);

  return [isDismissed, dismiss];
}

/**
 * A dismissible informational banner with localStorage persistence.
 *
 * @example Basic usage
 * ```tsx
 * <ContractBanner
 *   storageKey="my-dashboard-banner-dismissed"
 *   title="Contract-driven dashboard"
 *   description="nodes auto-register their capabilities. No hardcoded widgets."
 * />
 * ```
 *
 * @example With custom icon
 * ```tsx
 * import { Sparkles } from 'lucide-react';
 *
 * <ContractBanner
 *   storageKey="feature-banner-dismissed"
 *   icon={Sparkles}
 *   title="New Feature"
 *   description="Try out our latest capabilities."
 * />
 * ```
 *
 * @example With custom content
 * ```tsx
 * <ContractBanner storageKey="custom-banner">
 *   <div className="flex items-center gap-2">
 *     <Badge>Beta</Badge>
 *     <span>Custom content here</span>
 *   </div>
 * </ContractBanner>
 * ```
 */
export function ContractBanner({
  storageKey,
  icon: Icon = Zap,
  title,
  description,
  className,
  children,
}: ContractBannerProps) {
  const [isDismissed, dismiss] = useBannerDismissed(storageKey);

  if (isDismissed) {
    return null;
  }

  return (
    <div
      className={`bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-3 ${className ?? ''}`}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-primary flex-shrink-0" />
        {children ?? (
          <p className="text-sm text-muted-foreground flex-1">
            <span className="font-medium text-foreground">{title}</span>
            {' — '}
            {description}
          </p>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 hover:bg-destructive/10"
          onClick={dismiss}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
