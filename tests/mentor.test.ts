import test from 'node:test';
import assert from 'node:assert';
import { RateLimiter } from '../server/rateLimiter.ts';
import { sanitizeText, buildUserPrompt, SYSTEM_PROMPT } from '../server/prompts.ts';
import { OfflineFallbackProvider, getProvider, GoogleAIProvider, OpenRouterProvider } from '../server/providers.ts';
import { handleMentorRequest, handleHealthCheck } from '../server/handler.ts';

test('RateLimiter enforces 15 requests limit and resets correctly', () => {
  const limiter = new RateLimiter(3, 1000);
  const ip = '192.168.1.100';

  assert.strictEqual(limiter.check(ip).allowed, true);
  assert.strictEqual(limiter.check(ip).allowed, true);
  assert.strictEqual(limiter.check(ip).allowed, true);

  const blocked = limiter.check(ip);
  assert.strictEqual(blocked.allowed, false);
  assert.ok((blocked.retryAfterSeconds ?? 0) >= 0);

  limiter.reset();
  assert.strictEqual(limiter.check(ip).allowed, true);
});

test('sanitizeText strips control characters and limits length', () => {
  const dirty = 'Hello\u0000World\u0007!';
  const clean = sanitizeText(dirty, 20);
  assert.strictEqual(clean, 'HelloWorld!');

  const truncated = sanitizeText('1234567890', 5);
  assert.strictEqual(truncated, '12345');
});

test('buildUserPrompt handles explain, hint, mistake, and ask', () => {
  const code = 'for i in range(3):\n  collect_coin()';

  const explainPrompt = buildUserPrompt({ action: 'explain', code });
  assert.ok(explainPrompt.includes('line-by-line'));

  const hint1 = buildUserPrompt({ action: 'hint', code, hintLevel: 1 });
  assert.ok(hint1.includes('Hint #1'));

  const hint3 = buildUserPrompt({ action: 'hint', code, hintLevel: 3 });
  assert.ok(hint3.includes('Hint #3'));

  const mistakePrompt = buildUserPrompt({
    action: 'mistake',
    code,
    executionState: { ok: true, coinsCollected: 2, total: 3 },
  });
  assert.ok(mistakePrompt.includes('Coins collected: 2 out of 3'));

  const askPrompt = buildUserPrompt({
    action: 'ask',
    code,
    studentQuestion: 'Why does range start at 0?',
  });
  assert.ok(askPrompt.includes('Why does range start at 0?'));
});

test('OfflineFallbackProvider provides beginner-friendly responses without API key', () => {
  const code = 'for i in range(5):\n  collect_coin()';

  const explain = OfflineFallbackProvider.getResponse({ action: 'explain', code });
  assert.ok(explain.includes('range(5)'));
  assert.ok(explain.includes('collect_coin()'));

  const hint = OfflineFallbackProvider.getResponse({ action: 'hint', code, hintLevel: 2 });
  assert.ok(hint.includes('Hint 2'));

  const mistake = OfflineFallbackProvider.getResponse({ action: 'mistake', code: 'while True:' });
  assert.ok(mistake.includes('Missing loop declaration'));
});

test('getProvider returns corresponding adapter', () => {
  const google = getProvider('google');
  assert.ok(google instanceof GoogleAIProvider);

  const openrouter = getProvider('openrouter');
  assert.ok(openrouter instanceof OpenRouterProvider);
});

test('handleMentorRequest validates payload structure and limits', async () => {
  // Empty body
  const emptyRes = await handleMentorRequest(null, '127.0.0.1');
  assert.strictEqual(emptyRes.status, 400);

  // Invalid action
  const badActionRes = await handleMentorRequest({ action: 'hack', code: '' }, '127.0.0.1');
  assert.strictEqual(badActionRes.status, 400);

  // Excessively long code
  const longCode = 'a'.repeat(1500);
  const longRes = await handleMentorRequest({ action: 'explain', code: longCode }, '127.0.0.1');
  assert.strictEqual(longRes.status, 400);
});

test('handleMentorRequest falls back gracefully when no API key configured', async () => {
  const res = await handleMentorRequest(
    { action: 'explain', code: 'for i in range(3):\n  collect_coin()' },
    '10.0.0.1'
  );

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.isFallback, true);
  assert.ok(res.body.reply.includes('ByteBot'));
});

test('handleHealthCheck returns status and provider configuration', () => {
  const health = handleHealthCheck();
  assert.strictEqual(health.status, 'ok');
  assert.strictEqual(typeof health.hasEnvKey, 'boolean');
  assert.ok(health.configuredProvider === 'google' || health.configuredProvider === 'openrouter');
});
