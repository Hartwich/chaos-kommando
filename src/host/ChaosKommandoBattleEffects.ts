import Phaser from "phaser";
import { directFireWeapons, heldGunWeapons } from "../combatGeometry.js";
import type { ChaosKommandoState, ChaosKommandoWeaponAction } from "../protocol.js";

interface TrailPoint { x: number; y: number; at: number }
interface Trail { points: TrailPoint[]; bullet: boolean }
interface DamageLabel { text: Phaser.GameObjects.Text; x: number; y: number; at: number }
interface Flash { shot: ChaosKommandoWeaponAction; at: number }
interface Dust { x: number; y: number; at: number }

/** Presentation-only history: positions, attack events and HP come from the server. */
export class ChaosKommandoBattleEffects {
  private trails = new Map<string, Trail>();
  private health = new Map<string, number>();
  private feet = new Map<string, { grounded: boolean; x: number }>();
  private damage: DamageLabel[] = [];
  private explosions = new Set<string>();
  private seenShots = new Set<string>();
  private flashes: Flash[] = [];
  private dust: Dust[] = [];
  private initialized = false;
  private graphics: Phaser.GameObjects.Graphics;
  private foreground: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(10);
    this.foreground = scene.add.graphics().setDepth(26);
  }

  update(state: ChaosKommandoState, now: number): void {
    this.graphics.clear(); this.foreground.clear();
    const liveShots = new Set(state.weaponActions.map((shot) => shot.id));
    for (const id of this.seenShots) if (!liveShots.has(id)) this.seenShots.delete(id);
    for (const shot of state.weaponActions) if (!this.seenShots.has(shot.id)) {
      this.seenShots.add(shot.id);
      if (this.initialized) this.flashes.push({ shot, at: now });
    }
    this.initialized = true;
    this.flashes = this.flashes.filter((flash) => now - flash.at < 450);
    for (const { shot, at } of this.flashes) {
      const age = now - at;
      const gun = heldGunWeapons.includes(shot.weaponId);
      if (gun && age < 110) {
        const flash = this.foreground;
        const fade = 1 - age / 110;
        const length = directFireWeapons.includes(shot.weaponId) ? 24 : 36;
        const ux = Math.cos(shot.angleRad), uy = Math.sin(shot.angleRad);
        flash.fillStyle(0xffb63f, fade * 0.85);
        flash.fillTriangle(shot.x - uy * 9, shot.y + ux * 9, shot.x + ux * length, shot.y + uy * length, shot.x + uy * 9, shot.y - ux * 9);
        flash.fillStyle(0xfff8cf, fade); flash.fillCircle(shot.x + ux * 5, shot.y + uy * 5, 6 * fade);
      }
      if (directFireWeapons.includes(shot.weaponId)) {
        const seconds = age / 1000;
        const x = shot.x - Math.cos(shot.angleRad) * 28 - seconds * 38;
        const y = shot.y - 12 - seconds * 100 + seconds * seconds * 280;
        this.foreground.fillStyle(0xeac36a, 1 - age / 450);
        this.foreground.fillRect(x, y, 4, 2);
      }
      if (shot.weaponId === "baseball-schlaeger" && age < 170) {
        this.foreground.lineStyle(5, 0xfff4ca, (1 - age / 170) * 0.7);
        this.foreground.beginPath();
        this.foreground.arc(shot.x - Math.cos(shot.angleRad) * 20, shot.y, 32,
          shot.angleRad - 1.2, shot.angleRad + 1.2); this.foreground.strokePath();
      }
    }
    const live = new Set(state.projectiles.map((p) => p.id));
    for (const projectile of state.projectiles) {
      let trail = this.trails.get(projectile.id);
      if (!trail) {
        const shot = state.weaponActions.filter((event) => event.mercenaryId === projectile.ownerMercenaryId && event.weaponId === projectile.weaponId).at(-1);
        const points: TrailPoint[] = [];
        // Airstrikes and cluster children start where they really appear, never at the commando.
        if (shot && Math.hypot(shot.x - projectile.x, shot.y - projectile.y) < 220) points.push({ x: shot.x, y: shot.y, at: now - 70 });
        trail = { points, bullet: directFireWeapons.includes(projectile.weaponId) };
        this.trails.set(projectile.id, trail);
      }
      const previous = trail.points.at(-1);
      const distance = previous ? Math.hypot(previous.x - projectile.x, previous.y - projectile.y) : 0;
      if (!previous || distance > 3) {
        const steps = Math.max(1, Math.min(32, Math.ceil(distance / 8)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          trail.points.push({ x: previous ? previous.x + (projectile.x - previous.x) * t : projectile.x,
            y: previous ? previous.y + (projectile.y - previous.y) * t : projectile.y,
            at: previous ? previous.at + (now - previous.at) * t : now });
        }
      }
      if (trail.points.length > 160) trail.points.splice(0, trail.points.length - 160);
    }
    // Fade the complete history, also after an impact removed its projectile.
    for (const [id, trail] of this.trails) {
      const lifetime = trail.bullet ? 110 : 700;
      trail.points = trail.points.filter((point) => now - point.at < lifetime);
      if (!trail.points.length && !live.has(id)) { this.trails.delete(id); continue; }
      for (let i = 0; i < trail.points.length; i++) {
        const p = trail.points[i]; const age = (now - p.at) / lifetime;
        if (trail.bullet) {
          const before = trail.points[Math.max(0, i - 1)];
          this.graphics.lineStyle(2, 0xfff3a8, (1 - age) * 0.9);
          this.graphics.lineBetween(before.x, before.y, p.x, p.y);
        } else {
          this.graphics.fillStyle(0xf2eddf, (1 - age) * 0.45);
          this.graphics.fillCircle(p.x + state.wind.direction * age * 9, p.y - age * 8, 3 + age * 7);
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
      const foot = this.feet.get(unit.id);
      if (foot && unit.alive && unit.grounded && (!foot.grounded || Math.abs(foot.x - unit.x) > unit.radius)) {
        this.dust.push({ x: unit.x, y: unit.y + unit.radius, at: now });
        this.feet.set(unit.id, { grounded: true, x: unit.x });
      } else if (!foot || !unit.grounded) this.feet.set(unit.id, { grounded: unit.grounded, x: unit.x });
      this.health.set(unit.id, unit.hp);
    }
    this.dust = this.dust.filter((p) => now - p.at < 350);
    for (const p of this.dust) {
      const t = (now - p.at) / 350;
      this.graphics.fillStyle(0xd7bf83, (1 - t) * 0.4);
      this.graphics.fillEllipse(p.x - t * 12, p.y - t * 6, 5 + t * 12, 3 + t * 6);
      this.graphics.fillEllipse(p.x + t * 10, p.y - t * 5, 4 + t * 10, 3 + t * 4);
    }
    this.damage = this.damage.filter((label) => {
      const progress = (now - label.at) / 1400;
      if (progress >= 1) { label.text.destroy(); return false; }
      label.text.setPosition(label.x, label.y - progress * 65).setAlpha(Math.min(1, (1 - progress) * 2));
      return true;
    });
    const explosionIds = new Set(state.explosions.map((e) => e.id));
    for (const id of this.explosions) if (!explosionIds.has(id)) this.explosions.delete(id);
    for (const explosion of state.explosions) if (!this.explosions.has(explosion.id)) {
      this.explosions.add(explosion.id);
      if (explosion.radius > 70) this.scene.cameras.main.shake(160, Math.min(0.004, explosion.radius / 50000));
    }
  }

  destroy(): void {
    this.graphics.destroy(); this.foreground.destroy();
    for (const label of this.damage) label.text.destroy();
    this.damage = []; this.flashes = []; this.dust = []; this.trails.clear(); this.health.clear(); this.feet.clear();
    this.explosions.clear(); this.seenShots.clear();
  }
}
