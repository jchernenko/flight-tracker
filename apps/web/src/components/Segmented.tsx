type Props<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: (value: T) => string;
  ariaLabel: string;
  className?: string;
};

/** A row of mutually exclusive buttons, like iOS's segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  className = '',
}: Props<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex gap-1 rounded-[12px] border border-line bg-panel p-1 ${className}`}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`h-10 flex-1 rounded-[9px] px-3 text-[14px] font-medium ${
              active ? 'bg-act-bg text-act-fg' : 'text-in-fg'
            }`}
          >
            {label(option)}
          </button>
        );
      })}
    </div>
  );
}
