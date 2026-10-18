import test from 'node:test';
import assert from 'node:assert';
import { safeParse } from '../src/interpreter.ts';

test('safeParse parses valid for loop with collect_coin and print', () => {
  const code = 'for i in range(3):\n  collect_coin()\n  print(i)';
  const res = safeParse(code);

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.total, 3);
  assert.strictEqual(res.varName, 'i');
  assert.ok(res.steps && res.steps.length > 0);

  // Each iteration has 1 loop header step + 2 body steps + 1 final done step = 3 * 3 + 1 = 10 steps
  assert.strictEqual(res.steps.length, 10);

  // Coin collected count across steps
  const coins = res.steps.filter(s => s.coinCollected).length;
  assert.strictEqual(coins, 3, 'Should collect exactly 3 coins for range(3)');
});

test('safeParse handles range(0) gracefully', () => {
  const code = 'for x in range(0):\n  collect_coin()';
  const res = safeParse(code);

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.total, 0);
  assert.strictEqual(res.steps?.length, 1); // Only the "Done!" step
  const coins = res.steps?.filter(s => s.coinCollected).length;
  assert.strictEqual(coins, 0);
});

test('safeParse rejects unsupported Python code safely', () => {
  const dangerousCode = 'for i in range(5):\n  import os\n  os.system("rm -rf /")';
  const res = safeParse(dangerousCode);

  assert.strictEqual(res.ok, false);
  assert.ok(res.error?.includes('Not supported'));
});

test('safeParse rejects missing loop body', () => {
  const code = 'for i in range(5):';
  const res = safeParse(code);

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'Add a line inside the loop');
});

test('safeParse rejects range exceeding maximum safe bound', () => {
  const code = 'for i in range(50):\n  collect_coin()';
  const res = safeParse(code);

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'N must be 0–20');
});

test('safeParse rejects malformed for loop syntax', () => {
  const code = 'while i < 5:\n  collect_coin()';
  const res = safeParse(code);

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'Use: for <var> in range(N):');
});
