export type Ecc = 'L' | 'M' | 'Q' | 'H';

/** QR code as a PNG data URL; the encoder loads on first use */
export async function qrPng(text: string, ecc: Ecc, size = 640): Promise<string> {
  const { toDataURL } = await import('qrcode');
  return toDataURL(text, { errorCorrectionLevel: ecc, margin: 2, width: size, color: { dark: '#000000', light: '#ffffff' } });
}

/** put a PNG data URL on the clipboard as an image */
export async function copyPng(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
