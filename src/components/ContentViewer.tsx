import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Highlight } from './ui';

/** Stack frame line: .NET "   at X.Y()" or PHP "#12 /path(…)" */
const FRAME = /^\s*(?:at\s+\S|#\d+\s)/;
/** Frames from libraries/framework — usually noise when hunting a bug. */
const LIB_FRAME =
  /[/\\]vendor[/\\]|\bat (?:System|Microsoft|Npgsql|Newtonsoft|StackExchange|Polly|Serilog)\.|Illuminate\\|Symfony\\|GuzzleHttp\\|Laravel\\|Predis\\|\{main\}|\[internal function\]/;
/** Unbroken runs this long (JWT, base64, minified code) get collapsed. */
const LONG_TOKEN = /\S{140,}/g;
const MAX_LINES = 4000;

type Block = { kind: 'line'; n: number; text: string } | { kind: 'fold'; n: number; lines: string[] };

function toBlocks(text: string, fold: boolean): Block[] {
  const lines = text.split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (fold && FRAME.test(lines[i]) && LIB_FRAME.test(lines[i])) {
      let j = i;
      while (j < lines.length && FRAME.test(lines[j]) && LIB_FRAME.test(lines[j])) j++;
      if (j - i >= 3) {
        out.push({ kind: 'fold', n: i + 1, lines: lines.slice(i, j) });
        i = j;
        continue;
      }
    }
    out.push({ kind: 'line', n: i + 1, text: lines[i] });
    i++;
  }
  return out;
}

function LongToken({ text, hl, onId }: { text: string; hl: RegExp | null; onId?: (id: string) => void }) {
  const hasHit = useMemo(() => {
    if (!hl) return false;
    hl.lastIndex = 0;
    const r = hl.test(text);
    hl.lastIndex = 0;
    return r;
  }, [text, hl]);
  const [open, setOpen] = useState(hasHit);
  if (open)
    return (
      <span className="break-all">
        <Highlight text={text} hl={hl} onId={onId} />
        <button type="button" onClick={() => setOpen(false)} className="ml-1 rounded bg-surface-3 px-1 font-sans text-[10.5px] text-muted hover:text-fg">
          thu gọn
        </button>
      </span>
    );
  return (
    <span>
      <Highlight text={text.slice(0, 64)} hl={hl} onId={onId} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Bấm để xem đầy đủ"
        className="mx-0.5 rounded bg-accent-soft px-1 font-sans text-[10.5px] font-medium text-accent hover:brightness-110"
      >
        …+{(text.length - 64).toLocaleString('vi-VN')} ký tự
      </button>
    </span>
  );
}

const LINE_MAX = 1500;
const LINE_HEAD = 700;

/** Very long single lines (escaped HTML pages, minified code, huge JSON) show a head + expand button. */
function LineText({ text, hl, onId }: { text: string; hl: RegExp | null; onId?: (id: string) => void }) {
  const long = text.length > LINE_MAX;
  const hitIdx = useMemo(() => {
    if (!long || !hl) return -1;
    hl.lastIndex = 0;
    const m = hl.exec(text);
    hl.lastIndex = 0;
    return m ? m.index : -1;
  }, [long, text, hl]);
  const [open, setOpen] = useState(false);
  if (long && !open) {
    // Show the start, plus a window around the first search hit when it falls past the head.
    const win = hitIdx > LINE_HEAD ? [Math.max(LINE_HEAD, hitIdx - 120), Math.min(text.length, hitIdx + 280)] : null;
    const btn = (n: number) => (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Bấm để xem cả dòng"
        className="mx-1 rounded bg-accent-soft px-1.5 font-sans text-[10.5px] font-medium text-accent hover:brightness-110"
      >
        …+{n.toLocaleString('vi-VN')} ký tự
      </button>
    );
    return (
      <>
        <Segments text={text.slice(0, LINE_HEAD)} hl={hl} onId={onId} />
        {win ? (
          <>
            {btn(win[0] - LINE_HEAD)}
            <Segments text={text.slice(win[0], win[1])} hl={hl} onId={onId} />
            {win[1] < text.length && btn(text.length - win[1])}
          </>
        ) : (
          btn(text.length - LINE_HEAD)
        )}
      </>
    );
  }
  return (
    <>
      <Segments text={text} hl={hl} onId={onId} />
      {long && (
        <button type="button" onClick={() => setOpen(false)} className="ml-1 rounded bg-surface-3 px-1 font-sans text-[10.5px] text-muted hover:text-fg">
          thu gọn dòng
        </button>
      )}
    </>
  );
}

function Segments({ text, hl, onId }: { text: string; hl: RegExp | null; onId?: (id: string) => void }) {
  if (text.length < 140) return <Highlight text={text} hl={hl} onId={onId} />;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(LONG_TOKEN)) {
    if (m.index > last) parts.push(<Highlight key={k++} text={text.slice(last, m.index)} hl={hl} onId={onId} />);
    parts.push(<LongToken key={k++} text={m[0]} hl={hl} onId={onId} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Highlight key={k++} text={text.slice(last)} hl={hl} onId={onId} />);
  return <>{parts}</>;
}

function Fold({ block, hl, onId, gutter, gs }: { block: Extract<Block, { kind: 'fold' }>; hl: RegExp | null; onId?: (id: string) => void; gutter: string; gs: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex">
        <span className={gutter} style={gs} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="my-0.5 inline-flex items-center gap-1 rounded border border-dashed border-line-strong px-1.5 font-sans text-[11px] text-muted hover:border-accent hover:text-accent"
        >
          <ChevronRight size={11} className={clsx('transition-transform', open && 'rotate-90')} />
          {open ? 'Ẩn' : 'Hiện'} {block.lines.length} frame framework / thư viện
        </button>
      </div>
      {open &&
        block.lines.map((l, i) => (
          <div key={i} className="flex opacity-60">
            <span className={gutter} style={gs}>
              {block.n + i}
            </span>
            <span className="min-w-0 flex-1">
              <LineText text={l} hl={hl} onId={onId} />
            </span>
          </div>
        ))}
    </>
  );
}

interface Props {
  text: string;
  hl: RegExp | null;
  onId?: (id: string) => void;
  wrap: boolean;
  fold: boolean;
}

export function ContentViewer({ text, hl, onId, wrap, fold }: Props) {
  const [showAll, setShowAll] = useState(false);
  const blocks = useMemo(() => toBlocks(text, fold), [text, fold]);
  const shown = showAll ? blocks : blocks.slice(0, MAX_LINES);
  const digits = String(text.split('\n', MAX_LINES + 1).length).length;
  const gutter = 'shrink-0 select-none pr-3 text-right text-faint tabular-nums';
  const gutterStyle = { width: `${digits + 2}ch` };

  return (
    <div className={clsx('font-mono text-[12px] leading-[1.65] text-fg', wrap ? 'whitespace-pre-wrap break-words' : 'w-max min-w-full whitespace-pre')}>
      {shown.map((b) =>
        b.kind === 'line' ? (
          <div key={b.n} className={clsx('flex', FRAME.test(b.text) && 'text-fg-2')}>
            <span className={gutter} style={gutterStyle}>
              {b.n}
            </span>
            <span className="min-w-0 flex-1">
              <LineText text={b.text} hl={hl} onId={onId} />
            </span>
          </div>
        ) : (
          <Fold key={b.n} block={b} hl={hl} onId={onId} gutter={gutter} gs={gutterStyle} />
        ),
      )}
      {!showAll && blocks.length > MAX_LINES && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-2 rounded-md border border-line px-2 py-1 font-sans text-[12px] text-accent">
          Hiện thêm {(blocks.length - MAX_LINES).toLocaleString('vi-VN')} dòng
        </button>
      )}
    </div>
  );
}
