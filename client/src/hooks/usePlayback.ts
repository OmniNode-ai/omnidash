/**
 * Playback Hook
 *
 * React hook for controlling event playback from the dashboard.
 * Wraps the /api/demo/* endpoints with React Query for state management.
 *
 * Features:
 * - Real-time status updates via WebSocket (when connected)
 * - Automatic fallback to HTTP polling when WebSocket disconnects
 * - Type-safe message handling with Zod validation
 * - All mutations still use REST API for reliability
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Recording, PlaybackStatus, PlaybackOptions } from '@shared/schemas/playback-config';
import { parsePlaybackWSMessage } from '@shared/schemas/playback-config';
import { useWebSocket } from '@/hooks/useWebSocket';

// Re-export types for backward compatibility
export type { Recording, PlaybackStatus, PlaybackOptions };

async function fetchRecordings(): Promise<Recording[]> {
  const res = await fetch('/api/demo/recordings');
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch recordings: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`
    );
  }
  const data = await res.json();
  return data.recordings || [];
}

async function fetchStatus(): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/status');
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch playback status: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`
    );
  }
  return res.json();
}

async function startPlayback(options: PlaybackOptions): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Failed to start playback: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`
    );
  }
  return res.json();
}

async function pausePlayback(): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/pause', { method: 'POST' });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Failed to pause playback: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`
    );
  }
  return res.json();
}

async function resumePlayback(): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/resume', { method: 'POST' });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Failed to resume playback: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`
    );
  }
  return res.json();
}

async function stopPlayback(): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/stop', { method: 'POST' });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Failed to stop playback: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`
    );
  }
  return res.json();
}

async function setSpeed(speed: number): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/speed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speed }),
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Failed to set playback speed: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`
    );
  }
  return res.json();
}

async function setLoop(loop: boolean): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/loop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loop }),
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Failed to set loop mode: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`
    );
  }
  return res.json();
}

export function usePlayback() {
  const queryClient = useQueryClient();

  // Error state for tracking mutation failures
  const [error, setError] = useState<string | null>(null);
  const clearError = () => setError(null);

  // Track if we've subscribed to playback topics
  const hasSubscribedRef = useRef(false);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback(
    (message: { type: string; data?: unknown }) => {
      // Check if this is a playback message by looking at the type prefix
      if (!message.type?.startsWith('playback:')) {
        return;
      }

      // WebSocket messages may come in an envelope with the actual data in the `data` field.
      // Try to parse from `message.data` first (envelope format), then fall back to `message` directly.
      const messagePayload =
        message.data && typeof message.data === 'object' ? message.data : message;

      // Parse and validate the playback message
      const playbackMessage = parsePlaybackWSMessage(messagePayload);
      if (!playbackMessage) {
        // Not a valid playback message, ignore
        return;
      }

      // Update the React Query cache with the new status
      // All playback messages include the full status
      queryClient.setQueryData(['playback', 'status'], playbackMessage.status);

      // Log message type for debugging (can be removed in production)
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[usePlayback] WebSocket update:', playbackMessage.type);
      }
    },
    [queryClient]
  );

  // WebSocket connection for real-time updates
  const {
    isConnected: wsConnected,
    connectionStatus: wsConnectionStatus,
    subscribe,
  } = useWebSocket({
    onMessage: handleWebSocketMessage,
    onOpen: () => {
      // Subscribe to playback events when connected
      if (!hasSubscribedRef.current) {
        subscribe(['playback']);
        hasSubscribedRef.current = true;
      }
    },
    onClose: () => {
      // Reset subscription flag on disconnect so we resubscribe on reconnect
      hasSubscribedRef.current = false;
    },
  });

  // Re-subscribe when reconnected
  useEffect(() => {
    if (wsConnected && !hasSubscribedRef.current) {
      subscribe(['playback']);
      hasSubscribedRef.current = true;
    }
  }, [wsConnected, subscribe]);

  // Fetch available recordings
  const recordings = useQuery({
    queryKey: ['playback', 'recordings'],
    queryFn: fetchRecordings,
    staleTime: 30000, // 30 seconds
  });

  // Fetch and poll playback status
  // When WebSocket is connected, we get real-time updates and don't need to poll
  // When WebSocket is disconnected, fall back to polling every 500ms when playing
  const status = useQuery({
    queryKey: ['playback', 'status'],
    queryFn: fetchStatus,
    refetchInterval: (query) => {
      // If WebSocket is connected, don't poll - we get real-time updates
      if (wsConnected) {
        return false;
      }
      // Fall back to polling every 500ms when playing and WebSocket is disconnected
      const data = query.state.data;
      return data?.isPlaying && !data?.isPaused ? 500 : false;
    },
  });

  const invalidateStatus = () => {
    queryClient.invalidateQueries({ queryKey: ['playback', 'status'] });
  };

  // Mutations with error handling
  const startMutation = useMutation({
    mutationFn: startPlayback,
    onSuccess: () => {
      setError(null);
      // Invalidate ALL queries for clean demo slate
      // This ensures dashboard components fetch fresh data after state reset
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to start playback');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: pausePlayback,
    onSuccess: () => {
      setError(null);
      invalidateStatus();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to pause playback');
    },
  });

  const resumeMutation = useMutation({
    mutationFn: resumePlayback,
    onSuccess: () => {
      setError(null);
      invalidateStatus();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to resume playback');
    },
  });

  const stopMutation = useMutation({
    mutationFn: stopPlayback,
    onSuccess: () => {
      setError(null);
      invalidateStatus();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to stop playback');
    },
  });

  const speedMutation = useMutation({
    mutationFn: setSpeed,
    onSuccess: () => {
      setError(null);
      invalidateStatus();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to set playback speed');
    },
  });

  const loopMutation = useMutation({
    mutationFn: setLoop,
    onSuccess: () => {
      setError(null);
      invalidateStatus();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to set loop mode');
    },
  });

  return {
    // Data
    recordings: recordings.data || [],
    isLoadingRecordings: recordings.isLoading,
    status: status.data,
    isLoadingStatus: status.isLoading,

    // Computed state
    isPlaying: status.data?.isPlaying || false,
    isPaused: status.data?.isPaused || false,
    progress: status.data?.progress || 0,
    currentEvent: status.data?.currentIndex || 0,
    totalEvents: status.data?.totalEvents || 0,
    // Normalize path separators (handle both / and \) for cross-platform compatibility
    currentFile: status.data?.recordingFile?.replace(/\\/g, '/').split('/').pop() || '',

    // Actions
    start: (options: PlaybackOptions) => startMutation.mutate(options),
    pause: () => pauseMutation.mutate(),
    resume: () => resumeMutation.mutate(),
    stop: () => stopMutation.mutate(),
    setSpeed: (speed: number) => speedMutation.mutate(speed),
    setLoop: (loop: boolean) => loopMutation.mutate(loop),

    // Async actions (for awaiting completion)
    startAsync: (options: PlaybackOptions) => startMutation.mutateAsync(options),
    pauseAsync: () => pauseMutation.mutateAsync(),
    resumeAsync: () => resumeMutation.mutateAsync(),
    stopAsync: () => stopMutation.mutateAsync(),
    setSpeedAsync: (speed: number) => speedMutation.mutateAsync(speed),
    setLoopAsync: (loop: boolean) => loopMutation.mutateAsync(loop),

    // Loading states
    isStarting: startMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isStopping: stopMutation.isPending,
    isSettingLoop: loopMutation.isPending,

    // Individual error states for granular error handling
    startError: startMutation.error,
    pauseError: pauseMutation.error,
    resumeError: resumeMutation.error,
    stopError: stopMutation.error,
    speedError: speedMutation.error,
    loopError: loopMutation.error,
    recordingsError: recordings.error,
    statusError: status.error,

    // Refresh
    refreshRecordings: () => recordings.refetch(),
    refreshStatus: () => status.refetch(),

    // Error handling
    error,
    clearError,

    // WebSocket connection status
    // Use this to show connection indicator in UI
    wsConnected,
    wsConnectionStatus,
  };
}
