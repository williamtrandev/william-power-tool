import clsx from 'clsx';
import { Camera, ClipboardPaste, ImageUp, Keyboard, Loader2, MonitorUp, RotateCcw, ScanLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { QrScanner, ScreenQrScanner } from '../../../components/QrScanner';
import { Button, Segmented } from '../../../components/ui';
import { readQrFile } from '../../../lib/otp';
import { QrResult } from './QrResult';

type Source = 'image' | 'screen' | 'camera' | 'text';
const canShareScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
const isMac = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform);

/** read a QR from an image (pick, drop, paste), a shared screen, the camera, or a string already in hand */
export function QrRead({ active, onToast }: { active: boolean; onToast: (m: string) => void }) {
  const [src, setSrc] = useState<Source>('image');
  const [text, setText] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  // remounts the camera / screen scanner for another code
  const [scan, setScan] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const found = (t: string) => {
    setErr(null);
    setText(t);
  };
  const fromFile = async (f: Blob) => {
    setBusy(true);
    setErr(null);
    setImage((old) => (old && URL.revokeObjectURL(old), URL.createObjectURL(f)));
    try {
      found(await readQrFile(f));
    } catch (e) {
      setText(null);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // a pasted screenshot (or a QR string, outside text boxes) works anywhere on the page
  useEffect(() => {
    if (!active) return;
    const onPaste = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (img) {
        e.preventDefault();
        setSrc('image');
        fromFile(img);
        return;
      }
      const el = e.target as HTMLElement;
      const str = e.clipboardData?.getData('text').trim();
      if (str && !/^(INPUT|TEXTAREA)$/.test(el.tagName) && !el.isContentEditable) {
        setSrc('text');
        setTyped(str);
        found(str);
      }
    };
    addEventListener('paste', onPaste);
    return () => removeEventListener('paste', onPaste);
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section data-tour="qr-sources" className="space-y-3">
        <Segmented
          label="Đọc từ"
          value={src}
          onChange={(v) => {
            setSrc(v);
            setErr(null);
          }}
          items={[
            { id: 'image', label: 'Ảnh', icon: <ImageUp size={15} /> },
            ...(canShareScreen ? [{ id: 'screen' as const, label: 'Màn hình', icon: <MonitorUp size={15} /> }] : []),
            { id: 'camera', label: 'Camera', icon: <Camera size={15} /> },
            { id: 'text', label: 'Dán chuỗi', icon: <Keyboard size={15} /> },
          ]}
        />

        {src === 'image' && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) fromFile(f);
            }}
            className={clsx(
              'focus-ring flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
              drag ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2/50',
            )}
          >
            {image ? (
              <img src={image} alt="Ảnh vừa đọc" className="max-h-48 max-w-full rounded-lg object-contain" />
            ) : busy ? (
              <Loader2 size={24} className="animate-spin text-accent" />
            ) : (
              <ScanLine size={24} className="text-accent" />
            )}
            <span className="text-[13.5px] font-medium text-fg">{busy ? 'Đang đọc mã QR…' : image ? 'Chọn ảnh khác' : 'Chọn hoặc kéo thả ảnh có mã QR'}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              <ClipboardPaste size={13} /> Hoặc chụp màn hình rồi nhấn <b className="text-fg-2">{isMac ? '⌘' : 'Ctrl'} + V</b>
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) fromFile(f);
              }}
            />
          </button>
        )}
        {src === 'screen' && <ScreenQrScanner key={scan} onText={found} />}
        {src === 'camera' && active && <QrScanner key={scan} onText={found} />}
        {(src === 'screen' || src === 'camera') && text && (
          <Button size="sm" variant="ghost" onClick={() => setScan((n) => n + 1)}>
            <RotateCcw size={14} /> Quét mã khác
          </Button>
        )}
        {src === 'text' && (
          <textarea
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              if (e.target.value.trim()) found(e.target.value.trim());
              else setText(null);
            }}
            rows={5}
            spellCheck={false}
            aria-label="Chuỗi QR"
            placeholder={'Dán chuỗi QR lấy từ log hoặc API, vd:\n00020101021238570010A000000727…6304ABCD'}
            className="w-full resize-y rounded-xl border border-line bg-surface p-3 font-mono text-[12.5px] leading-relaxed text-fg outline-none placeholder:font-sans placeholder:text-faint focus:border-accent/60"
          />
        )}
        {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-[12.5px] text-error">{err}</p>}
      </section>

      <section data-tour="qr-result" className="min-w-0">
        {text ? (
          <QrResult text={text} onToast={onToast} />
        ) : (
          <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-line px-6 text-center text-[12.5px] text-faint">
            Nội dung mã QR sẽ hiện ở đây. Mã VietQR được tách ngân hàng, số tài khoản, số tiền, nội dung và kiểm tra CRC.
          </div>
        )}
      </section>
    </div>
  );
}
