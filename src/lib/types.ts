export const LEVELS = ['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'OTHER'] as const;
export type Level = (typeof LEVELS)[number];

export interface LogEntry {
  /** file index */
  f: number;
  /** index within file */
  k: number;
  /** 1-based line number in file */
  ln: number;
  raw: string;
  /** length of the timestamp/level prefix in raw */
  head: number;
  ts: number | null;
  level: Level;
  trace: string | null;
  /** trace was inferred from the surrounding request block */
  ti?: boolean;
  score: number;
  /** one-line summary */
  sum: string;
  /** lowercased, decoded full text used for search */
  lc: string;
  sig?: string;
}

export interface LogFile {
  id: number;
  name: string;
  size: number;
  format: string;
  lines: number;
  entries: LogEntry[];
  traced: number;
  color: string;
  on: boolean;
  /** key of the persisted copy in IndexedDB */
  storeId: string;
}

export interface ParseResult {
  format: string;
  lines: number;
  entries: LogEntry[];
}

export const SUS_MIN = 40;
