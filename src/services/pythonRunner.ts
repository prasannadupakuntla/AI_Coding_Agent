import type { PyResult } from './pythonTypes.ts';
import { executeInPyodide } from './pythonCore.ts';

export class PythonRunner {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, { resolve: (res: PyResult) => void; timeoutId: number }> = new Map();
  private isBrowser: boolean;
  private directPyodidePromise: Promise<any> | null = null;

  constructor() {
    this.isBrowser = typeof window !== 'undefined' && typeof Worker !== 'undefined';
    if (this.isBrowser) {
      this.initWorker();
    }
  }

  private initWorker(): void {
    if (this.worker) {
      this.worker.terminate();
    }
    try {
      this.worker = new Worker(
        new URL('../workers/pythonWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, id, result } = e.data || {};
        if (type === 'RESULT' && id && this.pendingRequests.has(id)) {
          const { resolve, timeoutId } = this.pendingRequests.get(id)!;
          clearTimeout(timeoutId);
          this.pendingRequests.delete(id);
          resolve(result);
        }
      };

      this.worker.onerror = (err) => {
        console.error('Python Worker error:', err);
      };
    } catch (err) {
      console.warn('Could not initialize Python Web Worker, falling back to direct mode:', err);
      this.worker = null;
    }
  }

  /**
   * Run Python code in Pyodide with safety timeout (5 seconds default).
   */
  public async run(code: string, timeoutMs = 5000): Promise<PyResult> {
    // If not in browser (e.g. Node.js unit tests) or worker failed, use direct runner
    if (!this.isBrowser || !this.worker) {
      return this.runDirect(code);
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return new Promise<PyResult>((resolve) => {
      // Hard watchdog timeout against infinite loops
      const timeoutId = window.setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          // Forcibly terminate the unresponsive worker running the infinite loop
          if (this.worker) {
            this.worker.terminate();
            this.worker = null;
          }
          // Restart a fresh worker for subsequent runs
          this.initWorker();

          resolve({
            success: false,
            stdout: [],
            stderr: ['TimeoutError: Execution exceeded 5.0s safety limit. Infinite loop detected.'],
            error: 'TimeoutError: Execution exceeded 5.0s safety limit. Infinite loop detected.',
            coinsCollected: 0,
            steps: [],
            executionTimeMs: timeoutMs,
          });
        }
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, timeoutId });

      this.worker!.postMessage({
        type: 'RUN',
        id,
        code,
      });
    });
  }

  /**
   * Direct Pyodide runner used in Node.js test environment or as browser fallback.
   */
  public async runDirect(code: string): Promise<PyResult> {
    if (!this.directPyodidePromise) {
      this.directPyodidePromise = (async () => {
        if (typeof window !== 'undefined') {
          // Browser environment
          // @ts-expect-error CDN import in browser
          const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs');
          return loadPyodide();
        } else {
          // Node.js environment
          const { loadPyodide } = await import('pyodide');
          return loadPyodide();
        }
      })();
    }

    const pyodide = await this.directPyodidePromise;
    return executeInPyodide(pyodide, code);
  }
}

export const pythonRunner = new PythonRunner();
