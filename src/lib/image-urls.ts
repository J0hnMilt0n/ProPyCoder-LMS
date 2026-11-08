import { createHash } from "node:crypto";

type ImageKind = "course" | "bundle" | "avatar";

export function imageUrl(
  image: string | null,
  kind: ImageKind,
  id: string,
): string | null {
  if (!image?.startsWith("data:")) return image;

  const version = createHash("sha256").update(image).digest("hex").slice(0, 16);
  return `/api/images/${kind}/${encodeURIComponent(id)}?v=${version}`;
}
