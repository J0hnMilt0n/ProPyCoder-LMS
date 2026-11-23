"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import toast from "react-hot-toast";

interface ImageUploadFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  optional?: boolean;
}

export function ImageUploadField({
  label = "Cover image",
  value,
  onChange,
  placeholder = "https://...",
  optional = true,
}: ImageUploadFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isReading, setIsReading] = useState(false);

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    // Reset so selecting the same file again still fires change.
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }

    // Keep uploaded image under the API's JSON limit.
    const MAX_IMAGE_BYTES = 1_600_000;

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be smaller than 1.6 MB");
      return;
    }

    setIsReading(true);

    const reader = new FileReader();

    reader.onload = () => {
      setIsReading(false);

      if (typeof reader.result === "string") {
        onChange(reader.result);
        toast.success("Image uploaded successfully");
      }
    };

    reader.onerror = () => {
      setIsReading(false);
      toast.error("Could not read that image");
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className="image-upload-field">
      <label>
        {label}{" "}
        {optional && (
          <span className="instructor-optional">Optional</span>
        )}
      </label>

      <div className="image-upload-row">
        <input
          type="url"
          className="image-upload-url"
          value={value.startsWith("data:") ? "" : value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />

        <button
          type="button"
          className="image-upload-button"
          onClick={() => fileRef.current?.click()}
          disabled={isReading}
        >
          {isReading ? (
            <LoaderCircle size={15} className="admin-spin" />
          ) : (
            <Upload size={15} />
          )}
          <span>Upload</span>
        </button>

        {value && (
          <button
            type="button"
            className="image-upload-clear"
            onClick={() => onChange("")}
            aria-label="Remove image"
            title="Remove"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handlePick}
      />

      {value ? (
        <div className="image-upload-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={`${label} preview`} />
        </div>
      ) : (
        <div className="image-upload-empty">
          <ImagePlus size={16} />
          <span>Upload a picture or paste a URL above</span>
        </div>
      )}
    </div>
  );
}
