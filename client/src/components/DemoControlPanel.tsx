/**
 * Demo Control Panel
 *
 * Dashboard UI for controlling event recording and playback.
 * Displays as a collapsible panel in the header area.
 */

import { useState, useEffect, useRef } from 'react';
import { usePlayback } from '@/hooks/usePlayback';
import { SPEED_OPTIONS, PLAYBACK_CONFIG } from '@shared/schemas/playback-config';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Play, Pause, Square, Film, RefreshCw, Repeat, Zap, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DemoControlPanel() {
  const {
    recordings,
    isLoadingRecordings,
    isPlaying,
    isPaused,
    progress,
    currentEvent,
    totalEvents,
    currentFile,
    start,
    pause,
    resume,
    stop,
    setSpeed,
    setLoop,
    isStarting,
    isSettingLoop,
    refreshRecordings,
    error,
    clearError,
  } = usePlayback();

  const [selectedFile, setSelectedFile] = useState<string>('');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(PLAYBACK_CONFIG.DEFAULT_SPEED);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Use ref to track current playing state for cleanup (avoids stale closure)
  const isPlayingRef = useRef(isPlaying);
  const stopRef = useRef(stop);

  // Keep refs in sync with current values
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Cleanup: stop playback when component unmounts
  useEffect(() => {
    return () => {
      if (isPlayingRef.current) {
        stopRef.current();
      }
    };
  }, []);

  const handleStart = () => {
    if (!selectedFile) return;
    start({ file: selectedFile, speed: playbackSpeed, loop: loopEnabled });
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (isPlaying) {
      setSpeed(speed);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isPlaying ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'relative gap-2',
            isPlaying && 'bg-amber-600 hover:bg-amber-700 text-white'
          )}
        >
          <Film className="w-4 h-4" />
          <span className="hidden sm:inline">Demo</span>
          {isPlaying && (
            <Badge variant="secondary" className="ml-1 bg-amber-800 text-amber-100 text-xs px-1.5">
              {Math.round(progress)}%
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Demo Playback</h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => refreshRecordings()}
              aria-label="Refresh recordings"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center justify-between text-xs text-destructive bg-destructive/10 p-2 rounded">
              <div className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                <span>{error}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={clearError}
                aria-label="Dismiss error"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Recording Selector */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Recording File</Label>
            <Select value={selectedFile} onValueChange={setSelectedFile} disabled={isPlaying}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select a recording..." />
              </SelectTrigger>
              <SelectContent>
                {isLoadingRecordings ? (
                  <SelectItem value="_loading" disabled>
                    Loading...
                  </SelectItem>
                ) : recordings.length === 0 ? (
                  <SelectItem value="_empty" disabled>
                    No recordings available
                  </SelectItem>
                ) : (
                  recordings.map((rec) => (
                    <SelectItem key={rec.name} value={rec.name}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="truncate">{rec.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {rec.eventCount} events
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Progress Bar (when playing) */}
          {isPlaying && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>
                  {currentEvent} / {totalEvents} events
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground truncate">Playing: {currentFile}</p>
            </div>
          )}

          {/* Speed Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Speed
              </Label>
              <span className="text-xs font-mono">
                {playbackSpeed === PLAYBACK_CONFIG.INSTANT_SPEED ? 'Instant' : `${playbackSpeed}x`}
              </span>
            </div>
            <div className="flex gap-1">
              {SPEED_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={playbackSpeed === opt.value ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 h-7 text-xs px-1"
                  onClick={() => handleSpeedChange(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Loop Toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Repeat className="h-3 w-3" />
              Loop Playback
            </Label>
            <Switch
              checked={loopEnabled}
              onCheckedChange={(checked) => {
                setLoopEnabled(checked);
                // Update server-side loop setting during playback
                if (isPlaying) {
                  setLoop(checked);
                }
              }}
              disabled={isSettingLoop}
            />
          </div>

          {/* Playback Controls */}
          <div className="flex gap-2 pt-2 border-t">
            {!isPlaying ? (
              <Button
                className="flex-1"
                onClick={handleStart}
                disabled={!selectedFile || isStarting}
              >
                <Play className="h-4 w-4 mr-2" />
                {isStarting ? 'Starting...' : 'Play'}
              </Button>
            ) : (
              <>
                <Button variant="outline" className="flex-1" onClick={isPaused ? resume : pause}>
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
                <Button variant="destructive" className="flex-1" onClick={stop}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              </>
            )}
          </div>

          {/* Info Footer */}
          <p className="text-xs text-muted-foreground text-center pt-2 border-t">
            Events replay through the dashboard as if live
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
