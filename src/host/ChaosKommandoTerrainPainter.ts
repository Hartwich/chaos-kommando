import { platformSurfaceY } from "../terrainGeometry.js";
import type { ChaosKommandoTerrainState } from "../protocol.js";

type Terrain = Pick<ChaosKommandoTerrainState, "width" | "height" | "samples" | "sampleSpacing" | "craters" | "platforms">;
const noise = (seed: number): number => { const n = Math.sin(seed * 12.9898) * 43758.5453; return n - Math.floor(n); };
interface SpriteBounds { x: number; y: number; width: number; height: number; ground: number }
const spriteBounds = new WeakMap<HTMLImageElement, SpriteBounds>();

/** Read alpha bounds once so transparent export margins do not alter in-game scale. */
function boundsOf(image: HTMLImageElement): SpriteBounds {
  const cached = spriteBounds.get(image);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
  const rows = new Uint32Array(canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (data[(y * canvas.width + x) * 4 + 3] < 32) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    rows[y]++;
  }
  const width = Math.max(1, right - left + 1), height = Math.max(1, bottom - top + 1);
  let ground = height * 0.3;
  for (let y = top; y <= bottom; y++) if (rows[y] > width * 0.68) { ground = y - top; break; }
  const bounds = { x: left, y: top, width, height, ground };
  spriteBounds.set(image, bounds);
  return bounds;
}

/** Paint the actual collision silhouette, including holes; foliage is decoration. */
export function paintCoastalTerrain(ctx: CanvasRenderingContext2D, terrain: Terrain, rock?: HTMLImageElement,
  foliage: { grass?: HTMLImageElement; palm?: HTMLImageElement } = {}): void {
  const surface = (x: number): number => {
    const t = Math.max(0, Math.min(terrain.samples.length - 1, x / terrain.sampleSpacing));
    const i = Math.floor(t);
    return terrain.samples[i] * (1 - (t - i)) + (terrain.samples[Math.min(i + 1, terrain.samples.length - 1)] ?? terrain.height) * (t - i);
  };
  const outline = (): void => {
    ctx.moveTo(0, terrain.height);
    terrain.samples.forEach((y, i) => ctx.lineTo(i * terrain.sampleSpacing, y));
    ctx.lineTo(terrain.width, terrain.height); ctx.closePath();
    for (const p of terrain.platforms) {
      if (p.contour) {
        p.contour.forEach((point, i) => { const x = p.x + point.x * p.rx, y = p.y + point.y * p.ry;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.closePath();
      } else { ctx.moveTo(p.x + p.rx, p.y); ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2); }
    }
  };
  const untouched = (x: number, y: number): boolean => !terrain.craters.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + 3);
  ctx.save(); ctx.clearRect(0, 0, terrain.width, terrain.height);
  ctx.beginPath(); outline();
  const stone = ctx.createLinearGradient(0, 350, 0, terrain.height);
  stone.addColorStop(0, "#e9bc74"); stone.addColorStop(0.55, "#bd884d"); stone.addColorStop(1, "#77543d");
  ctx.fillStyle = stone; ctx.fill();
  ctx.save(); ctx.clip();
  if (rock) {
    const pattern = ctx.createPattern(rock, "repeat");
    if (pattern) {
      pattern.setTransform(new DOMMatrix().scale(0.34)); ctx.globalAlpha = 0.57;
      ctx.fillStyle = pattern; ctx.fillRect(0, 0, terrain.width, terrain.height); ctx.globalAlpha = 1;
    }
  }
  // Uneven seams and shaded bases make the islands read as rock, not tiled bricks.
  for (let band = 0; band < 13; band++) {
    const y = 350 + band * 58;
    ctx.strokeStyle = band % 2 ? "rgba(91,58,35,0.28)" : "rgba(255,223,154,0.26)";
    ctx.lineWidth = 3 + noise(band + 0.7) * 7; ctx.beginPath();
    for (let x = 0; x <= terrain.width; x += 12) {
      const sy = y + Math.sin(x / 115 + band * 2) * 8 + Math.cos(x / 47 + band) * 3;
      if (x === 0) ctx.moveTo(x, sy); else ctx.lineTo(x, sy);
    }
    ctx.stroke();
  }
  const shade = ctx.createLinearGradient(0, 560, 0, terrain.height);
  shade.addColorStop(0, "rgba(60,53,42,0)"); shade.addColorStop(1, "rgba(45,55,49,0.48)");
  ctx.fillStyle = shade; ctx.fillRect(0, 0, terrain.width, terrain.height);
  ctx.restore();
  // A dark stone outline follows cliffs. Grass grows only on upward-facing ledges.
  ctx.beginPath(); outline(); ctx.strokeStyle = "#845e3b"; ctx.lineWidth = 4; ctx.stroke();
  const grass = (x: number, y: number, slope: number): void => {
    if (y > terrain.height - 180 || Math.abs(slope) > 0.9) return;
    if (foliage.grass) {
      const bounds = boundsOf(foliage.grass);
      const height = 64, scale = height / bounds.height;
      const sourceWidth = 8 / scale;
      const sourceX = ((x / scale) % Math.max(1, bounds.width - sourceWidth));
      ctx.drawImage(foliage.grass, bounds.x + sourceX, bounds.y, sourceWidth, bounds.height,
        x - 4, y - bounds.ground * scale, 8.5, height);
      return;
    }
    const n = noise(x * 0.167 + y);
    ctx.fillStyle = "#365f36"; ctx.beginPath(); ctx.ellipse(x, y + 5, 9, 12 + n * 7, slope * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = n > 0.55 ? "#638c35" : "#84a63f";
    ctx.beginPath(); ctx.ellipse(x, y - 1, 9, 5 + n * 4, slope * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = n > 0.5 ? "#cad76d" : "#9bbb4a"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x - 4, y - 1); ctx.quadraticCurveTo(x - 7, y - 10 - n * 6, x - 10, y - 10);
    ctx.moveTo(x + 2, y - 1); ctx.quadraticCurveTo(x + 3, y - 13 - n * 7, x + 8, y - 16 - n * 5); ctx.stroke();
    if (n > 0.94) { ctx.fillStyle = "#f5d26b"; ctx.beginPath(); ctx.arc(x, y - 9, 3, 0, Math.PI * 2); ctx.fill(); }
  };
  for (let x = 4; x < terrain.width; x += 8) grass(x, surface(x), (surface(x + 6) - surface(x - 6)) / 12);
  for (const p of terrain.platforms) for (let x = p.x - p.rx + 6; x < p.x + p.rx - 6; x += 8) {
    const y = platformSurfaceY(p, x), left = platformSurfaceY(p, x - 4), right = platformSurfaceY(p, x + 4);
    if (y !== null && left !== null && right !== null) grass(x, y, (right - left) / 8);
  }
  // Sparse palms establish the scale of the scene. Destroying the root removes the tree.
  for (const x of [180, 945, 1770]) {
    const y = surface(x);
    if (y >= terrain.height - 220 || !untouched(x, y + 12)) continue;
    if (foliage.palm) {
      const bounds = boundsOf(foliage.palm);
      const height = 148 + noise(x) * 28;
      const width = height * bounds.width / bounds.height;
      ctx.drawImage(foliage.palm, bounds.x, bounds.y, bounds.width, bounds.height,
        x - width * 0.5, y - height + 10, width, height);
      continue;
    }
    const lean = noise(x) > 0.5 ? 20 : -20;
    const height = 92 + noise(x + 1) * 28;
    ctx.strokeStyle = "#60472c"; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(x, y + 3);
    ctx.quadraticCurveTo(x + lean * 0.2, y - height * 0.55, x + lean, y - height); ctx.stroke();
    ctx.strokeStyle = "#b89352"; ctx.lineWidth = 6; ctx.stroke();
    const cx = x + lean, cy = y - height;
    for (let i = 0; i < 7; i++) {
      const angle = Math.PI + i * Math.PI / 6;
      const dx = Math.cos(angle) * (43 + noise(i + x) * 18);
      const dy = Math.sin(angle) * 32 + 23;
      ctx.fillStyle = i % 2 ? "#3b783d" : "#5d9741"; ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + dx * 0.4, cy - 22, cx + dx, cy + dy);
      ctx.quadraticCurveTo(cx + dx * 0.45, cy + 6, cx, cy); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "destination-out";
  for (const c of terrain.craters) { ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill(); }
  // Initial arches are clean rock; blast edges are charred. Draw shading only on surviving solid pixels.
  ctx.globalCompositeOperation = "source-atop";
  for (const c of terrain.craters) {
    const rim = ctx.createRadialGradient(c.x, c.y, Math.max(1, c.r - 1), c.x, c.y, c.r + 12);
    rim.addColorStop(0, c.r > 85 ? "rgba(65,49,32,0.5)" : "rgba(42,35,28,0.7)"); rim.addColorStop(1, "rgba(65,49,32,0)");
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
