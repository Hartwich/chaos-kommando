import Phaser from "phaser";
import type { ChaosKommandoState } from "../protocol.js";

interface TrailPoint { x: number; y: number; at: number }
interface DamageLabel { text: Phaser.GameObjects.Text; x: number; y: number; at: number }

/** Presentation-only history: the authoritative positions and HP come from the server. */
export class ChaosKommandoBattleEffects {
  private trails = new Map<string, TrailPoint[]>();
  private health = new Map<string, number>();
  private damage: DamageLabel[] = [];
  private explosions = new Set<string>();
  private graphics: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(10);
  }

  update(state: ChaosKommandoState, now: number): void {
    this.graphics.clear();
    const live = new Set(state.projectiles.map((p) => p.id));
    for (const [id, points] of this.trails) {
      const fresh = points.filter((point) => now - point.at < 650);
      if (!fresh.length && !live.has(id)) this.trails.delete(id);
      else this.trails.set(id, fresh);
    }
    for (const projectile of state.projectiles) {
      const points = this.trails.get(projectile.id) ?? [];
      const previous = points[points.length - 1];
      if (!previous || Math.hypot(previous.x - projectile.x, previous.y - projectile.y) > 5) {
        points.push({ x: projectile.x, y: projectile.y, at: now });
      }
      if (points.length > 80) points.shift();
      this.trails.set(projectile.id, points);
      const bullet = ["plunder-pistole", "minigun", "konfetti-schrot"].includes(projectile.weaponId);
      for (let i = 1; i < points.length; i++) {
        const p = points[i]; const before = points[i - 1];
        const fade = Math.max(0, 1 - (now - p.at) / (bullet ? 100 : 650));
        if (bullet) {
          this.graphics.lineStyle(2, 0xfff3a8, fade * 0.85);
          this.graphics.lineBetween(before.x, before.y, p.x, p.y);
        } else {
          this.graphics.fillStyle(0xf1eee2, fade * 0.38);
          this.graphics.fillCircle(p.x, p.y, 3 + (1 - fade) * 9);
        }
      }
    }
    for (const player of state.players) for (const unit of player.mercenaries) {
      const previous = this.health.get(unit.id);
      if (previous !== undefined && unit.hp < previous) {
        const text = this.scene.add.text(unit.x, unit.y - 65, `-${previous - unit.hp}`, {
          fontFamily: '"Oxanium", Arial, sans-serif', fontSize: "30px", fontStyle: "bold",
          color: "#fff5d8", stroke: "#60271e", strokeThickness: 5
        }).setOrigin(0.5).setDepth(35);
        this.damage.push({ text, x: unit.x, y: unit.y - 65, at: now });
      }
      this.health.set(unit.id, unit.hp);
    }
    this.damage = this.damage.filter((label) => {
      const progress = (now - label.at) / 1400;
      if (progress >= 1) { label.text.destroy(); return false; }
      label.text.setPosition(label.x, label.y - progress * 65).setAlpha(Math.min(1, (1 - progress) * 2));
      return true;
    });
    const explosionIds = new Set(state.explosions.map((e) => e.id));
    for (const id of this.explosions) if (!explosionIds.has(id)) this.explosions.delete(id);
    for (const explosion of state.explosions) {
      if (!this.explosions.has(explosion.id)) {
        this.explosions.add(explosion.id);
        if (explosion.radius > 70) this.scene.cameras.main.shake(160, Math.min(0.004, explosion.radius / 50000));
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
    for (const label of this.damage) label.text.destroy();
    this.damage = []; this.trails.clear(); this.health.clear(); this.explosions.clear();
  }
}
