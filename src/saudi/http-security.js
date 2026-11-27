/** Small in-process HTTP security helpers. For multi-instance deployments use a shared limiter store. */
export function createFixedWindowRateLimiter({ windowMs, max, message = 'Too many requests. Please retry later.' }) {
  if (!Number.isInteger(windowMs) || windowMs < 1000 || !Number.isInteger(max) || max < 1) {
    throw new RangeError('Invalid rate-limit configuration.');
  }
  const buckets = new Map();
  let lastPrune = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastPrune > windowMs) {
      for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
      lastPrune = now;
    }
    const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'rate_limit_exceeded', message });
    }
    return next();
  };
}

export function normalizeSahmkBaseUrl(value) {
  const raw = value || 'https://api.sahmk.sa/api/v1';
  let url;
  try { url = new URL(raw); } catch { throw new Error('SAHMK_BASE_URL must be a valid official Sahm HTTPS URL.'); }
  const allowedHosts = new Set(['api.sahmk.sa', 'www.sahmk.sa']);
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase()) ||
      url.username || url.password || url.port || url.search || url.hash ||
      !['/api/v1', '/api/v1/'].includes(url.pathname)) {
    throw new Error('SAHMK_BASE_URL must use an approved official Sahm host and /api/v1 path over HTTPS.');
  }
  return `${url.origin}/api/v1`;
}

export function safeProviderMessage(error, provider) {
  if (error?.cause?.name === 'TimeoutError' || error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return `${provider} request timed out.`;
  }
  return `${provider} data is temporarily unavailable.`;
}
