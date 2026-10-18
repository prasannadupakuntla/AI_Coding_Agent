import test from 'node:test';
import assert from 'node:assert';
import { pythonRunner } from '../src/services/pythonRunner.ts';

test('Pyodide executes prime-number example with nested loops and collect_coin', async () => {
  const code = `
def is_prime(n):
    if n <= 1:
        return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True

primes = []
for x in range(2, 20):
    if is_prime(x):
        primes.append(x)
        collect_coin()

print("Primes under 20:", primes)
`;

  const res = await pythonRunner.runDirect(code);

  assert.strictEqual(res.success, true);
  // There are 8 primes under 20: 2, 3, 5, 7, 11, 13, 17, 19
  assert.strictEqual(res.coinsCollected, 8);
  assert.ok(res.stdout.some(line => line.includes('[2, 3, 5, 7, 11, 13, 17, 19]')));
  assert.ok(res.steps.length > 0);
});

test('Pyodide executes recursion correctly', async () => {
  const code = `
def fibonacci(n):
    if n <= 0:
        return 0
    elif n == 1:
        return 1
    return fibonacci(n - 1) + fibonacci(n - 2)

result = fibonacci(7)
print("Fibonacci(7) =", result)
`;

  const res = await pythonRunner.runDirect(code);
  assert.strictEqual(res.success, true);
  assert.ok(res.stdout.some(line => line.includes('Fibonacci(7) = 13')));
});

test('Pyodide executes lists, dictionaries and comprehensions', async () => {
  const code = `
inventory = {"coins": 0, "stars": 3}
bonus_multipliers = [x * 2 for x in range(1, 4)]
inventory["multipliers"] = bonus_multipliers

for m in bonus_multipliers:
    inventory["coins"] += m
    collect_coin()

print("Final Inventory:", inventory)
`;

  const res = await pythonRunner.runDirect(code);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.coinsCollected, 3);
  assert.ok(res.stdout.some(line => line.includes("'coins': 12")));
});

test('Pyodide executes classes, methods and object-oriented programming', async () => {
  const code = `
class RobotCompanion:
    def __init__(self, name, starting_coins=0):
        self.name = name
        self.coins = starting_coins

    def collect(self, amount=1):
        for _ in range(amount):
            self.coins += 1
            collect_coin()
        return self.coins

bytebot = RobotCompanion("ByteBot", 2)
bytebot.collect(3)
print(f"Robot {bytebot.name} has {bytebot.coins} coins.")
`;

  const res = await pythonRunner.runDirect(code);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.coinsCollected, 3);
  assert.ok(res.stdout.some(line => line.includes('Robot ByteBot has 5 coins.')));
});

test('Pyodide captures Python exceptions and errors safely', async () => {
  // ZeroDivisionError
  const divZero = await pythonRunner.runDirect('x = 10 / 0');
  assert.strictEqual(divZero.success, false);
  assert.ok(divZero.error?.includes('ZeroDivisionError'));

  // SyntaxError
  const syntaxErr = await pythonRunner.runDirect('def broken_func(:\n  pass');
  assert.strictEqual(syntaxErr.success, false);
  assert.ok(syntaxErr.error?.includes('SyntaxError'));

  // NameError
  const nameErr = await pythonRunner.runDirect('print(unknown_variable_xyz)');
  assert.strictEqual(nameErr.success, false);
  assert.ok(nameErr.error?.includes('NameError'));
});
