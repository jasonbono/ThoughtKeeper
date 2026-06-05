// Sliding window in-memory rate limiter.
// Keyed by arbitrary string (e.g. "chat:<userId>").

const windows = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const timestamps = windows.get(key) ?? [];
  const valid = timestamps.filter((t) => t > now - windowMs);

  if (valid.length >= maxRequests) {
    const retryAfter = Math.ceil((valid[0] + windowMs - now) / 1000);
    windows.set(key, valid);
    return { allowed: false, retryAfter };
  }

  valid.push(now);
  windows.set(key, valid);
  return { allowed: true };
}
