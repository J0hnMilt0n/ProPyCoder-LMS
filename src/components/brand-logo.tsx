import Image from "next/image";

interface BrandLogoProps {
  size?: number;
}

export function BrandLogo({ size = 36 }: BrandLogoProps) {
  return (
    <span
      className="brand-logo-badge"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src="/propycoder-logo.png"
        alt=""
        width={1254}
        height={1254}
        sizes={`${size}px`}
        preload={size >= 36}
      />
    </span>
  );
}
