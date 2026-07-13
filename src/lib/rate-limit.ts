type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: Math.max(0, limit - 1), resetAt: now + windowMs };
  }
  if (current.count >= limit) return { limited: true, remaining: 0, resetAt: current.resetAt };
  current.count += 1;
  return { limited: false, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}
