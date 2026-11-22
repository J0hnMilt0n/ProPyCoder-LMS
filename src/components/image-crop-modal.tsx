"use client";

import { useRef, useState, useEffect } from "react";

interface ImageCropModalProps {
  src: string;
  onApply: (croppedDataUrl: string) => void;
  onCancel: () => void;
  aspectRatio?: number;
  maxDim?: number;
  quality?: number;
}

type Crop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type PointerStart = {
  pointerId: number;
  type: string;
  startX: number;
  startY: number;
  crop: Crop;
};

export function ImageCropModal({
  src,
  onApply,
  onCancel,
  aspectRatio = 1,
  maxDim = 800,
  quality = 0.75,
}: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const pointerStart = useRef<PointerStart | null>(null);

  const [crop, setCrop] = useState<Crop>({
    x: 0,
    y: 0,
    w: 200,
    h: 200,
  });

  const [isInteracting, setIsInteracting] = useState(false);

  // Initialize crop after image loads.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const initializeCrop = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;

      if (!width || !height) return;

      const w = Math.min(width, height * aspectRatio);
      const h = w / aspectRatio;

      setCrop({
        x: (width - w) / 2,
        y: (height - h) / 2,
        w,
        h,
      });
    };

    img.addEventListener("load", initializeCrop);

    if (img.complete && img.naturalWidth > 0) {
      initializeCrop();
    }

    return () => {
      img.removeEventListener("load", initializeCrop);
    };
  }, [src, aspectRatio]);

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    const img = imgRef.current;
    if (!img) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-handle]");

    const type = handle?.dataset.handle ?? "move";

    pointerStart.current = {
      pointerId: e.pointerId,
      type,
      startX: e.clientX,
      startY: e.clientY,
      crop: { ...crop },
    };

    e.currentTarget.setPointerCapture(e.pointerId);
    setIsInteracting(true);
  };

  const handlePointerMove = (
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    const img = imgRef.current;
    const start = pointerStart.current;

    if (!img || !start || start.pointerId !== e.pointerId) return;

    e.preventDefault();

    const rect = img.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    const dx = (e.clientX - start.startX) * scaleX;
    const dy = (e.clientY - start.startY) * scaleY;

    const imageWidth = img.naturalWidth;
    const imageHeight = img.naturalHeight;

    const original = start.crop;

    if (start.type === "move") {
      setCrop({
        ...original,
        x: Math.max(
          0,
          Math.min(imageWidth - original.w, original.x + dx)
        ),
        y: Math.max(
          0,
          Math.min(imageHeight - original.h, original.y + dy)
        ),
      });

      return;
    }

    // Resize while preserving the selected aspect ratio.
    const type = start.type;

    let widthChange = 0;

    if (type.includes("e")) {
      widthChange = dx;
    } else if (type.includes("w")) {
      widthChange = -dx;
    }

    if (type === "n" || type === "s") {
      widthChange = (type === "s" ? dy : -dy) * aspectRatio;
    }

    if (type.length === 2) {
      const horizontalChange = widthChange;
      const verticalChange =
        (type.includes("s") ? dy : -dy) * aspectRatio;

      widthChange =
        Math.abs(horizontalChange) >= Math.abs(verticalChange)
          ? horizontalChange
          : verticalChange;
    }

    const isWest = type.includes("w");
    const isEast = type.includes("e");
    const isNorth = type.includes("n");
    const isSouth = type.includes("s");

    const anchorX = isWest
      ? original.x + original.w
      : isEast
        ? original.x
        : original.x + original.w / 2;

    const anchorY = isNorth
      ? original.y + original.h
      : isSouth
        ? original.y
        : original.y + original.h / 2;

    const maxWidthFromX = isWest
      ? anchorX
      : isEast
        ? imageWidth - anchorX
        : 2 * Math.min(anchorX, imageWidth - anchorX);

    const maxHeightFromY = isNorth
      ? anchorY
      : isSouth
        ? imageHeight - anchorY
        : 2 * Math.min(anchorY, imageHeight - anchorY);

    const maxWidth = Math.min(
      maxWidthFromX,
      maxHeightFromY * aspectRatio
    );

    const minWidth = Math.min(
      30,
      maxWidth
    );

    const newWidth = Math.max(
      minWidth,
      Math.min(maxWidth, original.w + widthChange)
    );

    const newHeight = newWidth / aspectRatio;

    const newX = isWest
      ? anchorX - newWidth
      : isEast
        ? anchorX
        : anchorX - newWidth / 2;

    const newY = isNorth
      ? anchorY - newHeight
      : isSouth
        ? anchorY
        : anchorY - newHeight / 2;

    setCrop({
      x: newX,
      y: newY,
      w: newWidth,
      h: newHeight,
    });
  };

  const handlePointerUp = (
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (pointerStart.current?.pointerId !== e.pointerId) return;

    pointerStart.current = null;
    setIsInteracting(false);

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleApply = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;

    const scale = Math.min(
      1,
      maxDim / Math.max(crop.w, crop.h)
    );

    const outW = Math.max(1, Math.round(crop.w * scale));
    const outH = Math.max(1, Math.round(crop.h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      img,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      0,
      0,
      outW,
      outH
    );

    onApply(canvas.toDataURL("image/jpeg", quality));
  };

  const handles = [
    "nw",
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          width: "min(92vw, 560px)",
          maxHeight: "92dvh",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "auto",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "#222",
          }}
        >
          Crop Image
        </h3>

        <div
          style={{
            position: "relative",
            width: "fit-content",
            maxWidth: "100%",
            margin: "0 auto",
            overflow: "hidden",
            lineHeight: 0,
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt="Crop"
            draggable={false}
            style={{
              display: "block",
              width: "auto",
              height: "auto",
              maxWidth: "100%",
              maxHeight: "55dvh",
              objectFit: "contain",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />

          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: "absolute",
              left: `${(crop.x / (imgRef.current?.naturalWidth || 1)) * 100}%`,
              top: `${(crop.y / (imgRef.current?.naturalHeight || 1)) * 100}%`,
              width: `${(crop.w / (imgRef.current?.naturalWidth || 1)) * 100}%`,
              height: `${(crop.h / (imgRef.current?.naturalHeight || 1)) * 100}%`,
              boxSizing: "border-box",
              border: "2px solid #c6532b",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.48)",
              cursor: isInteracting ? "grabbing" : "grab",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            {handles.map((type) => (
              <div
                key={type}
                data-handle={type}
                style={{
                position: "absolute",
                width: 12,
                height: 12,
                background: "#e95f32",
                border: "2px solid #fff",
                borderRadius: 2,
                boxSizing: "border-box",
                touchAction: "none",
                ...(type.includes("n") ? { top: -6 } : {}),
                ...(type.includes("s") ? { bottom: -6 } : {}),
                ...(type.includes("e") ? { right: -6 } : {}),
                ...(type.includes("w") ? { left: -6 } : {}),
                ...(!type.includes("n") && !type.includes("s")
                  ? { top: "50%", transform: "translateY(-50%)" }
                  : {}),
                ...(!type.includes("e") && !type.includes("w")
                  ? { left: "50%", transform: "translateX(-50%)" }
                  : {}),
              }}
              />
            ))}
          </div>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "#777",
            textAlign: "center",
          }}
        >
          Drag the image area to reposition. Drag the corner or edge
          handles to resize.
        </p>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fff",
              color: "#333",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: "none",
              background: "#c6532b",
              color: "#fff",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
}
