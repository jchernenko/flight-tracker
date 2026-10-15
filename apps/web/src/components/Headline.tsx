import { RANGES_NM, type RangeNm } from '@flight/shared';

export const nextRange = (rangeNm: RangeNm): RangeNm =>
  RANGES_NM[(RANGES_NM.indexOf(rangeNm) + 1) % RANGES_NM.length]!;

type Props = {
  count: number | null;
  rangeNm: RangeNm;
  onCycleRange: () => void;
  place: string | undefined;
  /** Appended to the subline, e.g. the clock on the board. */
  suffix?: string;
  size: 'panel' | 'board';
};

/** "Overhead now", then "8 aircraft · 20 nm · Maple Ridge". Tapping the range cycles it. */
export function Headline({ count, rangeNm, onCycleRange, place, suffix, size }: Props) {
  const board = size === 'board';
  return (
    <div className="min-w-0">
      <h1
        className={`font-semibold tracking-[-0.01em] ${board ? 'text-[26px]' : 'text-[22px]'} leading-tight`}
      >
        Overhead now
      </h1>
      <p className={`mt-0.5 truncate text-muted ${board ? 'text-[14px]' : 'text-[13px]'}`}>
        {count === null ? '—' : count} aircraft ·{' '}
        <button
          type="button"
          onClick={onCycleRange}
          aria-label={`Range ${rangeNm} nautical miles. Tap to change.`}
          className="-my-3 inline-block py-3 underline decoration-dim decoration-dotted underline-offset-[3px]"
        >
          {rangeNm} nm
        </button>
        {place && ` · ${place}`}
        {suffix && ` · ${suffix}`}
      </p>
    </div>
  );
}
