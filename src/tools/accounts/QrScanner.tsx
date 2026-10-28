import { CameraOff, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
