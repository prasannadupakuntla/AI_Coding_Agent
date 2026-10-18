import test from 'node:test';
import assert from 'node:assert';
import { traceExecution } from '../src/traceEngine.ts';

test('traceExecution captures loop variable progression and coin increments', () => {
  const code = 'for i in range(3):\n  collect_coin()\n  print(i)';
  const res = traceExecution(code);

  assert.strictEqual(res.ok, true);
  assert.ok(res.steps.length > 5);

  // Check initial loop step
  const loopSteps = res.steps.filter(s => s.event === 'loop');
  assert.strictEqual(loopSteps.length, 3);
  assert.strictEqual(loopSteps[0].callStack[0].variables['i'], 0);
  assert.strictEqual(loopSteps[1].callStack[0].variables['i'], 1);
  assert.strictEqual(loopSteps[2].callStack[0].variables['i'], 2);

  // Check final coin count in last step
  const lastStep = res.steps[res.steps.length - 1];
  assert.strictEqual(lastStep.robotState.coins, 3);
});

test('traceExecution allocates heap objects and references for lists', () => {
  const code = 'bag = [10, 20, 30]\nprint(bag)';
  const res = traceExecution(code);

  assert.strictEqual(res.ok, true);
  const firstStep = res.steps[0];

  // Verify variable points to heap ref
  const bagVar = firstStep.callStack[0].variables['bag'] as { ref: string };
  assert.ok(bagVar && bagVar.ref);

  // Verify heap object exists with values
  const heapObj = firstStep.heap[bagVar.ref];
  assert.ok(heapObj);
  assert.strictEqual(heapObj.type, 'list');
  assert.deepStrictEqual(heapObj.values, [10, 20, 30]);
});

test('traceExecution tracks call stack frames, parameters, and return values', () => {
  const code = 'def double_coins(n):\n  return n * 2\ndouble_coins(4)';
  const res = traceExecution(code);

  assert.strictEqual(res.ok, true);

  // Check call step has 2 stack frames: <global> and double_coins
  const callStep = res.steps.find(s => s.event === 'call');
  assert.ok(callStep);
  assert.strictEqual(callStep.callStack.length, 2);
  assert.strictEqual(callStep.callStack[0].functionName, '<global>');
  assert.strictEqual(callStep.callStack[1].functionName, 'double_coins');
  assert.strictEqual(callStep.callStack[1].variables['n'], 4);

  // Check return step has returned value
  const returnStep = res.steps.find(s => s.event === 'return');
  assert.ok(returnStep);
  assert.strictEqual(returnStep.returnValue, 8);
});

test('traceExecution handles if conditionals deterministically', () => {
  const code = 'coins = 5\nif coins == 5:\n  print(coins)';
  const res = traceExecution(code);

  assert.strictEqual(res.ok, true);
  const ifStep = res.steps.find(s => s.line === 2);
  assert.ok(ifStep);
  assert.ok(ifStep.explanation.includes('True'));
});

test('traceExecution rejects empty code or invalid function definitions safely', () => {
  const emptyRes = traceExecution('   ');
  assert.strictEqual(emptyRes.ok, false);
  assert.ok(emptyRes.error?.includes('empty'));

  const badFn = traceExecution('def bad_fn:\n  pass');
  assert.strictEqual(badFn.ok, false);
  assert.ok(badFn.error?.includes('syntax'));
});
