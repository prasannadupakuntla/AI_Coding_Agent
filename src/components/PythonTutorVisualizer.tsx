import { useState, useEffect, useRef, useCallback } from 'react';

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
export interface VizFrame {
  name: string;        // "Global frame", function name
  vars: Record<string, any>;
  returnValue?: any;
}

export interface VizHeapObj {
  id: string;
  type: string;        // "list", "dict", "tuple", "function", …
  repr?: string;
  items: Array<{ label?: string; value: any; isRef?: boolean }>;
}

export interface VizStep {
  stepIndex: number;
  executedLine: number | null;   // 1-based line that just ran (green arrow)
  nextLine: number | null;       // 1-based line about to run (red arrow)
  frames: VizFrame[];
  heap: Record<string, VizHeapObj>;
  stdout: string[];              // cumulative stdout up to this step
  explanation: string;
  coins: number;
}

interface Props {
  codeLines: string[];
  steps: VizStep[];
  onEditCode?: () => void;
}

/* ─────────────────────────────────────────
   Helper: Render a value cell (primitive or reference dot)
───────────────────────────────────────── */
function ValCell({ val }: { val: any }) {
  if (val === null || val === undefined) return <span className="pt-val-none">None</span>;
  if (typeof val === 'boolean') return <span className="pt-val-bool">{val ? 'True' : 'False'}</span>;
  if (typeof val === 'number') return <span className="pt-val-num">{val}</span>;
  if (typeof val === 'string') {
    if (val.startsWith('__ref:')) {
      return (
        <span className="pt-ref-anchor" title={`Points to ${val.replace('__ref:', '')}`}>
          <span className="pt-ref-dot">●</span>
          <span className="pt-ref-arrow">➔</span>
        </span>
      );
    }
    return <span className="pt-val-str">'{val}'</span>;
  }
  if (typeof val === 'object' && val.__ref) {
    return (
      <span className="pt-ref-anchor" title={`Points to ${val.__ref}`}>
        <span className="pt-ref-dot">●</span>
        <span className="pt-ref-arrow">➔</span>
      </span>
    );
  }
  return <span className="pt-val-other">{String(val)}</span>;
}

/* ─────────────────────────────────────────
   Main Component: Python Tutor Visualizer
───────────────────────────────────────── */
export function PythonTutorVisualizer({ codeLines, steps, onEditCode }: Props) {
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(false);
  const timer = useRef<number | null>(null);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const total = steps.length;
  const cur: VizStep | undefined = steps[idx];

  /* Auto playback */
  useEffect(() => {
    if (auto) {
      timer.current = window.setInterval(() => {
        if (idxRef.current >= total - 1) {
          setAuto(false);
        } else {
          setIdx(i => i + 1);
        }
      }, 750);
    } else {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, total]);

  /* Reset to start when new steps arrive */
  useEffect(() => {
    setIdx(0);
    setAuto(false);
  }, [steps]);

  const go = useCallback((n: number) => {
    setAuto(false);
    setIdx(Math.max(0, Math.min(total - 1, n)));
  }, [total]);

  if (!cur || total === 0) {
    return (
      <div className="pt-empty">
        <div className="pt-empty-icon">🔬</div>
        <p>No execution steps recorded yet. Click <strong>▶ Visualize</strong> to see Python Tutor step-by-step execution.</p>
      </div>
    );
  }

  const frames = cur.frames ?? [];
  const heap = cur.heap ?? {};
  const heapEntries = Object.values(heap);

  return (
    <div className="pt-tutor-container">
      {/* Top Banner / Tab Bar (matching Python Tutor style) */}
      <div className="pt-navbar">
        <div className="pt-logo">
          <span className="pt-logo-bold">Python</span> <span className="pt-logo-light">Tutor</span>
        </div>
        <div className="pt-tabs">
          <span className="pt-tab active">Python 3.11</span>
          <span className="pt-tab">ByteBot Interactive</span>
        </div>
        {cur.coins > 0 && (
          <div className="pt-coin-badge">
            🪙 <strong>{cur.coins}</strong> coin{cur.coins !== 1 ? 's' : ''} collected
          </div>
        )}
      </div>

      {/* Main visualization workspace */}
      <div className="pt-workspace">
        {/* LEFT COLUMN: Code + Controls */}
        <div className="pt-code-section">
          <div className="pt-code-header">Python 3.11</div>

          <div className="pt-code-scroll">
            <div className="pt-code-table">
              {codeLines.map((line, i) => {
                const lineNum = i + 1;
                const isExecuted = cur.executedLine === lineNum;
                const isNext = cur.nextLine === lineNum && !isExecuted;

                return (
                  <div
                    key={i}
                    className={`pt-code-row ${isExecuted ? 'executed-row' : ''} ${isNext ? 'next-row' : ''}`}
                  >
                    <div className="pt-arrow-col">
                      {isExecuted && <span className="pt-arrow-green">➡</span>}
                      {isNext && <span className="pt-arrow-red">➡</span>}
                    </div>
                    <div className="pt-line-num">{lineNum}</div>
                    <div className="pt-line-content">{line || ' '}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {onEditCode && (
            <div className="pt-edit-link">
              <button className="pt-link-btn" onClick={onEditCode}>Edit this code</button>
            </div>
          )}

          {/* Legend */}
          <div className="pt-legend">
            <div className="pt-legend-item">
              <span className="pt-arrow-green">➡</span> line that just executed
            </div>
            <div className="pt-legend-item">
              <span className="pt-arrow-red">➡</span> next line to execute
            </div>
          </div>

          {/* Timeline slider */}
          <div className="pt-slider-box">
            <input
              type="range"
              min={0}
              max={Math.max(0, total - 1)}
              value={idx}
              onChange={e => go(parseInt(e.target.value))}
              className="pt-slider"
            />
          </div>

          {/* Buttons: << First < Prev Next > Last >> */}
          <div className="pt-nav-buttons">
            <button className="pt-btn" onClick={() => go(0)} disabled={idx === 0}>
              &lt;&lt; First
            </button>
            <button className="pt-btn" onClick={() => go(idx - 1)} disabled={idx === 0}>
              &lt; Prev
            </button>
            <button className="pt-btn" onClick={() => go(idx + 1)} disabled={idx >= total - 1}>
              Next &gt;
            </button>
            <button className="pt-btn" onClick={() => go(total - 1)} disabled={idx >= total - 1}>
              Last &gt;&gt;
            </button>
            <button className={`pt-btn pt-auto ${auto ? 'playing' : ''}`} onClick={() => setAuto(a => !a)}>
              {auto ? '⏸ Pause' : '▶ Auto'}
            </button>
          </div>

          <div className="pt-step-counter">
            Step <strong>{idx + 1}</strong> of <strong>{total}</strong>
          </div>

          {/* Step Explanation Banner */}
          <div className="pt-explain-box">
            <span className="pt-explain-icon">💡</span>
            <span className="pt-explain-text">{cur.explanation}</span>
          </div>
        </div>

        {/* RIGHT COLUMN: Split into Frames & Objects */}
        <div className="pt-memory-section">
          {/* Subcolumn 1: Frames */}
          <div className="pt-frames-col">
            <div className="pt-section-title">Frames</div>

            {frames.length === 0 ? (
              <div className="pt-no-frames">No active frames</div>
            ) : (
              <div className="pt-frames-stack">
                {frames.map((fr, fi) => {
                  const isTop = fi === frames.length - 1;
                  const varKeys = Object.keys(fr.vars).filter(k => !k.startsWith('_'));

                  return (
                    <div
                      key={fi}
                      className={`pt-frame-card ${isTop ? 'active-frame' : ''} ${fr.name === 'Global frame' ? 'global-frame' : 'fn-frame'}`}
                    >
                      <div className="pt-frame-label">{fr.name}</div>
                      <div className="pt-frame-table">
                        {varKeys.length === 0 && !fr.returnValue ? (
                          <div className="pt-empty-vars">(no local variables)</div>
                        ) : (
                          varKeys.map(k => (
                            <div key={k} className="pt-var-row">
                              <span className="pt-var-name">{k}</span>
                              <span className="pt-var-val">
                                <ValCell val={fr.vars[k]} />
                              </span>
                            </div>
                          ))
                        )}
                        {fr.returnValue !== undefined && (
                          <div className="pt-var-row pt-return-row">
                            <span className="pt-var-name pt-return-label">return value</span>
                            <span className="pt-var-val">
                              <ValCell val={fr.returnValue} />
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Subcolumn 2: Objects */}
          <div className="pt-objects-col">
            <div className="pt-section-title">Objects</div>

            {heapEntries.length === 0 ? (
              <div className="pt-no-objects">(no heap objects)</div>
            ) : (
              <div className="pt-objects-stack">
                {heapEntries.map(obj => {
                  if (obj.type === 'function') {
                    return (
                      <div key={obj.id} className="pt-obj-card pt-obj-function">
                        <span className="pt-obj-type-tag">function</span>
                        <div className="pt-obj-fn-name">{obj.repr || obj.items?.[0]?.value || 'function'}</div>
                      </div>
                    );
                  }

                  // Tuples and lists render as contiguous indexed horizontal cells
                  if (obj.type === 'tuple' || obj.type === 'list') {
                    return (
                      <div key={obj.id} className="pt-obj-card pt-obj-sequence">
                        <span className="pt-obj-type-tag">{obj.type}</span>
                        <div className="pt-seq-cells">
                          {obj.items.map((item, ii) => (
                            <div key={ii} className="pt-seq-slot">
                              <div className="pt-seq-idx">{item.label ?? ii}</div>
                              <div className="pt-seq-val">
                                <ValCell val={item.value} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  // Dictionaries render as key-value pairs
                  if (obj.type === 'dict') {
                    return (
                      <div key={obj.id} className="pt-obj-card pt-obj-dict">
                        <span className="pt-obj-type-tag">dict</span>
                        <div className="pt-dict-entries">
                          {obj.items.map((item, ii) => (
                            <div key={ii} className="pt-dict-row">
                              <span className="pt-dict-key">{item.label}:</span>
                              <span className="pt-dict-val">
                                <ValCell val={item.value} />
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  // Fallback generic object
                  return (
                    <div key={obj.id} className="pt-obj-card">
                      <span className="pt-obj-type-tag">{obj.type}</span>
                      <div className="pt-obj-content">{obj.repr}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Output Terminal */}
      <div className="pt-output-panel">
        <div className="pt-output-header">Program Output (at current step)</div>
        <pre className="pt-output-console">
          {cur.stdout.length > 0 ? (
            cur.stdout.join('\n')
          ) : (
            <span className="pt-output-dim">&lt;no stdout output yet&gt;</span>
          )}
        </pre>
      </div>
    </div>
  );
}
