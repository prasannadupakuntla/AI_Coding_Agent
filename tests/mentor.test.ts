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

test('buildUserPrompt incorporates beginner storytelling and analogies', () => {
  const code = 'for i in range(3):\n  collect_coin()';

  const explainPrompt = buildUserPrompt({ action: 'explain', code });
  assert.ok(explainPrompt.includes('Loop Header'));
  assert.ok(explainPrompt.includes('Backpack'));

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

test('OfflineFallbackProvider explains code using beginner analogies', () => {
  const code = 'for i in range(4):\n  collect_coin()\n  print(i)';
  const explain = OfflineFallbackProvider.getResponse({ action: 'explain', code });

  // Checks for terms and analogies
  assert.ok(explain.includes('Lap Counter Badge'));
  assert.ok(explain.includes('Number Dispenser'));
  assert.ok(explain.includes('Doorway'));
  assert.ok(explain.includes('**4 laps**'));
  assert.ok(explain.includes('**4 coins**'));
});

test('OfflineFallbackProvider handles empty code honestly', () => {
  const emptyRes = OfflineFallbackProvider.getResponse({ action: 'explain', code: '' });
  assert.ok(emptyRes.includes('code editor is currently empty'));
  assert.ok(emptyRes.includes('for i in range(5):'));
});

test('OfflineFallbackProvider delivers 3 progressive hint levels', () => {
  const code = 'for i in range(5):\n  collect_coin()';

  const hint1 = OfflineFallbackProvider.getResponse({ action: 'hint', code, hintLevel: 1 });
  assert.ok(hint1.includes('Hint 1 of 3'));
  assert.ok(hint1.includes('Concept & Story'));

  const hint2 = OfflineFallbackProvider.getResponse({ action: 'hint', code, hintLevel: 2 });
  assert.ok(hint2.includes('Hint 2 of 3'));
  assert.ok(hint2.includes('Guiding Question'));

  const hint3 = OfflineFallbackProvider.getResponse({ action: 'hint', code, hintLevel: 3 });
  assert.ok(hint3.includes('Hint 3 of 3'));
  assert.ok(hint3.includes('range(3)'));
});

test('OfflineFallbackProvider accurately diagnoses common beginner mistakes', () => {
  // Missing colon
  const colonErr = OfflineFallbackProvider.getResponse({ action: 'mistake', code: 'for i in range(5)' });
  assert.ok(colonErr.includes('Missing Colon'));

  // Missing for keyword
  const forErr = OfflineFallbackProvider.getResponse({ action: 'mistake', code: 'loop i in 5:' });
  assert.ok(forErr.includes("Missing 'for' Keyword"));

  // Number too large (> 20)
  const largeErr = OfflineFallbackProvider.getResponse({ action: 'mistake', code: 'for i in range(50):\n  collect_coin()' });
  assert.ok(largeErr.includes('Number Too Large'));

  // range(0) zero laps warning
  const zeroErr = OfflineFallbackProvider.getResponse({ action: 'mistake', code: 'for i in range(0):\n  collect_coin()' });
  assert.ok(zeroErr.includes('range(0) Means Zero Laps'));
});

test('OfflineFallbackProvider answers common beginner conceptual questions', () => {
  // Why start at 0
  const qZero = OfflineFallbackProvider.getResponse({
    action: 'ask',
    code: 'for i in range(5):',
    studentQuestion: 'Why does range(5) stop at 4?',
  });
  assert.ok(qZero.includes('counting starts at 0') || qZero.includes('starts at `0`'));

  // What is i
  const qVar = OfflineFallbackProvider.getResponse({
    action: 'ask',
    code: 'for i in range(5):',
    studentQuestion: "What is the letter 'i'?",
  });
  assert.ok(qVar.includes('Lap Counter Badge'));

  // What is iteration
  const qIter = OfflineFallbackProvider.getResponse({
    action: 'ask',
    code: 'for i in range(5):',
    studentQuestion: 'What is an iteration in plain English?',
  });
  assert.ok(qIter.includes('One complete lap through the loop'));

  // Indentation
  const qIndent = OfflineFallbackProvider.getResponse({
    action: 'ask',
    code: 'for i in range(5):',
    studentQuestion: 'Why does indentation matter?',
  });
  assert.ok(qIndent.includes("robot's backpack"));
});

test('getProvider returns corresponding adapter', () => {
  const google = getProvider('google');
  assert.ok(google instanceof GoogleAIProvider);

  const openrouter = getProvider('openrouter');
  assert.ok(openrouter instanceof OpenRouterProvider);
});

test('handleMentorRequest validates payload structure and limits', async () => {
  const emptyRes = await handleMentorRequest(null, '127.0.0.1');
  assert.strictEqual(emptyRes.status, 400);

  const badActionRes = await handleMentorRequest({ action: 'eval_code', code: '' }, '127.0.0.1');
  assert.strictEqual(badActionRes.status, 400);

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
