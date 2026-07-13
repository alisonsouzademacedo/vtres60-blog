import type { ImageLoaderProps } from "next/image";

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

export default function imageLoader({ src }: ImageLoaderProps): string {
  if (src.startsWith("/")) {
    return `${basePath}${src}`;
  }
  return src;
}
