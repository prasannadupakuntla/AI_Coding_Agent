import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMentorRequest, handleHealthCheck } from './handler.ts';

export { handleMentorRequest, handleHealthCheck } from './handler.ts';
export * from './types.ts';
export * from './providers.ts';
export * from './prompts.ts';
export * from './rateLimiter.ts';

export function mentorMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url || '';

  // GET /api/health or /health
  if (req.method === 'GET' && (url === '/api/health' || url === '/health')) {
    const health = handleHealthCheck();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(health));
    return;
  }

  // POST /api/mentor or /mentor
  if (req.method === 'POST' && (url === '/api/mentor' || url === '/mentor')) {
    let bodyData = '';
    const MAX_PAYLOAD_BYTES = 10 * 1024; // 10KB safeguard

    req.on('data', chunk => {
      bodyData += chunk;
      if (bodyData.length > MAX_PAYLOAD_BYTES) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Payload Too Large' }));
        req.destroy();
      }
    });

    req.on('end', async () => {
      let parsedBody: unknown = null;
      try {
        parsedBody = bodyData ? JSON.parse(bodyData) : null;
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        return;
      }

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';
      const clientHeaderKey = req.headers['x-api-key'] as string | undefined;

      try {
        const result = await handleMentorRequest(parsedBody, clientIp, clientHeaderKey);
        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result.body));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal Server Error';
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: message }));
      }
    });
    return;
  }

  next();
}
