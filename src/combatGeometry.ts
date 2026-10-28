import type { ChaosKommandoMercenaryState, ChaosKommandoWeaponId } from "./protocol.js";

type AimBody = Pick<ChaosKommandoMercenaryState, "x" | "y" | "radius" | "aimAngleRad">;
export const directFireWeapons: readonly ChaosKommandoWeaponId[] = ["plunder-pistole", "konfetti-schrot", "minigun"];
export const heldGunWeapons: readonly ChaosKommandoWeaponId[] = [
  ...directFireWeapons, "kicher-bazooka", "regenbogen-rakete", "bohrer-rakete", "keks-moerser", "leucht-salve"
];

export function resolveWeaponPivot(body: AimBody): { x: number; y: number } {
  return { x: body.x, y: body.y - body.radius * 0.4 };
}

/** Server projectiles, sprite barrels, aiming marks and muzzle flashes share this point. */
export function resolveWeaponMuzzle(body: AimBody, weaponId: ChaosKommandoWeaponId): { x: number; y: number } {
  const pivot = resolveWeaponPivot(body);
  const reach = heldGunWeapons.includes(weaponId) ? weaponId === "plunder-pistole" || weaponId === "leucht-salve" ? 1.65 : 2.25 : 1.3;
  return { x: pivot.x + Math.cos(body.aimAngleRad) * body.radius * reach,
    y: pivot.y + Math.sin(body.aimAngleRad) * body.radius * reach };
}
