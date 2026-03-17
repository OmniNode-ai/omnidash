/**
 * LocalDataUnavailableBanner (OMN-5202)
 *
 * Shown on pages where the local Kafka/database isn't running. Instead of a
 * broken page or cryptic 500 error, users see a clear explanation and the page
 * degrades gracefully with empty/zero data.
 *
 * Usage:
 *   import { LocalDataUnavailableBanner } from '@/components/LocalDataUnavailableBanner';
 *   {source === 'unavailable' && <LocalDataUnavailableBanner />}
 *
 * For pages that know which topic produces their data:
 *   <LocalDataUnavailableBanner topic="onex.evt.omniclaude.epic-run-updated.v1" />
 */

import { WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface LocalDataUnavailableBannerProps {
  /** The Kafka topic this page listens to (optional, adds helpful context). */
  topic?: string;
  /** Override the default description text. */
  description?: string;
}

export function LocalDataUnavailableBanner({ topic, description }: LocalDataUnavailableBannerProps) {
  const defaultDescription = topic
    ? `No data from ${topic}. Start the local Kafka broker and database, then run the producer that emits to this topic.`
    : 'The local database or Kafka broker is not reachable. Start the local infrastructure (infra-up) to see live data.';

  return (
    <Alert variant="default" className="border-orange-500/50 bg-orange-500/10 mb-4">
      <WifiOff className="h-4 w-4 text-orange-500" />
      <AlertTitle className="text-orange-400">Local data unavailable</AlertTitle>
      <AlertDescription className="text-muted-foreground">
        {description ?? defaultDescription}
        {' '}
        <span className="text-muted-foreground/70 text-xs">
          Run <code className="bg-muted px-1 py-0.5 rounded text-xs">infra-up</code> to start infrastructure.
        </span>
      </AlertDescription>
    </Alert>
  );
}
