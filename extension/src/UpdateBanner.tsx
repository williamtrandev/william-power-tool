import { Download, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../src/components/ui';
import { zipUrl, type BuildInfo } from './update';

type Reply = { reloading?: boolean; update?: BuildInfo | null };

/** a newer build is out: how to get it. The extension reloads by itself once the files are replaced. */
export function UpdateBanner() {
  const [state, setState] = useState<Reply | null>(null);
  const [checking, setChecking] = useState(false);
  const check = () => chrome.runtime.sendMessage({ type: 'update-check' }).then((r: Reply) => setState(r));
  useEffect(() => {
    check();
  }, []);

  if (state?.reloading)
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 py-2 text-[12px] text-accent">
        <Loader2 size={14} className="animate-spin" /> Đang chuyển sang bản mới…
      </div>
    );
  if (!state?.update) return null;
  return (
    <section className="shrink-0 space-y-2 border-b border-warn/30 bg-warn/10 px-3 py-2.5 text-[12px] text-fg-2">
      <p className="font-semibold text-fg">
        Có bản extension mới{' '}
        <span className="font-normal text-muted">
          · {state.update.version} build {state.update.build.slice(0, 6)}
        </span>
      </p>
      <ol className="list-decimal space-y-0.5 pl-4">
        <li>Tải file zip bản mới.</li>
        <li>Giải nén, chép tất cả file vào thư mục đang cài extension, chọn Thay thế.</li>
        <li>Extension tự chuyển sang bản mới trong vòng 30 giây, không cần vào chrome://extensions.</li>
      </ol>
      <p className="text-[11.5px] text-muted">
        Chép xong mà vẫn thấy thông báo này:{' '}
        <button type="button" className="font-medium text-accent hover:underline" onClick={() => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })}>
          mở trang Extensions
        </button>{' '}
        rồi bấm nút tải lại ↻ của William Tool.
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" variant="primary" onClick={() => chrome.tabs.create({ url: zipUrl() })}>
          <Download size={14} /> Tải bản mới
        </Button>
        <Button
          size="sm"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await check();
            setChecking(false);
          }}
        >
          <RefreshCw size={14} className={checking ? 'animate-spin' : undefined} /> Đã chép xong
        </Button>
      </div>
    </section>
  );
}
