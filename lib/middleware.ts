// lib/middleware.ts
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

/** Wrap a Next.js API handler and log once the response ends. */
export function withLogger(handler: NextApiHandler): NextApiHandler {
  return async function logger(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    const start = Date.now();

    // Preserve original end with correct 'this'
    const originalEnd: NextApiResponse['end'] = res.end.bind(res);

    // Override res.end but keep the exact call signature and return type
    res.end = (function (
      this: NextApiResponse,
      chunk?: any,
      encoding?: BufferEncoding | (() => void),
      cb?: () => void
    ) {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;
      const { method, url } = req;

      // your logging here if you want:
      // console.log(`[API] ${method} ${url} -> ${statusCode} (${duration}ms)`);

      // If 'encoding' is actually the callback, use the (chunk, cb) overload
      if (typeof encoding === 'function') {
        return originalEnd.call(this, chunk, encoding);
      }
      // Otherwise use the (chunk, encoding, cb) overload
      return originalEnd.call(this, chunk, encoding, cb);
    } as typeof res.end);

    await handler(req, res);
  };
}

/** Express-style middleware variant if you compose middlewares. */
export function loggerMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void
): void {
  const start = Date.now();
  const originalEnd: NextApiResponse['end'] = res.end.bind(res);

  res.end = (function (
    this: NextApiResponse,
    chunk?: any,
    encoding?: BufferEncoding | (() => void),
    cb?: () => void
  ) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    // console.log(`[API] ${req.method} ${req.url} -> ${statusCode} (${duration}ms)`);

    if (typeof encoding === 'function') {
      return originalEnd.call(this, chunk, encoding);
    }
    return originalEnd.call(this, chunk, encoding, cb);
  } as typeof res.end);

  next();
}
