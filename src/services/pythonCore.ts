import type { PyodideInterface } from 'pyodide';
export type { PyodideInterface };
import type { PyResult, PyStep, StackFrame, HeapObject } from './pythonTypes.ts';

/**
 * Execute Python code in Pyodide Web Worker with Python Tutor-style execution tracing.
 */
export function executeInPyodide(pyodide: PyodideInterface, code: string): PyResult {
  const startTime = Date.now();
  let coinsCollected = 0;
  const steps: PyStep[] = [];
  const MAX_TRACE_STEPS = 500;

  // JS callback for collect_coin
  pyodide.globals.set('_js_collect_coin', () => {
    coinsCollected += 1;
    steps.push({
      line: -1,
      event: 'line',
      explanation: `ByteBot collects gold coin #${coinsCollected}!`,
      coinCollected: true,
      output: `🪙 Coin ${coinsCollected} collected!`,
    });
  });

  // JS callback for line trace
  pyodide.globals.set('_js_trace_step', (
    line: number,
    event: string,
    fnName: string,
    framesJson: string,
    heapJson: string,
    retValStr?: string
  ) => {
    if (steps.length >= MAX_TRACE_STEPS) return;

    let callStack: StackFrame[] = [];
    try {
      callStack = JSON.parse(framesJson);
    } catch {
      callStack = [];
    }

    let heap: Record<string, HeapObject> = {};
    try {
      heap = JSON.parse(heapJson);
    } catch {
      heap = {};
    }

    // Determine primary variable change / explanation
    const activeFrame = callStack.length > 0 ? callStack[callStack.length - 1] : null;
    let varName: string | undefined;
    let varValue: any;
    if (activeFrame && activeFrame.variables) {
      const keys = Object.keys(activeFrame.variables).filter(k => !k.startsWith('_'));
      if (keys.length > 0) {
        varName = keys[keys.length - 1];
        varValue = activeFrame.variables[varName];
      }
    }

    const explanation = event === 'call'
      ? `Calling function "${fnName}"`
      : event === 'return'
        ? `Returning from "${fnName}"`
        : varName !== undefined
          ? `Executing line ${line} (${varName} = ${typeof varValue === 'object' && varValue?.__ref ? varValue.__ref : JSON.stringify(varValue)})`
          : `Executing line ${line}`;

    const step: PyStep = {
      line,
      event: event as 'line' | 'call' | 'return',
      functionName: fnName,
      varName,
      varValue,
      explanation,
      coinCollected: false,
      callStack,
      heap,
    };

    if (event === 'return' && retValStr) {
      try {
        step.output = JSON.parse(retValStr);
      } catch {
        step.output = retValStr;
      }
    }

    steps.push(step);
  });

  // Python wrapper harness that sets up buffers, heap tracking, and sys.settrace
  const harnessCode = `
import sys, io, json, inspect

_stdout_buffer = io.StringIO()
_stderr_buffer = io.StringIO()
sys.stdout = _stdout_buffer
sys.stderr = _stderr_buffer

def collect_coin():
    global _js_collect_coin
    _js_collect_coin()

_trace_step_count = 0
_MAX_STEPS = 500
_heap_objects = {}

def _serialize_val(v, seen=None, depth=0):
    if seen is None:
        seen = set()
    if depth > 4:
        return repr(v)
    if v is None or isinstance(v, (int, float, bool, str)):
        return v
    
    val_id = id(v)
    
    if callable(v):
        obj_id = f"fn_{val_id}"
        fn_name = getattr(v, '__name__', str(v))
        try:
            sig = str(inspect.signature(v))
        except Exception:
            sig = "(...)"
        _heap_objects[obj_id] = {
            "id": obj_id,
            "type": "function",
            "repr": f"{fn_name}{sig}",
            "items": [{"label": "call", "value": f"{fn_name}{sig}"}]
        }
        return {"__ref": obj_id}

    if isinstance(v, (tuple, list)):
        is_tup = isinstance(v, tuple)
        obj_id = f"{'tuple' if is_tup else 'list'}_{val_id}"
        if obj_id in _heap_objects or val_id in seen:
            return {"__ref": obj_id}
        seen.add(val_id)
        
        items = []
        for i, item in enumerate(v):
            items.append({
                "label": str(i),
                "value": _serialize_val(item, seen, depth + 1)
            })
        _heap_objects[obj_id] = {
            "id": obj_id,
            "type": "tuple" if is_tup else "list",
            "repr": repr(v),
            "items": items
        }
        return {"__ref": obj_id}

    if isinstance(v, dict):
        obj_id = f"dict_{val_id}"
        if obj_id in _heap_objects or val_id in seen:
            return {"__ref": obj_id}
        seen.add(val_id)
        
        items = []
        for k, val in v.items():
            items.append({
                "label": str(k),
                "value": _serialize_val(val, seen, depth + 1)
            })
        _heap_objects[obj_id] = {
            "id": obj_id,
            "type": "dict",
            "repr": repr(v),
            "items": items
        }
        return {"__ref": obj_id}

    return repr(v)

def _tracer(frame, event, arg):
    global _trace_step_count
    if _trace_step_count >= _MAX_STEPS:
        return None
    # Don't trace internal harness or collect_coin function
    if frame.f_code.co_filename != '<string>':
        return _tracer
    if frame.f_code.co_name == 'collect_coin':
        return None

    _trace_step_count += 1
    fn_name = frame.f_code.co_name
    line_no = frame.f_lineno

    # Build entire call stack from frame upwards
    frames_list = []
    cur = frame
    while cur:
        if cur.f_code.co_filename == '<string>' and cur.f_code.co_name != 'collect_coin':
            c_name = cur.f_code.co_name
            disp_name = "Global frame" if c_name == '<module>' else c_name
            f_vars = {}
            for k, v in cur.f_locals.items():
                if not k.startswith('_') and k != 'collect_coin':
                    try:
                        f_vars[k] = _serialize_val(v)
                    except Exception:
                        f_vars[k] = str(v)
            frames_list.insert(0, {
                "functionName": disp_name,
                "line": cur.f_lineno,
                "variables": f_vars
            })
        cur = cur.f_back

    # If return event, capture return value
    ret_val = ''
    if event == 'return' and arg is not None:
        try:
            ret_val = json.dumps(_serialize_val(arg))
        except Exception:
            ret_val = repr(arg)

    try:
        frames_json = json.dumps(frames_list)
        heap_json = json.dumps(_heap_objects)
    except Exception:
        frames_json = "[]"
        heap_json = "{}"

    _js_trace_step(line_no, event, fn_name, frames_json, heap_json, ret_val)
    return _tracer

sys.settrace(_tracer)
`;

  try {
    pyodide.runPython(harnessCode);
    pyodide.runPython(code);
    pyodide.runPython('sys.settrace(None)'); // remove trace

    const stdoutRaw: string = pyodide.runPython('_stdout_buffer.getvalue()');
    const stderrRaw: string = pyodide.runPython('_stderr_buffer.getvalue()');

    const stdoutLines = stdoutRaw ? stdoutRaw.trimEnd().split('\n') : [];
    const stderrLines = stderrRaw ? stderrRaw.trimEnd().split('\n') : [];

    return {
      success: true,
      stdout: stdoutLines,
      stderr: stderrLines,
      coinsCollected,
      steps,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    try {
      pyodide.runPython('sys.settrace(None)');
    } catch {
      // Ignore
    }
    const errType = (err as any)?.type || (err as any)?.name || 'PythonError';
    const errMessage = (err as any)?.message ? String((err as any).message).trim() : '';
    const cleanError = errMessage
      ? (errMessage.split('\n').map((l: string) => l.trim()).filter(Boolean).pop() || errMessage)
      : errType;

    return {
      success: false,
      stdout: [],
      stderr: [cleanError],
      error: cleanError,
      coinsCollected,
      steps,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
