import { FileUp, GitBranch, Lock, Search, ShieldAlert } from 'lucide-react';
import { useRef } from 'react';

const FORMATS = ['Laravel', '.NET [dd-MM-yyyy]', 'Serilog', 'ISO timestamp', 'JSON lines'];

const FEATURES = [
  { icon: Search, title: 'Tìm tức thì', text: 'AND / OR / loại trừ / regex, hiện đoạn trích quanh từ khoá.' },
  { icon: ShieldAlert, title: 'Lọc dòng khả nghi', text: 'Chấm điểm exception, timeout, HTTP 5xx, success:false… và gom nhóm lỗi.' },
  { icon: GitBranch, title: 'Ghép theo trace', text: 'Tự lấy trace_id / request id, xem toàn bộ request xuyên nhiều file.' },
];

export function DropZone({ onAdd }: { onAdd: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid flex-1 place-items-center overflow-auto px-4 py-10">
      <div className="w-full max-w-[640px] animate-in">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="focus-ring group flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-line-strong bg-surface px-6 py-14 text-center transition-colors hover:border-accent hover:bg-accent-soft/40"
        >
          <span className="mb-5 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent transition-transform group-hover:-translate-y-0.5">
            <FileUp size={26} strokeWidth={1.8} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Kéo thả file log vào đây</span>
          <span className="mt-1.5 text-muted">Chọn được nhiều file của nhiều hệ thống cùng lúc</span>
          <span className="mt-6 inline-flex h-9 items-center rounded-md bg-accent px-4 text-[13px] font-medium text-white group-hover:brightness-110">
            Chọn file log
          </span>
          <span className="mt-6 flex flex-wrap justify-center gap-1.5">
            {FORMATS.map((f) => (
              <span key={f} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11.5px] text-muted">
                {f}
              </span>
            ))}
          </span>
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) onAdd([...e.target.files]);
            e.target.value = '';
          }}
        />
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 sm:flex-col sm:gap-2">
              <Icon size={16} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <div className="font-medium">{title}</div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{text}</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-8 flex items-center justify-center gap-1.5 text-[12px] text-faint">
          <Lock size={12} /> File chỉ được đọc trong trình duyệt của bạn, không gửi lên server nào.
        </p>
      </div>
    </div>
  );
}
