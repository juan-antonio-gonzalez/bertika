import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QrImage({ text, size = 200 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let on = true;
    QRCode.toDataURL(text, { width: size * 2, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => { if (on) setSrc(url); })
      .catch(() => { if (on) setSrc(''); });
    return () => { on = false; };
  }, [text, size]);
  if (!src) return <div className="qr-empty" style={{ width: size, height: size }}>QR</div>;
  return <img src={src} alt="QR" width={size} height={size} style={{ display: 'block' }} />;
}