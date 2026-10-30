import { parseBlob } from './parser';
import type { LogEntry, ParseResult, ResumeFrom } from './types';

export interface ParseRequest {
  file: Blob;
  fileId: number;
  name: string;
  from?: ResumeFrom;
}
export type ParseMessage =
  | { type: 'progress'; value: number }
  | { type: 'batch'; entries: LogEntry[] }
  | { type: 'done'; result: ParseResult }
  | { type: 'error'; message: string };

self.onmessage = async (ev: MessageEvent<ParseRequest>) => {
  const { file, fileId, name, from } = ev.data;
  try {
    let last = 0;
    const onBatch = (entries: LogEntry[]) => self.postMessage({ type: 'batch', entries } satisfies ParseMessage);
    const result = await parseBlob(file, { fileId, name, from, onBatch }, (p) => {
      if (p - last > 0.02) {
        last = p;
        self.postMessage({ type: 'progress', value: p } satisfies ParseMessage);
      }
    });
    self.postMessage({ type: 'done', result } satisfies ParseMessage);
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies ParseMessage);
  }
};
