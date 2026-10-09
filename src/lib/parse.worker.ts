import { parseText } from './parser';

export interface ParseRequest {
  file: File;
  fileId: number;
}
export type ParseMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; result: ReturnType<typeof parseText> }
  | { type: 'error'; message: string };

self.onmessage = async (ev: MessageEvent<ParseRequest>) => {
  const { file, fileId } = ev.data;
  try {
    const text = await file.text();
    let last = 0;
    const result = parseText(text, fileId, (p) => {
      if (p - last > 0.03) {
        last = p;
        self.postMessage({ type: 'progress', value: p } satisfies ParseMessage);
      }
    });
    self.postMessage({ type: 'done', result } satisfies ParseMessage);
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies ParseMessage);
  }
};
