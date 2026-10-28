import { platformContains } from "../terrainGeometry.js";
import type { ChaosKommandoState, ChaosKommandoTerrainState } from "../protocol.js";

interface Position { x: number; y: number }

/** Smooth snapshots for rendering only. Never writes to gameplay state. */
export class CharacterPresentation {
  private positions = new Map<string, Position>();
  private lastAt = 0;

  sample(state: ChaosKommandoState, now: number): ChaosKommandoState {
    const dt = this.lastAt ? Math.max(0, Math.min(50, now - this.lastAt)) : 16;
    this.lastAt = now;
    const blend = 1 - Math.exp(-dt / 34);
    const live = new Set<string>();
    const players = state.players.map((player) => ({ ...player, mercenaries: player.mercenaries.map((unit) => {
      live.add(unit.id);
      const old = this.positions.get(unit.id);
      const snap = !old || Math.hypot(old.x - unit.x, old.y - unit.y) > 180;
      const position = snap ? { x: unit.x, y: unit.y }
        : { x: old.x + (unit.x - old.x) * blend, y: old.y + (unit.y - old.y) * blend };
      this.positions.set(unit.id, position);
      return { ...unit, ...position };
    }) }));
    for (const id of this.positions.keys()) if (!live.has(id)) this.positions.delete(id);
    return { ...state, players };
  }

  clear(): void { this.positions.clear(); this.lastAt = 0; }
}

/** A local foot probe follows a slope or crater lip; it cannot jump to another ledge. */
export function resolveFootSurface(terrain: ChaosKommandoTerrainState, x: number, nearY: number): number | null {
  if (x < 0 || x > terrain.width) return null;
  const i = Math.min(terrain.samples.length - 1, Math.max(0, x / terrain.sampleSpacing));
  const n = Math.floor(i);
  const height = terrain.samples[n] * (1 - (i - n)) + (terrain.samples[Math.min(n + 1, terrain.samples.length - 1)] ?? terrain.height) * (i - n);
  const solid = (y: number): boolean => {
    const mass = y >= height || terrain.platforms.some((p) => platformContains(p, x, y));
    return mass && !terrain.craters.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r ** 2);
  };
  for (let y = nearY - 16; y <= nearY + 16; y += 1) if (solid(y) && !solid(y - 1)) return y;
  return null;
}
