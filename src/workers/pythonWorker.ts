import { executeInPyodide, type PyodideInterface } from '../services/pythonCore.ts';
import type { WorkerMessageRequest } from '../services/pythonTypes.ts';

let pyodideInstance: PyodideInterface | null = null;
let initPromise: Promise<PyodideInterface> | null = null;

async function getOrInitPyodide(): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Dynamic import of Pyodide ES module in Web Worker
    // @ts-expect-error CDN import in Web Worker
    const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs');
    const py = await loadPyodide();
    pyodideInstance = py as PyodideInterface;
    return pyodideInstance;
  })();

  return initPromise;
}

// Signal readiness on worker startup
self.postMessage({ type: 'READY' });

self.onmessage = async (e: MessageEvent<WorkerMessageRequest>) => {
  const data = e.data;
  if (data?.type === 'RUN') {
    const { id, code } = data;
    try {
      const py = await getOrInitPyodide();
      const result = executeInPyodide(py, code);
      self.postMessage({ type: 'RESULT', id, result });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      self.postMessage({
        type: 'RESULT',
        id,
        result: {
          success: false,
          stdout: [],
          stderr: [errMsg],
          error: errMsg,
          coinsCollected: 0,
          steps: [],
          executionTimeMs: 0,
        },
      });
    }
  }
};
