/**
 * Portierte Rig-Konfiguration aus dem Marshmallow Motion Lab.
 *
 * Quelle: tools/marshmallow-motion-lab/presets/marshmallow-rig-presets.json
 *         tools/marshmallow-motion-lab/presets/marshmallow-motion-handoff.json
 *         tools/marshmallow-motion-lab/presets/IMPLEMENTATION.md
 *
 * Die Profile sind reine Renderkonfiguration. Bewegungsgleichungen liegen im
 * Animator, gezeichnet wird ausschliesslich im Character-Renderer.
 */

export type MarshmallowTorsoVariant = "wide" | "square" | "tall";
export type MarshmallowHeadgear = "none" | "helmet" | "headband";
export type MarshmallowActionHand = "left" | "right";

/**
 * Alle Zustaende des Warp-Rigs aus dem Motion-Lab-Handoff.
 * `walk` laeuft nach links, `walkRight` spiegelt denselben Zyklus.
 */
export type MarshmallowMotionState =
  | "idle"
  | "walk"
  | "walkRight"
  | "jump"
  | "longJump"
  | "joy"
  | "grenade"
  | "shoot"
  | "handgun";

export interface MarshmallowRigProfile {
  torsoVariant: MarshmallowTorsoVariant;
  /** 0..1 */
  warp: number;
  /** 0..1; sichtbare Fussdistanz = limbGap * 162 Rig-Pixel */
  limbGap: number;
  /** 0..1; Torso-Bodenversatz = torsoHeight * 145 Rig-Pixel */
  torsoHeight: number;
  /** 0.7..1.4 */
  legSize: number;
  /** 0..1 */
  legMotion: number;
  /** 0..1; Schulterhoehe = 155 + armHeight * 92 Rig-Pixel */
  armHeight: number;
  /** 0..1; nichtlinear, siehe armBaseGap() */
  armGap: number;
  /** 0.7..1.4 */
  armSize: number;
  /** 0..140 Rig-Pixel Zusatzabstand beider Blaster-Haende */
  twoHandOffset: number;
  /** 0..1 */
  helmetHeight: number;
  /** 0.5..1.5 */
  helmetScale: number;
  /** 0..1 */
  headbandHeight: number;
  /** 0.5..1.5 */
  headbandScale: number;
  headgear: MarshmallowHeadgear;
  actionHand: MarshmallowActionHand;
}

/** Feste Profile aus `marshmallow-rig-presets.json` (formatVersion 2). */
export const marshmallowRigProfiles: Record<MarshmallowTorsoVariant, MarshmallowRigProfile> = {
  wide: {
    torsoVariant: "wide",
    warp: 0.55,
    limbGap: 0.36,
    torsoHeight: 0.1,
    legSize: 1.05,
    legMotion: 0.5,
    armHeight: 0.16,
    armGap: 0.45,
    armSize: 1,
    twoHandOffset: 42,
    helmetHeight: 0.1,
    helmetScale: 1.01,
    headbandHeight: 0.65,
    headbandScale: 1.07,
    headgear: "headband",
    actionHand: "left"
  },
  square: {
    torsoVariant: "square",
    warp: 0.55,
    limbGap: 0.28,
    torsoHeight: 0.08,
    legSize: 0.95,
    legMotion: 0.4,
    armHeight: 0.26,
    armGap: 0.38,
    armSize: 1,
    twoHandOffset: 42,
    helmetHeight: 0.24,
    helmetScale: 0.85,
    headbandHeight: 0.6,
    headbandScale: 0.86,
    headgear: "headband",
    actionHand: "right"
  },
  tall: {
    torsoVariant: "tall",
    warp: 0.55,
    limbGap: 0.21,
    torsoHeight: 0.1,
    legSize: 0.85,
    legMotion: 0.4,
    armHeight: 0.5,
    armGap: 0.3,
    armSize: 1,
    twoHandOffset: 42,
    helmetHeight: 0.1,
    helmetScale: 0.77,
    headbandHeight: 0.55,
    headbandScale: 0.78,
    headgear: "headband",
    actionHand: "right"
  }
};

export const marshmallowTorsoVariants: readonly MarshmallowTorsoVariant[] = ["wide", "square", "tall"];

/** Framezyklus und Granatenphasen aus dem Motion-Lab-Handoff. */
export const MARSHMALLOW_FRAME_COUNT = 16;
export const MARSHMALLOW_DEFAULT_FPS = 16;
export const MARSHMALLOW_THROW_HOLD_FRAME = 6;
export const MARSHMALLOW_THROW_RELEASE_END_FRAME = 10;

/**
 * Umrechnung Rig-Pixel -> Weltpixel.
 *
 * Das Lab rendert den breiten Torso mit 330 Rig-Pixeln Breite. Chaos-Kommando
 * hat den Marshmallow bisher mit `radius * 3.2` gezeichnet. 330 / 3.2 = 103.125,
 * daher bleibt die Figurgroesse bei der Umstellung identisch.
 */
export const MARSHMALLOW_RIG_PIXELS_PER_RADIUS = 103.125;

export function marshmallowRigScale(radius: number): number {
  return radius / MARSHMALLOW_RIG_PIXELS_PER_RADIUS;
}

/**
 * `armGap` ist bewusst nichtlinear: 0.5 ergibt exakt den historischen Wert 184 px.
 * Referenz: `armBaseGap()` in motion-lab.js.
 */
export function armBaseGap(value: number): number {
  if (value <= 0.5) return (value / 0.5) * 184;
  return 184 + ((value - 0.5) / 0.5) * 39;
}

export function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

export function lerpAngle(from: number, to: number, amount: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
}

export interface MarshmallowTorsoLayout {
  variant: MarshmallowTorsoVariant;
  /** Breite in Rig-Pixeln */
  width: number;
  /** Hoehe in Rig-Pixeln */
  height: number;
}

const torsoLayouts: Record<MarshmallowTorsoVariant, MarshmallowTorsoLayout> = {
  wide: { variant: "wide", width: 330, height: 306 },
  square: { variant: "square", width: 312, height: 312 },
  tall: { variant: "tall", width: 275, height: 340 }
};

export function marshmallowTorsoLayout(variant: MarshmallowTorsoVariant): MarshmallowTorsoLayout {
  return torsoLayouts[variant];
}

/** Die sechs vorbereiteten Stirnbandfarben aus `headband-variants.json`. */
export type MarshmallowHeadbandVariantId = "red" | "blue" | "green" | "gold" | "violet" | "teal";

export interface MarshmallowHeadbandVariant {
  id: MarshmallowHeadbandVariantId;
  /** Vorgeschlagene Teamfarbe des Bandes */
  color: number;
}

export const marshmallowHeadbandVariants: readonly MarshmallowHeadbandVariant[] = [
  { id: "red", color: 0xe94d3d },
  { id: "blue", color: 0x3567b7 },
  { id: "green", color: 0x3f8b5a },
  { id: "gold", color: 0xd5a329 },
  { id: "violet", color: 0x8457aa },
  { id: "teal", color: 0x2f9a9a }
];

/** Waehlt das Stirnband, dessen Farbe der Teamfarbe am naechsten kommt. */
export function resolveHeadbandVariant(teamColor: number): MarshmallowHeadbandVariantId {
  let bestId: MarshmallowHeadbandVariantId = "red";
  let bestDistance = Number.POSITIVE_INFINITY;
  const r = (teamColor >> 16) & 0xff;
  const g = (teamColor >> 8) & 0xff;
  const b = teamColor & 0xff;
  for (const variant of marshmallowHeadbandVariants) {
    const dr = r - ((variant.color >> 16) & 0xff);
    const dg = g - ((variant.color >> 8) & 0xff);
    const db = b - (variant.color & 0xff);
    // Gewichtung nach wahrgenommener Helligkeit, damit Blau/Violett nicht kippen.
    const distance = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = variant.id;
    }
  }
  return bestId;
}

/** Stabile Formzuweisung: gleiche Soeldner-ID ergibt immer dieselbe Koerperform. */
export function resolveTorsoVariantForId(id: string): MarshmallowTorsoVariant {
  return marshmallowTorsoVariants[hashString(id) % marshmallowTorsoVariants.length]!;
}

export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}
