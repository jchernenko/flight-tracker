import { useEffect, useRef } from 'react';
import type { AircraftSnapshot } from '../aircraft/useAircraft';
import { RadarRenderer } from './renderer';

type Props = { snapshot: AircraftSnapshot | undefined; rangeNm: number };

export function RadarScope({ snapshot, rangeNm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RadarRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new RadarRenderer(canvas, rangeNm);
    rendererRef.current = renderer;
    renderer.start();
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      renderer.stop();
      rendererRef.current = null;
    };
    // The renderer is created once; range and data updates go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setRange(rangeNm);
  }, [rangeNm]);

  useEffect(() => {
    if (snapshot) rendererRef.current?.setSnapshot(snapshot);
  }, [snapshot]);

  return <canvas ref={canvasRef} className="block h-full w-full" aria-label="Radar scope" />;
}
