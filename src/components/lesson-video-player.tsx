"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ChangeEvent } from "react";
import {
  Maximize,
  Lock,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Unlock,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getLessonVideoSource } from "@/lib/lesson-video-sources";
import { extractYouTubeId } from "@/lib/youtube";

const RATES = [0.25, 0.5, 1, 1.25, 1.5, 2];

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
const RATE_KEY = "propycoder-video-rate";

interface LessonVideoPlayerProps {
  lessonId: string;
  videoId: string | null;
  title: string;
  videoUrl?: string | null;
}

/**
 * Native <video> player with a custom control bar (play/pause, scrubber,
 * skip, volume, speed, fullscreen, keyboard shortcuts). The source URL is
 * resolved from the obfuscated hardcoded map — no YouTube embed.
 */
export function LessonVideoPlayer({
  lessonId,
  videoId,
  videoUrl,
  title,
}: LessonVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const [ytReady, setYtReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRestoredRef = useRef(false);
  const lastSavedTimeRef = useRef(0);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const resolvedFromMap = getLessonVideoSource(videoId);
  const isDirectVideoUrl =
    !!videoUrl && !/youtube\.com|youtu\.be/i.test(videoUrl);
  const src = resolvedFromMap ?? (isDirectVideoUrl ? videoUrl! : null);
  const youtubeId = videoId ?? (videoUrl ? extractYouTubeId(videoUrl) : null);
  const isYouTube = !src && !!youtubeId;
  const hasMedia = !!src || isYouTube;
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [rateIndex, setRateIndex] = useState(2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isRotated, setIsRotated] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isOrientationLocked, setIsOrientationLocked] = useState(false);

  useEffect(() => {
  const media = window.matchMedia("(max-width: 1024px)");
  const update = () => setIsMobile(media.matches);
  update();
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}, []);

  useEffect(() => {
    const media = window.matchMedia("(orientation: portrait)");
    const update = () => setIsPortrait(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let frame = 0;
    try {
      const savedRate = Number(localStorage.getItem(RATE_KEY));
      const savedIndex = RATES.indexOf(savedRate);
      if (savedIndex !== -1) {
        frame = window.requestAnimationFrame(() => {
          setRateIndex(savedIndex);
          if (videoRef.current) videoRef.current.playbackRate = savedRate;
        });
      }
    } catch {
      // Storage unavailable; use the default rate.
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Reset non-React playback bookkeeping when the lesson changes; the media
  // element reload is scheduled after the new source has rendered.
  useEffect(() => {
    progressRestoredRef.current = false;
    lastSavedTimeRef.current = 0;
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

  // Restore saved volume + mute state on the mounted media element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const rawVolume = window.localStorage.getItem(VOLUME_KEY);
      const rawMuted = window.localStorage.getItem(MUTED_KEY);
      let restoredMuted = rawMuted === "1";
      if (rawVolume !== null) {
        const value = Number(rawVolume);
        if (Number.isFinite(value)) {
          const clamped = Math.min(1, Math.max(0, value));
          restoredMuted = clamped === 0 || restoredMuted;
          video.volume = clamped;
        }
      }
      if (restoredMuted) {
        video.muted = true;
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
    const syncFullscreen = () => {
      const fullscreen = document.fullscreenElement === rootRef.current;

      if (isMobile) {
        setIsNativeFullscreen(fullscreen);
        if (!fullscreen) {
          setIsFullscreen(false);
          setIsRotated(false);
          setIsOrientationLocked(false);
          try {
            const orientation = window.screen.orientation as ScreenOrientation & {
              unlock?: () => void;
            };
            orientation.unlock?.();
          } catch {
            // Orientation locking is optional and browser-dependent.
          }
        }
        return;
      }

      setIsFullscreen(fullscreen);
      if (!fullscreen) setIsRotated(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
    };
  }, [isMobile, isNativeFullscreen]);

  useEffect(() => {
    if (!isMobile || !isFullscreen) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
        setIsRotated(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, isMobile]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 2800);
  }, []);

  // YouTube IFrame API integration (custom controls over YouTube)
  useEffect(() => {
    if (!isYouTube || !youtubeId) return;

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (pollInterval) return;
      pollInterval = setInterval(() => {
        const p = ytPlayerRef.current;
        if (!p) return;
        try {
          const t = p.getCurrentTime?.();
          if (typeof t === "number") {
            setCurrentTime(t);
            if (Math.abs(t - lastSavedTimeRef.current) >= 5) {
              lastSavedTimeRef.current = t;
              // save progress best-effort
              if (lessonId) {
                try {
                  window.localStorage.setItem(
                    `${PROGRESS_PREFIX}${lessonId}`,
                    String(t),
                  );
                } catch {
                  // ignore
                }
              }
            }
          }
          const d = p.getDuration?.();
          if (typeof d === "number" && d > 0) setDuration(d);
        } catch {
          // ignore
        }
      }, 250);
    };
    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const init = () => {
      if (!ytContainerRef.current) return;
      const YT = (window as any).YT;
      const player = new YT.Player(ytContainerRef.current, {
        height: "100%",
        width: "100%",
        videoId: youtubeId,
        playerVars: { controls: 0, modestbranding: 1, showinfo: 0, rel: 0, branding: 0 },
        events: {
          onReady: (event: any) => {
            ytPlayerRef.current = event.target;
            setYtReady(true);
            const p = event.target;
            const d = p.getDuration?.();
            if (typeof d === "number") setDuration(d);
            try {
              const vol = Number(window.localStorage.getItem(VOLUME_KEY));
              if (Number.isFinite(vol)) {
                p.setVolume(Math.round(vol * 100));
                setVolume(vol);
              }
              const muted = window.localStorage.getItem(MUTED_KEY) === "1";
              if (muted) {
                p.mute();
                setIsMuted(true);
              }
            } catch {
              // ignore
            }
            // restore progress
            if (lessonId) {
              try {
                const raw = window.localStorage.getItem(
                  `${PROGRESS_PREFIX}${lessonId}`,
                );
                const saved = raw === null ? NaN : Number(raw);
                if (
                  Number.isFinite(saved) &&
                  saved > 1 &&
                  typeof d === "number" &&
                  saved < d - 1
                ) {
                  p.seekTo(saved, true);
                  setCurrentTime(saved);
                }
              } catch {
                // ignore
              }
            }
            progressRestoredRef.current = true;
          },
          onStateChange: (event: any) => {
            const YTNS = (window as any).YT;
            const state = event.data;
            if (state === YTNS.PlayerState.PLAYING) {
              setIsPlaying(true);
              setHasStarted(true);
              setIsBuffering(false);
              setHasError(false);
              startPolling();
            } else if (state === YTNS.PlayerState.PAUSED) {
              setIsPlaying(false);
              setIsBuffering(false);
              stopPolling();
              // save
              try {
                const p = ytPlayerRef.current;
                if (p && lessonId) {
                  window.localStorage.setItem(
                    `${PROGRESS_PREFIX}${lessonId}`,
                    String(p.getCurrentTime?.() ?? 0),
                  );
                }
              } catch {
                // ignore
              }
            } else if (state === YTNS.PlayerState.ENDED) {
              setIsPlaying(false);
              stopPolling();
              if (lessonId) {
                try {
                  window.localStorage.removeItem(`${PROGRESS_PREFIX}${lessonId}`);
                } catch {
                  // ignore
                }
              }
            } else if (state === YTNS.PlayerState.BUFFERING) {
              setIsBuffering(true);
            }
          },
          onError: () => {
            setIsBuffering(false);
            setHasError(true);
          },
        },
      });
      ytPlayerRef.current = player;
    };

    if ((window as any).YT && (window as any).YT.Player) {
      init();
    } else {
      (window as any).onYouTubeIframeAPIReady = init;
      if (
        !document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
      ) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScript = document.getElementsByTagName("script")[0];
        firstScript?.parentNode?.insertBefore(tag, firstScript);
      }
    }

    return () => {
      stopPolling();
      try {
        ytPlayerRef.current?.destroy?.();
      } catch {
        // ignore
      }
      ytPlayerRef.current = null;
      setYtReady(false);
    };
  }, [isYouTube, youtubeId, lessonId]);

  const togglePlay = useCallback(() => {
    if (isYouTube) {
      const p = ytPlayerRef.current;
      if (!p) return;
      if (isPlaying) p.pauseVideo?.();
      else p.playVideo?.();
      revealControls();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
    revealControls();
  }, [isYouTube, isPlaying, revealControls]);

  const skip = useCallback(
    (delta: number) => {
      if (isYouTube) {
        const p = ytPlayerRef.current;
        if (!p) return;
        const target = (p.getCurrentTime?.() ?? 0) + delta;
        const dur = p.getDuration?.() ?? 0;
        const clamped = Math.min(Math.max(target, 0), dur || target);
        p.seekTo?.(clamped, true);
        setCurrentTime(clamped);
        revealControls();
        return;
      }
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
    [isYouTube, revealControls],
  );

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    if (isYouTube) {
      const p = ytPlayerRef.current;
      if (nextMuted) p?.mute?.();
      else p?.unMute?.();
    } else {
      const video = videoRef.current;
      if (video) {
        video.muted = nextMuted;
        if (!nextMuted && video.volume === 0) {
          video.volume = 0.5;
          setVolume(0.5);
        }
      }
    }
    setIsMuted(nextMuted);
    try {
      window.localStorage.setItem(MUTED_KEY, nextMuted ? "1" : "0");
    } catch {
      // Storage unavailable.
    }
    revealControls();
  }, [isYouTube, isMuted, revealControls]);

  const toggleFullscreen = useCallback(async () => {
    if (isMobile) {
      if (isFullscreen) {
        if (isNativeFullscreen && document.fullscreenElement) {
          await document.exitFullscreen().catch(() => undefined);
        }
        setIsFullscreen(false);
        setIsNativeFullscreen(false);
        setIsRotated(false);
        setIsOrientationLocked(false);
        try {
          const orientation = window.screen.orientation as ScreenOrientation & {
            unlock?: () => void;
          };
          orientation.unlock?.();
        } catch {
          // Orientation locking is optional and browser-dependent.
        }
        return;
      }

      setIsRotated(false);
      const root = rootRef.current;
      if (!root) return;

      // Portrait keeps the proven CSS fullscreen overlay so its rotate
      // control can rotate the player. Landscape requests native fullscreen.
      if (isPortrait) {
        setIsNativeFullscreen(false);
        setIsFullscreen(true);
        revealControls();
        return;
      }

      // Request native fullscreen directly from the tap in landscape.
      // Fall back to the working CSS overlay if the browser denies the request.
      if (root.requestFullscreen) {
        setIsNativeFullscreen(true);
        try {
          await root.requestFullscreen();
          if (document.fullscreenElement === root) {
            setIsFullscreen(true);
            revealControls();
            return;
          }
        } catch {
          // Native fullscreen may be unavailable in this browser/context.
        }
        setIsNativeFullscreen(false);
      }

      setIsNativeFullscreen(false);
      setIsFullscreen(true);
      revealControls();
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      setIsRotated(false);
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    await root.requestFullscreen().catch(() => undefined);
    if (document.fullscreenElement === root) {
      setIsRotated(false);
    }
  }, [isFullscreen, isMobile, isNativeFullscreen, isPortrait, revealControls]);

  const togglePlayerRotation = useCallback(() => {
    setIsRotated((rotated) => !rotated);
    revealControls();
  }, [revealControls]);

  const toggleOrientationLock = useCallback(async () => {
    const orientation = window.screen.orientation as ScreenOrientation & {
      lock?: (value: "landscape") => Promise<void>;
      unlock?: () => void;
    };

    try {
      if (isOrientationLocked) {
        orientation.unlock?.();
        setIsOrientationLocked(false);
      } else if (orientation.lock) {
        await orientation.lock("landscape");
        setIsOrientationLocked(true);
      }
    } catch {
      // Browser may not permit orientation locking in this context.
      setIsOrientationLocked(false);
    }
    revealControls();
  }, [isOrientationLocked, revealControls]);

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
    const value = Number(event.target.value);
    setCurrentTime(value);
    if (isYouTube) {
      ytPlayerRef.current?.seekTo?.(value, true);
    } else {
      const video = videoRef.current;
      if (video) video.currentTime = value;
    }
  };

  const handleVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setVolume(value);
    setIsMuted(value === 0);
    if (isYouTube) {
      const p = ytPlayerRef.current;
      p?.setVolume?.(Math.round(value * 100));
      if (value === 0) p?.mute?.();
      else p?.unMute?.();
    } else {
      const video = videoRef.current;
      if (video) {
        video.volume = value;
        video.muted = value === 0;
      }
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
      className={`lvp-root ${controlsVisible ? "is-active" : ""} ${isFullscreen && isMobile ? "is-mobile-fullscreen" : ""} ${isRotated ? "is-rotated" : ""}`}
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
      {isYouTube ? (
        <div
          ref={ytContainerRef}
          className="lvp-yt-container"
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
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
      )}

      {!hasMedia && (
        <div className="lvp-loading">
          {videoId || videoUrl ? "Preparing player…" : "No video for this lesson"}
        </div>
      )}

      {hasError && (
        <button
          type="button"
          className="lvp-loading lvp-error"
          role="alert"
          onClick={() => {
            setHasError(false);
            if (isYouTube) {
              ytPlayerRef.current?.loadVideoById?.(youtubeId);
            } else {
              videoRef.current?.load();
            }
          }}
        >
          This video could not be loaded. Click to retry.
        </button>
      )}

      {isBuffering && hasMedia && (
        <div className="lvp-spinner" role="status" aria-label="Buffering" />
      )}

      {hasMedia && !hasStarted && (
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
          hasStarted && (controlsVisible || !isPlaying) ? "is-visible" : ""
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
          <div className="lvp-rate-menu">
  <button
    type="button"
    className="lvp-btn lvp-rate"
    aria-label="Playback speed"
    aria-expanded={rateMenuOpen}
    onClick={() => setRateMenuOpen((open) => !open)}
  >
    {RATES[rateIndex]}×
  </button>

  {rateMenuOpen && (
    <div className="lvp-rate-options" role="menu">
      {[...RATES].reverse().map((rate) => (
        <button
          key={rate}
          type="button"
          role="menuitemradio"
          aria-checked={RATES[rateIndex] === rate}
          onClick={() => {
            const index = RATES.indexOf(rate);
            setRateIndex(index);
            if (isYouTube) ytPlayerRef.current?.setPlaybackRate?.(rate); else if (videoRef.current) videoRef.current.playbackRate = rate;
            setRateMenuOpen(false);
          }}
        >
          {rate}×
        </button>
      ))}
    </div>
  )}
</div>
          {isMobile && isFullscreen && isPortrait && (
  <button
    type="button"
    className={`lvp-btn ${isRotated ? "is-active" : ""}`}
    aria-label={isRotated ? "Restore player orientation" : "Rotate player"}
    aria-pressed={isRotated}
    onClick={togglePlayerRotation}
  >
    ↻
  </button>
)}
          {isMobile && isFullscreen && !isPortrait && isNativeFullscreen && (
            <button
              type="button"
              className={`lvp-btn ${isOrientationLocked ? "is-active" : ""}`}
              aria-label={isOrientationLocked ? "Unlock landscape orientation" : "Lock landscape orientation"}
              aria-pressed={isOrientationLocked}
              onClick={() => void toggleOrientationLock()}
            >
              {isOrientationLocked ? <Unlock size={15} /> : <Lock size={15} />}
            </button>
          )}
          <button
            type="button"
            className={`lvp-btn ${isFullscreen ? "is-active" : ""}`}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-pressed={isFullscreen}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

