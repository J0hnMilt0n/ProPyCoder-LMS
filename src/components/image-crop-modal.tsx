"use client";

import { useRef, useState, useEffect } from "react";

interface ImageCropModalProps {
  src: string;
  onApply: (croppedDataUrl: string) => void;
  onCancel: () => void;
  aspectRatio?: number; // width/height, default 1 (square)
  maxDim?: number;
  quality?: number;
}

export function ImageCropModal({ src, onApply, onCancel, aspectRatio = 1, maxDim = 800, quality = 0.75 }: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState({ x: 10, y: 10, w: 200, h: 200 });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<string | null>(null);
  const dragStart = useRef({ mx: 0, my: 0, cx: 0, cy: 0, cw: 0, ch: 0 });

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => {
      const size = Math.min(img.naturalWidth, img.naturalHeight / aspectRatio);
      const w = Math.min(size, img.naturalWidth);
      const h = w / aspectRatio;
      setCrop({
        x: (img.naturalWidth - w) / 2,
        y: (img.naturalHeight - h) / 2,
        w,
        h,
      });
    };
    img.addEventListener("load", onLoad);
    if (img.complete) onLoad();
    return () => img.removeEventListener("load", onLoad);
  }, [src, aspectRatio]);

  const handleMouseDown = (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (type === "move") setDragging(true);
    else setResizing(type);
    dragStart.current = { mx: e.clientX, my: e.clientY, cx: crop.x, cy: crop.y, cw: crop.w, ch: crop.h };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const img = imgRef.current;
    if (!img) return;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const dx = (e.clientX - dragStart.current.mx) * scaleX;
    const dy = (e.clientY - dragStart.current.my) * scaleY;

    if (dragging) {
      setCrop((prev) => ({
        ...prev,
        x: Math.max(0, Math.min(img.naturalWidth - prev.w, dragStart.current.cx + dx)),
        y: Math.max(0, Math.min(img.naturalHeight - prev.h, dragStart.current.cy + dy)),
      }));
    } else if (resizing) {
      setCrop((prev) => {
        let { x, y, w, h } = prev;
        const minSize = 30;
        const type = resizing;
        if (type.includes("e")) w = Math.max(minSize, Math.min(img.naturalWidth - x, dragStart.current.cw + dx));
        if (type.includes("w")) {
          const newW = Math.max(minSize, dragStart.current.cw - dx);
          const newX = dragStart.current.cx + (dragStart.current.cw - newW);
          if (newX >= 0) { x = newX; w = newW; }
        }
        if (type.includes("s")) h = Math.max(minSize, Math.min(img.naturalHeight - y, dragStart.current.ch + dy));
        if (type.includes("n")) {
          const newH = Math.max(minSize, dragStart.current.ch - dy);
          const newY = dragStart.current.cy + (dragStart.current.ch - newH);
          if (newY >= 0) { y = newY; h = newH; }
        }
        if (aspectRatio) {
          if (type === "e" || type === "w") {
            h = w / aspectRatio;
            if (y + h > img.naturalHeight) { h = img.naturalHeight - y; w = h * aspectRatio; }
          } else if (type === "n" || type === "s") {
            w = h * aspectRatio;
            if (x + w > img.naturalWidth) { w = img.naturalWidth - x; h = w / aspectRatio; }
          } else {
            if (w / h > aspectRatio) { w = h * aspectRatio; } else { h = w / aspectRatio; }
          }
        }
        return { x, y, w, h };
      });
    }
  };

  const handleMouseUp = () => { setDragging(false); setResizing(null); };

  const handleApply = () => {
    const img = imgRef.current;
    if (!img) return;
    let outW = crop.w;
    let outH = crop.h;
    if (outW > maxDim || outH > maxDim) {
      const scale = maxDim / Math.max(outW, outH);
      outW = Math.round(outW * scale);
      outH = Math.round(outH * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
    onApply(canvas.toDataURL("image/jpeg", quality));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Crop Image</h3>
        <div style={{ position: "relative", overflow: "hidden", maxHeight: "60vh" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt="Crop"
            style={{ maxWidth: "100%", maxHeight: "60vh", display: "block", userSelect: "none" }}
            draggable={false}
          />
          <div
            style={{
              position: "absolute",
              left: `${(crop.x / (imgRef.current?.naturalWidth || 1)) * 100}%`,
              top: `${(crop.y / (imgRef.current?.naturalHeight || 1)) * 100}%`,
              width: `${(crop.w / (imgRef.current?.naturalWidth || 1)) * 100}%`,
              height: `${(crop.h / (imgRef.current?.naturalHeight || 1)) * 100}%`,
              border: "2px solid #e95f32",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
              cursor: dragging ? "grabbing" : "grab",
            }}
            onMouseDown={(e) => handleMouseDown(e, "move")}
          >
            {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((type) => (
              <div
                key={type}
                style={{
                  position: "absolute",
                  width: 12,
                  height: 12,
                  background: "#e95f32",
                  border: "2px solid #fff",
                  borderRadius: 2,
                  cursor: `${type === "nw" || type === "se" ? "nwse" : type === "ne" || type === "sw" ? "nesw" : type === "n" || type === "s" ? "ns" : "ew"}-resize`,
                  ...(type.includes("n") ? { top: -6 } : {}),
                  ...(type.includes("s") ? { bottom: -6 } : {}),
                  ...(type.includes("e") ? { right: -6 } : {}),
                  ...(type.includes("w") ? { left: -6 } : {}),
                  ...(!type.includes("n") && !type.includes("s") ? { top: "50%", transform: "translateY(-50%)" } : {}),
                  ...(!type.includes("e") && !type.includes("w") ? { left: "50%", transform: "translateX(-50%)" } : {}),
                }}
                onMouseDown={(e) => handleMouseDown(e, type)}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#e95f32", color: "#fff", cursor: "pointer" }}
          >
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
}