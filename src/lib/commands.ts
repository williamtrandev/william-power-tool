/** Shared command library (server commands + SQL): types and helpers. Storage is in backend.ts. */

/** shell / sql are runnable commands; note is free text for links, test accounts, environments… */
export type CommandKind = 'shell' | 'sql' | 'note';

export interface Command {
  id: string;
  title: string;
  kind: CommandKind;
  category: string;
  tags: string[];
  description: string;
  body: string;
  uses: number;
  /** visible to its owner only */
  is_private: boolean;
  owner_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CommandInput = Pick<Command, 'title' | 'kind' | 'category' | 'tags' | 'description' | 'body'> & { is_private?: boolean };

export interface HistoryRow {
  id: number;
  command_id: string;
  action: 'insert' | 'update' | 'delete';
  data: Command;
  changed_by: string | null;
  changed_at: string;
}

export const SAMPLE_COMMANDS: CommandInput[] = [
  {
    title: 'Môi trường UAT Watane',
    kind: 'note',
    category: 'Môi trường',
    tags: ['uat', 'link'],
    description: 'Link và tài khoản test dùng chung cho QC.',
    body: 'Web: https://uat.watane.example.vn\nAdmin: https://admin-uat.watane.example.vn\nTài khoản: qc_test\nMật khẩu: Uat@2026\n\nReset dữ liệu test mỗi sáng thứ 2.',
  },
  {
    title: 'Xem log core theo thời gian thực, lọc lỗi',
    kind: 'shell',
    category: 'Core',
    tags: ['log', 'realtime'],
    description: 'Theo dõi log Watane Core đang ghi, chỉ hiện dòng chứa từ khoá.',
    body: 'tail -f /home/www/WataneBO_Core/logs/{{file:app.log}} | grep --line-buffered -i "{{keyword:error}}"',
  },
  {
    title: 'Tìm một trace id trong log gateway',
    kind: 'shell',
    category: 'Gateway',
    tags: ['trace', 'log'],
    description: 'Lấy trace id từ William Tool (tab Log → Trace) rồi dán vào biến.',
    body: 'grep -rn "{{trace_id}}" /home/www/PayooGoBiz/PayooGoBiz_Gateway/logs/ | head -n 200',
  },
  {
    title: 'Lỗi của container Docker trong 30 phút gần nhất',
    kind: 'shell',
    category: 'Docker',
    tags: ['docker', 'log'],
    description: '',
    body: 'docker logs --since {{since:30m}} {{container}} 2>&1 | grep -i error | tail -n 200',
  },
  {
    title: 'Kiểm tra Redis còn sống',
    kind: 'shell',
    category: 'Hạ tầng',
    tags: ['redis'],
    description: 'Trả về PONG là bình thường. Dùng khi log báo "Connection refused [tcp://redis:…]".',
    body: 'redis-cli -h {{host:redis}} -p {{port:6403}} ping',
  },
  {
    title: 'Restart service core',
    kind: 'shell',
    category: 'Core',
    tags: ['restart'],
    description: 'Chỉ làm khi đã báo team và ngoài giờ cao điểm.',
    body: 'sudo systemctl restart {{service:watane-core}} && sudo systemctl status {{service:watane-core}} --no-pager',
  },
  {
    title: 'Tra đơn hàng theo mã đơn',
    kind: 'sql',
    category: 'Watane BO',
    tags: ['đơn hàng'],
    description: 'Lệnh mẫu — sửa tên bảng / cột cho khớp database thật.',
    body: "SELECT TOP 50 *\nFROM Orders\nWHERE OrderCode = '{{order_code}}'\nORDER BY CreatedDate DESC;",
  },
  {
    title: 'Đơn của một merchant trong ngày',
    kind: 'sql',
    category: 'Watane BO',
    tags: ['đơn hàng', 'merchant'],
    description: 'Lệnh mẫu — sửa tên bảng / cột cho khớp database thật.',
    body: "SELECT Id, OrderCode, Status, TotalAmount, CreatedDate\nFROM Orders\nWHERE PurchaserId = {{purchaser_id}}\n  AND CreatedDate >= '{{ngay:2026-10-28}}'\n  AND CreatedDate < DATEADD(day, 1, '{{ngay:2026-10-28}}')\nORDER BY CreatedDate DESC;",
  },
  {
    title: 'Mở khoá đơn bị treo (UAT)',
    kind: 'sql',
    category: 'Watane BO',
    tags: ['đơn hàng', 'uat'],
    description: 'Lệnh thay đổi dữ liệu — chỉ chạy trên UAT, luôn kèm WHERE theo mã đơn.',
    body: "UPDATE Orders\nSET Status = 'Pending'\nWHERE OrderCode = '{{order_code}}' AND Status = 'Processing';",
  },
];

// ── variables, danger detection, highlighting ────────────────────────────────

export interface CommandVar {
  name: string;
  def: string;
}

const VAR_RE = /\{\{\s*([\p{L}\p{N}_.-]+)\s*(?::([^}]*))?\}\}/gu;

/** `{{name}}` / `{{name:default}}` placeholders, in order of first appearance */
export function commandVars(body: string): CommandVar[] {
  const seen = new Map<string, CommandVar>();
  for (const m of body.matchAll(VAR_RE)) if (!seen.has(m[1])) seen.set(m[1], { name: m[1], def: (m[2] ?? '').trim() });
  return [...seen.values()];
}

export function fillCommand(body: string, values: Record<string, string>): string {
  return body.replace(VAR_RE, (_, name: string, def?: string) => {
    const v = values[name];
    return v != null && v !== '' ? v : (def ?? '').trim() || `{{${name}}}`;
  });
}

const VAR_VALUES = 'wpt-cmd-vars';
export function loadVarValues(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VAR_VALUES) || '{}');
  } catch {
    return {};
  }
}
export function saveVarValues(v: Record<string, string>) {
  try {
    localStorage.setItem(VAR_VALUES, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

const SQL_DANGER = /\b(update|delete|insert|merge|drop|truncate|alter|create|grant|revoke|exec(?:ute)?)\b/i;
const SHELL_DANGER =
  /\brm\s+-\w*[rf]|\bkill(?:all)?\b|\breboot\b|\bshutdown\b|\bsystemctl\s+(?:stop|restart|disable)\b|\bservice\s+\S+\s+(?:stop|restart)\b|\bdocker\s+(?:rm|rmi|stop|kill|restart|system\s+prune)\b|\bkubectl\s+(?:delete|rollout\s+restart|scale)\b|\bmkfs\b|\bdd\s+if=|\bchmod\s+-R\b|\bchown\s+-R\b|\btruncate\b|(?:^|[^>2&])>\s*\/(?!dev\/null)/i;

/** Commands that change data or services get a warning badge. */
export function dangerOf(c: Pick<Command, 'kind' | 'body'>): string | null {
  if (c.kind === 'note') return null;
  const body = c.body.replace(/--.*$|#.*$/gm, ''); // ignore comments
  if (c.kind === 'sql') {
    const m = SQL_DANGER.exec(body);
    return m ? `Thay đổi dữ liệu (${m[1].toUpperCase()})` : null;
  }
  const m = SHELL_DANGER.exec(body);
  return m ? 'Có thể thay đổi / dừng hệ thống' : null;
}

export type Tok = { t: string; k: 'kw' | 'str' | 'num' | 'com' | 'var' | 'flag' | 'op' | '' };

const SQL_KW =
  /^(select|from|where|and|or|not|in|is|null|like|between|order|by|group|having|top|limit|offset|join|left|right|inner|outer|full|on|as|distinct|count|sum|avg|min|max|case|when|then|else|end|union|all|exists|insert|into|values|update|set|delete|create|drop|alter|table|index|truncate|with|desc|asc|dateadd|getdate|cast|convert|nolock)$/i;

/** Small tokenizer for readable highlighting of SQL / shell (not a full parser). */
export function tokenize(body: string, kind: CommandKind): Tok[] {
  const re =
    kind === 'sql'
      ? /(\{\{[^}]*\}\})|(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)|(\s+)|(.)/g
      : /(\{\{[^}]*\}\})|(#[^\n]*)|("(?:[^"\\]|\\.)*"|'[^']*')|(\s-{1,2}[\w-]+)|([|&;<>]+)|(\b\d+\b)|([^\s{|&;<>"'#]+)|(\s+)|(.)/g;
  const out: Tok[] = [];
  // variables inside quotes / comments ('{{order_code}}') still get their own token
  const push = (t: string, k: Tok['k']) => {
    if (k !== 'str' && k !== 'com') return void out.push({ t, k });
    for (const part of t.split(/(\{\{[^}]*\}\})/)) if (part) out.push({ t: part, k: part.startsWith('{{') ? 'var' : k });
  };
  for (const m of body.matchAll(re)) {
    if (kind === 'sql') {
      const [, v, com, str, num, word] = m;
      push(m[0], v ? 'var' : com ? 'com' : str ? 'str' : num ? 'num' : word && SQL_KW.test(word) ? 'kw' : '');
    } else {
      const [, v, com, str, flag, op, num] = m;
      push(m[0], v ? 'var' : com ? 'com' : str ? 'str' : flag ? 'flag' : op ? 'op' : num ? 'num' : '');
    }
  }
  return out;
}

// ── notes ────────────────────────────────────────────────────────────────────

export type NoteLine = { t: 'kv'; key: string; value: string; secret: boolean } | { t: 'text'; text: string } | { t: 'blank' };

const SECRET_KEY = /pass|mật\s*khẩu|mat\s*khau|secret|token|api[\s_-]?key|\bpin\b|otp/i;
// "Key: value" — a URL like https://… is not a key (no space after its colon)
const KV = /^\s*([^:：\n]{1,40}?)\s*[:：]\s+(.+?)\s*$/;

/** A note is plain text; lines shaped like "Tên: giá trị" become copyable rows, secrets masked. */
export function parseNote(body: string): NoteLine[] {
  return body.split('\n').map((line) => {
    if (!line.trim()) return { t: 'blank' };
    const m = KV.exec(line);
    if (m && !/^https?$/i.test(m[1])) return { t: 'kv', key: m[1], value: m[2], secret: SECRET_KEY.test(m[1]) };
    return { t: 'text', text: line };
  });
}

export const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/g;

// ── same-title variants ──────────────────────────────────────────────────────

/** key that treats "Tên lệnh" and "ten lenh " as the same title */
export const titleKey = (t: string) =>
  t.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

const clip = (s: string) => (s.length > 28 ? s.slice(0, 27) + '…' : s);

/**
 * Short labels telling same-title commands apart: the first line where their bodies differ
 * ("qc" vs "dev_X"), never a secret value; else the description; else "Bản 1, 2…".
 */
export function variantLabels(list: Pick<Command, 'body' | 'description'>[]): string[] {
  const fallback = list.map((_, i) => `Bản ${i + 1}`);
  const unique = (labels: string[]) => (new Set(labels).size === labels.length ? labels : labels.map((l, i) => `${l} (${i + 1})`));
  const lines = list.map((c) => c.body.split('\n').map((l) => l.trim()).filter(Boolean));
  const n = Math.max(...lines.map((l) => l.length));
  for (let i = 0; i < n; i++) {
    const vals = lines.map((l) => l[i] ?? '');
    if (new Set(vals).size < 2) continue;
    const kv = vals.map((v) => KV.exec(v));
    if (kv.some((m) => m && SECRET_KEY.test(m[1]))) continue;
    return unique(vals.map((v, j) => clip(kv[j]?.[2] ?? v) || fallback[j]));
  }
  const desc = list.map((c) => c.description.trim().split('\n')[0]);
  if (new Set(desc).size === list.length && desc.every(Boolean)) return unique(desc.map(clip));
  return fallback;
}

// ── blocks of several commands ───────────────────────────────────────────────

export interface CommandPart {
  text: string;
  /** false for blank lines and comment-only lines */
  runnable: boolean;
}

/**
 * Split a body into the commands it contains: one per line for shell (a trailing "\" joins
 * the next line), one per statement for SQL (ends with ";"). Notes are not split.
 */
export function splitCommands(body: string, kind: CommandKind): CommandPart[] {
  if (kind === 'note') return [{ text: body, runnable: true }];
  const comment = kind === 'sql' ? /^\s*--/ : /^\s*#/;
  const parts: CommandPart[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) parts.push({ text: cur.join('\n'), runnable: true });
    cur = [];
  };
  for (const line of body.split('\n')) {
    if (!cur.length && (!line.trim() || comment.test(line))) {
      parts.push({ text: line, runnable: false });
      continue;
    }
    cur.push(line);
    const done = kind === 'sql' ? /;\s*(--.*)?$/.test(line) : !/\\\s*$/.test(line);
    if (done) flush();
  }
  flush();
  // drop trailing blank lines
  while (parts.length && !parts[parts.length - 1].runnable && !parts[parts.length - 1].text.trim()) parts.pop();
  return parts;
}

/** shell commands joined to run one after another, stopping at the first failure */
export const chainCommands = (parts: CommandPart[]) =>
  parts
    .filter((p) => p.runnable)
    .map((p) => p.text.trim())
    .join(' && ');
