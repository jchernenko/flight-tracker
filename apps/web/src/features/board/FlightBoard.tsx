import type { Aircraft } from '@flight/shared';

function detailLine(a: Aircraft): string {
  const parts: string[] = [];
  if (a.airline) parts.push(a.flightNumber ? `${a.airline} · Flight ${a.flightNumber}` : a.airline);
  else if (a.registration) parts.push(a.registration);
  if (a.route) parts.push(`${a.route.origin} → ${a.route.destination}`);
  if (a.typeName) parts.push(a.typeName);
  if (a.military) parts.push('MIL');
  return parts.join(' · ');
}

const pad = (n: number | null, width: number) =>
  n === null ? '-'.repeat(width) : String(Math.round(n)).padStart(width, '0');

export function FlightBoard({ aircraft }: { aircraft: Aircraft[] }) {
  if (aircraft.length === 0) {
    return <p className="py-16 text-center text-amber-muted italic">NO AIRCRAFT IN RANGE</p>;
  }

  const sorted = [...aircraft].sort((a, b) => (b.altitudeFt ?? -1) - (a.altitudeFt ?? -1));

  return (
    <div className="mx-auto w-full max-w-4xl rounded border-2 border-amber-border bg-[#0a0a0a] p-4">
      <div className="grid grid-cols-[2fr_2fr_2fr_1fr] gap-4 border-b-2 border-amber pb-2 text-sm tracking-widest text-amber-bright uppercase">
        <div>Callsign</div>
        <div>Alt (ft)</div>
        <div>Spd (kt)</div>
        <div>Hdg</div>
      </div>
      {sorted.map((a) => {
        const detail = detailLine(a);
        return (
          <div key={a.hex} className="border-b border-amber-border py-3 last:border-b-0">
            <div className="grid grid-cols-[2fr_2fr_2fr_1fr] gap-4 text-2xl font-bold tabular-nums">
              <div>{a.callsign ?? a.registration ?? a.hex.toUpperCase()}</div>
              <div>{a.onGround ? 'GND' : pad(a.altitudeFt, 5)}</div>
              <div>{pad(a.groundSpeedKt, 3)}</div>
              <div>{a.trackDeg === null ? '---' : `${pad(a.trackDeg, 3)}°`}</div>
            </div>
            {detail && <div className="mt-1 text-sm text-amber-muted">{detail}</div>}
          </div>
        );
      })}
    </div>
  );
}
