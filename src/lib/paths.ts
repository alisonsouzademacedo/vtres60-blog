const normalizedBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

export function withBasePath(path: string) {
  if (!normalizedBasePath) return path;
  return `${normalizedBasePath}${path.startsWith("/") ? path : `/${path}`}`;
}
