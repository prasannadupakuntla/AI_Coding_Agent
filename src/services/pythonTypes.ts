export interface StackFrame {
  functionName: string;
  line: number; // current line in this frame
  variables: Record<string, any>;
}

export interface HeapObject {
  id: string;
  type: string;
  repr: string;
}

export interface PyStep {
  line: number;           // 1-indexed
  event: 'line' | 'call' | 'return';
  functionName?: string;
  varName?: string;
  varValue?: string | number | boolean;
  explanation: string;
  coinCollected: boolean;
  output?: string;
  // New optional fields for real tracing
  callStack?: StackFrame[];
  heap?: Record<string, HeapObject>;
}

export interface PyResult {
  success: boolean;
  stdout: string[];
  stderr: string[];
  error?: string;
  coinsCollected: number;
  steps: PyStep[];
  executionTimeMs: number;
}

export interface WorkerMessageRequest {
  type: 'RUN';
  id: string;
  code: string;
}

export interface WorkerMessageResponse {
  type: 'READY' | 'RESULT' | 'ERROR';
  id?: string;
  result?: PyResult;
  error?: string;
}
