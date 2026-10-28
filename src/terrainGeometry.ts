import type { ChaosKommandoPlatformState } from "./protocol.js";

export function platformContains(p: ChaosKommandoPlatformState, x: number, y: number): boolean {
  const nx = (x - p.x) / p.rx, ny = (y - p.y) / p.ry;
  if (!p.contour) return nx * nx + ny * ny < 1;
  let inside = false;
  for (let i = 0, j = p.contour.length - 1; i < p.contour.length; j = i++) {
    const a = p.contour[i], b = p.contour[j];
    if ((a.y > ny) !== (b.y > ny) && nx < (b.x - a.x) * (ny - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function platformSurfaceY(p: ChaosKommandoPlatformState, x: number): number | null {
  const nx = (x - p.x) / p.rx;
  if (Math.abs(nx) >= 1) return null;
  if (!p.contour) return p.y - p.ry * Math.sqrt(1 - nx * nx);
  let top = Infinity;
  for (let i = 0, j = p.contour.length - 1; i < p.contour.length; j = i++) {
    const a = p.contour[i], b = p.contour[j];
    if ((a.x <= nx && nx < b.x) || (b.x <= nx && nx < a.x)) {
      top = Math.min(top, a.y + (nx - a.x) * (b.y - a.y) / (b.x - a.x));
    }
  }
  return Number.isFinite(top) ? p.y + top * p.ry : null;
}
