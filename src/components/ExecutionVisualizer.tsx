import { useState, useEffect, useRef } from 'react';
import type { TraceStep, HeapObject } from '../traceEngine.ts';

interface ExecutionVisualizerProps {
  codeLines: string[];
  steps: TraceStep[];
  currentStepIndex: number;
  onStepChange: (index: number) => void;
  error?: string;
}

export function ExecutionVisualizer({
  codeLines,
  steps,
  currentStepIndex,
  onStepChange,
  error,
}: ExecutionVisualizerProps) {
  const [autoPlaying, setAutoPlaying] = useState(false);
  const playTimer = useRef<number | null>(null);
  const stepRef = useRef<number>(currentStepIndex);
  stepRef.current = currentStepIndex;

  const totalSteps = steps.length;
  const curStep: TraceStep | undefined = steps[currentStepIndex];

  // Auto-play timer
  useEffect(() => {
    if (autoPlaying) {
      playTimer.current = window.setInterval(() => {
        if (stepRef.current >= totalSteps - 1) {
          setAutoPlaying(false);
        } else {
          onStepChange(stepRef.current + 1);
        }
      }, 750);
    } else if (playTimer.current !== null) {
      clearInterval(playTimer.current);
      playTimer.current = null;
    }
    return () => {
      if (playTimer.current !== null) clearInterval(playTimer.current);
    };
  }, [autoPlaying, totalSteps, onStepChange]);

  const handleFirst = () => { setAutoPlaying(false); onStepChange(0); };
  const handlePrev = () => { setAutoPlaying(false); onStepChange(Math.max(0, currentStepIndex - 1)); };
  const handleNext = () => { setAutoPlaying(false); onStepChange(Math.min(totalSteps - 1, currentStepIndex + 1)); };
  const handleLast = () => { setAutoPlaying(false); onStepChange(Math.max(0, totalSteps - 1)); };

  if (error) {
    return (
      <div className="pytutor-panel error-state">
        <div className="ph"><span>🔬</span> Execution Visualizer</div>
        <div className="pytutor-error">⚠️ Cannot trace execution: {error}</div>
      </div>
    );
  }

  if (!curStep || totalSteps === 0) {
    return (
      <div className="pytutor-panel empty-state">
        <div className="ph"><span>🔬</span> Python Tutor Execution Visualizer</div>
        <div className="pytutor-empty">Type valid Python code above and run to visualize the execution trace.</div>
      </div>
    );
  }

  const activeStack = curStep.callStack || [];
  const activeHeap: Record<string, HeapObject> = curStep.heap || {};
  const heapKeys = Object.keys(activeHeap);

  return (
    <section className="panel pytutor-panel">
      {/* Visualizer Header */}
      <div className="ph pytutor-ph">
        <div className="pytutor-title">
          <span>🔬</span>
          <strong>Python Tutor Execution Visualizer</strong>
          <span className="step-badge">
            Step {currentStepIndex + 1} of {totalSteps}
          </span>
        </div>
        <div className="pytutor-quick-stats">
          <span>🪙 {curStep.robotState.coins} coins</span>
        </div>
      </div>

      {/* Navigation Controls & Timeline Scrubber */}
      <div className="pytutor-controls">
        <div className="btn-group">
          <button
            className="btn nav-btn"
            onClick={handleFirst}
            disabled={currentStepIndex === 0}
            title="First step"
          >
            |◀ First
          </button>
          <button
            className="btn nav-btn"
            onClick={handlePrev}
            disabled={currentStepIndex === 0}
            title="Previous step"
          >
            ◀ Prev
          </button>
          <button
            className="btn nav-btn"
            onClick={handleNext}
            disabled={currentStepIndex >= totalSteps - 1}
            title="Next step"
          >
            Next ▶
          </button>
          <button
            className="btn nav-btn"
            onClick={handleLast}
            disabled={currentStepIndex >= totalSteps - 1}
            title="Last step"
          >
            Last ▶|
          </button>
          <button
            className={`btn nav-btn ${autoPlaying ? 'active' : ''}`}
            onClick={() => setAutoPlaying(a => !a)}
            disabled={currentStepIndex >= totalSteps - 1 && !autoPlaying}
          >
            {autoPlaying ? '⏸ Pause' : '▶ Auto'}
          </button>
        </div>

        {/* Timeline Slider */}
        <div className="timeline-slider-row">
          <input
            type="range"
            min={0}
            max={Math.max(0, totalSteps - 1)}
            value={currentStepIndex}
            onChange={e => {
              setAutoPlaying(false);
              onStepChange(parseInt(e.target.value, 10));
            }}
            className="timeline-slider"
          />
        </div>
      </div>

      {/* Step Explanation Banner */}
      <div className="pytutor-explanation">
        <span className="exp-icon">💡</span>
        <span className="exp-text">{curStep.explanation}</span>
      </div>

      {/* Main 2-Column Visualizer Layout */}
      <div className="pytutor-grid">
        {/* Left Column: Code Window with Current & Next Line Markers */}
        <div className="pytutor-code-col">
          <div className="col-header">
            <span>📄 Code Execution</span>
            <div className="legend">
              <span className="legend-item"><span className="arrow-sample green">▶</span> Current</span>
              <span className="legend-item"><span className="arrow-sample red">▷</span> Next</span>
            </div>
          </div>
          <div className="pytutor-code-lines">
            {codeLines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const isCurrent = curStep.line === lineNum;
              const isNext = curStep.nextLine === lineNum;
              return (
                <div
                  key={idx}
                  className={`pt-line ${isCurrent ? 'pt-current' : ''} ${isNext ? 'pt-next' : ''}`}
                >
                  <span className="pt-indicators">
                    {isCurrent && <span className="pt-arrow green" title="Current executing line">▶</span>}
                    {!isCurrent && isNext && <span className="pt-arrow red" title="Next line to execute">▷</span>}
                  </span>
                  <span className="pt-ln">{lineNum}</span>
                  <span className="pt-text">{lineText || ' '}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Stack Frames & Heap Objects */}
        <div className="pytutor-state-col">
          {/* Call Stack Frames */}
          <div className="pytutor-frames-section">
            <div className="col-header">
              <span>📚 Frames (Call Stack)</span>
            </div>
            <div className="frames-container">
              {activeStack.map((frame, fIdx) => (
                <div key={fIdx} className="frame-box">
                  <div className="frame-header">
                    <span className="frame-name">{frame.functionName}</span>
                    <span className="frame-line">line {frame.line}</span>
                  </div>
                  <div className="frame-vars">
                    {Object.keys(frame.variables).length === 0 ? (
                      <span className="no-vars">No local variables</span>
                    ) : (
                      <table className="var-table">
                        <tbody>
                          {Object.entries(frame.variables).map(([name, val]) => {
                            const isRef = val && typeof val === 'object' && 'ref' in val;
                            return (
                              <tr key={name}>
                                <td className="var-name">{name}</td>
                                <td className="var-val">
                                  {isRef ? (
                                    <span className="ref-pointer">➔ {val.ref}</span>
                                  ) : (
                                    String(val)
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    {curStep.returnValue !== undefined && fIdx === activeStack.length - 1 && (
                      <div className="return-val-box">
                        <span className="ret-label">Return Value:</span>
                        <span className="ret-data">{String(curStep.returnValue)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Heap Objects */}
          <div className="pytutor-objects-section">
            <div className="col-header">
              <span>📦 Objects (Heap)</span>
            </div>
            <div className="objects-container">
              {heapKeys.length === 0 ? (
                <div className="no-objects">No heap objects allocated</div>
              ) : (
                heapKeys.map((k) => {
                  const obj = activeHeap[k];
                  return (
                    <div key={k} className="heap-obj-card">
                      <div className="heap-obj-header">
                        <span className="heap-id">{obj.id}</span>
                        <span className="heap-type">{obj.type}</span>
                      </div>
                      <div className="heap-list-grid">
                        {obj.values.map((v, vIdx) => (
                          <div key={vIdx} className="heap-slot">
                            <span className="slot-idx">{vIdx}</span>
                            <span className="slot-val">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Standard Output Pane */}
          <div className="pytutor-stdout-section">
            <div className="col-header">
              <span>📺 Program Output</span>
            </div>
            <pre className="pytutor-stdout">
              {curStep.stdout.length > 0
                ? curStep.stdout.join('\n')
                : <span className="dim">No output produced yet</span>}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
