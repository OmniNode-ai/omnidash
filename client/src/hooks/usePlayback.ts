/**
 * Playback Hook
 *
 * React hook for controlling event playback from the dashboard.
 * Wraps the /api/demo/* endpoints with React Query for state management.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Recording {
  name: string;
  path: string;
  size: number;
  eventCount: number;
}

export interface PlaybackStatus {
  success: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalEvents: number;
  progress: number;
  recordingFile: string;
}

export interface PlaybackOptions {
  file: string;
  speed?: number;
  loop?: boolean;
}

async function fetchRecordings(): Promise<Recording[]> {
  const res = await fetch('/api/demo/recordings');
  if (!res.ok) {
    throw new Error(`Failed to fetch recordings: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.recordings || [];
}

async function fetchStatus(): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/status');
  if (!res.ok) {
    throw new Error(`Failed to fetch playback status: ${res.status} ${res.statusText}`);
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
    throw new Error(`Failed to start playback: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function pausePlayback(): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/pause', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Failed to pause playback: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function resumePlayback(): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/resume', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Failed to resume playback: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function stopPlayback(): Promise<PlaybackStatus> {
  const res = await fetch('/api/demo/stop', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Failed to stop playback: ${res.status} ${res.statusText}`);
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
    throw new Error(`Failed to set playback speed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function usePlayback() {
  const queryClient = useQueryClient();

  // Error state for tracking mutation failures
  const [error, setError] = useState<string | null>(null);
  const clearError = () => setError(null);

  // Fetch available recordings
  const recordings = useQuery({
    queryKey: ['playback', 'recordings'],
    queryFn: fetchRecordings,
    staleTime: 30000, // 30 seconds
  });

  // Poll playback status when playing
  const status = useQuery({
    queryKey: ['playback', 'status'],
    queryFn: fetchStatus,
    refetchInterval: (query) => {
      // Poll every 500ms when playing, otherwise don't poll
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
    currentFile: status.data?.recordingFile?.split('/').pop() || '',

    // Actions
    start: (options: PlaybackOptions) => startMutation.mutate(options),
    pause: () => pauseMutation.mutate(),
    resume: () => resumeMutation.mutate(),
    stop: () => stopMutation.mutate(),
    setSpeed: (speed: number) => speedMutation.mutate(speed),

    // Loading states
    isStarting: startMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isStopping: stopMutation.isPending,

    // Refresh
    refreshRecordings: () => recordings.refetch(),
    refreshStatus: () => status.refetch(),

    // Error handling
    error,
    clearError,
  };
}
