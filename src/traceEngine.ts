export interface StackFrame {
  functionName: string;
  line: number;
  variables: Record<string, string | number | boolean | { ref: string }>;
}

export interface HeapObject {
  id: string;
  type: 'list';
  values: (string | number | boolean)[];
}

export interface TraceStep {
  stepIndex: number;
  line: number;           // 1-indexed line currently executing
  nextLine: number | null;// 1-indexed next line to execute
  event: 'step' | 'call' | 'return' | 'loop' | 'done';
  callStack: StackFrame[];
  heap: Record<string, HeapObject>;
  stdout: string[];
  returnValue?: string | number | boolean;
  robotState: {
    coins: number;
    position: number;
    happy: boolean;
  };
  explanation: string;
}

export interface TraceResult {
  ok: boolean;
  error?: string;
  steps: TraceStep[];
  codeLines: string[];
}

interface ParsedFunction {
  name: string;
  params: string[];
  startLine: number; // 0-indexed
  endLine: number;
  bodyLines: { lineIdx: number; text: string; indent: number }[];
}

/**
 * Deterministic execution tracer for a beginner Python subset.
 * Supports:
 * - for loops with range(N)
 * - variable assignments (primitives and lists)
 * - if/else conditionals
 * - function definitions (def ... return ...)
 * - builtins: collect_coin(), print(...)
 */
export function traceExecution(sourceCode: string): TraceResult {
  const rawLines = sourceCode.split('\n');
  const codeLines = rawLines.map(l => l.trimEnd());
  if (codeLines.every(l => !l.trim())) {
    return { ok: false, error: 'Source code is empty.', steps: [], codeLines };
  }

  // Pre-parse and validate functions
  const functions = new Map<string, ParsedFunction>();
  const lineDetails = codeLines.map((l, idx) => {
    const trimmed = l.trim();
    const indent = l.length - l.trimStart().length;
    return { idx, trimmed, indent, raw: l };
  });

  // Identify functions
  for (let i = 0; i < lineDetails.length; i++) {
    const ld = lineDetails[i];
    if (ld.trimmed.startsWith('def ')) {
      const match = ld.trimmed.match(/^def\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*:$/);
      if (!match) {
        return { ok: false, error: `Line ${i + 1}: Invalid function definition syntax.`, steps: [], codeLines };
      }
      const fnName = match[1];
      const params = match[2].split(',').map(p => p.trim()).filter(Boolean);
      const fnBody: { lineIdx: number; text: string; indent: number }[] = [];
      let j = i + 1;
      while (j < lineDetails.length && (lineDetails[j].trimmed === '' || lineDetails[j].indent > ld.indent)) {
        if (lineDetails[j].trimmed !== '') {
          fnBody.push({ lineIdx: j, text: lineDetails[j].trimmed, indent: lineDetails[j].indent });
        }
        j++;
      }
      if (fnBody.length === 0) {
        return { ok: false, error: `Line ${i + 1}: Function '${fnName}' has empty body.`, steps: [], codeLines };
      }
      functions.set(fnName, { name: fnName, params, startLine: i, endLine: j - 1, bodyLines: fnBody });
      i = j - 1;
    }
  }

  // State management
  const steps: TraceStep[] = [];
  const globalVariables: Record<string, any> = {};
  const heap: Record<string, HeapObject> = {};
  let heapCounter = 1;
  const stdout: string[] = [];
  let coins = 0;
  let robotPos = 0;

  function cloneHeap(): Record<string, HeapObject> {
    const copy: Record<string, HeapObject> = {};
    for (const k of Object.keys(heap)) {
      copy[k] = { id: heap[k].id, type: 'list', values: [...heap[k].values] };
    }
    return copy;
  }

  function evalExpr(expr: string, localVars: Record<string, any>): any {
    const e = expr.trim();
    if (/^\d+$/.test(e)) return parseInt(e, 10);
    if (/^true$/i.test(e)) return true;
    if (/^false$/i.test(e)) return false;
    if ((e.startsWith('"') && e.endsWith('"')) || (e.startsWith("'") && e.endsWith("'"))) {
      return e.slice(1, -1);
    }
    if (e.startsWith('[') && e.endsWith(']')) {
      const items = e.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      return items.map(it => evalExpr(it, localVars));
    }
    // Simple arithmetic (a + b, a - b, a * b, a % b)
    const opMatch = e.match(/^([a-zA-Z_]\w*|\d+)\s*([\+\-\*\%])\s*([a-zA-Z_]\w*|\d+)$/);
    if (opMatch) {
      const left = evalExpr(opMatch[1], localVars);
      const op = opMatch[2];
      const right = evalExpr(opMatch[3], localVars);
      if (typeof left === 'number' && typeof right === 'number') {
        if (op === '+') return left + right;
        if (op === '-') return left - right;
        if (op === '*') return left * right;
        if (op === '%') return left % right;
      }
    }
    // Variable lookup
    if (e in localVars) return localVars[e];
    if (e in globalVariables) return globalVariables[e];
    return e;
  }

  function evalCondition(cond: string, localVars: Record<string, any>): boolean {
    const c = cond.trim();
    const match = c.match(/^(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/);
    if (match) {
      const left = evalExpr(match[1], localVars);
      const op = match[2];
      const right = evalExpr(match[3], localVars);
      if (op === '==') return left === right;
      if (op === '!=') return left !== right;
      if (op === '<') return left < right;
      if (op === '<=') return left <= right;
      if (op === '>') return left > right;
      if (op === '>=') return left >= right;
    }
    const val = evalExpr(c, localVars);
    return Boolean(val);
  }

  // Execute lines sequentially
  let pc = 0;
  const maxSteps = 150; // Guard against infinite loop

  while (pc < lineDetails.length && steps.length < maxSteps) {
    const cur = lineDetails[pc];
    if (!cur.trimmed || cur.trimmed.startsWith('#')) {
      pc++;
      continue;
    }

    // Skip function definitions during top-level execution
    if (cur.trimmed.startsWith('def ')) {
      const fn = Array.from(functions.values()).find(f => f.startLine === pc);
      if (fn) {
        pc = fn.endLine + 1;
        continue;
      }
    }

    // For Loop: for <var> in range(N):
    const forMatch = cur.trimmed.match(/^for\s+([a-zA-Z_]\w*)\s+in\s+range\((\d+)\)\s*:$/);
    if (forMatch) {
      const varName = forMatch[1];
      const count = parseInt(forMatch[2], 10);
      if (count < 0 || count > 20) {
        return { ok: false, error: `Line ${pc + 1}: range count must be between 0 and 20.`, steps: [], codeLines };
      }

      // Collect loop body
      const loopBody: { lineIdx: number; text: string }[] = [];
      let j = pc + 1;
      while (j < lineDetails.length && (lineDetails[j].trimmed === '' || lineDetails[j].indent > cur.indent)) {
        if (lineDetails[j].trimmed !== '') {
          loopBody.push({ lineIdx: j, text: lineDetails[j].trimmed });
        }
        j++;
      }

      if (loopBody.length === 0) {
        return { ok: false, error: `Line ${pc + 1}: for-loop body cannot be empty.`, steps: [], codeLines };
      }

      // Execute loop iterations
      for (let i = 0; i < count; i++) {
        globalVariables[varName] = i;
        const nextTargetLine = loopBody[0].lineIdx + 1;
        steps.push({
          stepIndex: steps.length,
          line: pc + 1,
          nextLine: nextTargetLine,
          event: 'loop',
          callStack: [{ functionName: '<global>', line: pc + 1, variables: { ...globalVariables } }],
          heap: cloneHeap(),
          stdout: [...stdout],
          robotState: { coins, position: robotPos, happy: false },
          explanation: i === 0 ? `Loop initializes: ${varName} = 0` : `Iteration ${i + 1}: ${varName} becomes ${i}`,
        });

        // Execute body lines
        for (let bIdx = 0; bIdx < loopBody.length; bIdx++) {
          const bodyItem = loopBody[bIdx];
          const bLineNum = bodyItem.lineIdx + 1;
          const nextBLineNum = bIdx < loopBody.length - 1 ? loopBody[bIdx + 1].lineIdx + 1 : pc + 1;

          if (bodyItem.text === 'collect_coin()') {
            coins += 1;
            robotPos = coins;
            stdout.push(`🪙 Coin ${coins} collected!`);
            steps.push({
              stepIndex: steps.length,
              line: bLineNum,
              nextLine: nextBLineNum,
              event: 'step',
              callStack: [{ functionName: '<global>', line: bLineNum, variables: { ...globalVariables } }],
              heap: cloneHeap(),
              stdout: [...stdout],
              robotState: { coins, position: robotPos, happy: true },
              explanation: `ByteBot executes collect_coin() and gathers coin #${coins}`,
            });
          } else if (bodyItem.text.startsWith('print(') && bodyItem.text.endsWith(')')) {
            const inner = bodyItem.text.slice(6, -1).trim();
            const val = evalExpr(inner, globalVariables);
            stdout.push(String(val));
            steps.push({
              stepIndex: steps.length,
              line: bLineNum,
              nextLine: nextBLineNum,
              event: 'step',
              callStack: [{ functionName: '<global>', line: bLineNum, variables: { ...globalVariables } }],
              heap: cloneHeap(),
              stdout: [...stdout],
              robotState: { coins, position: robotPos, happy: false },
              explanation: `print statement outputs: "${val}"`,
            });
          } else if (bodyItem.text.includes('=')) {
            const [vName, vExpr] = bodyItem.text.split('=').map(s => s.trim());
            const vVal = evalExpr(vExpr, globalVariables);
            if (Array.isArray(vVal)) {
              const heapId = `obj-${heapCounter++}`;
              heap[heapId] = { id: heapId, type: 'list', values: vVal };
              globalVariables[vName] = { ref: heapId };
            } else {
              globalVariables[vName] = vVal;
            }
            steps.push({
              stepIndex: steps.length,
              line: bLineNum,
              nextLine: nextBLineNum,
              event: 'step',
              callStack: [{ functionName: '<global>', line: bLineNum, variables: { ...globalVariables } }],
              heap: cloneHeap(),
              stdout: [...stdout],
              robotState: { coins, position: robotPos, happy: false },
              explanation: `Variable assigned: ${vName} = ${JSON.stringify(vVal)}`,
            });
          }
        }
      }

      pc = j;
      continue;
    }

    // Top-level variable assignment
    if (cur.trimmed.includes('=') && !cur.trimmed.startsWith('if ') && !cur.trimmed.startsWith('def ')) {
      const [vName, vExpr] = cur.trimmed.split('=').map(s => s.trim());
      const vVal = evalExpr(vExpr, globalVariables);
      if (Array.isArray(vVal)) {
        const heapId = `obj-${heapCounter++}`;
        heap[heapId] = { id: heapId, type: 'list', values: vVal };
        globalVariables[vName] = { ref: heapId };
      } else {
        globalVariables[vName] = vVal;
      }
      const nextLine = pc + 1 < lineDetails.length ? pc + 2 : null;
      steps.push({
        stepIndex: steps.length,
        line: pc + 1,
        nextLine,
        event: 'step',
        callStack: [{ functionName: '<global>', line: pc + 1, variables: { ...globalVariables } }],
        heap: cloneHeap(),
        stdout: [...stdout],
        robotState: { coins, position: robotPos, happy: false },
        explanation: `Assigned global variable ${vName} = ${JSON.stringify(vVal)}`,
      });
      pc++;
      continue;
    }

    // Top-level function call
    const fnCallMatch = cur.trimmed.match(/^([a-zA-Z_]\w*)\s*\(([^)]*)\)$/);
    if (fnCallMatch) {
      const fnName = fnCallMatch[1];
      const rawArgs = fnCallMatch[2].split(',').map(s => s.trim()).filter(Boolean);

      if (fnName === 'collect_coin') {
        coins += 1;
        robotPos = coins;
        stdout.push(`🪙 Coin ${coins} collected!`);
        steps.push({
          stepIndex: steps.length,
          line: pc + 1,
          nextLine: pc + 2 <= lineDetails.length ? pc + 2 : null,
          event: 'step',
          callStack: [{ functionName: '<global>', line: pc + 1, variables: { ...globalVariables } }],
          heap: cloneHeap(),
          stdout: [...stdout],
          robotState: { coins, position: robotPos, happy: true },
          explanation: `ByteBot collects a coin directly via collect_coin()`,
        });
        pc++;
        continue;
      }

      if (fnName === 'print') {
        const val = evalExpr(rawArgs.join(','), globalVariables);
        stdout.push(String(val));
        steps.push({
          stepIndex: steps.length,
          line: pc + 1,
          nextLine: pc + 2 <= lineDetails.length ? pc + 2 : null,
          event: 'step',
          callStack: [{ functionName: '<global>', line: pc + 1, variables: { ...globalVariables } }],
          heap: cloneHeap(),
          stdout: [...stdout],
          robotState: { coins, position: robotPos, happy: false },
          explanation: `print outputs: "${val}"`,
        });
        pc++;
        continue;
      }

      // User-defined function execution with stack frames
      const fnDef = functions.get(fnName);
      if (fnDef) {
        const localVars: Record<string, any> = {};
        fnDef.params.forEach((param, pIdx) => {
          localVars[param] = rawArgs[pIdx] ? evalExpr(rawArgs[pIdx], globalVariables) : undefined;
        });

        // Frame push step
        const globalFrame: StackFrame = { functionName: '<global>', line: pc + 1, variables: { ...globalVariables } };
        const localFrame: StackFrame = { functionName: fnName, line: fnDef.startLine + 1, variables: { ...localVars } };
        steps.push({
          stepIndex: steps.length,
          line: pc + 1,
          nextLine: fnDef.bodyLines[0].lineIdx + 1,
          event: 'call',
          callStack: [globalFrame, localFrame],
          heap: cloneHeap(),
          stdout: [...stdout],
          robotState: { coins, position: robotPos, happy: false },
          explanation: `Calling function '${fnName}' with arguments (${fnDef.params.map(p => `${p}=${localVars[p]}`).join(', ')})`,
        });

        // Execute function body
        let retVal: any = undefined;
        for (let b = 0; b < fnDef.bodyLines.length; b++) {
          const bodyItem = fnDef.bodyLines[b];
          const curFLine = bodyItem.lineIdx + 1;
          const nextFLine = b < fnDef.bodyLines.length - 1 ? fnDef.bodyLines[b + 1].lineIdx + 1 : pc + 1;

          if (bodyItem.text.startsWith('return ')) {
            const retExpr = bodyItem.text.slice(7).trim();
            retVal = evalExpr(retExpr, localVars);
            localFrame.line = curFLine;
            steps.push({
              stepIndex: steps.length,
              line: curFLine,
              nextLine: pc + 1,
              event: 'return',
              callStack: [{ ...globalFrame }, { ...localFrame }],
              heap: cloneHeap(),
              stdout: [...stdout],
              returnValue: retVal,
              robotState: { coins, position: robotPos, happy: true },
              explanation: `Function '${fnName}' returns value: ${retVal}`,
            });
            break;
          } else if (bodyItem.text === 'collect_coin()') {
            coins += 1;
            robotPos = coins;
            stdout.push(`🪙 Coin ${coins} collected!`);
            localFrame.line = curFLine;
            steps.push({
              stepIndex: steps.length,
              line: curFLine,
              nextLine: nextFLine,
              event: 'step',
              callStack: [{ ...globalFrame }, { ...localFrame }],
              heap: cloneHeap(),
              stdout: [...stdout],
              robotState: { coins, position: robotPos, happy: true },
              explanation: `'${fnName}' collected 1 coin for ByteBot`,
            });
          }
        }

        pc++;
        continue;
      }
    }

    // Top-level if conditional
    if (cur.trimmed.startsWith('if ')) {
      const condMatch = cur.trimmed.match(/^if\s+(.+)\s*:$/);
      if (condMatch) {
        const cond = condMatch[1];
        const condResult = evalCondition(cond, globalVariables);
        const nextLine = pc + 2 <= lineDetails.length ? pc + 2 : null;
        steps.push({
          stepIndex: steps.length,
          line: pc + 1,
          nextLine,
          event: 'step',
          callStack: [{ functionName: '<global>', line: pc + 1, variables: { ...globalVariables } }],
          heap: cloneHeap(),
          stdout: [...stdout],
          robotState: { coins, position: robotPos, happy: false },
          explanation: `Evaluated if condition (${cond}): ${condResult ? 'True' : 'False'}`,
        });
        pc++;
        continue;
      }
    }

    // Default step for other valid top-level lines
    pc++;
  }

  // Final completion step
  const finalLine = codeLines.length;
  steps.push({
    stepIndex: steps.length,
    line: finalLine,
    nextLine: null,
    event: 'done',
    callStack: [{ functionName: '<global>', line: finalLine, variables: { ...globalVariables } }],
    heap: cloneHeap(),
    stdout: [...stdout],
    robotState: { coins, position: robotPos, happy: false },
    explanation: `Execution completed successfully. Total coins collected: ${coins}`,
  });

  return { ok: true, steps, codeLines };
}
