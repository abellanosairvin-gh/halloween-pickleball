/**
 * The address the QR code points to. Set VITE_PUBLIC_URL to the deployed site (for example
 * https://halloween-pickleball.vercel.app) so a QR printed from any computer goes to the live site.
 */
const configured = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim().replace(/\/+$/, '');

export function partyUrl(): string {
  return `${configured || window.location.origin}/party`;
}

/** True when the QR would point at this computer, which guests' phones can't reach. */
export function partyUrlIsLocal(): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(partyUrl());
}
