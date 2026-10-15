type Props = {
  rangeNm: number;
  onCycleRange: () => void;
  view: 'radar' | 'board';
  onToggleView: () => void;
  count: number | null;
  status: { label: string; tone: 'ok' | 'warn' | 'alert' };
};

const toneClass = { ok: 'text-amber-dim', warn: 'text-amber', alert: 'text-alert' } as const;

const buttonClass =
  'pointer-events-auto rounded border border-amber-border bg-scope-bg/80 px-3 py-2 text-sm tracking-widest text-amber-bright uppercase active:bg-amber-border';

/** Corner readouts and the two controls: range and view. */
export function StatusOverlay({ rangeNm, onCycleRange, view, onToggleView, count, status }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 font-mono">
      <div className="flex justify-between gap-2">
        <button type="button" className={buttonClass} onClick={onCycleRange}>
          RNG {rangeNm} NM
        </button>
        <button type="button" className={buttonClass} onClick={onToggleView}>
          {view === 'radar' ? 'Board' : 'Radar'}
        </button>
      </div>
      <div className="flex items-end justify-between gap-2 text-sm tracking-widest uppercase">
        <span className="text-amber-dim">{count === null ? '' : `${count} AC`}</span>
        <span className={toneClass[status.tone]}>{status.label}</span>
      </div>
    </div>
  );
}
