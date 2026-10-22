const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export const normalizeDeg = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * The compass bearing (from magnetic north) that "up" on the screen points to,
 * from a DeviceOrientation reading relative to the earth.
 *
 * Two directions are blended: the screen's top edge, which is reliable when
 * the phone lies flat, and the direction the back of the phone faces, which is
 * reliable when it's held upright. Their horizontal parts agree in between, so
 * the sum never degenerates the way either one does on its own. The back counts
 * less the flatter the phone is, so rolling a flat phone doesn't swing it.
 * `screenAngle` is screen.orientation.angle (90 when turned to landscape).
 */
export function headingFromOrientation(
  alpha: number,
  beta: number,
  gamma: number,
  screenAngle = 0,
): number | null {
  // Device frame → earth frame (x east, y north, z up) is Rz(alpha)·Rx(beta)·Ry(gamma).
  const rotate = ([x, y, z]: [number, number, number]): [number, number] => {
    const [sg, cg] = [Math.sin(toRad(gamma)), Math.cos(toRad(gamma))];
    const [sb, cb] = [Math.sin(toRad(beta)), Math.cos(toRad(beta))];
    const [sa, ca] = [Math.sin(toRad(alpha)), Math.cos(toRad(alpha))];
    const x1 = x * cg + z * sg;
    const z1 = -x * sg + z * cg;
    const y2 = y * cb - z1 * sb;
    return [x1 * ca - y2 * sa, x1 * sa + y2 * ca];
  };
  const s = toRad(screenAngle);
  const [topE, topN] = rotate([Math.sin(s), Math.cos(s), 0]);
  const [backE, backN] = rotate([0, 0, -1]);
  const upright = Math.abs(Math.sin(toRad(beta)));
  const east = topE + backE * upright;
  const north = topN + backN * upright;
  if (Math.hypot(east, north) < 1e-6) return null;
  return normalizeDeg(toDeg(Math.atan2(east, north)));
}

/**
 * Smooths a stream of headings without the 359°→0° jump a plain average would
 * make. `weight` is how much each new reading counts.
 */
export function smoothHeading(previous: number | null, next: number, weight = 0.2): number {
  if (previous === null) return next;
  const delta = ((next - previous + 540) % 360) - 180;
  return normalizeDeg(previous + delta * weight);
}
