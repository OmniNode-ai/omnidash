/**
 * DemoBanner (OMN-2298)
 *
 * A persistent banner shown on every page when demo mode is active.
 *
 * Placement: render at the top of each page component (or wrap routes in
 * a layout that includes it). The banner is dismissible per-session via
 * local state but reappears on next page navigation.
 *
 * Usage:
 *   import { DemoBanner } from '@/components/DemoBanner';
 *   // At the top of a page component's JSX:
 *   <DemoBanner />
 */

import { useDemoMode } from '@/contexts/DemoModeContext';
import { FlaskConical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function DemoBanner() {
  const { isDemoMode, toggleDemoMode } = useDemoMode();
  const [dismissed, setDismissed] = useState(false);

  if (!isDemoMode || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 mb-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-amber-400 flex-shrink-0" />
        <span className="text-sm font-medium">Demo Mode</span>
        <span className="text-sm text-amber-300/80">
          — Showing pre-recorded sample data. No live Kafka or database queries are made.
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-amber-300 hover:text-amber-100 hover:bg-amber-500/20"
          onClick={toggleDemoMode}
        >
          Exit Demo
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-amber-400 hover:text-amber-100 hover:bg-amber-500/20"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss demo banner"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
