import { useCallback, useState } from 'react';
import { readStored, writeStored } from '../lib/storage';

/** useState backed by localStorage. `parse` returns null for missing or invalid stored values. */
export function usePersistentState<T extends string | number>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | null,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = readStored(key);
    return (raw !== null ? parse(raw) : null) ?? fallback;
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      writeStored(key, String(next));
    },
    [key],
  );

  return [value, update];
}
