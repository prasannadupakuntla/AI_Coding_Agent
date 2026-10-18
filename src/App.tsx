import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { safeParse, type ExecStep, type ParseResult } from './interpreter.ts';
import { AIMentor } from './components/AIMentor.tsx';

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

/* ─── Main App ─── */

export default function App() {
  const DEFAULT = 'for i in range(5):\n  collect_coin()\n  print(i)';
  const [code, setCode] = useState(DEFAULT);
  const [parsed, setParsed] = useState<ParseResult>(() => safeParse(DEFAULT));
  const [si, setSi] = useState(-1);          // step index, -1 = idle
  const [playing, setPlaying] = useState(false);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [coins, setCoins] = useState(0);
  const timer = useRef<number | null>(null);

  // Challenge
  const [chCode, setChCode] = useState('for i in range(__):\n  collect_coin()');
  const [chResult, setChResult] = useState<string | null>(null);

  useEffect(() => { setParsed(safeParse(code)); doReset(); }, [code]);

  const cur = parsed.steps && si >= 0 && si < parsed.steps.length ? parsed.steps[si] : null;

  const clearT = () => { if (timer.current !== null) { clearInterval(timer.current); timer.current = null; } };
  const doReset = useCallback(() => { clearT(); setSi(-1); setPlaying(false); setOutputs([]); setCoins(0); }, []);
  useEffect(() => () => clearT(), []);

  const execStep = (step: ExecStep) => {
    if (step.output) setOutputs(o => [...o, step.output]);
    if (step.coinCollected) setCoins(c => c + 1);
  };

  const advance = useCallback(() => {
    if (!parsed.steps) return;
    const steps = parsed.steps;
    setSi(prev => {
      const next = prev + 1;
      if (next >= steps.length) { clearT(); setPlaying(false); return prev; }
      execStep(steps[next]);
      return next;
    });
  }, [parsed.steps]);

  const play = () => {
    if (!parsed.ok || !parsed.steps || playing) return;
    if (si === -1) { setSi(0); execStep(parsed.steps[0]); }
    setPlaying(true);
    timer.current = window.setInterval(advance, 700);
  };

  const pause = () => { clearT(); setPlaying(false); };

  const step = () => {
    if (!parsed.ok || !parsed.steps) return;
    if (playing) pause();
    if (si === -1) { setSi(0); execStep(parsed.steps[0]); }
    else advance();
  };

  const totalCoins = parsed.total ?? 0;
  const done = si >= 0 && parsed.steps ? si >= parsed.steps.length - 1 : false;

  return (
    <div className="app">
      {/* Hero */}
      <header className="hero">
        <span className="badge">🐍 Python Basics · Interactive AI Learning</span>
        <h1>Learn <span className="grad">for loops</span> with ByteBot</h1>
        <p className="sub">Help the robot collect coins by writing Python code, with instant step-by-step guidance!</p>
      </header>

      <main className="grid">
        {/* ── Code Panel ── */}
        <section className="panel code-panel">
          <div className="ph"><span>📝</span> Code Editor</div>
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
            <button className="btn play" onClick={play} disabled={!parsed.ok || playing || done}>▶ Play</button>
            <button className="btn" onClick={pause} disabled={!playing}>⏸ Pause</button>
            <button className="btn" onClick={step} disabled={!parsed.ok || done}>⏭ Step</button>
            <button className="btn reset" onClick={() => { doReset(); }}>↺ Reset</button>
          </div>
        </section>

        {/* ── Animation Panel ── */}
        <section className="panel anim-panel">
          <div className="ph"><span>🎬</span> Animation <span className="cc">🪙 {coins}/{totalCoins}</span></div>
          <div className="scene">
            <div className="sky">
              {[...Array(5)].map((_, i) => <div key={i} className="star" style={{ left: `${10 + i * 20}%`, top: `${10 + (i % 3) * 15}%`, animationDelay: `${i * 0.7}s` }} />)}
            </div>
            <div className="ground" />
            <div className="coins-row">
              {Array.from({ length: totalCoins }, (_, i) => (
                <div key={i} className={`coin${i < coins ? ' got' : ''}`}>
                  <svg width="26" height="26" viewBox="0 0 26 26">
                    <circle cx="13" cy="13" r="11" fill="#ffd700" stroke="#f9a825" strokeWidth="1.5" />
                    <text x="13" y="17" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#e65100">$</text>
                  </svg>
                </div>
              ))}
            </div>
            <div className="robo" style={{ transform: `translateX(${coins > 0 ? (coins - 1) * 46 : 0}px)` }}>
              <RobotSVG happy={cur?.coinCollected ?? false} />
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
            ) : (
              <span>Press ▶ Play or ⏭ Step to start</span>
            )}
          </div>
        </section>

        {/* ── Output Panel ── */}
        <section className="panel out-panel">
          <div className="ph"><span>📺</span> Output</div>
          <pre className="out">
            {outputs.length ? outputs.join('\n') : <span className="dim">Output appears here…</span>}
          </pre>
        </section>
      </main>

      {!parsed.ok && <div className="err">⚠️ {parsed.error}</div>}

      {/* ── AI Learning Mentor ── */}
      <AIMentor
        code={code}
        executionState={{
          ok: parsed.ok,
          varName: parsed.varName,
          total: parsed.total,
          coinsCollected: coins,
          lastOutput: outputs,
          error: parsed.error,
        }}
      />

      {/* ── Challenge ── */}
      <section className="panel challenge">
        <div className="ph"><span>🏆</span> Challenge: Collect Exactly 3 Coins</div>
        <p className="cd">Replace <code>__</code> with the right number so the robot collects <strong>exactly 3</strong> coins.</p>
        <textarea className="code-input chi" value={chCode} onChange={e => setChCode(e.target.value)} spellCheck={false} rows={2} />
        <button className="btn play" onClick={() => {
          const r = safeParse(chCode);
          if (!r.ok) { setChResult('❌ ' + r.error); return; }
          setChResult(r.total === 3 ? '🎉 Correct! Exactly 3 coins!' : `🤔 That gives ${r.total} coins — try range(3)!`);
        }}>Check Answer</button>
        {chResult && <p className={`cr${chResult.startsWith('🎉') ? ' ok' : ''}`}>{chResult}</p>}
      </section>

      <footer className="foot">Built for B.Tech beginners · AI Powered · No login · 100% free &amp; open-source</footer>
    </div>
  );
}
