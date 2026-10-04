/** A pencil, marking something the organizer can tap to change. */
export function EditIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M15.2 4.2l4.6 4.6L8.6 20H4v-4.6zm2.1-2.1 1.4-1.4a1.5 1.5 0 0 1 2.1 0l2.5 2.5a1.5 1.5 0 0 1 0 2.1l-1.4 1.4z" />
    </svg>
  );
}
