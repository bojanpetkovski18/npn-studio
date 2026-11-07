// Client for the engine Web Worker (SheetJS parsing + document generation run there, never on the UI thread).
let worker = null;
let seq = 0;
const pending = new Map();

function w() {
  if (!worker) {
    worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, type } = e.data;
      const p = pending.get(id);
      if (!p) return;
      if (type === 'progress') { if (p.onProgress) p.onProgress(e.data); return; }
      pending.delete(id);
      if (type === 'error') p.reject(new Error(e.data.error));
      else p.resolve(e.data.result);
    };
    worker.onerror = (e) => {
      // a crashed worker fails every pending call instead of hanging the UI
      for (const p of pending.values()) p.reject(new Error(e.message || 'Грешка во обработката'));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

function call(op, payload, { onProgress, transfer = [] } = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    w().postMessage({ id, op, ...payload }, transfer);
  });
}

// Cancellation is tied to a job id. A cancel that arrives before the job was posted (the UI awaits a screen
// wake-lock first) is remembered and applied to the next job, instead of being overwritten when the job starts.
let runningGen = null;
let cancelNext = false;

export const engine = {
  /** files: [{ name, data: ArrayBuffer }] (copied, not transferred – the caller keeps them for storage) */
  load: (files) => call('load', { files }),
  generate: (job, onProgress) => {
    if (cancelNext) { cancelNext = false; return Promise.resolve({ cancelled: true, done: 0 }); }
    const p = call('generate', { job }, { onProgress });
    runningGen = seq;
    const done = () => { if (runningGen === seq) runningGen = null; };
    p.then(done, done);
    return p;
  },
  cancel: () => {
    if (runningGen && worker) worker.postMessage({ op: 'cancel', id: runningGen });
    else cancelNext = true;
  },
  /** forget a cancel that never met a job (e.g. the user left the screen) */
  resetCancel: () => { cancelNext = false; },
};
