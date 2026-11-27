export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getDuration(): number;
  getCurrentTime(): number;
  getPlayerState(): number;
  getVolume(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  destroy(): void;
  addEventListener(event: string, listener: (event: YTEvent) => void): void;
  removeEventListener(event: string, listener: (event: YTEvent) => void): void;
  loadVideoById(
    videoId: string,
    startSeconds?: number,
    suggestedQuality?: string,
  ): void;
}

export interface YTEvent {
  target: YTPlayer;
  data: number;
}

export interface YTPlayerVars {
  controls?: 0 | 1;
  modestbranding?: 0 | 1;
  showinfo?: 0 | 1;
  rel?: 0 | 1;
  branding?: 0 | 1;
  autoplay?: 0 | 1;
  loop?: 0 | 1;
  playlist?: string;
  start?: number;
  end?: number;
  fs?: 0 | 1;
  cc_load_policy?: 0 | 1;
  iv_load_policy?: 0 | 1 | 3;
  playsinline?: 0 | 1;
  origin?: string;
  disablekb?: 0 | 1;
  theme?: "dark" | "light";
  color?: "white" | "red";
}

export interface YTPlayerOptions {
  height: string | number;
  width: string | number;
  videoId: string;
  playerVars?: YTPlayerVars;
  events?: {
    onReady?: (event: YTEvent) => void;
    onStateChange?: (event: YTEvent) => void;
    onPlaybackQualityChange?: (event: YTEvent) => void;
    onPlaybackRateChange?: (event: YTEvent) => void;
    onError?: (event: YTEvent) => void;
    onApiChange?: (event: YTEvent) => void;
  };
}

export interface YT {
  Player: new (
    elementId: string | HTMLElement,
    options: YTPlayerOptions,
  ) => YTPlayer;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
  load(): Promise<void>;
}

declare global {
  interface Window {
    YT?: YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}
