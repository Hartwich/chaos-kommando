import Phaser from "phaser";
import type { ChaosKommandoWeaponId } from "../../protocol.js";

export const chaosKommandoCharacterTextureKeys = {
  torso: "chaos-kommando-marshmallow-torso",
  arm: "chaos-kommando-marshmallow-arm",
  foot: "chaos-kommando-marshmallow-foot",
  helmet: "chaos-kommando-marshmallow-helmet",
  backpack: "chaos-kommando-marshmallow-backpack"
} as const;

export type ChaosKommandoWeaponHandling =
  | "launcher"
  | "two-handed"
  | "pistol"
  | "throwable"
  | "placeable"
  | "melee"
  | "remote";

export interface ChaosKommandoGripPoint {
  x: number;
  y: number;
}

export interface ChaosKommandoWeaponVisual {
  textureKey: string;
  path: string;
  handling: ChaosKommandoWeaponHandling;
  sizeInRadii: number;
  primaryGrip: ChaosKommandoGripPoint;
  secondaryGrip: ChaosKommandoGripPoint | null;
  rotationOffsetRad: number;
}

const degrees = (value: number): number => (value * Math.PI) / 180;

/**
 * Grip points use normalized coordinates inside each 256x256 carry asset.
 * The weapon rotates around primaryGrip; arms are solved against both points.
 * That keeps the hands attached at every aim angle instead of relying on a
 * visually estimated offset from the character's centre.
 */
export const chaosKommandoWeaponVisuals: Record<ChaosKommandoWeaponId, ChaosKommandoWeaponVisual> = {
  "kicher-bazooka": weapon("launcher", 4.3, [0.18, 0.54], [0.52, 0.52], 2),
  "regenbogen-rakete": weapon("launcher", 4.1, [0.2, 0.56], [0.55, 0.53], -5),
  "bohrer-rakete": weapon("launcher", 4.1, [0.18, 0.55], [0.52, 0.52], 0),
  "konfetti-schrot": weapon("two-handed", 3.7, [0.18, 0.59], [0.56, 0.53], -3),
  "keks-moerser": weapon("two-handed", 3.8, [0.2, 0.62], [0.55, 0.54], -8),
  minigun: weapon("two-handed", 4.2, [0.2, 0.58], [0.54, 0.52], 0),
  "plunder-pistole": weapon("pistol", 2.7, [0.25, 0.63], null, -2),
  "enten-granate": weapon("throwable", 2.25, [0.5, 0.55], null, -10),
  "splitter-granate": weapon("throwable", 2.05, [0.5, 0.54], null, -8),
  "heilige-granate": weapon("throwable", 2.1, [0.5, 0.54], null, -8),
  banane: weapon("throwable", 2.15, [0.5, 0.54], null, -12),
  "gummi-huhn": weapon("throwable", 2.4, [0.42, 0.55], null, -8),
  "seifenblasen-bombe": weapon("throwable", 2.05, [0.5, 0.52], null, -4),
  dynamit: weapon("placeable", 2.15, [0.5, 0.74], null, 0),
  "baseball-schlaeger": weapon("melee", 4.0, [0.2, 0.62], [0.46, 0.55], -16),
  luftschlag: weapon("remote", 2.2, [0.5, 0.58], null, 0)
};

function weapon(
  handling: ChaosKommandoWeaponHandling,
  sizeInRadii: number,
  primaryGrip: readonly [number, number],
  secondaryGrip: readonly [number, number] | null,
  rotationOffsetDeg: number
): ChaosKommandoWeaponVisual {
  return {
    textureKey: "",
    path: "",
    handling,
    sizeInRadii,
    primaryGrip: { x: primaryGrip[0], y: primaryGrip[1] },
    secondaryGrip: secondaryGrip ? { x: secondaryGrip[0], y: secondaryGrip[1] } : null,
    rotationOffsetRad: degrees(rotationOffsetDeg)
  };
}

for (const weaponId of Object.keys(chaosKommandoWeaponVisuals) as ChaosKommandoWeaponId[]) {
  const visual = chaosKommandoWeaponVisuals[weaponId];
  visual.textureKey = `chaos-kommando-carry-${weaponId}`;
  visual.path = `/chaos-kommando/weapons/carry/${weaponId}-carry.svg`;
}

export function preloadChaosKommandoCharacterAssets(scene: Phaser.Scene): void {
  scene.load.image(
    chaosKommandoCharacterTextureKeys.torso,
    "/chaos-kommando/characters/marshmallow/rig/torso.png"
  );
  scene.load.image(
    chaosKommandoCharacterTextureKeys.arm,
    "/chaos-kommando/characters/marshmallow/rig/arm.png"
  );
  scene.load.image(
    chaosKommandoCharacterTextureKeys.foot,
    "/chaos-kommando/characters/marshmallow/rig/foot.png"
  );
  scene.load.svg(
    chaosKommandoCharacterTextureKeys.helmet,
    "/chaos-kommando/characters/gear/marshmallow-helmet.svg"
  );
  scene.load.svg(
    chaosKommandoCharacterTextureKeys.backpack,
    "/chaos-kommando/characters/gear/marshmallow-backpack.svg"
  );

  for (const visual of Object.values(chaosKommandoWeaponVisuals)) {
    scene.load.svg(visual.textureKey, visual.path);
  }
}
