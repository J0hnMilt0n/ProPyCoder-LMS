"use client";

import { useRef, useState, useEffect } from "react";

type YouTubeVideoPlayerProps = {
  videoId?: string;
  title: string;
  width?: number;
  height?: number;
};

const YouTubeVideoPlayer = ({
  videoId,
  title,
  width = 1280,
  height = 720,
}: YouTubeVideoPlayerProps) => {
  const videoRef = useRef<any>(null);
  const [player, setPlayer] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);

  // Load YouTube IFrame API
  useEffect(() => {
    const initPlayer = () => {
      if (!videoRef.current) return;
      const player = new (window as any).YT.Player(videoRef.current, {
        height: height,
        width: width,
        videoId: videoId,
        playerVars: {
          controls: 0,
          modestbranding: 1,
          showinfo: 0,
          rel: 0,
          branding: 0,
          disablekb: 1,
          iv_load_policy: 3,
          playsinline: 1,
          origin: window.location.origin,
          theme: "dark",
          color: "white",
          cc_load_policy: 0,
        },
        events: {
          onReady: () => {
            setIsReady(true);
          },
          onError: (err: any) => {
            console.error("YouTube player error:", err);
          },
        },
      });
      setPlayer(player);
    };

    if ((window as any).YT && (window as any).YT.Player) {
      initPlayer();
      return;
    }

    (window as any).onYouTubeIframeAPIReady = initPlayer;

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScript = document.getElementsByTagName("script")[0];
      firstScript?.parentNode?.insertBefore(tag, firstScript);
    }
  }, [videoId, width, height]);

  if (!isReady) {
    return (
      <div>
        <div className="lvp-loading">Loading YouTube player…</div>
      </div>
    );
  }

  return (
    <div className="lvp-youtube-wrapper" style={{ width: "100%", height: "100%" }}>
      <div className="lvp-player-wrapper" style={{ width: "100%", height: "100%" }}>
        <div ref={videoRef} id="player" style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
};

export default YouTubeVideoPlayer;

