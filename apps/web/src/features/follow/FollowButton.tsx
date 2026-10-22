import { bearingText } from '../aircraft/format';
import { useRoundedHeading, type Follow } from './useFollowMe';

function statusText(follow: Follow, heading: number | null): string {
  if (follow.locationError === 'denied') return 'Location blocked · showing home';
  if (follow.locationError === 'unavailable' && !follow.position)
    return 'No GPS fix · showing home';
  if (!follow.position) return 'Finding you…';
  if (follow.compass === 'ok' && heading !== null) return `Facing ${bearingText(heading)}`;
  if (follow.compass === 'waiting') return 'Reading compass…';
  return 'No compass · north up';
}

/** Turns follow mode on (GPS centre, compass heading-up) and shows what it's doing. */
export function FollowButton({ follow, className = '' }: { follow: Follow; className?: string }) {
  const heading = useRoundedHeading(follow.heading);
  return (
    <button
      type="button"
      aria-pressed={follow.on}
      onClick={follow.on ? follow.stop : follow.start}
      className={`flex h-11 items-center gap-2 rounded-[12px] border px-4 text-[14px] font-medium ${
        follow.on ? 'border-text2 bg-act-bg text-act-fg' : 'border-line bg-panel text-text2'
      } ${className}`}
    >
      <LocateIcon />
      <span className={follow.on ? 'font-mono' : ''}>
        {follow.on ? statusText(follow, heading) : 'Use my location'}
      </span>
    </button>
  );
}

const LocateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    <path d="M8 0.5v3M8 12.5v3M0.5 8h3M12.5 8h3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
