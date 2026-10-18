import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { safeParse, type ExecStep, type ParseResult } from './interpreter.ts';
import { traceExecution, type TraceResult } from './traceEngine.ts';
import { pythonRunner } from './services/pythonRunner.ts';
import { AIMentor } from './components/AIMentor.tsx';
import { PythonTutorVisualizer, type VizStep, type VizFrame, type VizHeapObj } from './components/PythonTutorVisualizer.tsx';

/* ─── SVG Robot ─── */
function RobotSVG({ happy, size = 56 }: { happy: boolean; size?: number }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 56 73" className={`robot-svg${happy ? ' bounce' : ''}`}>
      <line x1="28" y1="1" x2="28" y2="11" stroke="#4fc3f7" strokeWidth="2" />
      <circle cx="28" cy="3" r="3" fill="#4fc3f7" className="glow" />
      <rect x="8" y="11" width="40" height="26" rx="7" fill="#1e88e5" />
      <circle cx="20" cy="24" r="4.5" fill="#fff" />
      <circle cx="36" cy="24" r="4.5" fill="#fff" />
      <circle cx={happy ? "21.5" : "20.5"} cy="24" r="2" fill="#0d47a1" />
      <circle cx={happy ? "37.5" : "36.5"} cy="24" r="2" fill="#0d47a1" />
      {happy
        ? <path d="M20 33 Q28 38 36 33" stroke="#4fc3f7" strokeWidth="2" fill="none" />
        : <rect x="20" y="32" width="16" height="2" rx="1" fill="#4fc3f7" />}
      <rect x="12" y="40" width="32" height="20" rx="5" fill="#1565c0" />
      <circle cx="28" cy="50" r="3" fill={happy ? '#76ff03' : '#4fc3f7'} className="chest" />
      <rect x="0" y="44" width="10" height="5" rx="2.5" fill="#1e88e5" className={happy ? 'arm-l' : ''} />
      <rect x="46" y="44" width="10" height="5" rx="2.5" fill="#1e88e5" className={happy ? 'arm-r' : ''} />
      <rect x="16" y="62" width="8" height="8" rx="3" fill="#1e88e5" />
      <rect x="32" y="62" width="8" height="8" rx="3" fill="#1e88e5" />
    </svg>
  );
}

/* ─── Convert Pyodide PyStep[] → VizStep[] ─── */
function buildVizSteps(pySteps: any[], codeSource: string, finalStdout: string[]): VizStep[] {
  let coins = 0;
  const accStdout: string[] = [];
  const totalLines = codeSource.split('\n').length;
  const vizSteps: VizStep[] = [];

  pySteps.forEach((st, i) => {
    if (st.coinCollected) {
      coins += 1;
      if (st.output) accStdout.push(st.output);
    }
    if (st.output && !st.coinCollected) {
      accStdout.push(st.output);
    }

    // Frames directly from step's genuine callStack
    let frames: VizFrame[] = [];
    if (st.callStack && st.callStack.length > 0) {
      frames = st.callStack.map((fr: any) => ({
        name: fr.functionName,
        vars: { ...fr.variables },
      }));
    } else {
      const fbVars: Record<string, any> = {};
      if (st.varName && !st.coinCollected) {
        fbVars[st.varName] = st.varValue;
      }
      frames = [{ name: 'Global frame', vars: fbVars }];
    }

    if (st.event === 'return' && frames.length > 0 && st.output !== undefined) {
      frames[frames.length - 1].returnValue = st.output;
    }

    // Heap objects
    const heap: Record<string, VizHeapObj> = {};
    if (st.heap) {
      Object.entries(st.heap).forEach(([id, obj]: [string, any]) => {
        heap[id] = {
          id,
          type: obj.type || 'object',
          repr: obj.repr,
          items: obj.items || (obj.repr ? [{ value: obj.repr }] : []),
        };
      });
    }

    // Next executed line
    let nextLine: number | null = null;
    for (let j = i + 1; j < pySteps.length; j++) {
      if (pySteps[j].line > 0 && pySteps[j].line <= totalLines) {
        nextLine = pySteps[j].line;
        break;
      }
    }

    vizSteps.push({
      stepIndex: i,
      executedLine: st.line > 0 && st.line <= totalLines ? st.line : null,
      nextLine,
      frames,
      heap,
      stdout: [...accStdout],
      explanation: st.explanation,
      coins,
    });
  });

  if (vizSteps.length === 0 && finalStdout.length > 0) {
    vizSteps.push({
      stepIndex: 0,
      executedLine: null,
      nextLine: null,
      frames: [{ name: 'Global frame', vars: {} }],
      heap: {},
      stdout: finalStdout,
      explanation: 'Program finished.',
      coins,
    });
  }

  return vizSteps;
}

/* ─── Main App ─── */
export default function App() {
  const DEFAULT = 'for i in range(5):\n  collect_coin()\n  print(i)';
  const [code, setCode] = useState(DEFAULT);
  const [parsed, setParsed] = useState<ParseResult>(() => safeParse(DEFAULT));
  const [trace, setTrace] = useState<TraceResult>(() => traceExecution(DEFAULT));

  // Animation / interpreter state
  const [si, setSi] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  // Display state
  const [coins, setCoins] = useState(0);
  const [outputs, setOutputs] = useState<string[]>([]);

  // Pyodide state
  const [isPyRunning, setIsPyRunning] = useState(false);
  const [pyError, setPyError] = useState<string | null>(null);

  // Visualizer data (Python Tutor style)
  const [vizSteps, setVizSteps] = useState<VizStep[]>([]);
  const [vizCodeLines, setVizCodeLines] = useState<string[]>([]);
  const [showViz, setShowViz] = useState(false);

  // Pyodide mode flag — prevents interpreter animation from overwriting Pyodide result
  const pyodideModeRef = useRef(false);

  // Challenge
  const [chCode, setChCode] = useState('for i in range(__):\n  collect_coin()');
  const [chResult, setChResult] = useState<string | null>(null);

  /* helpers */
  const clearT = () => { if (timer.current !== null) { clearInterval(timer.current); timer.current = null; } };

  const doReset = useCallback(() => {
    clearT();
    setSi(-1);
    setPlaying(false);
    pyodideModeRef.current = false;
    setCoins(0);
    setOutputs([]);
    setPyError(null);
    setVizSteps([]);
    setShowViz(false);
  }, []);

  useEffect(() => {
    setParsed(safeParse(code));
    setTrace(traceExecution(code));
    doReset();
  }, [code]);

  useEffect(() => () => clearT(), []);

  const cur = parsed.steps && si >= 0 && si < parsed.steps.length ? parsed.steps[si] : null;

  /* interpreter animation */
  const execStep = useCallback((step: ExecStep) => {
    if (pyodideModeRef.current) return;
    if (step.output) setOutputs(o => [...o, step.output]);
    if (step.coinCollected) setCoins(c => c + 1);
  }, []);

  const advance = useCallback(() => {
    if (!parsed.steps) return;
    const steps = parsed.steps;
    setSi(prev => {
      const next = prev + 1;
      if (next >= steps.length) { clearT(); setPlaying(false); return prev; }
      execStep(steps[next]);
      return next;
    });
  }, [parsed.steps, execStep]);

  const startAnim = useCallback(() => {
    if (!parsed.ok || !parsed.steps) return;
    pyodideModeRef.current = false;
    setCoins(0);
    setOutputs([]);
    setSi(-1);
    requestAnimationFrame(() => {
      setParsed(p => {
        if (!p.steps) return p;
        setSi(0);
        execStep(p.steps[0]);
        setPlaying(true);
        timer.current = window.setInterval(advance, 700);
        return p;
      });
    });
  }, [parsed, execStep, advance]);

  const play = () => {
    if (!parsed.ok || !parsed.steps || playing) return;
    clearT(); setPlaying(false);
    startAnim();
  };

  const pause = () => { clearT(); setPlaying(false); };

  const stepOnce = () => {
    if (!parsed.ok || !parsed.steps) return;
    if (playing) { clearT(); setPlaying(false); }
    if (pyodideModeRef.current || si === -1) {
      pyodideModeRef.current = false;
      setCoins(0); setOutputs([]); setSi(0);
      execStep(parsed.steps[0]);
    } else { advance(); }
  };

  /* Pyodide run — produces the visualizer data */
  const runPyodide = async (codeToRun = code): Promise<any> => {
    doReset();
    setIsPyRunning(true);
    try {
      const res = await pythonRunner.run(codeToRun);
      if (res.success) {
        pyodideModeRef.current = true;
        setCoins(res.coinsCollected);
        setOutputs(res.stdout);

        // Build Python Tutor viz steps from Pyodide trace
        const lines = codeToRun.split('\n');
        const vSteps = buildVizSteps(res.steps, codeToRun, res.stdout);
        setVizCodeLines(lines);
        setVizSteps(vSteps);
        setShowViz(true);
      } else {
        const err = res.error || 'Execution failed';
        setPyError(err);
        setOutputs(res.stderr.length ? res.stderr : [err]);
        pyodideModeRef.current = false;
      }
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPyError(msg); setOutputs([msg]);
      pyodideModeRef.current = false;
      return { success: false, error: msg, coinsCollected: 0 };
    } finally {
      setIsPyRunning(false);
    }
  };

  const done = si >= 0 && parsed.steps ? si >= parsed.steps.length - 1 : false;

  return (
    <div className="app">
      {/* Hero */}
      <header className="hero">
        <span className="badge">🐍 Genuine Python · Pyodide WebAssembly Worker</span>
        <h1>Learn <span className="grad">Python</span> with ByteBot</h1>
        <p className="sub">Run real Python in your browser — loops, functions, lists, classes, and coin collecting!</p>
      </header>

      <main className="grid">
        {/* ── Code Panel ── */}
        <section className="panel code-panel">
          <div className="ph">
            <span>📝</span> Code Editor
            <span className="engine-badge">⚡ Pyodide Engine</span>
          </div>
          <div className="code-area">
            {si === -1 ? (
              <textarea
                className="code-input"
                value={code}
                onChange={e => setCode(e.target.value)}
                spellCheck={false}
                rows={code.split('\n').length + 1}
              />
            ) : (
              <pre className="code-display">
                {(parsed.codeLines ?? []).map((ln, idx) => (
                  <div key={idx} className={`cl${cur?.lineIdx === idx ? ' cl-active' : ''}`}>
                    <span className="ln">{idx + 1}</span>
                    <span className="lt">{ln || ' '}</span>
                    {cur?.lineIdx === idx && <span className="arrow">◀</span>}
                  </div>
                ))}
              </pre>
            )}
          </div>
          <div className="ctrls">
            <button
              className="btn run-pyodide-btn"
              onClick={() => runPyodide()}
              disabled={isPyRunning}
              title="Run with Pyodide and open step-by-step visualizer"
            >
              {isPyRunning ? '⏳ Running...' : '🔬 Run & Visualize'}
            </button>
            <button className="btn play" onClick={play} disabled={!parsed.ok || playing}>▶ Play</button>
            <button className="btn" onClick={pause} disabled={!playing}>⏸ Pause</button>
            <button className="btn" onClick={stepOnce} disabled={!parsed.ok || done}>⏭ Step</button>
            <button className="btn reset" onClick={doReset}>↺ Reset</button>
          </div>
        </section>

        {/* ── Animation Panel ── */}
        <section className="panel anim-panel">
          <div className="ph"><span>🎬</span> Animation <span className="cc">🪙 {coins} coins collected</span></div>
          <div className="scene">
            <div className="sky">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="star" style={{ left: `${10 + i * 20}%`, top: `${10 + (i % 3) * 15}%`, animationDelay: `${i * 0.7}s` }} />
              ))}
            </div>
            <div className="ground" />
            <div className="coins-row">
              {Array.from({ length: Math.min(20, Math.max(coins, 5)) }, (_, i) => (
                <div key={i} className={`coin${i < coins ? ' got' : ''}`}>
                  <svg width="26" height="26" viewBox="0 0 26 26">
                    <circle cx="13" cy="13" r="11" fill="#ffd700" stroke="#f9a825" strokeWidth="1.5" />
                    <text x="13" y="17" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#e65100">$</text>
                  </svg>
                </div>
              ))}
            </div>
            <div className="robo" style={{ transform: `translateX(${coins > 0 ? (coins - 1) * 38 : 0}px)` }}>
              <RobotSVG happy={coins > 0 || (cur?.coinCollected ?? false)} />
            </div>
          </div>
          <div className="explain">
            {cur ? (
              <>
                <span className="vb">{cur.varName} = {cur.varValue}</span>
                <span>{cur.explanation}</span>
              </>
            ) : done ? (
              <span>✅ All done! The robot collected {coins} coin{coins !== 1 ? 's' : ''}.</span>
            ) : isPyRunning ? (
              <span>⏳ Executing in Pyodide Web Worker…</span>
            ) : pyodideModeRef.current ? (
              <span>✅ Done! {coins} coin{coins !== 1 ? 's' : ''} collected. See the visualizer below ↓ or press ▶ Play to animate.</span>
            ) : (
              <span>Press 🔬 Run & Visualize or ▶ Play to start</span>
            )}
          </div>
        </section>

        {/* ── Output Panel ── */}
        <section className="panel out-panel">
          <div className="ph"><span>📺</span> Output (stdout/stderr)</div>
          <pre className="out">
            {outputs.length ? outputs.join('\n') : <span className="dim">Output appears here…</span>}
          </pre>
        </section>
      </main>

      {pyError && <div className="err">⚠️ Python Error: {pyError}</div>}
      {!parsed.ok && !pyError && (
        <div className="err">⚠️ {parsed.error} (Simple loops work with ▶ Play; 🔬 Run & Visualize supports all Python!)</div>
      )}

      {/* ── Python Tutor Visualizer (auto-shown after Run & Visualize) ── */}
      {vizSteps.length > 0 && (
        <div className="pviz-wrapper">
          <div className="pviz-wrapper-header">
            <span>🔬 Step-by-step Execution Visualizer</span>
            <button className="btn-close-viz" onClick={() => setShowViz(v => !v)}>
              {showViz ? '▲ Hide' : '▼ Show'}
            </button>
          </div>
          {showViz && <PythonTutorVisualizer codeLines={vizCodeLines} steps={vizSteps} />}
        </div>
      )}

      {/* Interpreter Trace visualizer (for Play/Step mode) — only when no Pyodide viz */}
      {vizSteps.length === 0 && trace.steps.length > 0 && (
        <div className="pviz-wrapper">
          <div className="pviz-wrapper-header">
            <span>🔬 Trace Visualizer (interpreter mode)</span>
          </div>
          <PythonTutorVisualizer
            codeLines={trace.codeLines}
            steps={trace.steps.map((ts, i) => ({
              stepIndex: i,
              executedLine: ts.line,
              nextLine: ts.nextLine,
              frames: ts.callStack.map((f, fi) => ({
                name: fi === 0 ? 'Global frame' : f.functionName,
                vars: f.variables as Record<string, any>,
              })),
              heap: {},
              stdout: ts.stdout,
              explanation: ts.explanation,
              coins: ts.robotState.coins,
            }))}
          />
        </div>
      )}

      {/* ── AI Mentor ── */}
      <AIMentor
        code={code}
        executionState={{
          ok: !pyError,
          varName: parsed.varName,
          total: coins,
          coinsCollected: coins,
          lastOutput: outputs,
          error: pyError || parsed.error,
        }}
        onPlayRequest={play}
      />

      {/* ── Challenge ── */}
      <section className="panel challenge">
        <div className="ph"><span>🏆</span> Challenge: Collect Exactly 3 Coins</div>
        <p className="cd">Write Python code so ByteBot collects <strong>exactly 3</strong> coins.</p>
        <textarea className="code-input chi" value={chCode} onChange={e => setChCode(e.target.value)} spellCheck={false} rows={2} />
        <button className="btn play" onClick={async () => {
          const res = await runPyodide(chCode);
          if (!res?.success) {
            setChResult('❌ ' + (res?.error || 'Execution error'));
            return;
          }
          setChResult(res.coinsCollected === 3
            ? '🎉 Correct! Exactly 3 coins collected!'
            : `🤔 That collected ${res.coinsCollected} coins — aim for exactly 3!`);
        }}>Check Answer (Run)</button>
        {chResult && <p className={`cr${chResult.startsWith('🎉') ? ' ok' : ''}`}>{chResult}</p>}
      </section>

      <footer className="foot">Built for B.Tech beginners · Pyodide CPython Engine · No login · 100% free &amp; open-source</footer>
    </div>
  );
}
