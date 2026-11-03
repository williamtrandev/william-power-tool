import { Download, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from '../../components/Modal';
import { Kbd } from '../../components/ui';

/** built next to index.html by `npm run build` (scripts/zip-extension.mjs) */
const ZIP = './william-tool-extension.zip';
const GUIDE = './extension-guide.gif';

/** download + install steps for the browser extension that fills these accounts into login pages */
export function ExtensionModal({ onClose }: { onClose: () => void }) {
  // the dev server has no zip; say so instead of downloading an error page
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch(ZIP, { method: 'HEAD' })
      .then((r) => live && setReady(r.ok && !r.headers.get('content-type')?.includes('text/html')))
      .catch(() => live && setReady(false));
    return () => {
      live = false;
    };
  }, []);

  return (
    <Modal title="Extension điền tài khoản" onClose={onClose}>
      <div className="space-y-4 px-5 pb-5 text-[13px] text-fg-2">
        <img src={GUIDE} alt="Bấm vào ô tên đăng nhập, chọn tài khoản trong menu hiện ra, tên đăng nhập và mật khẩu được điền sẵn" className="w-full rounded-lg border border-line" />
        <p>
          Bấm vào ô đăng nhập là menu chọn tài khoản hiện ngay bên dưới; hoặc bấm icon extension (<Kbd>Alt+Shift+W</Kbd>). Tên đăng nhập, mật khẩu và mã OTP được điền sẵn. Danh sách và quyền xem giống hệt
          tab này, mọi lần điền đều được ghi nhật ký.
        </p>

        {ready === false ? (
          <p className="flex gap-2 rounded-lg bg-warn/10 px-3 py-2.5 text-[12.5px] text-warn">
            <TriangleAlert size={15} className="mt-px shrink-0" />
            Bản đang chạy chưa có file extension. Chạy npm run build (hoặc deploy lại) để tạo.
          </p>
        ) : (
          <a
            href={ZIP}
            download
            aria-disabled={!ready}
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-white hover:brightness-110 aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <Download size={16} /> Tải extension (.zip)
          </a>
        )}

        <ol className="space-y-2.5">
          <Step n={1}>Giải nén file vừa tải. Để thư mục ở chỗ cố định, đừng xoá — Chrome chạy extension từ chính thư mục đó.</Step>
          <Step n={2}>
            Mở <code className="rounded bg-surface-2 px-1 font-mono text-[12px]">chrome://extensions</code> (Edge: <code className="rounded bg-surface-2 px-1 font-mono text-[12px]">edge://extensions</code>), bật{' '}
            <b className="text-fg">Developer mode</b> ở góc trên.
          </Step>
          <Step n={3}>
            Bấm <b className="text-fg">Load unpacked</b>, chọn thư mục <code className="rounded bg-surface-2 px-1 font-mono text-[12px]">william-tool-extension</code>. Ghim icon lên thanh công cụ cho dễ bấm.
          </Step>
          <Step n={4}>Bấm icon, đăng nhập Google như vào William Tool. Phiên đăng nhập mất khi đóng trình duyệt.</Step>
          <Step n={5}>Mở lại các trang đăng nhập đang mở sẵn (F5) để menu hiện trong ô.</Step>
        </ol>

        <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
          Chrome sẽ báo extension “đọc và thay đổi dữ liệu trên các trang web”: cần quyền này để hiện menu ngay dưới ô đăng nhập và điền vào. Extension chỉ tìm ô đăng nhập trên trang, không đọc hay gửi
          nội dung trang đi đâu. Muốn tắt menu trong trang: icon extension → nút cài đặt.
        </p>
        <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
          Có bản mới: tải lại file, giải nén đè lên thư mục cũ, rồi bấm nút tải lại của extension trong trang chrome://extensions. Để tài khoản hiện đúng trang, điền “Link đăng nhập” cho từng tài
          khoản.
        </p>
      </div>
    </Modal>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{n}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}
