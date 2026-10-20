export const LEVELS = ['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'OTHER'] as const;
export type Level = (typeof LEVELS)[number];

export interface LogEntry {
  /** file index */
  f: number;
  /** index within file */
  k: number;
  /** 1-based line number in file */
  ln: number;
  /**
   * Byte range of the entry inside its file. The text itself is not kept in memory —
   * it is sliced from the file on demand (see rawCache), so 300MB+ logs stay usable.
   */
  bs: number;
  be: number;
  /** inline text for entries that are not a byte range of the file (CSV rows) */
  text?: string;
  /** length of the timestamp/level prefix in the raw text */
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
  /** the file contents, read lazily for entry text */
  blob: Blob;
  /** parser format id, used to parse only the appended tail of a growing file */
  fmtId: string;
  color: string;
  on: boolean;
  note?: string;
  /** key of the persisted copy in IndexedDB, or "folder:<name>" for files read from a connected folder */
  storeId: string;
  /** bumped each time the file is re-read (folder files that changed on disk) */
  rev?: number;
}

export interface ParseResult {
  format: string;
  /** extra detail about how the file was read, e.g. CSV column mapping */
  note?: string;
  fmtId: string;
  lines: number;
  entries: LogEntry[];
}

/** Resume parsing a growing file from its last entry instead of from byte 0. */
export interface ResumeFrom {
  byte: number;
  k: number;
  ln: number;
  lastTs: number | null;
  fmtId: string;
}

export const SUS_MIN = 40;
