/**
 * Tests for usePlayback hook
 *
 * Tests the playback control hook that wraps /api/demo/* endpoints
 * with React Query for state management.
 *
 * Coverage includes:
 * - Fetching recordings list
 * - Fetching playback status
 * - Starting, pausing, resuming, stopping playback
 * - Speed change mutation
 * - Error handling
 * - Loading states
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePlayback } from '../usePlayback';
import type { Recording, PlaybackStatus, PlaybackOptions } from '@shared/schemas/playback-config';

// Create a fresh QueryClient for each test
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
        refetchOnWindowFocus: false,
        gcTime: Infinity,
        staleTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Wrapper component for providing QueryClient
function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// Mock data
const mockRecordings: Recording[] = [
  {
    name: 'demo-recording-1.json',
    size: 1024,
    eventCount: 50,
  },
  {
    name: 'demo-recording-2.json',
    size: 2048,
    eventCount: 100,
  },
];

const mockPlaybackStatus: PlaybackStatus = {
  success: true,
  isPlaying: false,
  isPaused: false,
  currentIndex: 0,
  totalEvents: 50,
  progress: 0,
  recordingFile: '/recordings/demo-recording-1.json',
};

const mockPlayingStatus: PlaybackStatus = {
  success: true,
  isPlaying: true,
  isPaused: false,
  currentIndex: 25,
  totalEvents: 50,
  progress: 50,
  recordingFile: '/recordings/demo-recording-1.json',
};

const mockPausedStatus: PlaybackStatus = {
  success: true,
  isPlaying: true,
  isPaused: true,
  currentIndex: 25,
  totalEvents: 50,
  progress: 50,
  recordingFile: '/recordings/demo-recording-1.json',
};

// Global fetch mock
const mockFetch = vi.fn();

describe('usePlayback', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();

    // Set up global fetch mock
    global.fetch = mockFetch;

    // Default mock implementations
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/demo/recordings') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ recordings: mockRecordings }),
        });
      }
      if (url === '/api/demo/status') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPlaybackStatus),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });
  });

  afterEach(async () => {
    queryClient.clear();
    await queryClient.cancelQueries();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // ============================================================================
  // Fetching Recordings
  // ============================================================================

  describe('fetching recordings', () => {
    it('should fetch recordings list on mount', async () => {
      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      // Initially loading
      expect(result.current.isLoadingRecordings).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingRecordings).toBe(false);
      });

      expect(result.current.recordings).toEqual(mockRecordings);
      expect(mockFetch).toHaveBeenCalledWith('/api/demo/recordings');
    });

    it('should return empty array when no recordings', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: null }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingRecordings).toBe(false);
      });

      expect(result.current.recordings).toEqual([]);
    });

    it('should handle fetch recordings error', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingRecordings).toBe(false);
      });

      // Default to empty array on error
      expect(result.current.recordings).toEqual([]);
    });

    it('should refresh recordings when refreshRecordings is called', async () => {
      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingRecordings).toBe(false);
      });

      const initialCallCount = mockFetch.mock.calls.filter(
        (call) => call[0] === '/api/demo/recordings'
      ).length;

      // Call refresh
      await act(async () => {
        await result.current.refreshRecordings();
      });

      const finalCallCount = mockFetch.mock.calls.filter(
        (call) => call[0] === '/api/demo/recordings'
      ).length;

      expect(finalCallCount).toBeGreaterThan(initialCallCount);
    });
  });

  // ============================================================================
  // Fetching Playback Status
  // ============================================================================

  describe('fetching playback status', () => {
    it('should fetch playback status on mount', async () => {
      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      expect(result.current.isLoadingStatus).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      expect(result.current.status).toEqual(mockPlaybackStatus);
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.progress).toBe(0);
      expect(result.current.currentEvent).toBe(0);
      expect(result.current.totalEvents).toBe(50);
      expect(mockFetch).toHaveBeenCalledWith('/api/demo/status');
    });

    it('should compute currentFile from recordingFile path', async () => {
      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      expect(result.current.currentFile).toBe('demo-recording-1.json');
    });

    it('should handle fetch status error', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      // Status should be undefined on error
      expect(result.current.status).toBeUndefined();
      // Computed values should have defaults
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.progress).toBe(0);
    });

    it('should refresh status when refreshStatus is called', async () => {
      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      const initialCallCount = mockFetch.mock.calls.filter(
        (call) => call[0] === '/api/demo/status'
      ).length;

      await act(async () => {
        await result.current.refreshStatus();
      });

      const finalCallCount = mockFetch.mock.calls.filter(
        (call) => call[0] === '/api/demo/status'
      ).length;

      expect(finalCallCount).toBeGreaterThan(initialCallCount);
    });
  });

  // ============================================================================
  // Start Playback Mutation
  // ============================================================================

  describe('start playback mutation', () => {
    it('should start playback with correct options', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        if (url === '/api/demo/start' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      const playbackOptions: PlaybackOptions = {
        file: '/recordings/demo-recording-1.json',
        speed: 2,
        loop: false,
      };

      await act(async () => {
        result.current.start(playbackOptions);
      });

      await waitFor(() => {
        expect(result.current.isStarting).toBe(false);
      });

      // Verify POST request
      const startCall = mockFetch.mock.calls.find((call) => call[0] === '/api/demo/start');
      expect(startCall).toBeDefined();
      expect(startCall?.[1]).toEqual({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(playbackOptions),
      });
    });

    it('should set isStarting to true while starting', async () => {
      let resolveStart: ((value: Response) => void) | undefined;
      const startPromise = new Promise<Response>((resolve) => {
        resolveStart = resolve;
      });

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        if (url === '/api/demo/start' && options?.method === 'POST') {
          return startPromise;
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      // Start playback (don't await)
      act(() => {
        result.current.start({ file: 'test.json', speed: 1, loop: false });
      });

      // Wait for the mutation to be in pending state
      await waitFor(() => {
        expect(result.current.isStarting).toBe(true);
      });

      // Resolve the promise
      await act(async () => {
        resolveStart?.({
          ok: true,
          json: () => Promise.resolve(mockPlayingStatus),
        } as Response);
      });

      await waitFor(() => {
        expect(result.current.isStarting).toBe(false);
      });
    });

    it('should handle start playback error', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        if (url === '/api/demo/start' && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.start({ file: 'test.json', speed: 1, loop: false });
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to start playback: 400 Bad Request');
      });
    });

    it('should use startAsync for awaitable mutation', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        if (url === '/api/demo/start' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      let returnedStatus: PlaybackStatus | undefined;
      await act(async () => {
        returnedStatus = await result.current.startAsync({
          file: 'test.json',
          speed: 1,
          loop: false,
        });
      });

      expect(returnedStatus).toEqual(mockPlayingStatus);
    });
  });

  // ============================================================================
  // Pause Playback Mutation
  // ============================================================================

  describe('pause playback mutation', () => {
    it('should pause playback', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/pause' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPausedStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.pause();
      });

      await waitFor(() => {
        expect(result.current.isPausing).toBe(false);
      });

      // Verify POST request
      const pauseCall = mockFetch.mock.calls.find((call) => call[0] === '/api/demo/pause');
      expect(pauseCall).toBeDefined();
      expect(pauseCall?.[1]).toEqual({ method: 'POST' });
    });

    it('should handle pause error', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/pause' && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.pause();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to pause playback: 500 Internal Server Error');
      });
    });

    it('should use pauseAsync for awaitable mutation', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/pause' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPausedStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      let returnedStatus: PlaybackStatus | undefined;
      await act(async () => {
        returnedStatus = await result.current.pauseAsync();
      });

      expect(returnedStatus).toEqual(mockPausedStatus);
    });
  });

  // ============================================================================
  // Resume Playback Mutation
  // ============================================================================

  describe('resume playback mutation', () => {
    it('should resume playback', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPausedStatus),
          });
        }
        if (url === '/api/demo/resume' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.resume();
      });

      await waitFor(() => {
        expect(result.current.isResuming).toBe(false);
      });

      const resumeCall = mockFetch.mock.calls.find((call) => call[0] === '/api/demo/resume');
      expect(resumeCall).toBeDefined();
      expect(resumeCall?.[1]).toEqual({ method: 'POST' });
    });

    it('should handle resume error', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPausedStatus),
          });
        }
        if (url === '/api/demo/resume' && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 409,
            statusText: 'Conflict',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.resume();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to resume playback: 409 Conflict');
      });
    });

    it('should use resumeAsync for awaitable mutation', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPausedStatus),
          });
        }
        if (url === '/api/demo/resume' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      let returnedStatus: PlaybackStatus | undefined;
      await act(async () => {
        returnedStatus = await result.current.resumeAsync();
      });

      expect(returnedStatus).toEqual(mockPlayingStatus);
    });
  });

  // ============================================================================
  // Stop Playback Mutation
  // ============================================================================

  describe('stop playback mutation', () => {
    it('should stop playback', async () => {
      const stoppedStatus: PlaybackStatus = {
        ...mockPlaybackStatus,
        isPlaying: false,
        isPaused: false,
        currentIndex: 0,
        progress: 0,
      };

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/stop' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(stoppedStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.stop();
      });

      await waitFor(() => {
        expect(result.current.isStopping).toBe(false);
      });

      const stopCall = mockFetch.mock.calls.find((call) => call[0] === '/api/demo/stop');
      expect(stopCall).toBeDefined();
      expect(stopCall?.[1]).toEqual({ method: 'POST' });
    });

    it('should handle stop error', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/stop' && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.stop();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to stop playback: 500 Internal Server Error');
      });
    });

    it('should use stopAsync for awaitable mutation', async () => {
      const stoppedStatus: PlaybackStatus = {
        ...mockPlaybackStatus,
        isPlaying: false,
        isPaused: false,
      };

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/stop' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(stoppedStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      let returnedStatus: PlaybackStatus | undefined;
      await act(async () => {
        returnedStatus = await result.current.stopAsync();
      });

      expect(returnedStatus).toEqual(stoppedStatus);
    });
  });

  // ============================================================================
  // Speed Change Mutation
  // ============================================================================

  describe('speed change mutation', () => {
    it('should change playback speed', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/speed' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.setSpeed(5);
      });

      // Verify POST request with speed
      const speedCall = mockFetch.mock.calls.find((call) => call[0] === '/api/demo/speed');
      expect(speedCall).toBeDefined();
      expect(speedCall?.[1]).toEqual({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: 5 }),
      });
    });

    it('should handle speed change error', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/speed' && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.setSpeed(-1);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to set playback speed: 400 Bad Request');
      });
    });

    it('should use setSpeedAsync for awaitable mutation', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/speed' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      let returnedStatus: PlaybackStatus | undefined;
      await act(async () => {
        returnedStatus = await result.current.setSpeedAsync(10);
      });

      expect(returnedStatus).toEqual(mockPlayingStatus);
    });

    it('should handle instant speed (0)', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/speed' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.setSpeed(0);
      });

      const speedCall = mockFetch.mock.calls.find((call) => call[0] === '/api/demo/speed');
      expect(speedCall).toBeDefined();
      expect(JSON.parse(speedCall?.[1]?.body as string)).toEqual({ speed: 0 });
    });
  });

  // ============================================================================
  // Set Loop Mutation
  // ============================================================================

  describe('setLoop mutation', () => {
    it('should enable loop mode', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/loop' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.setLoop(true);
      });

      // Verify POST request with loop: true
      const loopCall = mockFetch.mock.calls.find((call) => call[0] === '/api/demo/loop');
      expect(loopCall).toBeDefined();
      expect(loopCall?.[1]).toEqual({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loop: true }),
      });
    });

    it('should disable loop mode', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/loop' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.setLoop(false);
      });

      // Verify POST request with loop: false
      const loopCall = mockFetch.mock.calls.find((call) => call[0] === '/api/demo/loop');
      expect(loopCall).toBeDefined();
      expect(loopCall?.[1]).toEqual({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loop: false }),
      });
    });

    it('should handle setLoop error', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/loop' && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.setLoop(true);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to set loop mode: 400 Bad Request');
      });
    });

    it('should use setLoopAsync for awaitable mutation', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/loop' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      let returnedStatus: PlaybackStatus | undefined;
      await act(async () => {
        returnedStatus = await result.current.setLoopAsync(true);
      });

      expect(returnedStatus).toEqual(mockPlayingStatus);
    });

    it('should set isSettingLoop to true while mutation is pending', async () => {
      let resolveLoop: ((value: Response) => void) | undefined;
      const loopPromise = new Promise<Response>((resolve) => {
        resolveLoop = resolve;
      });

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        if (url === '/api/demo/loop' && options?.method === 'POST') {
          return loopPromise;
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      // Start the mutation (don't await)
      act(() => {
        result.current.setLoop(true);
      });

      // Wait for the mutation to be in pending state
      await waitFor(() => {
        expect(result.current.isSettingLoop).toBe(true);
      });

      // Resolve the promise
      await act(async () => {
        resolveLoop?.({
          ok: true,
          json: () => Promise.resolve(mockPlayingStatus),
        } as Response);
      });

      await waitFor(() => {
        expect(result.current.isSettingLoop).toBe(false);
      });
    });

    it('should handle server error (500)', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        if (url === '/api/demo/loop' && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.setLoop(false);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to set loop mode: 500 Internal Server Error');
      });
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('error handling', () => {
    it('should clear error on successful mutation', async () => {
      let shouldFail = true;

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        if (url === '/api/demo/start' && options?.method === 'POST') {
          if (shouldFail) {
            return Promise.resolve({
              ok: false,
              status: 500,
              statusText: 'Internal Server Error',
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      // First call should fail and set error
      await act(async () => {
        result.current.start({ file: 'test.json', speed: 1, loop: false });
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Second call should succeed and clear error
      shouldFail = false;

      await act(async () => {
        result.current.start({ file: 'test.json', speed: 1, loop: false });
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    it('should allow manual error clearing via clearError', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        if (url === '/api/demo/start' && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.start({ file: 'test.json', speed: 1, loop: false });
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Clear error manually
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it('should set default error message when error has no message', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlaybackStatus),
          });
        }
        if (url === '/api/demo/stop' && options?.method === 'POST') {
          // Simulate network error with no message
          return Promise.reject(new Error(''));
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      await act(async () => {
        result.current.stop();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to stop playback');
      });
    });
  });

  // ============================================================================
  // Loading States
  // ============================================================================

  describe('loading states', () => {
    it('should track all loading states independently', async () => {
      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      // Initially, queries should be loading
      expect(result.current.isLoadingRecordings).toBe(true);
      expect(result.current.isLoadingStatus).toBe(true);

      // Mutations should not be loading
      expect(result.current.isStarting).toBe(false);
      expect(result.current.isPausing).toBe(false);
      expect(result.current.isResuming).toBe(false);
      expect(result.current.isStopping).toBe(false);

      await waitFor(() => {
        expect(result.current.isLoadingRecordings).toBe(false);
        expect(result.current.isLoadingStatus).toBe(false);
      });
    });
  });

  // ============================================================================
  // Computed State
  // ============================================================================

  describe('computed state', () => {
    it('should compute isPlaying from status', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPlayingStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      expect(result.current.isPlaying).toBe(true);
      expect(result.current.isPaused).toBe(false);
    });

    it('should compute isPaused from status', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPausedStatus),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      expect(result.current.isPlaying).toBe(true);
      expect(result.current.isPaused).toBe(true);
    });

    it('should compute progress from status', async () => {
      const statusWithProgress: PlaybackStatus = {
        ...mockPlaybackStatus,
        progress: 75,
        currentIndex: 37,
      };

      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(statusWithProgress),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      expect(result.current.progress).toBe(75);
      expect(result.current.currentEvent).toBe(37);
      expect(result.current.totalEvents).toBe(50);
    });

    it('should handle empty recordingFile path', async () => {
      const statusWithEmptyFile: PlaybackStatus = {
        ...mockPlaybackStatus,
        recordingFile: '',
      };

      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/demo/recordings') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ recordings: mockRecordings }),
          });
        }
        if (url === '/api/demo/status') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(statusWithEmptyFile),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`));
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => usePlayback(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatus).toBe(false);
      });

      expect(result.current.currentFile).toBe('');
    });
  });
});
