const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function fmtTime(ts: number | null, ms = false): string {
  if (ts == null) return '—';
  const d = new Date(ts);
  return (
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + (ms ? '.' + pad(d.getMilliseconds(), 3) : '')
  );
}

export function fmtDate(ts: number | null): string {
  if (ts == null) return '';
  const d = new Date(ts);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
}

export const fmtDateTime = (ts: number | null, ms = false) => (ts == null ? '—' : fmtDate(ts) + ' ' + fmtTime(ts, ms));

export function fmtFull(ts: number | null): string {
  if (ts == null) return '—';
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${fmtTime(ts, true)}`;
}

export const nf = (n: number) => n.toLocaleString('vi-VN');

export function fmtBytes(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

export function fmtStep(ms: number): string {
  if (ms >= 86400000) return ms / 86400000 + ' ngày';
  if (ms >= 3600000) return ms / 3600000 + ' giờ';
  if (ms >= 60000) return ms / 60000 + ' phút';
  return ms / 1000 + ' giây';
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + 's';
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
}

export const shortName = (n: string) => n.replace(/\.(log|txt)$/i, '');

export const FILE_COLORS = ['#14b8a6', '#f97316', '#3b82f6', '#ec4899', '#84cc16', '#eab308', '#06b6d4', '#a855f7'];
