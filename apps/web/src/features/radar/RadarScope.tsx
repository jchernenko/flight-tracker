import { useEffect, useRef, type MouseEvent } from 'react';
import type { AircraftSnapshot } from '../aircraft/useAircraft';
import type { Theme } from '../../lib/theme';
import { RadarRenderer } from './renderer';

type Props = {
  snapshot: AircraftSnapshot | undefined;
  rangeNm: number;
  theme: Theme;
  selectedHex: string | null;
  stale: boolean;
  acquiring: boolean;
  /** Called with the tapped aircraft, or null for a tap on empty scope. */
  onSelect: (hex: string | null) => void;
};

export function RadarScope({
  snapshot,
  rangeNm,
  theme,
  selectedHex,
  stale,
  acquiring,
  onSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RadarRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new RadarRenderer(canvas, rangeNm, theme);
    rendererRef.current = renderer;
    renderer.start();
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);
    // Tag widths are measured with the web fonts, which may arrive after the first frame.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) renderer.resize();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
      renderer.stop();
      rendererRef.current = null;
    };
    // The renderer is created once; settings and data go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => rendererRef.current?.setRange(rangeNm), [rangeNm]);
  useEffect(() => rendererRef.current?.setTheme(theme), [theme]);
  useEffect(() => rendererRef.current?.setSelected(selectedHex), [selectedHex]);
  useEffect(() => rendererRef.current?.setStale(stale), [stale]);
  useEffect(() => rendererRef.current?.setAcquiring(acquiring), [acquiring]);
  useEffect(() => {
    if (snapshot) rendererRef.current?.setSnapshot(snapshot);
  }, [snapshot]);

  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const hex = rendererRef.current?.hitTest(e.clientX - rect.left, e.clientY - rect.top) ?? null;
    onSelect(hex !== null && hex === selectedHex ? null : hex);
  };

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full"
      aria-label="Radar scope"
      onClick={handleClick}
    />
  );
}
