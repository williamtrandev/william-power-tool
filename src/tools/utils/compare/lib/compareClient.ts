import CompareWorker from './compare.worker?worker&inline';
import type { CompareReply, CompareRequest, WorkerMessage } from './compare.worker';

/**
 * Promise wrapper around the compare worker. Requests run one at a time in the order sent,
 * so a compare never sees a file that is still being opened.
 */
export class CompareClient {
  private w: Worker | null = null;
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();

  call<T extends CompareReply>(req: CompareRequest, onProgress?: (p: number) => void): Promise<T> {
    const run = () =>
      new Promise<T>((resolve, reject) => {
        const w = (this.w ??= new CompareWorker());
        const id = ++this.seq;
        const done = () => {
          w.removeEventListener('message', onMessage);
          w.removeEventListener('error', onError);
        };
        const onMessage = (ev: MessageEvent<WorkerMessage>) => {
          const m = ev.data;
          if (m.id !== id) return;
          if ('progress' in m) return onProgress?.(m.progress);
          done();
          if (m.ok) resolve(m.value as T);
          else reject(new Error(m.error));
        };
        // e.g. out of memory: the worker and the files it held are gone, start over next time
        const onError = (ev: ErrorEvent) => {
          done();
          this.dispose();
          reject(new Error(ev.message || 'Không đủ bộ nhớ để xử lý file'));
        };
        w.addEventListener('message', onMessage);
        w.addEventListener('error', onError);
        w.postMessage({ id, req });
      });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  dispose() {
    this.w?.terminate();
    this.w = null;
  }
}
