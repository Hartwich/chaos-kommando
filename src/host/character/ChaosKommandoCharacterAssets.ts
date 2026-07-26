import Phaser from "phaser";
import type { ChaosKommandoWeaponId } from "../../protocol.js";
import {
  marshmallowHeadbandVariants,
  marshmallowTorsoVariants,
  type MarshmallowHeadbandVariantId,
  type MarshmallowTorsoVariant
} from "./marshmallowRig.js";

const marshmallowRoot = "/chaos-kommando/characters/marshmallow";
const arsenalRoot = "/chaos-kommando/weapons/arsenal";

export const chaosKommandoCharacterTextureKeys = {
  torsoWide: "chaos-kommando-marshmallow-torso-wide",
  torsoSquare: "chaos-kommando-marshmallow-torso-square",
  torsoTall: "chaos-kommando-marshmallow-torso-tall",
  hand: "chaos-kommando-marshmallow-hand",
  foot: "chaos-kommando-marshmallow-foot",
  helmet: "chaos-kommando-marshmallow-helmet",
  headband: "chaos-kommando-marshmallow-headband"
} as const;

const torsoTextureKeys: Record<MarshmallowTorsoVariant, string> = {
  wide: chaosKommandoCharacterTextureKeys.torsoWide,
  square: chaosKommandoCharacterTextureKeys.torsoSquare,
  tall: chaosKommandoCharacterTextureKeys.torsoTall
};

export function chaosKommandoTorsoTextureKey(variant: MarshmallowTorsoVariant): string {
  return torsoTextureKeys[variant];
}

export function chaosKommandoHeadbandTextureKey(variant: MarshmallowHeadbandVariantId): string {
  return `chaos-kommando-marshmallow-headband-${variant}`;
}

export type ChaosKommandoWeaponHandling =
  | "launcher"
  | "two-handed"
  | "pistol"
  | "throwable"
  | "placeable"
  | "melee"
  | "remote";

/** Auf welchen Motion-Lab-Zustand eine Waffenklasse abgebildet wird. */
export type ChaosKommandoWeaponPosture = "two-hand" | "one-hand" | "throw";

export interface ChaosKommandoGripPoint {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ */
/* Marshmallow Comic Arsenal                                           */
/* ------------------------------------------------------------------ */

/**
 * Kunst aus `tools/marshmallow-motion-lab/assets/weapons/arsenal`
 * (`weapon-pack.json`, formatVersion 1). Die Griffpunkte sind laut Paket-README
 * bewusst nicht im Pack enthalten und werden hier spielseitig festgelegt.
 * Alle Werte sind auf die volle Canvasflaeche normiert, Blickrichtung rechts.
 */
export type ChaosKommandoArsenalArtId =
  | "rocket-launcher"
  | "grenade-launcher"
  | "plunger-launcher"
  | "confetti-cannon"
  | "marshmallow-blaster"
  | "minigun"
  | "revolver"
  | "baseball-bat"
  | "frag-grenade"
  | "cluster-grenade"
  | "sticky-grenade"
  | "smoke-grenade"
  | "banana-bomb"
  | "duck-grenade"
  | "dynamite-bundle"
  | "airstrike-radio"
  | "airstrike-flare-gun"
  | "airstrike-signal-flare"
  | "airstrike-whistle"
  | "proximity-mine"
  | "supply-crate";

interface ChaosKommandoArsenalArt {
  textureKey: string;
  path: string;
  /** Breite geteilt durch Hoehe der Grafik, fuer verzerrungsfreie Skalierung. */
  aspect: number;
  /** Hintere Hand bzw. Wurfhand. */
  primaryGrip: ChaosKommandoGripPoint;
  /** Vordere Hand bei Zweihandwaffen. */
  secondaryGrip: ChaosKommandoGripPoint | null;
}

const longGunAspect = 1280 / 768;
const sidearmAspect = 768 / 640;
const meleeAspect = 1024 / 768;
const throwableAspect = 1;
const equipmentAspect = 1;

export const chaosKommandoArsenalArt: Record<ChaosKommandoArsenalArtId, ChaosKommandoArsenalArt> = {
  "rocket-launcher": art(longGunAspect, [0.25, 0.68], [0.59, 0.68]),
  "grenade-launcher": art(longGunAspect, [0.34, 0.68], [0.665, 0.74]),
  "plunger-launcher": art(longGunAspect, [0.21, 0.72], [0.61, 0.72]),
  "confetti-cannon": art(longGunAspect, [0.19, 0.77], [0.573, 0.77]),
  "marshmallow-blaster": art(longGunAspect, [0.2, 0.73], [0.617, 0.75]),
  minigun: art(longGunAspect, [0.086, 0.578], [0.492, 0.68]),
  revolver: art(sidearmAspect, [0.18, 0.61], null),
  "airstrike-flare-gun": art(sidearmAspect, [0.16, 0.7], null),
  "baseball-bat": art(meleeAspect, [0.09, 0.79], null),
  "frag-grenade": art(throwableAspect, [0.47, 0.52], null),
  "cluster-grenade": art(throwableAspect, [0.47, 0.5], null),
  "sticky-grenade": art(throwableAspect, [0.49, 0.55], null),
  "smoke-grenade": art(throwableAspect, [0.49, 0.52], null),
  "banana-bomb": art(throwableAspect, [0.6, 0.55], null),
  "duck-grenade": art(throwableAspect, [0.52, 0.52], null),
  "dynamite-bundle": art(throwableAspect, [0.5, 0.56], null),
  "airstrike-signal-flare": art(throwableAspect, [0.51, 0.48], null),
  "airstrike-whistle": art(throwableAspect, [0.47, 0.53], null),
  "airstrike-radio": art(equipmentAspect, [0.5, 0.34], null),
  "proximity-mine": art(equipmentAspect, [0.5, 0.46], null),
  "supply-crate": art(equipmentAspect, [0.5, 0.49], null)
};

function art(
  aspect: number,
  primaryGrip: readonly [number, number],
  secondaryGrip: readonly [number, number] | null
): ChaosKommandoArsenalArt {
  return {
    textureKey: "",
    path: "",
    aspect,
    primaryGrip: { x: primaryGrip[0], y: primaryGrip[1] },
    secondaryGrip: secondaryGrip ? { x: secondaryGrip[0], y: secondaryGrip[1] } : null
  };
}

for (const artId of Object.keys(chaosKommandoArsenalArt) as ChaosKommandoArsenalArtId[]) {
  const entry = chaosKommandoArsenalArt[artId];
  entry.textureKey = `chaos-kommando-arsenal-${artId}`;
  entry.path = `${arsenalRoot}/${artId}.png`;
}

/* ------------------------------------------------------------------ */
/* Zuordnung Spielwaffe -> Arsenal-Grafik                              */
/* ------------------------------------------------------------------ */

export interface ChaosKommandoWeaponVisual {
  artId: ChaosKommandoArsenalArtId;
  textureKey: string;
  path: string;
  aspect: number;
  handling: ChaosKommandoWeaponHandling;
  posture: ChaosKommandoWeaponPosture;
  /** Waffen, bei denen der Helm aufgesetzt wird (Granaten, Werfer, Sprengsatz). */
  wearsHelmet: boolean;
  /** Zielbreite der Grafik in Soeldnerradien. */
  sizeInRadii: number;
  primaryGrip: ChaosKommandoGripPoint;
  secondaryGrip: ChaosKommandoGripPoint | null;
  rotationOffsetRad: number;
}

const degrees = (value: number): number => (value * Math.PI) / 180;

/**
 * Bewusste Doppelbelegungen, solange im Arsenal noch keine eigene Grafik
 * existiert: `enten-granate` (frag), `dynamit` (sticky) und `luftschlag` (smoke).
 * `baseball-schlaeger` nutzt vorerst die Bratpfanne als Comedy-Nahkampfwaffe.
 */
export const chaosKommandoWeaponVisuals: Record<ChaosKommandoWeaponId, ChaosKommandoWeaponVisual> = {
  "kicher-bazooka": weapon("rocket-launcher", "launcher", 3.7, 0),
  "regenbogen-rakete": weapon("marshmallow-blaster", "launcher", 3.6, 0),
  "bohrer-rakete": weapon("grenade-launcher", "launcher", 3.5, 0),
  "konfetti-schrot": weapon("confetti-cannon", "two-handed", 3.5, 0),
  "keks-moerser": weapon("plunger-launcher", "two-handed", 3.5, 0),
  minigun: weapon("minigun", "two-handed", 3.9, 0),
  "plunder-pistole": weapon("revolver", "pistol", 1.9, 0),
  "enten-granate": weapon("duck-grenade", "throwable", 1.25, 0),
  "splitter-granate": weapon("frag-grenade", "throwable", 1.15, 0),
  "heilige-granate": weapon("cluster-grenade", "throwable", 1.25, 0),
  banane: weapon("banana-bomb", "throwable", 1.35, 0),
  "gummi-huhn": weapon("sticky-grenade", "throwable", 1.2, 0),
  "seifenblasen-bombe": weapon("smoke-grenade", "throwable", 1.15, 0),
  dynamit: weapon("dynamite-bundle", "placeable", 1.3, 0),
  "baseball-schlaeger": weapon("baseball-bat", "melee", 3, 34),
  "funk-bombenteppich": weapon("airstrike-radio", "remote", 1.4, 0),
  "leucht-salve": weapon("airstrike-flare-gun", "pistol", 1.9, 0),
  "signal-schauer": weapon("airstrike-signal-flare", "throwable", 1.2, 0),
  "pfeifen-sturzflug": weapon("airstrike-whistle", "remote", 1.15, 0),
  seilzug: weapon("proximity-mine", "remote", 1.2, 0)
};

function resolvePosture(handling: ChaosKommandoWeaponHandling): ChaosKommandoWeaponPosture {
  if (handling === "launcher" || handling === "two-handed") return "two-hand";
  // Pistole und die einhaendigen Nahkampfwaffen des Arsenals teilen sich `handgun`.
  if (handling === "pistol" || handling === "melee") return "one-hand";
  return "throw";
}

/**
 * Helm auf: alles was geworfen, gelegt oder aus einem Rohr abgefeuert wird.
 * Pistole, Konfettischrot und Nahkampf bleiben beim Stirnband.
 */
function resolveWearsHelmet(handling: ChaosKommandoWeaponHandling): boolean {
  return handling === "launcher" || handling === "throwable" || handling === "placeable" || handling === "remote";
}

function weapon(
  artId: ChaosKommandoArsenalArtId,
  handling: ChaosKommandoWeaponHandling,
  sizeInRadii: number,
  rotationOffsetDeg: number
): ChaosKommandoWeaponVisual {
  const entry = chaosKommandoArsenalArt[artId];
  return {
    artId,
    textureKey: entry.textureKey,
    path: entry.path,
    aspect: entry.aspect,
    handling,
    posture: resolvePosture(handling),
    wearsHelmet: resolveWearsHelmet(handling),
    sizeInRadii,
    primaryGrip: entry.primaryGrip,
    secondaryGrip: entry.secondaryGrip,
    rotationOffsetRad: degrees(rotationOffsetDeg)
  };
}

export function preloadChaosKommandoCharacterAssets(scene: Phaser.Scene): void {
  for (const variant of marshmallowTorsoVariants) {
    scene.load.image(chaosKommandoTorsoTextureKey(variant), `${marshmallowRoot}/rig/torso-${variant}.png`);
  }
  scene.load.image(chaosKommandoCharacterTextureKeys.hand, `${marshmallowRoot}/limbs/hand-knob.png`);
  scene.load.image(chaosKommandoCharacterTextureKeys.foot, `${marshmallowRoot}/limbs/foot-knob.png`);
  scene.load.image(chaosKommandoCharacterTextureKeys.helmet, `${marshmallowRoot}/accessories/helmet.png`);
  scene.load.image(chaosKommandoCharacterTextureKeys.headband, `${marshmallowRoot}/accessories/headband.png`);
  for (const variant of marshmallowHeadbandVariants) {
    scene.load.image(
      chaosKommandoHeadbandTextureKey(variant.id),
      `${marshmallowRoot}/accessories/headbands/headband-${variant.id}.png`
    );
  }

  // Jede Arsenal-Grafik nur einmal laden, auch wenn sie mehrfach belegt ist.
  for (const entry of Object.values(chaosKommandoArsenalArt)) {
    scene.load.image(entry.textureKey, entry.path);
  }
}
