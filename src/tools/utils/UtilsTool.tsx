import clsx from 'clsx';
import { KeyRound, QrCode, ScanLine } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Segmented } from '../../components/ui';
import { QrMake } from './qr/QrMake';
import { QrRead } from './qr/QrRead';
import { WataneSection } from './watane/WataneSection';

export type Section = 'qr-read' | 'qr-make' | 'watane';

const GROUPS: { title: string; items: { id: Section; label: string; short: string; icon: ReactNode; title: string; about: string }[] }[] = [
  {
    title: 'Mã QR',
    items: [
      {
        id: 'qr-read',
        label: 'Đọc mã QR',
        short: 'Đọc QR',
        icon: <ScanLine size={16} />,
        title: 'Đọc mã QR',
        about: 'Đọc QR từ ảnh, màn hình, camera hoặc chuỗi đã có. VietQR / EMVCo được tách từng trường và kiểm tra CRC.',
      },
      {
        id: 'qr-make',
        label: 'Tạo mã QR',
        short: 'Tạo QR',
        icon: <QrCode size={16} />,
        title: 'Tạo mã QR',
        about: 'Tạo VietQR chuyển khoản để test, hoặc QR cho link / văn bản bất kỳ. Tải PNG hoặc copy chuỗi.',
      },
    ],
  },
  {
    title: 'Watane',
    items: [
      {
        id: 'watane',
        label: 'Giải mã / mã hoá',
        short: 'Watane',
        icon: <KeyRound size={16} />,
        title: 'Giải mã Watane',
        about: 'Giải mã / mã hoá code Watane bằng AES-ECB với secret key — giống script Python, chạy ngay trên trình duyệt.',
      },
    ],
  },
];
const ITEMS = GROUPS.flatMap((g) => g.items);

/** #utils/qr-make → qr-make; the old #watane tab opens the Watane section */
function fromHash(): Section {
  const [tool, sub] = location.hash.slice(1).split('/');
  if (tool === 'watane') return 'watane';
  return ITEMS.find((i) => i.id === sub)?.id ?? 'qr-read';
}

/** Small tools grouped by topic: QR codes, Watane codes. Every one runs in the browser only. */
export function UtilsTool({ active, onToast }: { active: boolean; onToast: (m: string) => void }) {
  const [section, setSection] = useState<Section>(fromHash);
  const item = ITEMS.find((i) => i.id === section)!;

  // keep the section in the address so a reload or a shortcut lands on it
  useEffect(() => {
    if (active) history.replaceState(null, '', `#utils/${section}`);
  }, [active, section]);

  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto', !active && 'hidden')}>
      <div className="mx-auto flex w-full max-w-[1200px] gap-6 px-4 py-6">
        <nav data-tour="u-nav" aria-label="Tiện ích" className="sticky top-6 hidden w-48 shrink-0 self-start lg:block">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-4">
              <p className="mb-1 px-2.5 text-[11px] font-semibold tracking-wide text-faint uppercase">{g.title}</p>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  aria-current={section === it.id ? 'page' : undefined}
                  onClick={() => setSection(it.id)}
                  className={clsx(
                    'focus-ring flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors',
                    section === it.id ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  {it.icon}
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="lg:hidden" data-tour="u-nav">
            <Segmented label="Tiện ích" value={section} onChange={setSection} items={ITEMS.map((i) => ({ id: i.id, label: i.short, icon: i.icon }))} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{item.title}</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">{item.about}</p>
          </div>
          {/* all stay mounted so switching keeps pasted codes, the loaded file and the QR form */}
          <div className={clsx(section !== 'qr-read' && 'hidden')}>
            <QrRead active={active && section === 'qr-read'} onToast={onToast} />
          </div>
          <div className={clsx(section !== 'qr-make' && 'hidden')}>
            <QrMake onToast={onToast} />
          </div>
          <div className={clsx(section !== 'watane' && 'hidden')}>
            <WataneSection onToast={onToast} />
          </div>
        </div>
      </div>
    </div>
  );
}
