import type { ReactNode } from 'react';
import type { Aircraft } from '@flight/shared';
import type { Status } from '../features/aircraft/status';
import { ident, squawkMeaning } from '../features/aircraft/format';

/** Overlays sit above Leaflet's panes (z-index up to 800) and controls (1000). */
const Z = 'z-[1100]';

export function AltitudeLegend() {
  return (
    <div className={`pointer-events-none absolute bottom-[26px] left-7 w-[220px] ${Z}`} aria-hidden>
      <div className="altitude-gradient h-1 rounded-[2px]" />
      <div className="mt-2 flex justify-between font-mono text-[11px] text-dim">
        <span>0</span>
        <span>20k</span>
        <span>40k ft</span>
      </div>
    </div>
  );
}

/** A line of text just below the home point, centred on the scope. */
export function ScopeMessage({ children }: { children: string }) {
  return (
    <p
      className={`pointer-events-none absolute inset-x-0 top-[calc(50%+18px)] text-center text-[16px] font-medium text-text2 ${Z}`}
    >
      {children}
    </p>
  );
}

function Banner({ alert, children }: { alert?: boolean; children: ReactNode }) {
  return (
    <div
      role={alert ? 'alert' : 'status'}
      className={`flex h-11 items-center gap-2 rounded-[12px] border px-4 text-[14px] ${
        alert ? 'border-alert bg-alert-t font-medium text-alert' : 'border-line bg-panel text-text2'
      }`}
    >
      {children}
    </div>
  );
}

const HollowDot = () => (
  <span className="size-[7px] shrink-0 rounded-full border-[1.5px] border-muted" />
);

type BannersProps = { status: Status; emergencies: Aircraft[]; feed: string | undefined };

/** Emergencies, a stale picture or an offline feed, stacked at the top of the scope area. */
export function ScopeBanners({ status, emergencies, feed }: BannersProps) {
  if (emergencies.length === 0 && status.kind !== 'stale' && status.kind !== 'offline') return null;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center gap-2 px-6 ${Z}`}
    >
      {emergencies.map((a) => (
        <Banner key={a.hex} alert>
          {ident(a)} is squawking {a.squawk} · {squawkMeaning(a.squawk)}
        </Banner>
      ))}
      {status.kind === 'stale' && (
        <Banner>
          <HollowDot />
          Showing the {status.time} picture · feed not responding
        </Banner>
      )}
      {status.kind === 'offline' && (
        <Banner alert>
          <span className="size-[7px] shrink-0 rounded-full bg-alert" />
          Feed offline · can&apos;t reach {feed ?? 'the feed'} · retrying
        </Banner>
      )}
    </div>
  );
}
