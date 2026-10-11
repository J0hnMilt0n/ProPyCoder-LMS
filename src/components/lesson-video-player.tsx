"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ChangeEvent } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getLessonVideoSource } from "@/lib/lesson-video-sources";

const RATES = [1, 1.25, 1.5, 2];

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const VOLUME_KEY = "propycoder-video-volume";
const MUTED_KEY = "propycoder-video-muted";
const PROGRESS_PREFIX = "propycoder-video-progress:";

interface LessonVideoPlayerProps {
  lessonId: string;
  videoId: string | null;
  title: string;
}

/**
 * Native <video> player with a custom control bar (play/pause, scrubber,
 * skip, volume, speed, fullscreen, keyboard shortcuts). The source URL is
 * resolved from the obfuscated hardcoded map — no YouTube embed.
 */
export function LessonVideoPlayer({
  lessonId,
  videoId,
  title,
}: LessonVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRestoredRef = useRef(false);
  const lastSavedTimeRef = useRef(0);

  const [src, setSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [rateIndex, setRateIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Resolve the obfuscated source after mount so the server render and the
  // first client render always agree (avoids a hydration mismatch).
  useEffect(() => {
    progressRestoredRef.current = false;
    lastSavedTimeRef.current = 0;
    setSrc(getLessonVideoSource(videoId));
  }, [videoId]);

  const saveProgress = useCallback(() => {
    if (!lessonId) return;
    try {
      const time = videoRef.current?.currentTime ?? 0;
      if (time > 0) {
        window.localStorage.setItem(
          `${PROGRESS_PREFIX}${lessonId}`,
          String(time),
        );
      }
    } catch {
      // Storage unavailable — playback still works, just no persistence.
    }
  }, [lessonId]);

  // Persist playback position when the tab hides or the player unmounts
  // (covers refresh, closing the tab, and navigating to another lesson).
  useEffect(() => {
    const persist = () => saveProgress();
    const onVisibilityChange = () => {
      // Save the instant the tab is hidden (e.g. switching to the lab) —
      // more reliable than relying on unmount alone with route caching.
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      saveProgress();
    };
  }, [saveProgress]);

  // Restore saved volume + mute state once on mount.
  useEffect(() => {
    try {
      const rawVolume = window.localStorage.getItem(VOLUME_KEY);
      const rawMuted = window.localStorage.getItem(MUTED_KEY);
      let restoredMuted = false;
      if (rawVolume !== null) {
        const value = Number(rawVolume);
        if (Number.isFinite(value)) {
          const clamped = Math.min(1, Math.max(0, value));
          setVolume(clamped);
          restoredMuted = clamped === 0;
          if (videoRef.current) videoRef.current.volume = clamped;
        }
      }
      if (rawMuted !== null) {
        restoredMuted = rawMuted === "1" || restoredMuted;
      }
      if (restoredMuted) {
        setIsMuted(true);
        if (videoRef.current) videoRef.current.muted = true;
      }
    } catch {
      // Storage unavailable — keep defaults.
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 2800);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
    revealControls();
  }, [revealControls]);

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      const target = video.currentTime + delta;
      video.currentTime = Math.min(
        Math.max(target, 0),
        Number.isFinite(video.duration) ? video.duration : 0,
      );
      setCurrentTime(video.currentTime);
      revealControls();
    },
    [revealControls],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    if (!nextMuted && video.volume === 0) {
      video.volume = 0.5;
      setVolume(0.5);
    }
    setIsMuted(nextMuted);
    try {
      window.localStorage.setItem(MUTED_KEY, nextMuted ? "1" : "0");
      window.localStorage.setItem(VOLUME_KEY, String(video.volume));
    } catch {
      // Storage unavailable.
    }
    revealControls();
  }, [revealControls]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void rootRef.current?.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const cycleRate = useCallback(() => {
    const video = videoRef.current;
    const next = (rateIndex + 1) % RATES.length;
    setRateIndex(next);
    if (video) video.playbackRate = RATES[next];
    revealControls();
  }, [rateIndex, revealControls]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"))
      return;
    switch (event.key) {
      case " ":
      case "k":
        event.preventDefault();
        togglePlay();
        break;
      case "ArrowRight":
        event.preventDefault();
        skip(5);
        break;
      case "ArrowLeft":
        event.preventDefault();
        skip(-5);
        break;
      case "m":
        toggleMute();
        break;
      case "f":
        toggleFullscreen();
        break;
      default:
        break;
    }
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(event.target.value);
    setCurrentTime(video.currentTime);
  };

  const handleVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    const value = Number(event.target.value);
    setVolume(value);
    setIsMuted(value === 0);
    if (video) {
      video.volume = value;
      video.muted = value === 0;
    }
    try {
      window.localStorage.setItem(VOLUME_KEY, String(value));
      window.localStorage.setItem(MUTED_KEY, value === 0 ? "1" : "0");
    } catch {
      // Storage unavailable.
    }
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePct = (isMuted ? 0 : volume) * 100;

  return (
    <div
      ref={rootRef}
      className="lvp-root"
      tabIndex={0}
      aria-label={`Video player: ${title}`}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        if (videoRef.current && !videoRef.current.paused) {
          setControlsVisible(false);
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <video
        ref={videoRef}
        src={src ?? undefined}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onPlay={() => {
          setIsPlaying(true);
          setHasStarted(true);
        }}
        onPause={() => {
          setIsPlaying(false);
          setControlsVisible(true);
          saveProgress();
        }}
        onEnded={() => {
          setIsPlaying(false);
          setControlsVisible(true);
          // Finished — start fresh next time.
          try {
            if (lessonId) {
              window.localStorage.removeItem(`${PROGRESS_PREFIX}${lessonId}`);
            }
          } catch {
            // Storage unavailable.
          }
        }}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          setCurrentTime(time);
          // Throttled save every ~5s so a crash/refresh loses little.
          if (Math.abs(time - lastSavedTimeRef.current) >= 5) {
            lastSavedTimeRef.current = time;
            saveProgress();
          }
        }}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration);
          if (progressRestoredRef.current || !lessonId) return;
          progressRestoredRef.current = true;
          try {
            const raw = window.localStorage.getItem(
              `${PROGRESS_PREFIX}${lessonId}`,
            );
            const saved = raw === null ? NaN : Number(raw);
            if (
              Number.isFinite(saved) &&
              saved > 1 &&
              Number.isFinite(video.duration) &&
              saved < video.duration - 1
            ) {
              video.currentTime = saved;
              setCurrentTime(saved);
            }
          } catch {
            // Storage unavailable.
          }
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setHasError(false);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onError={() => {
          setIsBuffering(false);
          setHasError(true);
        }}
      />

      {!src && (
        <div className="lvp-loading">
          {videoId ? "Preparing player…" : "No video for this lesson"}
        </div>
      )}

      {hasError && (
        <button
          type="button"
          className="lvp-loading lvp-error"
          role="alert"
          onClick={() => {
            // Drop and re-resolve the source to force a fresh load attempt.
            setHasError(false);
            setSrc(null);
            window.setTimeout(() => {
              setSrc(getLessonVideoSource(videoId));
            }, 150);
          }}
        >
          This video could not be loaded. Click to retry.
        </button>
      )}

      {isBuffering && src && (
        <div className="lvp-spinner" role="status" aria-label="Buffering" />
      )}

      {src && !hasStarted && (
        <button
          type="button"
          className="lvp-big-play"
          aria-label={`Play ${title}`}
          onClick={togglePlay}
        >
          <Play size={34} fill="currentColor" strokeWidth={1.5} />
        </button>
      )}

      <div
        className={`lvp-controls ${
          controlsVisible || !isPlaying ? "is-visible" : ""
        }`}
      >
        <input
          type="range"
          className="lvp-progress"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          aria-label="Seek"
          onChange={handleSeek}
          style={{ "--lvp-pct": `${progressPct}%` } as CSSProperties}
        />
        <div className="lvp-row">
          <button
            type="button"
            className="lvp-btn"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={togglePlay}
          >
            {isPlaying ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            className="lvp-btn"
            aria-label="Back 10 seconds"
            onClick={() => skip(-10)}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="lvp-btn"
            aria-label="Forward 10 seconds"
            onClick={() => skip(10)}
          >
            <RotateCw size={14} />
          </button>
          <span className="lvp-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <span className="lvp-spacer" />
          <button
            type="button"
            className="lvp-btn"
            aria-label={isMuted ? "Unmute" : "Mute"}
            onClick={toggleMute}
          >
            {isMuted || volume === 0 ? (
              <VolumeX size={15} />
            ) : (
              <Volume2 size={15} />
            )}
          </button>
          <input
            type="range"
            className="lvp-volume"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            aria-label="Volume"
            onChange={handleVolume}
            style={{ "--lvp-pct": `${volumePct}%` } as CSSProperties}
          />
          <button
            type="button"
            className="lvp-btn lvp-rate"
            aria-label="Playback speed"
            onClick={cycleRate}
          >
            {RATES[rateIndex]}×
          </button>
          <button
            type="button"
            className="lvp-btn"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

