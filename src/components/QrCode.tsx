import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * A scannable QR code as inline SVG. Dark modules on a light field, whatever the theme, because phone
 * cameras need that contrast. The field is white unless a page asks for a softer light colour.
 */
export function QrCode({
  value,
  label,
  className,
  light = '#ffffff',
}: {
  value: string;
  label: string;
  className?: string;
  light?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: 'svg', margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light } })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [value, light]);

  return (
    <div
      className={`qr ${className ?? ''}`}
      role="img"
      aria-label={label}
      // Matches the code's own field, so no sliver of another colour shows where the SVG rounds short.
      style={{ background: light }}
      // Markup comes from the qrcode library, encoding our own URL; nothing user-supplied.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
