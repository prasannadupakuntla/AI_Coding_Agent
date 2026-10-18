export interface ExecStep {
  lineIdx: number;   // which code line is active (-1 = done)
  varName: string;
  varValue: number;
  output: string;
  explanation: string;
  coinCollected: boolean;
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  varName?: string;
  total?: number;
  codeLines?: string[];
  steps?: ExecStep[];
}

export function safeParse(code: string): ParseResult {
  const raw = code.split('\n');
  const lines = raw.map(l => l.trimEnd());
  if (!lines[0]?.trim()) return { ok: false, error: 'Write a for loop to begin!' };

  const m = lines[0].trim().match(/^for\s+(\w+)\s+in\s+range\((\d+)\)\s*:$/);
  if (!m) return { ok: false, error: 'Use: for <var> in range(N):' };

  const varName = m[1];
  const n = parseInt(m[2], 10);
  if (n < 0 || n > 20) return { ok: false, error: 'N must be 0–20' };

  const body = lines.slice(1).filter(l => l.trim().length > 0);
  if (body.length === 0) return { ok: false, error: 'Add a line inside the loop' };

  for (const b of body) {
    const t = b.trim();
    if (!/^print\(.+\)$/.test(t) && t !== 'collect_coin()')
      return { ok: false, error: `Not supported: ${t}` };
  }

  const steps: ExecStep[] = [];
  for (let i = 0; i < n; i++) {
    steps.push({
      lineIdx: 0, varName, varValue: i, output: '',
      explanation: i === 0 ? `Loop starts! ${varName} = ${i}` : `Next iteration: ${varName} = ${i}`,
      coinCollected: false,
    });
    for (let j = 0; j < body.length; j++) {
      const t = body[j].trim();
      let output = '', explanation = '', coinCollected = false;
      if (t === 'collect_coin()') {
        coinCollected = true;
        output = `🪙 Coin ${i + 1} collected!`;
        explanation = `Robot picks up coin #${i + 1}!`;
      } else {
        const inner = t.slice(6, -1).trim();
        if (inner === varName) {
          output = String(i);
        } else {
          const fm = inner.match(/^f?["'](.*)["']$/);
          output = fm
            ? fm[1].replace(new RegExp(`\\{${varName}\\}`, 'g'), String(i))
            : inner.replace(new RegExp(`\\b${varName}\\b`, 'g'), String(i));
        }
        explanation = `print → ${output}`;
      }
      steps.push({ lineIdx: j + 1, varName, varValue: i, output, explanation, coinCollected });
    }
  }
  steps.push({
    lineIdx: -1, varName, varValue: n, output: '',
    explanation: `Done! Loop finished after ${n} iteration${n !== 1 ? 's' : ''} ✓`,
    coinCollected: false,
  });

  return { ok: true, varName, total: n, codeLines: lines, steps };
}
