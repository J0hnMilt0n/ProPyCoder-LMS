"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
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
import { extractYouTubeId } from "@/lib/youtube";

const RATES = [0.25, 0.5, 1, 1.25, 1.5, 2];

/**
 * Resolve the video source URL based on available video info.
 * Priority:
 * 1. Direct videoUrl (if not YouTube)
 * 2. YouTube stream proxy (/api/youtube/stream?videoId=...)
 * 3. YouTube iframe embed
 * 4. Obfuscated sources from lesson-video-sources.ts
 */
function resolveVideoSource(
  videoId: string | null,
  videoUrl: string | null | undefined
): {
  src: string | null;
  type: "proxy" | "youtube" | "native" | "obfuscated";
  label: string;
} {

  // If we have a direct videoUrl that's not YouTube, use it natively
  if (videoUrl && !/^(?:https?:)?\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(videoUrl)) {
    // console.log("Failed")
    return { src: videoUrl, type: "native", label: "Direct video URL" };
  }

  if (videoId) {
    return { src: videoId, type: "youtube", label: "YouTube embed (fallback)" };
  }
  if (videoUrl && /^(?:https?:)?\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(videoUrl)) {
    const videoId = extractYouTubeId(videoUrl);
    if (videoId) {
      return { src: videoId, type: "youtube", label: "YouTube embed (fallback)" };
    }
    // Fallback to iframe if we can't extract the ID
    return { src: videoUrl, type: "youtube", label: "YouTube embed (fallback)" };
  }
  
  // If we have a YouTube videoId, use the stream proxy
  // if (videoId) {
  //   const proxyUrl = `/api/youtube/stream?videoId=${videoId}&itag=137`;
  //   return { src: proxyUrl, type: "proxy", label: "YouTube stream proxy" };
  // }

  // // If we have a YouTube URL, also use the stream proxy (instead of iframe embed)
  // if (videoUrl && /^(?:https?:)?\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(videoUrl)) {
  //   const videoId = extractYouTubeId(videoUrl);
  //   if (videoId) {
  //     const proxyUrl = `/api/youtube/stream?videoId=${videoId}&itag=137`;
  //     return { src: proxyUrl, type: "proxy", label: "YouTube stream proxy" };
  //   }
  //   // Fallback to iframe if we can't extract the ID
  //   return { src: videoUrl, type: "youtube", label: "YouTube embed (fallback)" };
  // }

  // Fall back to obfuscated sources
  return { src: null, type: "obfuscated", label: "Obfuscated sources" };
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const VOLUME_KEY = "propycoder-video-volume";
const MUTED_KEY = "propycoder-video-muted";
const PROGRESS_PREFIX = "propycoder-video-progress:";

interface LessonVideoPlayerProps {
  lessonId: string;
  videoId: string | null;
  title: string;
  videoUrl?: string | null;
  videoStartTime?: number | null;
  videoEndTime?: number | null;
  durationMinutes?: number | null;
}

type GestureZone = "left" | "center" | "right";
type GestureMode =
  | "pending"
  | "vertical"
  | "horizontal"
  | "hold"
  | "ignored";

interface TouchGesture {
  pointerId: number;
  startX: number;
  startY: number;
  zone: GestureZone;
  inlineTouch: boolean;
  mobileTap: boolean;
  mode: GestureMode;
  initialValue: number;
  lastValue: number;
  initialTime: number;
  lastSeekTime: number;
  previousRate: number;
  wasPlaying: boolean;
  rewindTime: number;
  reversePlayback: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
  reverseTimer: ReturnType<typeof setInterval> | null;
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
  videoStartTime,
  videoEndTime,
  durationMinutes,
  title,
}: LessonVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const [ytReady, setYtReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsHiddenRef = useRef(false);
  const gestureRef = useRef<TouchGesture | null>(null);
  const pendingTapRef = useRef<{
    zone: GestureZone;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRestoredRef = useRef(false);
  const lastSavedTimeRef = useRef(0);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const youtubeId = videoId ?? (videoUrl ? extractYouTubeId(videoUrl) : null);
  const isYouTube = !!youtubeId;
  
  // Resolve the video source using the new priority system
  const sourceInfo = resolveVideoSource(youtubeId, videoUrl);
  const src = sourceInfo.src;
  const hasMedia = !!youtubeId || !!src;
  const sourceType = sourceInfo.type;
  
  // Debug logging for source resolution
  // if (process.env.NODE_ENV === "development") {
  //   console.log(`[LessonVideoPlayer] Source resolution:`);
  //   console.log(`  - youtubeId: ${youtubeId}`);
  //   console.log(`  - videoUrl: ${videoUrl}`);
  //   console.log(`  - sourceType: ${sourceType}`);
  //   console.log(`  - src: ${src}`);
  //   console.log(`  - isYouTube: ${isYouTube}`);
  //   console.log(`  - hasMedia: ${hasMedia}`);
  // }
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const configuredStartTime = Math.max(0, videoStartTime ?? 0);
  const durationLimit =
    durationMinutes != null && durationMinutes > 0
      ? configuredStartTime + durationMinutes * 60
      : null;
  const requestedEndTime =
    [videoEndTime, durationLimit].reduce<number | null>(
      (endTime, candidate) =>
        candidate != null &&
        Number.isFinite(candidate) &&
        candidate > configuredStartTime
          ? endTime == null
            ? candidate
            : Math.min(endTime, candidate)
          : endTime,
      null,
    );
  const clipStartTime =
    duration > 0
      ? Math.min(configuredStartTime, duration)
      : configuredStartTime;
  const clipEndTime =
    duration > 0
      ? Math.min(requestedEndTime ?? duration, duration)
      : requestedEndTime ?? duration;
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [rateState, setRateState] = useState({
    lessonId,
    videoId,
    videoUrl,
    index: 2,
  });
  const rateIndex =
    rateState.lessonId === lessonId &&
    rateState.videoId === videoId &&
    rateState.videoUrl === videoUrl
      ? rateState.index
      : 2;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showMobileCenterAction, setShowMobileCenterAction] = useState(false);
  const [gestureFeedback, setGestureFeedback] = useState("");
  const [isRotated, setIsRotated] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isAdaptive, setIsAdaptive] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isOrientationLocked, setIsOrientationLocked] = useState(false);

  const showGestureFeedback = useCallback((message: string, duration = 0) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setGestureFeedback(message);
    if (message && duration > 0) {
      feedbackTimerRef.current = setTimeout(() => {
        setGestureFeedback("");
        feedbackTimerRef.current = null;
      }, duration);
    }
  }, []);

  useEffect(() => {
  // const media = window.matchMedia("(max-width: 1024px)");
  const media = window.matchMedia("(max-width: 1024px) and (pointer: coarse)");
  const adaptive_media = window.matchMedia("(max-width: 740px)");
  const update = () => {setIsMobile(media.matches)
setIsAdaptive(adaptive_media.matches)
  };
  update();
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}, []);

  useEffect(() => {
    const media = window.matchMedia("(orientation: portrait)");
    const update = () => {
      const portrait = media.matches;
      setIsPortrait(portrait);
      if (!portrait) setIsRotated(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Reset non-React playback bookkeeping when the lesson changes; the media
  // element reload is scheduled after the new source has rendered.
  useEffect(() => {
    progressRestoredRef.current = false;
    lastSavedTimeRef.current = 0;
  }, [lessonId, videoId]);

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
    const video = videoRef.current;
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (pendingTapRef.current) clearTimeout(pendingTapRef.current.timer);
      const gesture = gestureRef.current;
      if (gesture?.holdTimer) clearTimeout(gesture.holdTimer);
      if (gesture?.reverseTimer) clearInterval(gesture.reverseTimer);
      if (gesture?.mode === "hold") {
        if (gesture.zone === "left" && gesture.reversePlayback && video) {
          video.playbackRate = gesture.previousRate;
        } else if (gesture.zone === "right" && isYouTube) {
          ytPlayerRef.current?.setPlaybackRate?.(gesture.previousRate);
        } else if (gesture.zone === "right" && video) {
          video.playbackRate = gesture.previousRate;
        }
      }
    };
  }, [isYouTube]);

  useEffect(() => {
    const syncFullscreen = () => {
      const fullscreen = document.fullscreenElement === rootRef.current;
      if (isMobile || isAdaptive) {
        setIsNativeFullscreen(fullscreen);
        if (!fullscreen) {
          setIsFullscreen(false);
          setIsRotated(false);
          setIsOrientationLocked(false);
          setShowMobileCenterAction(false);
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
    controlsHiddenRef.current = false;
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (ytContainerRef.current || (videoRef.current && !videoRef.current.paused)) {
        setControlsVisible(false);
        setShowMobileCenterAction(false);
      }
    }, 1800);
  }, []);

  const hideControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    controlsHiddenRef.current = true;
    setControlsVisible(false);
    setShowMobileCenterAction(false);
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
            const d = p.getDuration?.() ?? 0;
            const start =
              d > 0 ? Math.min(configuredStartTime, d) : configuredStartTime;
            if (
              requestedEndTime !== null &&
              d > 0 &&
              requestedEndTime < d
            ) {
              const end = Math.min(requestedEndTime, d);
              if (t >= end) {
                p.seekTo?.(end, true);
                p.pauseVideo?.();
                setCurrentTime(end);
                stopPolling();
                return;
              }
            }
            if (t < start) {
              p.seekTo?.(start, true);
              setCurrentTime(start);
              return;
            }
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
            if (typeof d === "number" && d > 0) setDuration(d);
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
            const start = Math.min(
              configuredStartTime,
              typeof d === "number" && d > 0 ? d : configuredStartTime,
            );
            const end =
              typeof d === "number" && d > 0
                ? Math.min(requestedEndTime ?? d, d)
                : requestedEndTime ?? start;
            let restoreTime = start;
            if (lessonId) {
              try {
                const raw = window.localStorage.getItem(
                  `${PROGRESS_PREFIX}${lessonId}`,
                );
                const saved = raw === null ? NaN : Number(raw);
                if (
                  Number.isFinite(saved) &&
                  saved > start + 1 &&
                  saved < end - 1
                ) {
                  restoreTime = saved;
                }
              } catch {
                // ignore
              }
            }
            p.seekTo?.(restoreTime, true);
            setCurrentTime(restoreTime);
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
  }, [
    configuredStartTime,
    durationMinutes,
    isYouTube,
    lessonId,
    requestedEndTime,
    youtubeId,
  ]);

  const togglePlay = useCallback(() => {
    if (isYouTube) {
      const p = ytPlayerRef.current;
      if (!p) return;
      const state = p.getPlayerState?.();
      const playing =
        typeof state === "number"
          ? state === 1 || (state === 3 && isPlaying)
          : isPlaying;
      if (playing) {
        p.pauseVideo?.();
      } else {
        const time = p.getCurrentTime?.() ?? currentTime;
        if (requestedEndTime !== null && time >= clipEndTime - 0.25) {
          p.seekTo?.(clipStartTime, true);
          setCurrentTime(clipStartTime);
        }
        p.playVideo?.();
      }
      revealControls();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (
        requestedEndTime !== null &&
        video.currentTime >= Math.min(requestedEndTime, video.duration) - 0.25
      ) {
        video.currentTime = clipStartTime;
        setCurrentTime(clipStartTime);
      }
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
    revealControls();
  }, [
    clipEndTime,
    clipStartTime,
    currentTime,
    isYouTube,
    isPlaying,
    requestedEndTime,
    revealControls,
  ]);

  const isPlayerPlaying = useCallback(() => {
    if (isYouTube) {
      const state = ytPlayerRef.current?.getPlayerState?.();
      if (typeof state === "number") {
        return state === 1 || (state === 3 && isPlaying);
      }
    }

    return videoRef.current ? !videoRef.current.paused : isPlaying;
  }, [isYouTube, isPlaying]);

  const handleMobileSurfaceTap = useCallback(() => {
    const controlsShown =
      showMobileCenterAction ||
      (hasStarted && controlsVisible) ||
      (isFullscreen && controlsVisible);
    if (!controlsShown) {
      revealControls();
      setShowMobileCenterAction(true);
      return;
    }

    if (!isPlayerPlaying()) togglePlay();
    hideControls();
  }, [
    controlsVisible,
    hasStarted,
    hideControls,
    isFullscreen,
    isPlayerPlaying,
    revealControls,
    showMobileCenterAction,
    togglePlay,
  ]);

  const handleVideoClick = useCallback(() => {
    if (isMobile) {
      handleMobileSurfaceTap();
      return;
    }

    if (isPlayerPlaying()) {
      togglePlay();
      revealControls();
    } else {
      togglePlay();
      hideControls();
    }
  }, [
    handleMobileSurfaceTap,
    hideControls,
    isMobile,
    isPlayerPlaying,
    revealControls,
    togglePlay,
  ]);

  const skip = useCallback(
    (delta: number) => {
      if (isYouTube) {
        const p = ytPlayerRef.current;
        if (!p) return;
        const target = (p.getCurrentTime?.() ?? 0) + delta;
        const dur = p.getDuration?.() ?? 0;
        const lower = Math.min(
          configuredStartTime,
          dur > 0 ? dur : configuredStartTime,
        );
        const upper =
          dur > 0
            ? Math.min(requestedEndTime ?? dur, dur)
            : requestedEndTime ?? Math.max(target, lower);
        const clamped = Math.min(Math.max(target, lower), Math.max(lower, upper));
        p.seekTo?.(clamped, true);
        setCurrentTime(clamped);
        revealControls();
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      const target = video.currentTime + delta;
      const mediaDuration = Number.isFinite(video.duration) ? video.duration : 0;
      const lower = Math.min(
        configuredStartTime,
        mediaDuration > 0 ? mediaDuration : configuredStartTime,
      );
      const upper =
        mediaDuration > 0
          ? Math.min(requestedEndTime ?? mediaDuration, mediaDuration)
          : requestedEndTime ?? Math.max(target, lower);
      video.currentTime = Math.min(
        Math.max(target, lower),
        Math.max(lower, upper),
      );
      setCurrentTime(video.currentTime);
      revealControls();
    },
    [configuredStartTime, isYouTube, requestedEndTime, revealControls],
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

  const applyPlaybackRate = useCallback(
    (rate: number) => {
      if (isYouTube) ytPlayerRef.current?.setPlaybackRate?.(rate);
      else if (videoRef.current) videoRef.current.playbackRate = rate;
    },
    [isYouTube],
  );

  useEffect(() => {
    applyPlaybackRate(1);
  }, [applyPlaybackRate, lessonId, videoId, videoUrl]);

  const setPlaybackRate = useCallback(
    (index: number) => {
      const nextIndex = Math.min(RATES.length - 1, Math.max(0, index));
      setRateState({ lessonId, videoId, videoUrl, index: nextIndex });
      applyPlaybackRate(RATES[nextIndex]);
    },
    [applyPlaybackRate, lessonId, videoId, videoUrl],
  );

  const applyVolume = useCallback(
    (value: number) => {
      const clamped = Math.min(1, Math.max(0, value));
      setVolume(clamped);
      setIsMuted(clamped === 0);
      if (isYouTube) {
        const player = ytPlayerRef.current;
        player?.setVolume?.(Math.round(clamped * 100));
        if (clamped === 0) player?.mute?.();
        else player?.unMute?.();
      } else {
        const video = videoRef.current;
        if (video) {
          video.volume = clamped;
          video.muted = clamped === 0;
        }
      }
    },
    [isYouTube],
  );

  const persistVolume = useCallback((value: number) => {
    try {
      window.localStorage.setItem(VOLUME_KEY, String(value));
      window.localStorage.setItem(MUTED_KEY, value === 0 ? "1" : "0");
    } catch {
      // Storage unavailable.
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (isMobile || isAdaptive) {
      if (isFullscreen) {
        if (isNativeFullscreen && document.fullscreenElement) {
          await document.exitFullscreen().catch(() => undefined);
        }
        setIsFullscreen(false);
        setIsNativeFullscreen(false);
        setIsRotated(false);
        setIsOrientationLocked(false);
        setShowMobileCenterAction(false);
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
      if (isPortrait || isAdaptive) {
        console.log("Here")
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
    const upper = Math.max(clipStartTime, clipEndTime || duration);
    const value = Math.min(
      Math.max(Number(event.target.value), clipStartTime),
      upper,
    );
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
    applyVolume(value);
    persistVolume(value);
  };

  const getGestureCoordinates = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (isMobile && isFullscreen && isRotated) {
      // Map viewport coordinates back into the player's rotated coordinate space.
      return {
        x: event.clientY - bounds.top,
        y: bounds.width - (event.clientX - bounds.left),
        width: bounds.height,
        height: bounds.width,
      };
    }
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  };

  const handleGesturePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || gestureRef.current) return;
    const inlineTouch = isMobile && !isFullscreen;
    if (!inlineTouch) event.preventDefault();

    const position = getGestureCoordinates(event);
    const zone: GestureZone =
      position.x < position.width * 0.4
        ? "left"
        : position.x > position.width * 0.6
          ? "right"
          : "center";
    const videoRate = videoRef.current?.playbackRate;
    const playerRate = ytPlayerRef.current?.getPlaybackRate?.();
    const previousRate =
      (typeof playerRate === "number" && playerRate) ||
      videoRate ||
      RATES[rateIndex];
    const playerTime = isYouTube
      ? ytPlayerRef.current?.getCurrentTime?.()
      : videoRef.current?.currentTime;
    const initialTime =
      typeof playerTime === "number" && Number.isFinite(playerTime)
        ? playerTime
        : currentTime;
    const gesture: TouchGesture = {
      pointerId: event.pointerId,
      startX: position.x,
      startY: position.y,
      zone,
      inlineTouch,
      mobileTap: isMobile,
      mode: "pending",
      initialValue: zone === "left" ? rateIndex : volume,
      lastValue: zone === "left" ? rateIndex : volume,
      initialTime,
      lastSeekTime: currentTime,
      previousRate,
      wasPlaying: isYouTube
        ? ytPlayerRef.current?.getPlayerState?.() === 1
        : Boolean(videoRef.current && !videoRef.current.paused),
      rewindTime: currentTime,
      reversePlayback: false,
      holdTimer: null,
      reverseTimer: null,
    };

    gestureRef.current = gesture;
    if (!inlineTouch) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!inlineTouch && zone !== "center") {
      gesture.holdTimer = setTimeout(() => {
        if (gestureRef.current !== gesture || gesture.mode !== "pending") return;
        gesture.mode = "hold";
        if (gesture.zone === "left") {
          const video = videoRef.current;
          if (!isYouTube && gesture.wasPlaying && video) {
            try {
              video.playbackRate = -2;
              gesture.reversePlayback = video.playbackRate === -2;
            } catch {
              video.playbackRate = gesture.previousRate;
            }
          }
          if (!gesture.reversePlayback) {
            if (isYouTube) ytPlayerRef.current?.pauseVideo?.();
            else video?.pause();
            const playerTime = isYouTube
              ? ytPlayerRef.current?.getCurrentTime?.()
              : video?.currentTime;
            if (typeof playerTime === "number" && Number.isFinite(playerTime)) {
              gesture.rewindTime = playerTime;
            }
            gesture.reverseTimer = setInterval(() => {
              gesture.rewindTime = Math.max(
                clipStartTime,
                gesture.rewindTime - 0.5,
              );
              if (isYouTube) {
                ytPlayerRef.current?.seekTo?.(gesture.rewindTime, true);
              } else if (videoRef.current) {
                videoRef.current.currentTime = gesture.rewindTime;
              }
              setCurrentTime(gesture.rewindTime);
            }, 250);
          }
          showGestureFeedback("2× rewind");
        } else {
          applyPlaybackRate(2);
          showGestureFeedback("2× speed");
        }
        revealControls();
      }, 350);
    }
  };

  const handleGesturePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (
      event.pointerType !== "touch" ||
      !gesture ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }

    const position = getGestureCoordinates(event);
    const deltaY = gesture.startY - position.y;
    const deltaX = position.x - gesture.startX;
    if (gesture.mode === "pending") {
      if (Math.abs(deltaX) > 16 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (gesture.holdTimer) clearTimeout(gesture.holdTimer);
        gesture.mode = "horizontal";
        if (gesture.inlineTouch) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        revealControls();
      } else if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX)) {
        if (gesture.holdTimer) clearTimeout(gesture.holdTimer);
        gesture.mode =
          gesture.inlineTouch || gesture.zone === "center"
            ? "ignored"
            : "vertical";
      }
    }

    if (gesture.mode === "horizontal") {
      event.preventDefault();
      const endTime = Math.max(clipStartTime, clipEndTime || duration);
      const range = endTime - clipStartTime;
      if (range <= 0) return;
      gesture.lastSeekTime = Math.min(
        endTime,
        Math.max(
          clipStartTime,
          gesture.initialTime + (deltaX / Math.max(position.width, 1)) * range,
        ),
      );
      setCurrentTime(gesture.lastSeekTime);
      if (isYouTube) {
        ytPlayerRef.current?.seekTo?.(gesture.lastSeekTime, true);
      } else if (videoRef.current) {
        videoRef.current.currentTime = gesture.lastSeekTime;
      }
      showGestureFeedback(
        `${formatTime(gesture.lastSeekTime)} / ${formatTime(endTime)}`,
      );
      return;
    }

    if (gesture.mode !== "vertical") return;
    event.preventDefault();
    if (gesture.zone === "left") {
      const rateIndex = Math.min(
        RATES.length - 1,
        Math.max(
          0,
          gesture.initialValue +
            Math.round(
              (deltaY / Math.max(position.height, 1)) * (RATES.length - 1),
            ),
        ),
      );
      gesture.lastValue = rateIndex;
      setPlaybackRate(rateIndex);
      showGestureFeedback(`Speed ${RATES[rateIndex]}×`);
      return;
    }

    const amount = (deltaY / Math.max(position.height, 1)) * 1.5;
    gesture.lastValue = Math.min(
      1,
      Math.max(0, gesture.initialValue + amount),
    );
    applyVolume(gesture.lastValue);
    showGestureFeedback(`Volume ${Math.round(gesture.lastValue * 100)}%`);
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (
      event.pointerType !== "touch" ||
      !gesture ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }

    if (gesture.holdTimer) clearTimeout(gesture.holdTimer);
    gestureRef.current = null;
    if (gesture.mode === "hold") {
      if (gesture.reverseTimer) clearInterval(gesture.reverseTimer);
      if (gesture.zone === "left" && gesture.wasPlaying) {
        if (gesture.reversePlayback && videoRef.current) {
          videoRef.current.playbackRate = gesture.previousRate;
          if (videoRef.current.paused) {
            void videoRef.current.play().catch(() => undefined);
          }
        } else if (isYouTube) {
          ytPlayerRef.current?.playVideo?.();
        } else if (videoRef.current) {
          void videoRef.current.play().catch(() => undefined);
        }
      } else if (gesture.zone === "right") {
        applyPlaybackRate(gesture.previousRate);
      }
      showGestureFeedback("");
      return;
    }
    if (gesture.mode === "vertical") {
      if (gesture.zone === "left") {
        const rate = RATES[gesture.lastValue];
        showGestureFeedback(`Speed ${rate}×`, 500);
      } else {
        persistVolume(gesture.lastValue);
        showGestureFeedback(
          `Volume ${Math.round(gesture.lastValue * 100)}%`,
          500,
        );
      }
      return;
    }
    if (gesture.mode === "horizontal") {
      showGestureFeedback(
        `${formatTime(gesture.lastSeekTime)} / ${formatTime(
          Math.max(clipStartTime, clipEndTime || duration),
        )}`,
        500,
      );
      return;
    }
    if (gesture.mode !== "pending") return;

    if (gesture.mobileTap) {
      handleMobileSurfaceTap();
      if (gesture.zone === "center") {
        if (pendingTapRef.current) {
          clearTimeout(pendingTapRef.current.timer);
          pendingTapRef.current = null;
        }
        return;
      }

      const pendingTap = pendingTapRef.current;
      if (pendingTap?.zone === gesture.zone) {
        clearTimeout(pendingTap.timer);
        pendingTapRef.current = null;
        const delta = gesture.zone === "left" ? -10 : 10;
        skip(delta);
        showGestureFeedback(`${delta > 0 ? "+" : ""}${delta}s`, 700);
        hideControls()
        return;
      }
      hideControls()
      if (pendingTap) clearTimeout(pendingTap.timer);
      const timer = setTimeout(() => {
        if (pendingTapRef.current?.timer === timer) {
          pendingTapRef.current = null;
          handleVideoClick()
        }
      }, 250);
      pendingTapRef.current = { zone: gesture.zone, timer };
      return;
    }

    if (gesture.zone === "center") {
      if (gesture.inlineTouch) {
        revealControls();
        setShowMobileCenterAction(true);
        return;
      }
      togglePlay();
      return;
    }

    if (gesture.inlineTouch) {
      revealControls();
      setShowMobileCenterAction(true);
      return;
    }

    const pendingTap = pendingTapRef.current;
    if (pendingTap?.zone === gesture.zone) {
      clearTimeout(pendingTap.timer);
      pendingTapRef.current = null;
      const delta = gesture.zone === "left" ? -10 : 10;
      skip(delta);
      showGestureFeedback(`${delta > 0 ? "+" : ""}${delta}s`, 700);
      return;
    }

    if (pendingTap) {
      clearTimeout(pendingTap.timer);
      pendingTapRef.current = null;
      togglePlay();
    }
    const timer = setTimeout(() => {
      pendingTapRef.current = null;
      togglePlay();
    }, 260);
    pendingTapRef.current = { zone: gesture.zone, timer };
  };

  const handleGesturePointerCancel = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.holdTimer) clearTimeout(gesture.holdTimer);
    if (gesture.reverseTimer) clearInterval(gesture.reverseTimer);
    if (gesture.mode === "hold" && gesture.zone === "left" && gesture.wasPlaying) {
      if (gesture.reversePlayback && videoRef.current) {
        videoRef.current.playbackRate = gesture.previousRate;
        if (videoRef.current.paused) {
          void videoRef.current.play().catch(() => undefined);
        }
      } else if (isYouTube) {
        ytPlayerRef.current?.playVideo?.();
      } else if (videoRef.current) {
        void videoRef.current.play().catch(() => undefined);
      }
    } else if (gesture.mode === "hold" && gesture.zone === "right") {
      applyPlaybackRate(gesture.previousRate);
    }
    if (gesture.mode === "vertical" && gesture.zone === "right") {
      persistVolume(gesture.lastValue);
    }
    gestureRef.current = null;
    showGestureFeedback("");
  };

  const progressEndTime = Math.max(clipStartTime, clipEndTime || duration);
  const progressRange = progressEndTime - clipStartTime;
  const clipElapsedTime = Math.max(
    0,
    Math.min(currentTime, progressEndTime) - clipStartTime,
  );
  const progressPct =
    progressRange > 0
      ? Math.min(
          100,
          Math.max(0, ((currentTime - clipStartTime) / progressRange) * 100),
        )
      : 0;
  const volumePct = (isMuted ? 0 : volume) * 100;

  return (
    <div
      ref={rootRef}
      className={`lvp-root ${controlsVisible ? "is-active" : ""} ${isFullscreen && (isMobile || isAdaptive) ? "is-mobile-fullscreen" : ""} ${isNativeFullscreen ? "is-native-fullscreen" : ""} ${isRotated ? "is-rotated" : ""}`}
      tabIndex={0}
      aria-label={`Video player: ${title}`}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        if (ytContainerRef.current || (videoRef.current && !videoRef.current.paused)) {
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
          onClick={handleVideoClick}
          onPlay={() => {
            setIsPlaying(true);
            setHasStarted(true);
          }}
          onPause={() => {
            setIsPlaying(false);
            if (!controlsHiddenRef.current) setControlsVisible(true);
            saveProgress();
          }}
          onEnded={() => {
            setIsPlaying(false);
            controlsHiddenRef.current = false;
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
            const video = event.currentTarget;
            const time = video.currentTime;
            if (
              requestedEndTime !== null &&
              Number.isFinite(video.duration) &&
              requestedEndTime < video.duration &&
              video.playbackRate >= 0
            ) {
              const end = Math.min(requestedEndTime, video.duration);
              if (time >= end) {
                video.currentTime = end;
                setCurrentTime(end);
                video.pause();
                saveProgress();
                return;
              }
            }
            if (video.playbackRate < 0 && time <= clipStartTime) {
              video.currentTime = clipStartTime;
              setCurrentTime(clipStartTime);
              video.pause();
              saveProgress();
              return;
            }
            setCurrentTime(time);
            if (Math.abs(time - lastSavedTimeRef.current) >= 5) {
              lastSavedTimeRef.current = time;
              saveProgress();
            }
          }}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setDuration(video.duration);
            if (progressRestoredRef.current) return;
            progressRestoredRef.current = true;
            const start = Math.min(configuredStartTime, video.duration);
            const end = Math.min(
              requestedEndTime ?? video.duration,
              video.duration,
            );
            let restoreTime = start;
            if (lessonId) {
              try {
                const raw = window.localStorage.getItem(
                  `${PROGRESS_PREFIX}${lessonId}`,
                );
                const saved = raw === null ? NaN : Number(raw);
                if (
                  Number.isFinite(saved) &&
                  saved > start + 1 &&
                  saved < end - 1
                ) {
                  restoreTime = saved;
                }
              } catch {
                // Storage unavailable.
              }
            }
            video.currentTime = restoreTime;
            setCurrentTime(restoreTime);
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

      {hasMedia && !hasError && (
        <div
          className="lvp-gesture-surface"
          aria-hidden="true"
          onPointerDown={handleGesturePointerDown}
          onPointerMove={handleGesturePointerMove}
          onPointerUp={finishGesture}
          onPointerCancel={handleGesturePointerCancel}
          onClick={() => {
            if (!isMobile) handleVideoClick();
          }}
        />
      )}

      {gestureFeedback && (
        <div className="lvp-gesture-feedback" aria-live="polite">
          {gestureFeedback}
        </div>
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

      {hasMedia &&
        ((!hasStarted) ||
          (showMobileCenterAction && isMobile)) && (
        <button
          type="button"
          className={`lvp-big-play ${hasStarted ? "is-mobile-action" : ""}`}
          aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
          onClick={() => {
            const wasPlaying = isPlayerPlaying();
            setShowMobileCenterAction(false);
            togglePlay();
            if (isMobile || !wasPlaying) hideControls();
            else revealControls();
          }}
        >
          {isPlaying ? (
            <Pause size={34} fill="currentColor" strokeWidth={1.5} />
          ) : (
            <Play size={34} fill="currentColor" strokeWidth={1.5} />
          )}
        </button>
      )}

      <div
        className={`lvp-controls ${
          (hasStarted &&
            (isMobile ? controlsVisible : controlsVisible || !isPlaying)) ||
          (isMobile && isFullscreen && controlsVisible) ||
          (isMobile && showMobileCenterAction)
            ? "is-visible"
            : ""
        }`}
      >
        <input
          type="range"
          className="lvp-progress"
          max={progressEndTime}
          step={0.1}
          min={clipStartTime}
          value={Math.min(
            Math.max(currentTime, clipStartTime),
            progressEndTime,
          )}
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
            {formatTime(clipElapsedTime)} / {formatTime(progressRange)}
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
            setPlaybackRate(index);
            setRateMenuOpen(false);
          }}
        >
          {rate}×
        </button>
      ))}
    </div>
  )}
</div>
          {(isMobile || isAdaptive)  && isFullscreen && isPortrait && (
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
          {(isMobile || isAdaptive) && isFullscreen && !isPortrait && isNativeFullscreen && (
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

