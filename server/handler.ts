import type { MentorRequest, MentorResponse, HealthResponse } from './types.ts';
import { RateLimiter } from './rateLimiter.ts';
import { getProvider, OfflineFallbackProvider } from './providers.ts';

const rateLimiter = new RateLimiter(15, 60_000);

export function getEffectiveApiKey(req: MentorRequest, clientHeaderKey?: string): { key: string | null; providerType: 'google' | 'openrouter' } {
  const providerType = req.provider || (process.env.AI_PROVIDER === 'openrouter' ? 'openrouter' : 'google');

  // Check header or request body first (client-provided session key)
  const clientKey = (clientHeaderKey || req.apiKey || '').trim();
  if (clientKey) {
    return { key: clientKey, providerType };
  }

  // Check server environment variables
  if (providerType === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY || null;
    return { key, providerType };
  }

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  return { key, providerType };
}

export function handleHealthCheck(): HealthResponse {
  const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENROUTER_API_KEY;
  const provider = (process.env.AI_PROVIDER === 'openrouter' ? 'openrouter' : 'google');

  return {
    status: 'ok',
    hasEnvKey: Boolean(envKey),
    configuredProvider: provider,
    rateLimitMax: 15,
  };
}

export async function handleMentorRequest(
  body: unknown,
  clientIp = '127.0.0.1',
  clientHeaderKey?: string
): Promise<{ status: number; body: MentorResponse }> {
  // 1. Rate limiting check
  const rate = rateLimiter.check(clientIp);
  if (!rate.allowed) {
    return {
      status: 429,
      body: {
        success: false,
        reply: `⚠️ Rate limit reached. You can make 15 mentor requests per minute. Please retry in ${rate.retryAfterSeconds}s.`,
        action: 'explain',
        providerUsed: 'rate-limiter',
        error: 'Too Many Requests',
      },
    };
  }

  // 2. Validate request body structure
  if (!body || typeof body !== 'object') {
    return {
      status: 400,
      body: {
        success: false,
        reply: 'Invalid request: Body must be a JSON object.',
        action: 'explain',
        providerUsed: 'validator',
        error: 'Bad Request',
      },
    };
  }

  const req = body as MentorRequest;
  const validActions = ['explain', 'hint', 'mistake', 'ask'];
  if (!validActions.includes(req.action)) {
    return {
      status: 400,
      body: {
        success: false,
        reply: `Invalid action: Supported actions are ${validActions.join(', ')}.`,
        action: 'explain',
        providerUsed: 'validator',
        error: 'Invalid Action',
      },
    };
  }

  // 3. Validation safeguards on student inputs
  if (typeof req.code !== 'string' || req.code.length > 1200) {
    return {
      status: 400,
      body: {
        success: false,
        reply: 'Code input exceeds maximum allowed length (1200 characters).',
        action: req.action,
        providerUsed: 'validator',
        error: 'Input Too Long',
      },
    };
  }

  if (req.studentQuestion && (typeof req.studentQuestion !== 'string' || req.studentQuestion.length > 300)) {
    return {
      status: 400,
      body: {
        success: false,
        reply: 'Question exceeds maximum allowed length (300 characters).',
        action: req.action,
        providerUsed: 'validator',
        error: 'Question Too Long',
      },
    };
  }

  // 4. Resolve API key & provider
  const { key, providerType } = getEffectiveApiKey(req, clientHeaderKey);

  // If no API key configured, use the safe OfflineFallbackProvider gracefully
  if (!key) {
    const fallbackReply = OfflineFallbackProvider.getResponse(req);
    return {
      status: 200,
      body: {
        success: true,
        reply: fallbackReply,
        action: req.action,
        hintLevel: req.hintLevel,
        providerUsed: 'ByteBot Builtin Tutor (No API Key Configured)',
        isFallback: true,
      },
    };
  }

  // 5. Invoke selected AI provider
  const provider = getProvider(providerType);
  try {
    const reply = await provider.generate(req, key, 10000);
    return {
      status: 200,
      body: {
        success: true,
        reply,
        action: req.action,
        hintLevel: req.hintLevel,
        providerUsed: provider.name,
      },
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown AI Provider error';
    // Graceful fallback on upstream provider errors so learning is never blocked
    const fallbackReply = OfflineFallbackProvider.getResponse(req);
    return {
      status: 200,
      body: {
        success: true,
        reply: `${fallbackReply}\n\n*(Note: Live provider call failed with: ${errMsg}. Showing offline mentor response)*`,
        action: req.action,
        hintLevel: req.hintLevel,
        providerUsed: `${provider.name} (Fallback)`,
        isFallback: true,
        error: errMsg,
      },
    };
  }
}
