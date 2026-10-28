import clsx from 'clsx';
import { CameraOff, Loader2, MonitorUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { readQr } from '../../lib/otp';

/** Live camera preview that calls onText as soon as a QR code is readable. */
export function QrScanner({ onText }: { onText: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'live' | 'error'>('starting');
  const [err, setErr] = useState('');
  const done = useRef(onText);
  done.current = onText;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setState('live');
        const tick = () => {
          if (stopped) return;
          if (v.videoWidth) {
            // scan a centred square, scaled down — enough for a phone-held QR and much faster
            const side = Math.min(v.videoWidth, v.videoHeight);
            canvas.width = canvas.height = Math.min(640, side);
            ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
            const text = readQr(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (text) {
              done.current(text);
              return;
            }
          }
          timer = window.setTimeout(tick, 200);
        };
        tick();
      } catch (e) {
        const name = (e as DOMException).name;
        setErr(
          name === 'NotAllowedError'
            ? 'Trình duyệt chưa được phép dùng camera — bấm biểu tượng camera trên thanh địa chỉ để cho phép.'
            : name === 'NotFoundError'
              ? 'Không tìm thấy camera trên máy này.'
              : 'Không mở được camera.',
        );
        setState('error');
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (state === 'error')
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">
        <CameraOff size={22} className="text-faint" />
        {err}
        <span className="text-[12px] text-faint">Có thể dùng “Ảnh / dán” hoặc “Nhập tay” thay thế.</span>
      </div>
    );
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-xl bg-black">
      <video ref={video} muted playsInline className="size-full object-cover" />
      {/* viewfinder */}
      <div className="pointer-events-none absolute inset-[14%] rounded-2xl shadow-[0_0_0_9999px_rgb(0_0_0/0.45)] ring-2 ring-white/80" />
      <div className="pointer-events-none absolute inset-x-[14%] h-0.5 animate-[qr-scan_2s_ease-in-out_infinite] bg-accent shadow-[0_0_12px_var(--accent)]" />
      {state === 'starting' && (
        <div className="absolute inset-0 grid place-items-center text-[13px] text-white/80">
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Đang mở camera…
          </span>
        </div>
      )}
      <p className="absolute inset-x-0 bottom-2 text-center text-[11.5px] text-white/80">Đưa mã QR vào giữa khung</p>
    </div>
  );
}

/**
 * Scan a QR shown somewhere on screen (another tab, the authenticator extension, any window):
 * the browser asks which tab / window / screen to share, frames are scanned until a code is
 * found, then sharing stops at once.
 */
export function ScreenQrScanner({ onText }: { onText: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'idle' | 'live' | 'error'>('idle');
  const [err, setErr] = useState('');
  const stop = useRef<() => void>(() => {});
  const done = useRef(onText);
  done.current = onText;
  useEffect(() => () => stop.current(), []);

  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
        // Chrome hints: offer other tabs first, never this one
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      } as DisplayMediaStreamOptions);
      let timer = 0;
      let stopped = false;
      stop.current = () => {
        stopped = true;
        clearTimeout(timer);
        stream.getTracks().forEach((t) => t.stop());
      };
      // the user can also end sharing from the browser's own bar
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (!stopped) setState('idle');
        stop.current();
      });
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      setState('live');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const tick = () => {
        if (stopped) return;
        if (v.videoWidth) {
          // full frame first (small QR on a big screen), then smaller sizes jsQR handles better
          for (const max of [2400, 1400, 800]) {
            const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const text = readQr(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (text) {
              stop.current();
              setState('idle');
              done.current(text);
              return;
            }
          }
        }
        timer = window.setTimeout(tick, 400);
      };
      tick();
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === 'NotAllowedError' || name === 'AbortError') return setState('idle'); // picker cancelled
      setErr(name === 'NotSupportedError' || !navigator.mediaDevices?.getDisplayMedia ? 'Trình duyệt này không hỗ trợ chia sẻ màn hình.' : 'Không chia sẻ màn hình được.');
      setState('error');
    }
  };

  return (
    <div className="space-y-2">
      <div className={clsx('relative overflow-hidden rounded-xl border border-line bg-surface-2', state === 'live' ? 'aspect-video' : 'hidden')}>
        <video ref={video} muted playsInline className="size-full object-contain" />
        <p className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/55 py-1.5 text-[12px] text-white">
          <Loader2 size={13} className="animate-spin" /> Đang tìm mã QR… mở trang / extension có mã QR trong cửa sổ đang chia sẻ
        </p>
      </div>
      {state === 'live' ? (
        <Button size="sm" variant="ghost" onClick={() => (stop.current(), setState('idle'))}>
          Dừng chia sẻ
        </Button>
      ) : (
        <button
          type="button"
          onClick={start}
          className="focus-ring flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-6 py-7 text-center transition-colors hover:border-accent/50 hover:bg-accent-soft/40"
        >
          <MonitorUp size={24} className="text-accent" />
          <span className="text-[13.5px] font-medium text-fg">Chọn tab hoặc cửa sổ đang hiện mã QR</span>
          <span className="max-w-sm text-[12px] text-muted">
            Vd: tab hệ thống đang hiện QR cài 2FA, hoặc cửa sổ extension Authenticator. Đọc được mã là tự dừng chia sẻ — không có gì được ghi lại hay gửi đi.
          </span>
        </button>
      )}
      {err && <p className="text-[12.5px] text-error">{err}</p>}
    </div>
  );
}
