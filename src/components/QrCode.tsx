import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * A scannable QR code as inline SVG. Always dark modules on a white field, whatever the theme,
 * because phone cameras read that most reliably.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      className={`qr ${className ?? ''}`}
      role="img"
      aria-label={label}
      // Markup comes from the qrcode library, encoding our own URL; nothing user-supplied.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
