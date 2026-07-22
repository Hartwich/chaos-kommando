import {
  createBaseRoundState,
  resolveRoundPhaseTimings,
  transitionRoundState,
  type BaseRoundState,
  type ScoreEntry,
  type ServerGame,
  type ServerGameContext,
  type SupportedLanguage
} from "@open-party-lab/game-core";
import type {
  ChaosKommandoCrateState,
  ChaosKommandoCraterState,
  ChaosKommandoExplosionState,
  ChaosKommandoExplosionSourceId,
  ChaosKommandoGravestoneState,
  ChaosKommandoInput,
  ChaosKommandoMercenaryRole,
  ChaosKommandoMercenaryState,
  ChaosKommandoMineState,
  ChaosKommandoPlayerState,
  ChaosKommandoProjectileState,
  ChaosKommandoState,
  ChaosKommandoTerrainState,
  ChaosKommandoTurnState,
  ChaosKommandoWeaponDefinition,
  ChaosKommandoWeaponId,
  ChaosKommandoWindState
} from "../protocol.js";
import { chaosKommandoManifest } from "../manifest.js";

const phaseTimings = resolveRoundPhaseTimings(chaosKommandoManifest.phaseDurations);

const terrainWidth = 2_360;
const terrainHeight = 1_260;
const initialWaterlineY = 1_094;
const sampleSpacing = 4;
const mercenaryRadius = 20;
const walkSpeed = 82;
const gravity = 880;
const jumpVelocity = -330;
const jumpForwardBoost = 92;
const turnDurationMs = 30_000;
const retreatDurationMs = 3_000;
const chargeWindowMs = 1_750;
const settleDelayMs = 900;
const jumpCooldownMs = 650;
const crosshairDistance = 150;
const stepUpHeight = 14;
const stepDownHeight = 20;
const deathExplosionRadius = 88;
const deathExplosionDamage = 24;
const deathExplosionCraterDepth = 30;
const deathExplosionDelayMs = 340;
const gravestoneSpawnDelayMs = 280;
const gravestoneRadius = 18;
const mineRadius = 11;
const mineTriggerDistance = 40;
const mineFuseMs = 1_300;
const mineDamage = 38;
const mineBlastRadius = 82;
const crateRadius = 16;
const crateDropEveryNTurns = 3;
const suddenDeathTurn = 16;
const suddenDeathWaterRisePerTurn = 26;

type RuntimeMercenaryState = ChaosKommandoMercenaryState & {
  moveInputX: number;
  jumpReadyAt: number;
  airborneFromY: number | null;
  deathExploded: boolean;
};

type RuntimeGravestoneState = ChaosKommandoGravestoneState;
type RuntimeMineState = ChaosKommandoMineState;
type RuntimeCrateState = ChaosKommandoCrateState;

interface RuntimePlayerState extends Omit<ChaosKommandoPlayerState, "mercenaries"> {
  mercenaries: RuntimeMercenaryState[];
}

type RuntimeProjectileState = ChaosKommandoProjectileState & {
  damage: number;
  blastRadius: number;
  craterDepth: number;
  gravityScale: number;
  windScale: number;
  splashColor: string;
  bounceFactor: number;
  /** Cluster generation (0 = fired shot, 1 = spawned child bomblet). */
  generation: number;
};

interface RuntimeTurnState extends ChaosKommandoTurnState {
  orderPlayerIds: string[];
}

interface RuntimeDeathSequenceState {
  mercenaryId: string;
  explodeAt: number;
  gravestoneAt: number | null;
}

interface ChaosKommandoRuntimeState
  extends BaseRoundState,
    Omit<
      ChaosKommandoState,
      "players" | "projectiles" | "explosions" | "gravestones" | "mines" | "crates" | "turn"
    > {
  players: RuntimePlayerState[];
  projectiles: RuntimeProjectileState[];
  explosions: ChaosKommandoExplosionState[];
  gravestones: RuntimeGravestoneState[];
  mines: RuntimeMineState[];
  crates: RuntimeCrateState[];
  turn: RuntimeTurnState;
  seed: number;
  language: SupportedLanguage;
  deathQueueMercenaryIds: string[];
  activeDeathSequence: RuntimeDeathSequenceState | null;
}

const weaponDefinitions: ChaosKommandoWeaponDefinition[] = [
  {
    id: "kicher-bazooka",
    displayName: "Kicher-Bazooka",
    description: "Der Klassiker. Fliegt im Bogen, der Wind mischt kraeftig mit.",
    iconPath: "/chaos-kommando/weapons/kicher-bazooka.svg",
    accentColor: "#ff935c",
    fireMode: "charged",
    damage: 45,
    blastRadius: 90,
    projectileSpeed: 760,
    gravityScale: 0.74,
    windScale: 1,
    fuseMs: null,
    craterDepth: 56
  },
  {
    id: "enten-granate",
    displayName: "Enten-Granate",
    description: "Huepft, wartet drei Sekunden und reisst dann ein tiefes Loch.",
    iconPath: "/chaos-kommando/weapons/enten-granate.svg",
    accentColor: "#ffd24d",
    fireMode: "charged",
    damage: 48,
    blastRadius: 100,
    projectileSpeed: 600,
    gravityScale: 1.1,
    windScale: 0,
    fuseMs: 3_000,
    craterDepth: 66
  },
  {
    id: "plunder-pistole",
    displayName: "Plunder-Pistole",
    description: "Schneller Direktschuss ohne Bogen. Ideal zum Nachsetzen.",
    iconPath: "/chaos-kommando/weapons/plunder-pistole.svg",
    accentColor: "#7dd3fc",
    fireMode: "instant",
    damage: 24,
    blastRadius: 32,
    projectileSpeed: 1_050,
    gravityScale: 0.06,
    windScale: 0,
    fuseMs: null,
    craterDepth: 12
  },
  {
    id: "regenbogen-rakete",
    displayName: "Regenbogen-Rakete",
    description: "Riesiger bunter Bumms, aber nur einmal pro Soeldner.",
    iconPath: "/chaos-kommando/weapons/regenbogen-rakete.svg",
    accentColor: "#f472b6",
    fireMode: "charged",
    damage: 72,
    blastRadius: 140,
    projectileSpeed: 800,
    gravityScale: 0.6,
    windScale: 1.15,
    fuseMs: null,
    craterDepth: 82
  },
  {
    id: "splitter-granate",
    displayName: "Splitter-Granate",
    description: "Huepft kurz und streut beim Knall fiese Splitter.",
    iconPath: "/chaos-kommando/weapons/splitter-granate.svg",
    accentColor: "#fb923c",
    fireMode: "charged",
    damage: 30,
    blastRadius: 80,
    projectileSpeed: 580,
    gravityScale: 1.08,
    windScale: 0,
    fuseMs: 2_600,
    craterDepth: 44
  },
  {
    id: "konfetti-schrot",
    displayName: "Konfetti-Schrot",
    description: "Direkter Faecher aus funkelnden Nahkampf-Pellets.",
    iconPath: "/chaos-kommando/weapons/konfetti-schrot.svg",
    accentColor: "#f0abfc",
    fireMode: "instant",
    damage: 13,
    blastRadius: 26,
    projectileSpeed: 1_000,
    gravityScale: 0.14,
    windScale: 0,
    fuseMs: null,
    craterDepth: 8
  },
  {
    id: "bohrer-rakete",
    displayName: "Bohrer-Rakete",
    description: "Frisst sich tief ins Gelaende und gruebt steile Tunnel.",
    iconPath: "/chaos-kommando/weapons/bohrer-rakete.svg",
    accentColor: "#a3e635",
    fireMode: "charged",
    damage: 30,
    blastRadius: 74,
    projectileSpeed: 740,
    gravityScale: 0.66,
    windScale: 0.4,
    fuseMs: null,
    craterDepth: 96
  },
  {
    id: "gummi-huhn",
    displayName: "Gummi-Huhn",
    description: "Springt albern durch die Gegend und knallt erst nach der Lunte.",
    iconPath: "/chaos-kommando/weapons/gummi-huhn.svg",
    accentColor: "#fde047",
    fireMode: "charged",
    damage: 32,
    blastRadius: 84,
    projectileSpeed: 620,
    gravityScale: 0.95,
    windScale: 0,
    fuseMs: 2_800,
    craterDepth: 34
  },
  {
    id: "seifenblasen-bombe",
    displayName: "Seifenblasen-Bombe",
    description: "Schwebt mit dem Wind davon und pustet Soeldner von Haengen.",
    iconPath: "/chaos-kommando/weapons/seifenblasen-bombe.svg",
    accentColor: "#67e8f9",
    fireMode: "charged",
    damage: 24,
    blastRadius: 118,
    projectileSpeed: 520,
    gravityScale: 0.3,
    windScale: 1.8,
    fuseMs: 2_200,
    craterDepth: 22
  },
  {
    id: "keks-moerser",
    displayName: "Keks-Moerser",
    description: "Schwerer Bogenwurf mit knusprigem Einschlag von oben.",
    iconPath: "/chaos-kommando/weapons/keks-moerser.svg",
    accentColor: "#d97706",
    fireMode: "charged",
    damage: 42,
    blastRadius: 100,
    projectileSpeed: 500,
    gravityScale: 1.24,
    windScale: 0.3,
    fuseMs: null,
    craterDepth: 62
  },
  {
    id: "dynamit",
    displayName: "Dynamit",
    description: "Ablegen, wegrennen, Ohren zuhalten. Riesiges Loch garantiert.",
    iconPath: "/chaos-kommando/weapons/dynamit.svg",
    accentColor: "#ef4444",
    fireMode: "instant",
    damage: 70,
    blastRadius: 125,
    projectileSpeed: 0,
    gravityScale: 1,
    windScale: 0,
    fuseMs: 3_800,
    craterDepth: 84
  },
  {
    id: "heilige-granate",
    displayName: "Heilige Granate",
    description: "Halleluja. Der groesste Knall im ganzen Arsenal.",
    iconPath: "/chaos-kommando/weapons/heilige-granate.svg",
    accentColor: "#facc15",
    fireMode: "charged",
    damage: 95,
    blastRadius: 165,
    projectileSpeed: 560,
    gravityScale: 1.05,
    windScale: 0,
    fuseMs: 3_400,
    craterDepth: 96
  },
  {
    id: "banane",
    displayName: "Banana-Bombe",
    description: "Platzt beim Aufprall in fuenf huepfende Mini-Bananen.",
    iconPath: "/chaos-kommando/weapons/banane.svg",
    accentColor: "#fde047",
    fireMode: "charged",
    damage: 38,
    blastRadius: 84,
    projectileSpeed: 620,
    gravityScale: 1.05,
    windScale: 0,
    fuseMs: null,
    craterDepth: 46
  },
  {
    id: "luftschlag",
    displayName: "Luftschlag",
    description: "Vier Bomben aus heiterem Himmel auf die Zielrichtung.",
    iconPath: "/chaos-kommando/weapons/luftschlag.svg",
    accentColor: "#94a3b8",
    fireMode: "instant",
    damage: 32,
    blastRadius: 72,
    projectileSpeed: 0,
    gravityScale: 0.78,
    windScale: 0,
    fuseMs: null,
    craterDepth: 44
  },
  {
    id: "baseball-schlaeger",
    displayName: "Baseball-Schlaeger",
    description: "Kein Loch, aber ein Traumflug fuer den Getroffenen.",
    iconPath: "/chaos-kommando/weapons/baseball-schlaeger.svg",
    accentColor: "#fbbf24",
    fireMode: "instant",
    damage: 28,
    blastRadius: 52,
    projectileSpeed: 0,
    gravityScale: 1,
    windScale: 0,
    fuseMs: null,
    craterDepth: 0
  },
  {
    id: "minigun",
    displayName: "Konfetti-Minigun",
    description: "Zehn Kugeln Dauerfeuer, das sich durch Huegel nagt.",
    iconPath: "/chaos-kommando/weapons/minigun.svg",
    accentColor: "#f87171",
    fireMode: "instant",
    damage: 8,
    blastRadius: 22,
    projectileSpeed: 1_150,
    gravityScale: 0.1,
    windScale: 0,
    fuseMs: null,
    craterDepth: 10
  }
];

const weaponTexts: Partial<
  Record<
    SupportedLanguage,
    Partial<Record<ChaosKommandoWeaponId, Pick<ChaosKommandoWeaponDefinition, "displayName" | "description">>>
  >
> = {
  en: {
    "kicher-bazooka": {
      displayName: "Giggler Bazooka",
      description: "The classic. Arcs through the air, the wind joins in."
    },
    "enten-granate": {
      displayName: "Duck Grenade",
      description: "Bounces, waits three seconds, then tears open a deep hole."
    },
    "plunder-pistole": {
      displayName: "Plunder Pistol",
      description: "Fast straight shot with no arc. Great for finishing off."
    },
    "regenbogen-rakete": {
      displayName: "Rainbow Rocket",
      description: "A huge colorful blast, but only once per mercenary."
    },
    "splitter-granate": {
      displayName: "Shrapnel Grenade",
      description: "Bounces briefly and scatters nasty fragments on the bang."
    },
    "konfetti-schrot": {
      displayName: "Confetti Shotgun",
      description: "A direct fan of sparkling close-range pellets."
    },
    "bohrer-rakete": {
      displayName: "Drill Rocket",
      description: "Bites deep into the terrain and digs steep tunnels."
    },
    "gummi-huhn": {
      displayName: "Rubber Chicken",
      description: "Bounces around absurdly and only pops after the fuse."
    },
    "seifenblasen-bombe": {
      displayName: "Bubble Bomb",
      description: "Drifts with the wind and blows mercenaries off slopes."
    },
    "keks-moerser": {
      displayName: "Cookie Mortar",
      description: "Heavy arcing shot with a crunchy impact from above."
    },
    dynamit: {
      displayName: "Dynamite",
      description: "Drop it, run away, cover your ears. Giant hole guaranteed."
    },
    "heilige-granate": {
      displayName: "Holy Grenade",
      description: "Hallelujah. The biggest bang in the entire arsenal."
    },
    banane: {
      displayName: "Banana Bomb",
      description: "Bursts on impact into five bouncing mini bananas."
    },
    luftschlag: {
      displayName: "Air Strike",
      description: "Four bombs out of the blue onto your aiming direction."
    },
    "baseball-schlaeger": {
      displayName: "Baseball Bat",
      description: "No crater, but a dream flight for whoever gets hit."
    },
    minigun: {
      displayName: "Confetti Minigun",
      description: "Ten rounds of sustained fire that chews through hills."
    }
  }
};

function localizeWeaponDefinition(
  definition: ChaosKommandoWeaponDefinition,
  language: SupportedLanguage
): ChaosKommandoWeaponDefinition {
  const text = weaponTexts[language]?.[definition.id];

  return text ? { ...definition, ...text } : definition;
}

function localizeWeaponDefinitions(language: SupportedLanguage): ChaosKommandoWeaponDefinition[] {
  return weaponDefinitions.map((definition) => localizeWeaponDefinition(definition, language));
}

const chaosKommandoText = {
  de: {
    waitingAction: "Chaos-Kommando wartet auf die naechste Aktion.",
    playerTurn: (playerName: string, mercenaryName: string, weaponName: string) =>
      `${playerName} ist dran | ${mercenaryName} mit ${weaponName}`,
    wind: (direction: number, strength: number) =>
      `${direction > 0 ? "Wind nach rechts" : "Wind nach links"} | ${Math.round(strength * 10)}`,
    winner: (name: string) => `${name} gewinnt Chaos-Kommando!`,
    draw: "Alle Teams sind untergegangen.",
    smokeClears: "Der Rauch verzieht sich. Das naechste Team ist dran.",
    intro: "Chaos-Kommando macht die Sicherungen locker.",
    introLog: "Bunt, ueberdreht, taktisch und schoen gemein.",
    start: "Die Lunte brennt. Das erste Team stuermt los.",
    mercenaryForward: (playerName: string, mercenaryName: string) => `${playerName} schickt jetzt ${mercenaryName} vor.`,
    clockFaster: "Die Uhr war schneller. Das naechste Team uebernimmt.",
    retreat: "Rueckzug! Noch schnell in Deckung.",
    splash: (name: string) => `${name} verschwindet mit einem Platsch im Wasser.`,
    drowned: (name: string) => `${name} geht baden. Fuer immer.`,
    mineTriggered: "Eine Mine piept boese ...",
    crateDrop: "Eine Versorgungskiste schwebt ein!",
    crateCollected: (name: string, weaponName: string, amount: number) =>
      `${name} schnappt sich die Kiste: +${amount}x ${weaponName}.`,
    crateDestroyed: "Die Versorgungskiste wurde zerlegt.",
    suddenDeath: "SUDDEN DEATH! Das Wasser steigt!"
  },
  en: {
    waitingAction: "Chaos Commando is waiting for the next action.",
    playerTurn: (playerName: string, mercenaryName: string, weaponName: string) =>
      `${playerName} is up | ${mercenaryName} with ${weaponName}`,
    wind: (direction: number, strength: number) =>
      `${direction > 0 ? "Wind right" : "Wind left"} | ${Math.round(strength * 10)}`,
    winner: (name: string) => `${name} wins Chaos Commando!`,
    draw: "All teams went down.",
    smokeClears: "The smoke clears. The next team is up.",
    intro: "Chaos Commando is loosening the fuses.",
    introLog: "Colorful, loud, tactical, and delightfully mean.",
    start: "The fuse is lit. The first team rushes in.",
    mercenaryForward: (playerName: string, mercenaryName: string) => `${playerName} sends ${mercenaryName} forward.`,
    clockFaster: "The clock won. The next team takes over.",
    retreat: "Retreat! Get to cover, quick.",
    splash: (name: string) => `${name} vanishes into the water with a splash.`,
    drowned: (name: string) => `${name} goes for a swim. Forever.`,
    mineTriggered: "A mine is beeping angrily ...",
    crateDrop: "A supply crate is floating in!",
    crateCollected: (name: string, weaponName: string, amount: number) =>
      `${name} grabs the crate: +${amount}x ${weaponName}.`,
    crateDestroyed: "The supply crate got shredded.",
    suddenDeath: "SUDDEN DEATH! The water is rising!"
  }
} satisfies Record<SupportedLanguage, {
  waitingAction: string;
  playerTurn: (playerName: string, mercenaryName: string, weaponName: string) => string;
  wind: (direction: number, strength: number) => string;
  winner: (name: string) => string;
  draw: string;
  smokeClears: string;
  intro: string;
  introLog: string;
  start: string;
  mercenaryForward: (playerName: string, mercenaryName: string) => string;
  clockFaster: string;
  retreat: string;
  splash: (name: string) => string;
  drowned: (name: string) => string;
  mineTriggered: string;
  crateDrop: string;
  crateCollected: (name: string, weaponName: string, amount: number) => string;
  crateDestroyed: string;
  suddenDeath: string;
}>;

const mercenaryTemplates: Array<{
  role: ChaosKommandoMercenaryRole;
  name: string;
  spritePath: string;
  portraitPath: string;
  accentColor: string;
}> = [
  {
    role: "sprinter",
    name: "Turbo-Toni",
    spritePath: "/chaos-kommando/characters/marshmallow/portrait.png",
    portraitPath: "/chaos-kommando/characters/marshmallow/portrait.png",
    accentColor: "#22d3ee"
  },
  {
    role: "grenadier",
    name: "Greta Granate",
    spritePath: "/chaos-kommando/characters/marshmallow/portrait.png",
    portraitPath: "/chaos-kommando/characters/marshmallow/portrait.png",
    accentColor: "#fbbf24"
  },
  {
    role: "chaos-schuetze",
    name: "Bummo Blitz",
    spritePath: "/chaos-kommando/characters/marshmallow/portrait.png",
    portraitPath: "/chaos-kommando/characters/marshmallow/portrait.png",
    accentColor: "#fb7185"
  }
];

interface TerrainPreset {
  id: string;
  name: string;
  controlPoints: Array<{ x: number; y: number }>;
  /** Pre-carved caves and arches so maps start with real overhangs. */
  initialCraters: ChaosKommandoCraterState[];
}

const terrainPresets: TerrainPreset[] = [
  {
    id: "klapperkueste",
    name: "Klapperkueste",
    controlPoints: [
      { x: 0, y: 826 },
      { x: 150, y: 778 },
      { x: 320, y: 652 },
      { x: 430, y: 498 },
      { x: 610, y: 560 },
      { x: 820, y: 452 },
      { x: 990, y: 522 },
      { x: 1180, y: 690 },
      { x: 1390, y: 558 },
      { x: 1570, y: 432 },
      { x: 1750, y: 506 },
      { x: 1960, y: 644 },
      { x: 2140, y: 718 },
      { x: 2360, y: 834 }
    ],
    initialCraters: [
      { x: 610, y: 700, r: 66 },
      { x: 1180, y: 830, r: 78 },
      { x: 1750, y: 660, r: 62 }
    ]
  },
  {
    id: "seeschlund",
    name: "Seeschlund",
    controlPoints: [
      { x: 0, y: 792 },
      { x: 210, y: 702 },
      { x: 420, y: 530 },
      { x: 640, y: 446 },
      { x: 860, y: 608 },
      { x: 1080, y: 742 },
      { x: 1260, y: 620 },
      { x: 1450, y: 458 },
      { x: 1660, y: 508 },
      { x: 1860, y: 656 },
      { x: 2080, y: 578 },
      { x: 2230, y: 494 },
      { x: 2360, y: 734 }
    ],
    initialCraters: [
      { x: 640, y: 590, r: 58 },
      { x: 1450, y: 610, r: 70 },
      { x: 2080, y: 720, r: 64 }
    ]
  },
  {
    id: "brandungstreppe",
    name: "Brandungstreppe",
    controlPoints: [
      { x: 0, y: 842 },
      { x: 180, y: 764 },
      { x: 360, y: 662 },
      { x: 540, y: 560 },
      { x: 700, y: 450 },
      { x: 930, y: 612 },
      { x: 1180, y: 760 },
      { x: 1390, y: 594 },
      { x: 1580, y: 462 },
      { x: 1760, y: 526 },
      { x: 1940, y: 650 },
      { x: 2160, y: 706 },
      { x: 2360, y: 812 }
    ],
    initialCraters: [
      { x: 700, y: 590, r: 62 },
      { x: 1580, y: 600, r: 66 },
      { x: 930, y: 780, r: 72 }
    ]
  },
  {
    id: "wurmfelsen",
    name: "Wurmfelsen",
    controlPoints: [
      { x: 0, y: 860 },
      { x: 200, y: 730 },
      { x: 380, y: 520 },
      { x: 560, y: 470 },
      { x: 720, y: 640 },
      { x: 900, y: 780 },
      { x: 1120, y: 560 },
      { x: 1300, y: 440 },
      { x: 1480, y: 500 },
      { x: 1640, y: 700 },
      { x: 1840, y: 760 },
      { x: 2040, y: 560 },
      { x: 2200, y: 500 },
      { x: 2360, y: 720 }
    ],
    initialCraters: [
      { x: 560, y: 610, r: 74 },
      { x: 1300, y: 590, r: 82 },
      { x: 2100, y: 680, r: 68 },
      { x: 900, y: 920, r: 60 }
    ]
  }
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createSeed(context: ServerGameContext): number {
  let seed = context.now >>> 0;

  for (const player of context.players) {
    for (let index = 0; index < player.id.length; index += 1) {
      seed = (seed ^ player.id.charCodeAt(index) ^ (index * 374_761_393)) >>> 0;
      seed = Math.imul(seed ^ (seed >>> 13), 1_274_126_177) >>> 0;
    }
  }

  return seed || 0x51f15e;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_295;
  };
}

function pushActionLog(actionLog: string[], entry: string): string[] {
  return [entry, ...actionLog].slice(0, 5);
}

function normalizeStick(x: number, y: number): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);

  if (magnitude <= 0.0001) {
    return { x: 0, y: 0 };
  }

  if (magnitude <= 1) {
    return { x, y };
  }

  return {
    x: x / magnitude,
    y: y / magnitude
  };
}

function resolveAimAngle(aimX: number, aimY: number, fallback: number): number {
  const normalized = normalizeStick(aimX, aimY);

  if (normalized.x === 0 && normalized.y === 0) {
    return fallback;
  }

  return Math.atan2(normalized.y, normalized.x);
}

function buildWind(seed: number, language: SupportedLanguage): ChaosKommandoWindState {
  const rng = createRng(seed ^ 0xa53c9f);
  const direction = rng() > 0.5 ? 1 : -1;
  const strength = Math.round((0.1 + rng() * 0.9) * 100) / 100;

  return {
    strength,
    direction,
    label: chaosKommandoText[language].wind(direction, strength)
  };
}

function createSpawnAnchors(playerCount: number): number[] {
  switch (playerCount) {
    case 2:
      return [440, terrainWidth - 440];
    case 3:
      return [360, terrainWidth / 2, terrainWidth - 360];
    default:
      return [280, 820, terrainWidth - 820, terrainWidth - 280];
  }
}

function createMercenarySpawnXs(anchor: number, width: number): number[] {
  return [-250, 0, 250].map((offset) =>
    clamp(anchor + offset, mercenaryRadius + 16, width - mercenaryRadius - 16)
  );
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function resolvePresetHeight(
  preset: TerrainPreset,
  x: number
): number {
  const points = preset.controlPoints;

  if (x <= points[0].x) {
    return points[0].y;
  }

  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];

    if (x > right.x) {
      continue;
    }

    const blend = smoothStep(clamp((x - left.x) / Math.max(1, right.x - left.x), 0, 1));
    return left.y + (right.y - left.y) * blend;
  }

  return points[points.length - 1].y;
}

function resolveSampleHeight(samples: number[], x: number): number {
  const scaled = clamp(x / sampleSpacing, 0, samples.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
  const blend = scaled - leftIndex;
  return (samples[leftIndex] ?? samples[samples.length - 1]) * (1 - blend) + (samples[rightIndex] ?? samples[leftIndex] ?? 0) * blend;
}

function flattenTerrain(samples: number[], centerX: number, width: number, targetY: number): void {
  const startIndex = Math.max(0, Math.floor((centerX - width) / sampleSpacing));
  const endIndex = Math.min(samples.length - 1, Math.ceil((centerX + width) / sampleSpacing));

  for (let index = startIndex; index <= endIndex; index += 1) {
    const sampleX = index * sampleSpacing;
    const distance = Math.abs(sampleX - centerX);
    const influence = clamp(1 - distance / width, 0, 1);
    const blend = 1 - (1 - influence) * (1 - influence);
    samples[index] = samples[index] * (1 - blend) + targetY * blend;
  }
}

function createTerrain(playerCount: number, seed: number): ChaosKommandoTerrainState {
  const preset = terrainPresets[Math.abs(seed) % terrainPresets.length] ?? terrainPresets[0];
  const sampleCount = Math.floor(terrainWidth / sampleSpacing) + 1;
  const samples = Array.from({ length: sampleCount }, (_, index) => {
    const x = index * sampleSpacing;
    const sculpted =
      resolvePresetHeight(preset, x) +
      Math.sin(x / 64) * 7 +
      Math.cos(x / 118) * 5 +
      Math.sin(x / 28) * 2;

    return clamp(sculpted, 410, initialWaterlineY - 66);
  });

  const spawnAnchors = createSpawnAnchors(playerCount);

  for (const anchorX of spawnAnchors) {
    for (const spawnX of createMercenarySpawnXs(anchorX, terrainWidth)) {
      flattenTerrain(samples, spawnX, 118, clamp(resolveSampleHeight(samples, spawnX) - 6, 430, 660));
    }
  }

  return {
    mapId: preset.id,
    mapName: preset.name,
    width: terrainWidth,
    height: terrainHeight,
    waterlineY: initialWaterlineY,
    sampleSpacing,
    samples,
    craters: preset.initialCraters.map((crater) => ({ ...crater }))
  };
}

/**
 * Base heightmap surface (without craters). Used for initial placement only.
 */
function resolveBaseGroundY(terrain: ChaosKommandoTerrainState, x: number): number {
  return resolveSampleHeight(terrain.samples, clamp(x, 0, terrain.width));
}

/**
 * True 2D solidity test: below the heightmap AND not inside any crater.
 * This is what makes tunnels, caves and overhangs possible.
 */
function isTerrainSolid(terrain: ChaosKommandoTerrainState, x: number, y: number): boolean {
  if (x < 0 || x > terrain.width || y < 0) {
    return false;
  }

  if (y >= terrain.height) {
    return true;
  }

  if (y < resolveBaseGroundY(terrain, x)) {
    return false;
  }

  const craters = terrain.craters;

  for (let index = 0; index < craters.length; index += 1) {
    const crater = craters[index];
    const dx = x - crater.x;
    const dy = y - crater.y;

    if (dx * dx + dy * dy < crater.r * crater.r) {
      return false;
    }
  }

  return true;
}

/**
 * Scan downward for the first solid pixel (2px steps). Returns null when
 * nothing solid exists in the window.
 */
function findSurfaceBelow(
  terrain: ChaosKommandoTerrainState,
  x: number,
  fromY: number,
  toY: number
): number | null {
  const start = Math.max(0, fromY);
  const end = Math.min(terrain.height, toY);

  for (let y = start; y <= end; y += 2) {
    if (isTerrainSolid(terrain, x, y)) {
      return y;
    }
  }

  return null;
}

/** First solid surface scanning from the sky. Used for spawning objects. */
function resolveSpawnSurfaceY(terrain: ChaosKommandoTerrainState, x: number): number {
  return findSurfaceBelow(terrain, x, 0, terrain.height) ?? resolveBaseGroundY(terrain, x);
}

function buildAmmo(): Record<ChaosKommandoWeaponId, number> {
  return {
    "kicher-bazooka": 99,
    "enten-granate": 99,
    "plunder-pistole": 99,
    "regenbogen-rakete": 1,
    "splitter-granate": 3,
    "konfetti-schrot": 4,
    "bohrer-rakete": 2,
    "gummi-huhn": 2,
    "seifenblasen-bombe": 2,
    "keks-moerser": 3,
    dynamit: 2,
    "heilige-granate": 1,
    banane: 2,
    luftschlag: 1,
    "baseball-schlaeger": 3,
    minigun: 3
  };
}

function createMercenary(
  player: ServerGameContext["players"][number],
  template: (typeof mercenaryTemplates)[number],
  mercenaryIndex: number,
  spawnX: number,
  terrain: ChaosKommandoTerrainState
): RuntimeMercenaryState {
  const x = clamp(spawnX, mercenaryRadius + 4, terrain.width - mercenaryRadius - 4);
  const y = resolveSpawnSurfaceY(terrain, x) - mercenaryRadius;

  return {
    id: `${player.id}:merc:${mercenaryIndex}`,
    name: template.name,
    role: template.role,
    playerId: player.id,
    playerName: player.name,
    teamColor: player.color,
    accentColor: template.accentColor,
    spritePath: template.spritePath,
    portraitPath: template.portraitPath,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: mercenaryRadius,
    hp: 100,
    maxHp: 100,
    alive: true,
    grounded: true,
    facing: mercenaryIndex % 2 === 0 ? "right" : "left",
    aimAngleRad: mercenaryIndex % 2 === 0 ? -Math.PI / 4 : (-Math.PI * 3) / 4,
    ammo: buildAmmo(),
    moveInputX: 0,
    jumpReadyAt: 0,
    airborneFromY: null,
    deathExploded: false
  };
}

function createMines(
  terrain: ChaosKommandoTerrainState,
  playerCount: number,
  seed: number
): RuntimeMineState[] {
  const rng = createRng(seed ^ 0x77aa11);
  const spawnAnchors = createSpawnAnchors(playerCount);
  const mines: RuntimeMineState[] = [];
  const mineCount = 5 + playerCount;
  let attempts = 0;

  while (mines.length < mineCount && attempts < 80) {
    attempts += 1;
    const x = 140 + rng() * (terrain.width - 280);
    const nearSpawn = spawnAnchors.some((anchor) => Math.abs(anchor - x) < 220);

    if (nearSpawn) {
      continue;
    }

    const surfaceY = findSurfaceBelow(terrain, x, 0, terrain.waterlineY - 20);

    if (surfaceY === null) {
      continue;
    }

    mines.push({
      id: `mine:${mines.length}:${Math.round(x)}`,
      x,
      y: surfaceY - mineRadius,
      vx: 0,
      vy: 0,
      radius: mineRadius,
      grounded: true,
      explodesAt: null
    });
  }

  return mines;
}

function countAliveMercenaries(mercenaries: RuntimeMercenaryState[]): number {
  return mercenaries.filter((mercenary) => mercenary.alive).length;
}

function createPlayers(
  players: ServerGameContext["players"],
  terrain: ChaosKommandoTerrainState
): RuntimePlayerState[] {
  const safePlayers = players.length > 0
    ? players
    : [
        {
          id: "chaos-p1",
          name: "Spieler 1",
          color: "#38bdf8",
          score: 0,
          isReady: true,
          connected: true
        },
        {
          id: "chaos-p2",
          name: "Spieler 2",
          color: "#fb7185",
          score: 0,
          isReady: true,
          connected: true
        }
      ];
  const anchors = createSpawnAnchors(safePlayers.length);

  return safePlayers.map((player, playerIndex) => {
    const anchor = anchors[playerIndex] ?? anchors[anchors.length - 1] ?? terrain.width / 2;
    const spawnXs = createMercenarySpawnXs(anchor, terrain.width);
    const mercenaries = mercenaryTemplates.map((template, mercenaryIndex) =>
      createMercenary(
        player,
        template,
        mercenaryIndex,
        spawnXs[mercenaryIndex] ?? anchor,
        terrain
      )
    );

    return {
      playerId: player.id,
      name: player.name,
      color: player.color,
      mercenaries,
      aliveMercenaryCount: countAliveMercenaries(mercenaries),
      eliminated: false
    };
  });
}

function resolveFirstAliveMercenaryId(player: RuntimePlayerState | undefined): string {
  return player?.mercenaries.find((mercenary) => mercenary.alive)?.id ?? "";
}

function findPlayer(state: { players: RuntimePlayerState[] }, playerId: string): RuntimePlayerState | undefined {
  return state.players.find((player) => player.playerId === playerId);
}

function findMercenaryById(
  state: { players: RuntimePlayerState[] },
  mercenaryId: string
): RuntimeMercenaryState | undefined {
  for (const player of state.players) {
    const mercenary = player.mercenaries.find((entry) => entry.id === mercenaryId);

    if (mercenary) {
      return mercenary;
    }
  }

  return undefined;
}

function hasGravestoneForMercenary(
  state: { gravestones: RuntimeGravestoneState[] },
  mercenaryId: string
): boolean {
  return state.gravestones.some((gravestone) => gravestone.mercenaryId === mercenaryId);
}

function findWeaponDefinition(weaponId: ChaosKommandoWeaponId): ChaosKommandoWeaponDefinition {
  return (
    weaponDefinitions.find((definition) => definition.id === weaponId) ??
    weaponDefinitions[0]
  );
}

function resolveAvailableWeapon(
  mercenary: RuntimeMercenaryState | undefined,
  preferredWeaponId: ChaosKommandoWeaponId | undefined
): ChaosKommandoWeaponId {
  if (mercenary && preferredWeaponId && (mercenary.ammo[preferredWeaponId] ?? 0) > 0) {
    return preferredWeaponId;
  }

  for (const definition of weaponDefinitions) {
    if ((mercenary?.ammo[definition.id] ?? 0) > 0) {
      return definition.id;
    }
  }

  return "kicher-bazooka";
}

function isBouncyWeapon(weaponId: ChaosKommandoWeaponId): boolean {
  return (
    weaponId === "enten-granate" ||
    weaponId === "splitter-granate" ||
    weaponId === "gummi-huhn" ||
    weaponId === "heilige-granate" ||
    weaponId === "dynamit"
  );
}

function resolveProjectileRadius(weaponId: ChaosKommandoWeaponId): number {
  switch (weaponId) {
    case "plunder-pistole":
      return 7;
    case "konfetti-schrot":
    case "minigun":
      return 4;
    case "enten-granate":
    case "splitter-granate":
      return 10;
    case "gummi-huhn":
      return 13;
    case "seifenblasen-bombe":
      return 15;
    case "keks-moerser":
      return 12;
    case "bohrer-rakete":
      return 9;
    case "dynamit":
      return 11;
    case "heilige-granate":
      return 14;
    case "banane":
      return 10;
    case "luftschlag":
      return 10;
    case "kicher-bazooka":
    case "regenbogen-rakete":
    default:
      return 10;
  }
}

function resolveProjectileBounceFactor(weaponId: ChaosKommandoWeaponId): number {
  switch (weaponId) {
    case "gummi-huhn":
      return 0.72;
    case "splitter-granate":
      return 0.5;
    case "enten-granate":
      return 0.48;
    case "heilige-granate":
      return 0.34;
    case "banane":
      return 0.55;
    case "dynamit":
      return 0.05;
    default:
      return 0.18;
  }
}

function refreshPlayerSummaries(players: RuntimePlayerState[]): RuntimePlayerState[] {
  return players.map((player) => {
    const aliveMercenaryCount = countAliveMercenaries(player.mercenaries);

    return {
      ...player,
      aliveMercenaryCount,
      eliminated: aliveMercenaryCount === 0
    };
  });
}

function countAliveTeams(players: RuntimePlayerState[]): number {
  return players.filter((player) => player.aliveMercenaryCount > 0).length;
}

function buildTurnState(players: RuntimePlayerState[], now: number): RuntimeTurnState {
  const currentPlayer = players.find((player) => player.aliveMercenaryCount > 0) ?? players[0];
  const activeMercenaryId = resolveFirstAliveMercenaryId(currentPlayer);
  const activeMercenary = activeMercenaryId ? findMercenaryById({ players }, activeMercenaryId) : undefined;
  const aimAngleRad = activeMercenary?.aimAngleRad ?? -Math.PI / 4;

  return {
    turnNumber: 1,
    currentPlayerId: currentPlayer?.playerId ?? "",
    activeMercenaryId,
    currentWeaponId: resolveAvailableWeapon(activeMercenary, "kicher-bazooka"),
    turnEndsAt: now + turnDurationMs,
    hasFired: false,
    resolvingShot: false,
    chargeStartedAt: null,
    chargeRatio: 0,
    settleEndsAt: null,
    retreatEndsAt: null,
    crosshairX: (activeMercenary?.x ?? terrainWidth / 2) + Math.cos(aimAngleRad) * crosshairDistance,
    crosshairY: (activeMercenary?.y ?? terrainHeight / 2) + Math.sin(aimAngleRad) * crosshairDistance,
    crosshairDistance,
    orderPlayerIds: players.map((player) => player.playerId)
  };
}

function findCurrentPlayerIndex(state: ChaosKommandoRuntimeState): number {
  return state.turn.orderPlayerIds.findIndex((playerId) => playerId === state.turn.currentPlayerId);
}

function buildTurnMessage(state: ChaosKommandoRuntimeState): string {
  const player = findPlayer(state, state.turn.currentPlayerId);
  const mercenary = findMercenaryById(state, state.turn.activeMercenaryId);
  const text = chaosKommandoText[state.language];

  if (!player || !mercenary) {
    return text.waitingAction;
  }

  const weapon = localizeWeaponDefinition(findWeaponDefinition(state.turn.currentWeaponId), state.language);
  return text.playerTurn(player.name, mercenary.name, weapon.displayName);
}

function resolveCrosshairPosition(
  mercenary: RuntimeMercenaryState | null | undefined,
  fallbackAngleRad: number
): { x: number; y: number } {
  if (!mercenary) {
    return {
      x: terrainWidth / 2 + Math.cos(fallbackAngleRad) * crosshairDistance,
      y: terrainHeight / 2 + Math.sin(fallbackAngleRad) * crosshairDistance
    };
  }

  return {
    x: mercenary.x + Math.cos(fallbackAngleRad) * crosshairDistance,
    y: mercenary.y + Math.sin(fallbackAngleRad) * crosshairDistance
  };
}

function syncTurnPresentation(
  state: ChaosKommandoRuntimeState,
  now: number
): ChaosKommandoRuntimeState {
  const activeMercenary = findMercenaryById(state, state.turn.activeMercenaryId);
  const aimAngleRad = activeMercenary?.aimAngleRad ?? -Math.PI / 4;
  const weapon = findWeaponDefinition(state.turn.currentWeaponId);
  const crosshair = resolveCrosshairPosition(activeMercenary, aimAngleRad);
  const chargeRatio =
    state.turn.chargeStartedAt !== null &&
    !state.turn.hasFired &&
    !state.turn.resolvingShot &&
    weapon.fireMode === "charged"
      ? clamp((now - state.turn.chargeStartedAt) / chargeWindowMs, 0, 1)
      : 0;

  return {
    ...state,
    turn: {
      ...state.turn,
      chargeRatio,
      crosshairX: crosshair.x,
      crosshairY: crosshair.y,
      crosshairDistance
    },
    updatedAt: now
  };
}

function resolveCameraFocus(state: ChaosKommandoRuntimeState): { x: number; y: number } {
  const projectile = state.projectiles[state.projectiles.length - 1];

  if (projectile) {
    return { x: projectile.x, y: projectile.y };
  }

  if (state.activeDeathSequence) {
    const doomedMercenary = findMercenaryById(state, state.activeDeathSequence.mercenaryId);

    if (doomedMercenary) {
      return { x: doomedMercenary.x, y: doomedMercenary.y };
    }
  }

  const triggeredMine = state.mines.find((mine) => mine.explodesAt !== null);

  if (triggeredMine) {
    return { x: triggeredMine.x, y: triggeredMine.y };
  }

  const mercenary = findMercenaryById(state, state.turn.activeMercenaryId);

  if (mercenary) {
    return { x: mercenary.x, y: mercenary.y };
  }

  return { x: state.terrain.width / 2, y: state.terrain.height / 2 };
}

function spawnCrateIfDue(
  state: ChaosKommandoRuntimeState,
  turnNumber: number,
  now: number
): ChaosKommandoRuntimeState {
  if (turnNumber < 2 || turnNumber % crateDropEveryNTurns !== 0) {
    return state;
  }

  const rng = createRng(state.seed ^ (turnNumber * 613));
  const crateWeapons: ChaosKommandoWeaponId[] = [
    "dynamit",
    "heilige-granate",
    "banane",
    "luftschlag",
    "minigun",
    "regenbogen-rakete",
    "bohrer-rakete",
    "seifenblasen-bombe",
    "gummi-huhn",
    "keks-moerser"
  ];
  const weaponId = crateWeapons[Math.floor(rng() * crateWeapons.length)] ?? "banane";
  const x = 160 + rng() * (state.terrain.width - 320);
  const text = chaosKommandoText[state.language];

  return {
    ...state,
    crates: [
      ...state.crates,
      {
        id: `crate:${turnNumber}`,
        x,
        y: -30,
        vx: 0,
        vy: 30,
        radius: crateRadius,
        grounded: false,
        weaponId,
        amount: 1 + Math.floor(rng() * 2)
      }
    ],
    actionLog: pushActionLog(state.actionLog, text.crateDrop),
    updatedAt: now
  };
}

function applySuddenDeath(
  state: ChaosKommandoRuntimeState,
  turnNumber: number,
  now: number
): ChaosKommandoRuntimeState {
  if (turnNumber < suddenDeathTurn) {
    return state;
  }

  const nextWaterlineY = Math.max(560, state.terrain.waterlineY - suddenDeathWaterRisePerTurn);
  const text = chaosKommandoText[state.language];

  return {
    ...state,
    suddenDeath: true,
    terrain: {
      ...state.terrain,
      waterlineY: nextWaterlineY
    },
    actionLog:
      turnNumber === suddenDeathTurn
        ? pushActionLog(state.actionLog, text.suddenDeath)
        : state.actionLog,
    updatedAt: now
  };
}

function startPlayerTurn(
  state: ChaosKommandoRuntimeState,
  playerId: string,
  activeMercenaryId: string,
  now: number,
  turnNumber: number,
  reason: string
): ChaosKommandoRuntimeState {
  const activeMercenary = findMercenaryById(state, activeMercenaryId);
  const nextWeaponId = resolveAvailableWeapon(activeMercenary, state.turn.currentWeaponId);
  const isNewTurn = turnNumber !== state.turn.turnNumber;

  let nextState: ChaosKommandoRuntimeState = {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      mercenaries: player.mercenaries.map((mercenary) => ({
        ...mercenary,
        moveInputX: 0
      }))
    })),
    turn: {
      ...state.turn,
      turnNumber,
      currentPlayerId: playerId,
      activeMercenaryId,
      currentWeaponId: nextWeaponId,
      turnEndsAt: now + turnDurationMs,
      hasFired: false,
      resolvingShot: false,
      chargeStartedAt: null,
      chargeRatio: 0,
      settleEndsAt: null,
      retreatEndsAt: null
    },
    actionLog: pushActionLog(state.actionLog, reason),
    updatedAt: now
  };

  if (isNewTurn) {
    // Worms style: fresh wind every single turn.
    nextState = {
      ...nextState,
      wind: buildWind(nextState.seed ^ (turnNumber * 131), nextState.language)
    };
    nextState = applySuddenDeath(nextState, turnNumber, now);
    nextState = spawnCrateIfDue(nextState, turnNumber, now);
  }

  const focus = resolveCameraFocus(nextState);

  return {
    ...syncTurnPresentation(nextState, now),
    cameraFocusX: focus.x,
    cameraFocusY: focus.y,
    message: buildTurnMessage(nextState)
  };
}

function resolveNextTurn(state: ChaosKommandoRuntimeState, now: number, reason: string): ChaosKommandoRuntimeState {
  const currentIndex = findCurrentPlayerIndex(state);
  const order = state.turn.orderPlayerIds;

  for (let offset = 1; offset <= order.length; offset += 1) {
    const nextIndex = (currentIndex + offset + order.length) % order.length;
    const nextPlayer = findPlayer(state, order[nextIndex]);

    if (!nextPlayer || nextPlayer.aliveMercenaryCount === 0) {
      continue;
    }

    return startPlayerTurn(
      state,
      nextPlayer.playerId,
      resolveFirstAliveMercenaryId(nextPlayer),
      now,
      state.turn.turnNumber + 1,
      reason
    );
  }

  return state;
}

/**
 * True 2D destruction: every blast punches a circular crater into the terrain.
 */
function updateTerrainForExplosion(
  terrain: ChaosKommandoTerrainState,
  x: number,
  y: number,
  radius: number,
  craterDepth: number
): ChaosKommandoTerrainState {
  if (craterDepth <= 0 || radius <= 4) {
    return terrain;
  }

  const craterRadius = Math.max(8, radius * 0.9);

  return {
    ...terrain,
    craters: [...terrain.craters, { x: Math.round(x), y: Math.round(y), r: Math.round(craterRadius) }]
  };
}

interface ExplosionOptions {
  /** Base knockback strength; scales with proximity. */
  pushStrength?: number;
  /** When set, knockback is applied along this fixed direction (baseball bat). */
  pushAngleRad?: number;
}

function applyExplosion(
  state: ChaosKommandoRuntimeState,
  explosionX: number,
  explosionY: number,
  definition: ChaosKommandoWeaponDefinition,
  now: number,
  ownerPlayerId: string,
  sourceWeaponId: ChaosKommandoExplosionSourceId = definition.id,
  options: ExplosionOptions = {}
): ChaosKommandoRuntimeState {
  const nextTerrain = updateTerrainForExplosion(
    state.terrain,
    explosionX,
    explosionY,
    definition.blastRadius,
    definition.craterDepth
  );
  const basePush = options.pushStrength ?? 250 + definition.damage * 2.6;
  const nextPlayers = state.players.map((player) => ({
    ...player,
    mercenaries: player.mercenaries.map((mercenary) => {
      const dx = mercenary.x - explosionX;
      const dy = mercenary.y - explosionY;
      const distance = Math.hypot(dx, dy);

      if (distance > definition.blastRadius) {
        return mercenary;
      }

      const normalizedDistance = clamp(distance / definition.blastRadius, 0, 1);
      const safeDistance = Math.max(distance, 8);
      const pushStrength = (1 - normalizedDistance * 0.72) * basePush;
      const pushX = options.pushAngleRad !== undefined ? Math.cos(options.pushAngleRad) : dx / safeDistance;
      const pushY = options.pushAngleRad !== undefined ? Math.sin(options.pushAngleRad) : dy / safeDistance;
      const damage = mercenary.alive
        ? definition.damage > 0
          ? Math.max(1, Math.round(definition.damage * (1 - normalizedDistance * 0.85)))
          : 0
        : 0;
      const nextHp = Math.max(0, mercenary.hp - damage);
      const killed = mercenary.alive && nextHp <= 0;

      return {
        ...mercenary,
        hp: nextHp,
        alive: mercenary.alive ? !killed : false,
        grounded: false,
        vx: mercenary.vx + pushX * pushStrength,
        vy: mercenary.vy + pushY * pushStrength - 130,
        airborneFromY: mercenary.y
      };
    })
  }));
  const nextGravestones = state.gravestones.map((gravestone) => {
    const dx = gravestone.x - explosionX;
    const dy = gravestone.y - explosionY;
    const distance = Math.hypot(dx, dy);

    if (distance > definition.blastRadius) {
      return gravestone;
    }

    const normalizedDistance = clamp(distance / definition.blastRadius, 0, 1);
    const safeDistance = Math.max(distance, 8);
    const pushStrength = (1 - normalizedDistance) * 320;

    return {
      ...gravestone,
      grounded: false,
      vx: gravestone.vx + (dx / safeDistance) * pushStrength,
      vy: gravestone.vy + (dy / safeDistance) * pushStrength - 120
    };
  });
  // Chain-trigger nearby mines and knock them around.
  const nextMines = state.mines.map((mine) => {
    const dx = mine.x - explosionX;
    const dy = mine.y - explosionY;
    const distance = Math.hypot(dx, dy);

    if (distance > definition.blastRadius * 1.15) {
      return mine;
    }

    const safeDistance = Math.max(distance, 8);
    const pushStrength = (1 - clamp(distance / definition.blastRadius, 0, 1)) * 260;

    return {
      ...mine,
      grounded: false,
      vx: mine.vx + (dx / safeDistance) * pushStrength,
      vy: mine.vy + (dy / safeDistance) * pushStrength - 90,
      explodesAt: mine.explodesAt === null ? now + 350 : Math.min(mine.explodesAt, now + 350)
    };
  });
  // Blasts shred supply crates.
  const survivingCrates = state.crates.filter(
    (crate) => Math.hypot(crate.x - explosionX, crate.y - explosionY) > definition.blastRadius
  );
  const crateDestroyed = survivingCrates.length !== state.crates.length;
  const refreshedPlayers = refreshPlayerSummaries(nextPlayers);
  const explosion: ChaosKommandoExplosionState = {
    id: `explosion:${now}:${Math.round(explosionX)}:${Math.round(explosionY)}`,
    sourceWeaponId,
    x: explosionX,
    y: explosionY,
    radius: definition.blastRadius,
    color: definition.accentColor,
    createdAt: now
  };
  const text = chaosKommandoText[state.language];
  let actionLog = pushActionLog(
    state.actionLog,
    `${findPlayer(state, ownerPlayerId)?.name ?? "Ein Team"} locht das Terrain mit ${definition.displayName}.`
  );

  if (crateDestroyed) {
    actionLog = pushActionLog(actionLog, text.crateDestroyed);
  }

  const nextState: ChaosKommandoRuntimeState = {
    ...state,
    terrain: nextTerrain,
    players: refreshedPlayers,
    gravestones: nextGravestones,
    mines: nextMines,
    crates: survivingCrates,
    explosions: [explosion, ...state.explosions].slice(0, 14),
    actionLog,
    updatedAt: now
  };
  const focus = resolveCameraFocus(nextState);

  return {
    ...nextState,
    cameraFocusX: focus.x,
    cameraFocusY: focus.y
  };
}

function markMercenaryDeathExploded(
  state: ChaosKommandoRuntimeState,
  mercenaryId: string
): ChaosKommandoRuntimeState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      mercenaries: player.mercenaries.map((mercenary) =>
        mercenary.id === mercenaryId
          ? {
              ...mercenary,
              deathExploded: true
            }
          : mercenary
      )
    }))
  };
}

function buildDeathExplosionDefinition(mercenary: RuntimeMercenaryState): ChaosKommandoWeaponDefinition {
  return {
    id: "enten-granate",
    displayName: "Abschieds-BUMM",
    description: "Wenn ein Soeldner faellt, gibt es noch eine letzte Gemeinheit.",
    iconPath: mercenary.portraitPath,
    accentColor: mercenary.accentColor,
    fireMode: "instant",
    damage: deathExplosionDamage,
    blastRadius: deathExplosionRadius,
    projectileSpeed: 0,
    gravityScale: 1,
    windScale: 0,
    fuseMs: null,
    craterDepth: deathExplosionCraterDepth
  };
}

function queueDeadMercenaries(
  state: ChaosKommandoRuntimeState,
): ChaosKommandoRuntimeState {
  const queued = [...state.deathQueueMercenaryIds];
  let changed = false;

  for (const mercenary of state.players.flatMap((player) => player.mercenaries)) {
    if (mercenary.alive || mercenary.deathExploded) {
      continue;
    }

    if (
      queued.includes(mercenary.id) ||
      state.activeDeathSequence?.mercenaryId === mercenary.id ||
      hasGravestoneForMercenary(state, mercenary.id)
    ) {
      continue;
    }

    queued.push(mercenary.id);
    changed = true;
  }

  return changed
    ? {
        ...state,
        deathQueueMercenaryIds: queued
      }
    : state;
}

function startNextDeathSequence(
  state: ChaosKommandoRuntimeState,
  now: number
): ChaosKommandoRuntimeState {
  if (state.activeDeathSequence || state.deathQueueMercenaryIds.length === 0) {
    return state;
  }

  return {
    ...state,
    deathQueueMercenaryIds: state.deathQueueMercenaryIds.slice(1),
    activeDeathSequence: {
      mercenaryId: state.deathQueueMercenaryIds[0],
      explodeAt: now + deathExplosionDelayMs,
      gravestoneAt: null
    }
  };
}

function createGravestone(
  state: ChaosKommandoRuntimeState,
  mercenary: RuntimeMercenaryState
): RuntimeGravestoneState {
  const x = clamp(mercenary.x, gravestoneRadius + 12, state.terrain.width - gravestoneRadius - 12);
  const groundY = resolveSpawnSurfaceY(state.terrain, x);

  return {
    id: `gravestone:${mercenary.id}`,
    mercenaryId: mercenary.id,
    playerId: mercenary.playerId,
    x,
    y: Math.min(mercenary.y, groundY - gravestoneRadius - 6),
    vx: clamp(mercenary.vx * 0.14, -90, 90),
    vy: -120,
    radius: gravestoneRadius,
    grounded: false
  };
}

function resolveDeathSequences(
  state: ChaosKommandoRuntimeState,
  now: number
): ChaosKommandoRuntimeState {
  let nextState = startNextDeathSequence(queueDeadMercenaries(state), now);
  const activeSequence = nextState.activeDeathSequence;

  if (!activeSequence) {
    return nextState;
  }

  const doomedMercenary = findMercenaryById(nextState, activeSequence.mercenaryId);

  if (!doomedMercenary) {
    return {
      ...nextState,
      activeDeathSequence: null
    };
  }

  if (activeSequence.gravestoneAt === null) {
    if (now < activeSequence.explodeAt) {
      return nextState;
    }

    const explodedState = applyExplosion(
      markMercenaryDeathExploded(nextState, doomedMercenary.id),
      doomedMercenary.x,
      doomedMercenary.y,
      buildDeathExplosionDefinition(doomedMercenary),
      now,
      doomedMercenary.playerId,
      "abschieds-bumm"
    );

    return {
      ...explodedState,
      activeDeathSequence: {
        ...activeSequence,
        gravestoneAt: now + gravestoneSpawnDelayMs
      }
    };
  }

  if (now < activeSequence.gravestoneAt) {
    return nextState;
  }

  const withGravestone = hasGravestoneForMercenary(nextState, doomedMercenary.id)
    ? nextState
    : {
        ...nextState,
        gravestones: [...nextState.gravestones, createGravestone(nextState, doomedMercenary)],
        updatedAt: now
      };

  return startNextDeathSequence(
    {
      ...withGravestone,
      activeDeathSequence: null
    },
    now
  );
}

function markProjectileSettling(state: ChaosKommandoRuntimeState, now: number): ChaosKommandoRuntimeState {
  return {
    ...state,
    turn: {
      ...state.turn,
      resolvingShot: true,
      settleEndsAt: now + settleDelayMs,
      chargeStartedAt: null
    },
    updatedAt: now
  };
}

function removeProjectileSilently(
  state: ChaosKommandoRuntimeState,
  projectile: RuntimeProjectileState,
  now: number,
  logEntry?: string
): ChaosKommandoRuntimeState {
  return markProjectileSettling(
    {
      ...state,
      projectiles: state.projectiles.filter((entry) => entry.id !== projectile.id),
      actionLog: logEntry ? pushActionLog(state.actionLog, logEntry) : state.actionLog,
      updatedAt: now
    },
    now
  );
}

function spawnBananaChildren(
  state: ChaosKommandoRuntimeState,
  projectile: RuntimeProjectileState,
  now: number
): ChaosKommandoRuntimeState {
  const rng = createRng(state.seed ^ Math.round(projectile.x * 17 + projectile.y * 31));
  const children: RuntimeProjectileState[] = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + (index - 2) * 0.42 + (rng() - 0.5) * 0.2;
    const speed = 240 + rng() * 160;

    return {
      id: `${projectile.id}:child:${index}`,
      weaponId: "banane" as const,
      ownerPlayerId: projectile.ownerPlayerId,
      ownerMercenaryId: projectile.ownerMercenaryId,
      x: projectile.x,
      y: projectile.y - 6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 7,
      ageMs: 0,
      fuseMs: 1_050 + index * 130,
      armed: true,
      damage: 26,
      blastRadius: 64,
      craterDepth: 34,
      gravityScale: 1.05,
      windScale: 0,
      splashColor: "#fde047",
      bounceFactor: 0.55,
      generation: 1
    };
  });

  return {
    ...state,
    projectiles: [...state.projectiles, ...children],
    updatedAt: now
  };
}

function detonateProjectile(
  state: ChaosKommandoRuntimeState,
  projectile: RuntimeProjectileState,
  now: number
): ChaosKommandoRuntimeState {
  const baseDefinition = findWeaponDefinition(projectile.weaponId);
  const definition: ChaosKommandoWeaponDefinition = {
    ...baseDefinition,
    damage: projectile.damage,
    blastRadius: projectile.blastRadius,
    craterDepth: projectile.craterDepth,
    gravityScale: projectile.gravityScale,
    accentColor: projectile.splashColor
  };
  const nextProjectiles = state.projectiles.filter((entry) => entry.id !== projectile.id);
  const withRemovedProjectile: ChaosKommandoRuntimeState = {
    ...state,
    projectiles: nextProjectiles,
    updatedAt: now
  };
  let explodedState = applyExplosion(
    withRemovedProjectile,
    projectile.x,
    projectile.y,
    definition,
    now,
    projectile.ownerPlayerId
  );

  if (projectile.weaponId === "splitter-granate") {
    const shardDefinition: ChaosKommandoWeaponDefinition = {
      ...definition,
      displayName: "Splitterwolke",
      damage: 13,
      blastRadius: 42,
      craterDepth: 14,
      accentColor: "#facc15"
    };

    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6 + Math.PI / 7;
      const distance = 50 + (index % 2) * 16;
      explodedState = applyExplosion(
        explodedState,
        projectile.x + Math.cos(angle) * distance,
        projectile.y + Math.sin(angle) * distance * 0.7,
        shardDefinition,
        now,
        projectile.ownerPlayerId,
        projectile.weaponId
      );
    }
  }

  if (projectile.weaponId === "banane" && projectile.generation === 0) {
    explodedState = spawnBananaChildren(explodedState, projectile, now);
  }

  return markProjectileSettling(explodedState, now);
}

function createProjectile(
  id: string,
  weaponId: ChaosKommandoWeaponId,
  definition: ChaosKommandoWeaponDefinition,
  owner: RuntimeMercenaryState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  overrides: Partial<RuntimeProjectileState> = {}
): RuntimeProjectileState {
  return {
    id,
    weaponId,
    ownerPlayerId: owner.playerId,
    ownerMercenaryId: owner.id,
    x,
    y,
    vx,
    vy,
    radius: resolveProjectileRadius(weaponId),
    ageMs: 0,
    fuseMs: definition.fuseMs,
    armed: false,
    damage: definition.damage,
    blastRadius: definition.blastRadius,
    craterDepth: definition.craterDepth,
    gravityScale: definition.gravityScale,
    windScale: definition.windScale,
    splashColor: definition.accentColor,
    bounceFactor: resolveProjectileBounceFactor(weaponId),
    generation: 0,
    ...overrides
  };
}

function buildFiredProjectiles(
  state: ChaosKommandoRuntimeState,
  mercenary: RuntimeMercenaryState,
  weaponId: ChaosKommandoWeaponId,
  definition: ChaosKommandoWeaponDefinition,
  chargeRatio: number,
  now: number
): RuntimeProjectileState[] {
  const angle = mercenary.aimAngleRad;
  const launchSpeed = definition.projectileSpeed * chargeRatio;

  if (weaponId === "dynamit") {
    // Placed at the mercenary's feet: run!
    return [
      createProjectile(
        `projectile:${now}:${mercenary.id}:0`,
        weaponId,
        definition,
        mercenary,
        mercenary.x + Math.cos(angle) * 6,
        mercenary.y,
        0,
        -40,
        { armed: true }
      )
    ];
  }

  if (weaponId === "luftschlag") {
    // Four bombs raining down onto the aiming direction.
    const targetX = clamp(
      mercenary.x + Math.cos(angle) * 560,
      120,
      state.terrain.width - 120
    );
    const driftDirection = Math.cos(angle) >= 0 ? 1 : -1;

    return Array.from({ length: 4 }, (_, index) =>
      createProjectile(
        `projectile:${now}:${mercenary.id}:${index}`,
        weaponId,
        definition,
        mercenary,
        targetX - driftDirection * 190 + driftDirection * index * 64,
        -50 - index * 44,
        driftDirection * 96,
        150,
        { armed: true }
      )
    );
  }

  if (weaponId === "konfetti-schrot") {
    return [-0.18, -0.09, 0, 0.09, 0.18].map((spread, index) => {
      const projectileAngle = angle + spread;
      const speed = definition.projectileSpeed * (0.9 + index * 0.035);

      return createProjectile(
        `projectile:${now}:${mercenary.id}:${index}`,
        weaponId,
        definition,
        mercenary,
        mercenary.x + Math.cos(projectileAngle) * mercenary.radius * 1.35,
        mercenary.y + Math.sin(projectileAngle) * mercenary.radius * 1.35,
        Math.cos(projectileAngle) * speed,
        Math.sin(projectileAngle) * speed
      );
    });
  }

  if (weaponId === "minigun") {
    const rng = createRng(state.seed ^ now);

    return Array.from({ length: 10 }, (_, index) => {
      const projectileAngle = angle + (rng() - 0.5) * 0.11;
      const speed = definition.projectileSpeed * (0.9 + rng() * 0.18);
      const startOffset = mercenary.radius * 1.35 + index * 9;

      return createProjectile(
        `projectile:${now}:${mercenary.id}:${index}`,
        weaponId,
        definition,
        mercenary,
        mercenary.x + Math.cos(projectileAngle) * startOffset,
        mercenary.y + Math.sin(projectileAngle) * startOffset,
        Math.cos(projectileAngle) * speed,
        Math.sin(projectileAngle) * speed
      );
    });
  }

  return [
    createProjectile(
      `projectile:${now}:${mercenary.id}:0`,
      weaponId,
      definition,
      mercenary,
      mercenary.x + Math.cos(angle) * mercenary.radius * 1.3,
      mercenary.y + Math.sin(angle) * mercenary.radius * 1.3,
      Math.cos(angle) * launchSpeed,
      Math.sin(angle) * launchSpeed
    )
  ];
}

function fireActiveWeapon(
  state: ChaosKommandoRuntimeState,
  now: number,
  chargeRatio: number
): ChaosKommandoRuntimeState {
  const activeMercenary = findMercenaryById(state, state.turn.activeMercenaryId);

  if (!activeMercenary || !activeMercenary.alive) {
    return state;
  }

  const weaponId = resolveAvailableWeapon(activeMercenary, state.turn.currentWeaponId);
  const definition = findWeaponDefinition(weaponId);

  if ((activeMercenary.ammo[weaponId] ?? 0) <= 0) {
    return {
      ...state,
      turn: {
        ...state.turn,
        currentWeaponId: resolveAvailableWeapon(activeMercenary, undefined),
        chargeStartedAt: null
      },
      updatedAt: now
    };
  }

  const normalizedChargeRatio =
    definition.fireMode === "charged" ? clamp(chargeRatio, 0.25, 1) : 1;

  // Baseball bat: pure melee knockback, resolved instantly without a projectile.
  if (weaponId === "baseball-schlaeger") {
    const angle = activeMercenary.aimAngleRad;
    const hitX = activeMercenary.x + Math.cos(angle) * activeMercenary.radius * 1.7;
    const hitY = activeMercenary.y + Math.sin(angle) * activeMercenary.radius * 1.7;
    const consumedState: ChaosKommandoRuntimeState = {
      ...state,
      players: refreshPlayerSummaries(
        state.players.map((player) => ({
          ...player,
          mercenaries: player.mercenaries.map((mercenary) =>
            mercenary.id === activeMercenary.id
              ? {
                  ...mercenary,
                  ammo: {
                    ...mercenary.ammo,
                    [weaponId]: Math.max(0, (mercenary.ammo[weaponId] ?? 0) - 1)
                  },
                  facing: Math.cos(angle) >= 0 ? ("right" as const) : ("left" as const),
                  moveInputX: 0
                }
              : mercenary
          )
        }))
      ),
      turn: {
        ...state.turn,
        currentWeaponId: weaponId,
        hasFired: true,
        resolvingShot: true,
        chargeStartedAt: null,
        chargeRatio: 0,
        settleEndsAt: null
      },
      actionLog: pushActionLog(
        state.actionLog,
        `${activeMercenary.name} holt mit dem ${definition.displayName} aus!`
      ),
      updatedAt: now
    };
    const smackedState = applyExplosion(
      consumedState,
      hitX,
      hitY,
      definition,
      now,
      activeMercenary.playerId,
      weaponId,
      {
        pushStrength: 540,
        pushAngleRad: angle - 0.35 * Math.sign(Math.cos(angle) || 1) * 0
      }
    );
    // The batter never smacks themselves off the map.
    const protectedState: ChaosKommandoRuntimeState = {
      ...smackedState,
      players: smackedState.players.map((player) => ({
        ...player,
        mercenaries: player.mercenaries.map((mercenary) =>
          mercenary.id === activeMercenary.id
            ? {
                ...mercenary,
                hp: activeMercenary.hp,
                alive: activeMercenary.alive,
                vx: activeMercenary.vx,
                vy: activeMercenary.vy,
                grounded: activeMercenary.grounded,
                airborneFromY: null
              }
            : mercenary
        )
      }))
    };

    return markProjectileSettling(protectedState, now);
  }

  const projectiles = buildFiredProjectiles(
    state,
    activeMercenary,
    weaponId,
    definition,
    normalizedChargeRatio,
    now
  );
  const nextPlayers = state.players.map((player) => ({
    ...player,
    mercenaries: player.mercenaries.map((mercenary) =>
      mercenary.id === activeMercenary.id
        ? {
            ...mercenary,
            ammo: {
              ...mercenary.ammo,
              [weaponId]: Math.max(0, (mercenary.ammo[weaponId] ?? 0) - 1)
            },
            facing: Math.cos(activeMercenary.aimAngleRad) >= 0 ? ("right" as const) : ("left" as const),
            moveInputX: 0
          }
        : mercenary
    )
  }));
  const nextState: ChaosKommandoRuntimeState = {
    ...state,
    players: refreshPlayerSummaries(nextPlayers),
    projectiles: [...state.projectiles, ...projectiles],
    turn: {
      ...state.turn,
      currentWeaponId: weaponId,
      hasFired: true,
      resolvingShot: true,
      chargeStartedAt: null,
      chargeRatio: 0,
      settleEndsAt: null
    },
    actionLog: pushActionLog(
      state.actionLog,
      definition.fireMode === "charged"
        ? `${activeMercenary.name} feuert ${definition.displayName} mit ${Math.round(normalizedChargeRatio * 100)}% Wumms.`
        : `${activeMercenary.name} zupft ${definition.displayName} blitzschnell ab.`
    ),
    updatedAt: now
  };
  const focus = resolveCameraFocus(nextState);

  return {
    ...syncTurnPresentation(nextState, now),
    cameraFocusX: focus.x,
    cameraFocusY: focus.y,
    message: `${activeMercenary.name} feuert ${definition.displayName}.`
  };
}

/** Approximate the terrain surface normal at a collision point. */
function resolveSurfaceNormal(
  terrain: ChaosKommandoTerrainState,
  x: number,
  y: number
): { x: number; y: number } {
  let nx = 0;
  let ny = 0;
  const probe = 6;

  if (isTerrainSolid(terrain, x - probe, y)) nx += 1;
  if (isTerrainSolid(terrain, x + probe, y)) nx -= 1;
  if (isTerrainSolid(terrain, x, y - probe)) ny += 1;
  if (isTerrainSolid(terrain, x, y + probe)) ny -= 1;

  const magnitude = Math.hypot(nx, ny);

  if (magnitude < 0.001) {
    return { x: 0, y: -1 };
  }

  return { x: nx / magnitude, y: ny / magnitude };
}

function updateProjectile(
  state: ChaosKommandoRuntimeState,
  projectile: RuntimeProjectileState,
  deltaMs: number,
  now: number
): ChaosKommandoRuntimeState {
  const seconds = deltaMs / 1000;
  const windPush = state.wind.direction * state.wind.strength * 78;
  const nextProjectile: RuntimeProjectileState = {
    ...projectile,
    ageMs: projectile.ageMs + deltaMs,
    vx: projectile.vx + windPush * seconds * projectile.windScale,
    vy: projectile.vy + gravity * projectile.gravityScale * seconds
  };
  const terrain = state.terrain;
  const text = chaosKommandoText[state.language];

  nextProjectile.armed = nextProjectile.armed || nextProjectile.ageMs > 120;

  // Fuse weapons detonate mid-air once the timer runs out.
  if (nextProjectile.fuseMs !== null && nextProjectile.ageMs >= nextProjectile.fuseMs) {
    return detonateProjectile(state, nextProjectile, now);
  }

  // Substepped movement so fast shots cannot tunnel through thin walls.
  const speed = Math.hypot(nextProjectile.vx, nextProjectile.vy);
  const travel = speed * seconds;
  const steps = Math.max(1, Math.min(48, Math.ceil(travel / 6)));
  const stepSeconds = seconds / steps;
  const bouncy = isBouncyWeapon(nextProjectile.weaponId) || nextProjectile.generation > 0;

  for (let step = 0; step < steps; step += 1) {
    nextProjectile.x += nextProjectile.vx * stepSeconds;
    nextProjectile.y += nextProjectile.vy * stepSeconds;

    // Water swallows everything without a bang.
    if (nextProjectile.y > terrain.waterlineY + 8) {
      return removeProjectileSilently(
        state,
        nextProjectile,
        now,
        text.splash(findWeaponDefinition(nextProjectile.weaponId).displayName)
      );
    }

    if (
      nextProjectile.x < -60 ||
      nextProjectile.x > terrain.width + 60 ||
      nextProjectile.y > terrain.height + 80
    ) {
      return removeProjectileSilently(state, nextProjectile, now);
    }

    const velocityMagnitude = Math.max(1, Math.hypot(nextProjectile.vx, nextProjectile.vy));
    const leadX = nextProjectile.x + (nextProjectile.vx / velocityMagnitude) * nextProjectile.radius * 0.8;
    const leadY = nextProjectile.y + (nextProjectile.vy / velocityMagnitude) * nextProjectile.radius * 0.8;

    if (isTerrainSolid(terrain, leadX, leadY) || isTerrainSolid(terrain, nextProjectile.x, nextProjectile.y)) {
      if (!bouncy && nextProjectile.weaponId !== "seifenblasen-bombe") {
        return detonateProjectile(state, nextProjectile, now);
      }

      // Push the projectile back out of the wall.
      for (let unstick = 0; unstick < 14; unstick += 1) {
        if (!isTerrainSolid(terrain, nextProjectile.x, nextProjectile.y)) {
          break;
        }

        nextProjectile.x -= (nextProjectile.vx / velocityMagnitude) * 2.4;
        nextProjectile.y -= (nextProjectile.vy / velocityMagnitude) * 2.4;
      }

      const normal = resolveSurfaceNormal(terrain, leadX, leadY);
      const dot = nextProjectile.vx * normal.x + nextProjectile.vy * normal.y;
      const bounceFactor =
        nextProjectile.weaponId === "seifenblasen-bombe" ? 0.24 : nextProjectile.bounceFactor;

      nextProjectile.vx = (nextProjectile.vx - 2 * dot * normal.x) * bounceFactor;
      nextProjectile.vy = (nextProjectile.vy - 2 * dot * normal.y) * bounceFactor;

      // Kill tiny jitter bounces so grenades come to rest.
      if (Math.hypot(nextProjectile.vx, nextProjectile.vy) < 26) {
        nextProjectile.vx = 0;
        nextProjectile.vy = 0;
      }

      break;
    }
  }

  const hitGravestone = state.gravestones.find(
    (gravestone) =>
      Math.hypot(gravestone.x - nextProjectile.x, gravestone.y - nextProjectile.y) <=
      gravestone.radius + nextProjectile.radius + 2
  );

  if (hitGravestone) {
    return detonateProjectile(
      state,
      {
        ...nextProjectile,
        x: hitGravestone.x,
        y: hitGravestone.y
      },
      now
    );
  }

  const hitMine = state.mines.find(
    (mine) =>
      Math.hypot(mine.x - nextProjectile.x, mine.y - nextProjectile.y) <=
      mine.radius + nextProjectile.radius + 2
  );

  if (hitMine && nextProjectile.armed) {
    return detonateProjectile(state, nextProjectile, now);
  }

  for (const player of state.players) {
    for (const mercenary of player.mercenaries) {
      if (!mercenary.alive || mercenary.id === nextProjectile.ownerMercenaryId || !nextProjectile.armed) {
        continue;
      }

      const dx = mercenary.x - nextProjectile.x;
      const dy = mercenary.y - nextProjectile.y;

      if (Math.hypot(dx, dy) <= mercenary.radius + nextProjectile.radius) {
        if (isBouncyWeapon(nextProjectile.weaponId) && nextProjectile.fuseMs !== null) {
          // Grenades bounce off worms instead of detonating on contact.
          continue;
        }

        return detonateProjectile(state, nextProjectile, now);
      }
    }
  }

  return {
    ...state,
    projectiles: state.projectiles.map((entry) => (entry.id === projectile.id ? nextProjectile : entry)),
    updatedAt: now
  };
}

interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  grounded: boolean;
}

/**
 * Shared circle-vs-terrain physics for gravestones, mines and crates.
 */
function applyBodyPhysics<T extends PhysicsBody>(
  body: T,
  terrain: ChaosKommandoTerrainState,
  seconds: number,
  options: { bounce: number; groundFriction: number; parachute?: boolean }
): T {
  const next = { ...body };
  const terrainLeft = next.radius + 8;
  const terrainRight = terrain.width - next.radius - 8;

  if (next.grounded) {
    next.vx *= options.groundFriction;
    next.x = clamp(next.x + next.vx * seconds, terrainLeft, terrainRight);

    if (!isTerrainSolid(terrain, next.x, next.y + next.radius + 4)) {
      const surface = findSurfaceBelow(terrain, next.x, next.y + next.radius, next.y + next.radius + 10);

      if (surface !== null) {
        next.y = surface - next.radius;
      } else {
        next.grounded = false;
      }
    }

    return next;
  }

  next.vx *= 0.995;
  next.vy += gravity * seconds * (options.parachute ? 0.1 : 1);

  if (options.parachute) {
    next.vy = Math.min(next.vy, 74);
  }

  next.x = clamp(next.x + next.vx * seconds, terrainLeft, terrainRight);
  next.y += next.vy * seconds;

  if (isTerrainSolid(terrain, next.x, next.y + next.radius)) {
    let landingY = next.y;

    for (let lift = 0; lift < 40; lift += 2) {
      if (!isTerrainSolid(terrain, next.x, landingY + next.radius)) {
        break;
      }

      landingY -= 2;
    }

    next.y = landingY;
    next.vx *= 0.6;
    next.vy = -Math.abs(next.vy) * options.bounce;

    if (Math.abs(next.vy) < 34) {
      next.vy = 0;
      next.grounded = true;
    }
  }

  return next;
}

function applyGravestonePhysics(
  state: ChaosKommandoRuntimeState,
  deltaMs: number,
  now: number
): ChaosKommandoRuntimeState {
  if (state.gravestones.length === 0) {
    return state;
  }

  const seconds = Math.max(0.001, deltaMs / 1000);
  const nextGravestones = state.gravestones.map((gravestone) =>
    applyBodyPhysics(gravestone, state.terrain, seconds, { bounce: 0.22, groundFriction: 0.84 })
  );

  return {
    ...state,
    gravestones: nextGravestones,
    updatedAt: now
  };
}

function applyMinePhysics(
  state: ChaosKommandoRuntimeState,
  deltaMs: number,
  now: number
): ChaosKommandoRuntimeState {
  if (state.mines.length === 0) {
    return state;
  }

  const seconds = Math.max(0.001, deltaMs / 1000);
  const text = chaosKommandoText[state.language];
  let logMineTriggered = false;
  let nextState = state;
  const survivingMines: RuntimeMineState[] = [];

  for (const mine of state.mines) {
    let nextMine = applyBodyPhysics(mine, nextState.terrain, seconds, {
      bounce: 0.28,
      groundFriction: 0.86
    });

    // Mines sink and drown once the water reaches them.
    if (nextMine.y > nextState.terrain.waterlineY + 20) {
      continue;
    }

    if (nextMine.explodesAt === null) {
      const proximityTarget = nextState.players
        .flatMap((player) => player.mercenaries)
        .find(
          (mercenary) =>
            mercenary.alive &&
            Math.hypot(mercenary.x - nextMine.x, mercenary.y - nextMine.y) <=
              mineTriggerDistance
        );

      if (proximityTarget) {
        nextMine = { ...nextMine, explodesAt: now + mineFuseMs };
        logMineTriggered = true;
      }
    }

    if (nextMine.explodesAt !== null && now >= nextMine.explodesAt) {
      const mineDefinition: ChaosKommandoWeaponDefinition = {
        id: "enten-granate",
        displayName: "Mine",
        description: "Boese Ueberraschung im Boden.",
        iconPath: "",
        accentColor: "#f87171",
        fireMode: "instant",
        damage: mineDamage,
        blastRadius: mineBlastRadius,
        projectileSpeed: 0,
        gravityScale: 1,
        windScale: 0,
        fuseMs: null,
        craterDepth: 44
      };

      nextState = applyExplosion(
        nextState,
        nextMine.x,
        nextMine.y,
        mineDefinition,
        now,
        state.turn.currentPlayerId,
        "mine"
      );
      continue;
    }

    survivingMines.push(nextMine);
  }

  return {
    ...nextState,
    mines: survivingMines,
    actionLog: logMineTriggered
      ? pushActionLog(nextState.actionLog, text.mineTriggered)
      : nextState.actionLog,
    updatedAt: now
  };
}

function applyCratePhysics(
  state: ChaosKommandoRuntimeState,
  deltaMs: number,
  now: number
): ChaosKommandoRuntimeState {
  if (state.crates.length === 0) {
    return state;
  }

  const seconds = Math.max(0.001, deltaMs / 1000);
  const text = chaosKommandoText[state.language];
  let nextState = state;
  const survivingCrates: RuntimeCrateState[] = [];

  for (const crate of state.crates) {
    const nextCrate = applyBodyPhysics(crate, nextState.terrain, seconds, {
      bounce: 0.1,
      groundFriction: 0.8,
      parachute: !crate.grounded
    });

    if (nextCrate.y > nextState.terrain.waterlineY + 14) {
      continue;
    }

    const collector = nextState.players
      .flatMap((player) => player.mercenaries)
      .find(
        (mercenary) =>
          mercenary.alive &&
          Math.hypot(mercenary.x - nextCrate.x, mercenary.y - nextCrate.y) <=
            mercenary.radius + nextCrate.radius + 4
      );

    if (collector) {
      const weaponName = localizeWeaponDefinition(
        findWeaponDefinition(nextCrate.weaponId),
        nextState.language
      ).displayName;

      nextState = {
        ...nextState,
        players: nextState.players.map((player) => ({
          ...player,
          mercenaries: player.mercenaries.map((mercenary) =>
            mercenary.id === collector.id
              ? {
                  ...mercenary,
                  ammo: {
                    ...mercenary.ammo,
                    [nextCrate.weaponId]:
                      (mercenary.ammo[nextCrate.weaponId] ?? 0) + nextCrate.amount
                  }
                }
              : mercenary
          )
        })),
        actionLog: pushActionLog(
          nextState.actionLog,
          text.crateCollected(collector.name, weaponName, nextCrate.amount)
        ),
        updatedAt: now
      };
      continue;
    }

    survivingCrates.push(nextCrate);
  }

  return {
    ...nextState,
    crates: survivingCrates,
    updatedAt: now
  };
}

function applyMercenaryPhysics(
  state: ChaosKommandoRuntimeState,
  deltaMs: number,
  now: number
): ChaosKommandoRuntimeState {
  const seconds = Math.max(0.001, deltaMs / 1000);
  const terrain = state.terrain;
  const text = chaosKommandoText[state.language];
  let drownedName: string | null = null;
  const nextPlayers = state.players.map((player) => ({
    ...player,
    mercenaries: player.mercenaries.map((mercenary) => {
      // Worms style: the active worm may also move while the shot resolves (retreat).
      const isActiveMercenary =
        mercenary.alive &&
        mercenary.id === state.turn.activeMercenaryId &&
        player.playerId === state.turn.currentPlayerId;
      const nextMercenary = { ...mercenary };
      const terrainLeft = nextMercenary.radius + 8;
      const terrainRight = terrain.width - nextMercenary.radius - 8;

      if (nextMercenary.grounded) {
        if (isActiveMercenary && Math.abs(nextMercenary.moveInputX) > 0.12) {
          const direction = Math.sign(nextMercenary.moveInputX);
          nextMercenary.vx = nextMercenary.moveInputX * walkSpeed;
          nextMercenary.facing = direction > 0 ? "right" : "left";

          const targetX = clamp(
            nextMercenary.x + nextMercenary.vx * seconds,
            terrainLeft,
            terrainRight
          );
          const feetY = nextMercenary.y + nextMercenary.radius;
          // Worms cannot walk through walls or up cliffs: head clearance first.
          const blockedByWall =
            isTerrainSolid(terrain, targetX + direction * nextMercenary.radius * 0.5, nextMercenary.y - nextMercenary.radius * 0.35) ||
            isTerrainSolid(terrain, targetX, nextMercenary.y - nextMercenary.radius * 0.85);

          if (!blockedByWall) {
            const surface = findSurfaceBelow(
              terrain,
              targetX,
              feetY - stepUpHeight,
              feetY + stepDownHeight
            );

            if (surface === null) {
              // Walked off a ledge.
              nextMercenary.x = targetX;
              nextMercenary.grounded = false;
              nextMercenary.airborneFromY = nextMercenary.y;
            } else {
              nextMercenary.x = targetX;
              nextMercenary.y = surface - nextMercenary.radius;
            }
          } else {
            nextMercenary.vx = 0;
          }
        } else {
          nextMercenary.vx *= 0.6;

          if (!isTerrainSolid(terrain, nextMercenary.x, nextMercenary.y + nextMercenary.radius + 5)) {
            const surface = findSurfaceBelow(
              terrain,
              nextMercenary.x,
              nextMercenary.y + nextMercenary.radius,
              nextMercenary.y + nextMercenary.radius + 12
            );

            if (surface !== null) {
              nextMercenary.y = surface - nextMercenary.radius;
            } else {
              nextMercenary.grounded = false;
              nextMercenary.airborneFromY = nextMercenary.y;
            }
          }
        }
      }

      if (!nextMercenary.grounded) {
        nextMercenary.vx *= 0.995;
        nextMercenary.vy += gravity * seconds;

        const travel = Math.hypot(nextMercenary.vx, nextMercenary.vy) * seconds;
        const steps = Math.max(1, Math.min(24, Math.ceil(travel / 5)));
        const stepSeconds = seconds / steps;

        for (let step = 0; step < steps; step += 1) {
          const previousX = nextMercenary.x;
          nextMercenary.x = clamp(nextMercenary.x + nextMercenary.vx * stepSeconds, terrainLeft, terrainRight);
          nextMercenary.y += nextMercenary.vy * stepSeconds;

          // Ceiling bump inside tunnels.
          if (nextMercenary.vy < 0 && isTerrainSolid(terrain, nextMercenary.x, nextMercenary.y - nextMercenary.radius)) {
            nextMercenary.y += 3;
            nextMercenary.vy = Math.abs(nextMercenary.vy) * 0.12;
          }

          // Side walls kill horizontal momentum.
          if (
            Math.abs(nextMercenary.vx) > 4 &&
            isTerrainSolid(
              terrain,
              nextMercenary.x + Math.sign(nextMercenary.vx) * nextMercenary.radius * 0.8,
              nextMercenary.y
            )
          ) {
            nextMercenary.x = previousX;
            nextMercenary.vx *= -0.24;
          }

          if (nextMercenary.vy >= 0 && isTerrainSolid(terrain, nextMercenary.x, nextMercenary.y + nextMercenary.radius)) {
            let landingY = nextMercenary.y;

            for (let lift = 0; lift < 44; lift += 2) {
              if (!isTerrainSolid(terrain, nextMercenary.x, landingY + nextMercenary.radius)) {
                break;
              }

              landingY -= 2;
            }

            const airborneFromY = nextMercenary.airborneFromY ?? nextMercenary.y;
            const fallDistance = landingY - airborneFromY;
            const fallDamage =
              nextMercenary.alive && fallDistance > 110 ? Math.round((fallDistance - 110) * 0.16) : 0;

            nextMercenary.y = landingY;
            nextMercenary.vy = 0;
            nextMercenary.vx *= 0.45;
            nextMercenary.grounded = true;
            nextMercenary.airborneFromY = null;
            nextMercenary.hp = Math.max(0, nextMercenary.hp - fallDamage);
            nextMercenary.alive = nextMercenary.alive ? nextMercenary.hp > 0 : false;
            break;
          }
        }
      }

      // Rising water: touching the waterline means drowning, Worms style.
      if (nextMercenary.y + nextMercenary.radius * 0.4 > terrain.waterlineY) {
        if (nextMercenary.alive) {
          drownedName = nextMercenary.name;
        }

        nextMercenary.hp = 0;
        nextMercenary.alive = false;
      }

      return nextMercenary;
    })
  }));

  const refreshedPlayers = refreshPlayerSummaries(nextPlayers);
  const nextState: ChaosKommandoRuntimeState = {
    ...state,
    players: refreshedPlayers,
    explosions: state.explosions.filter((explosion) => now - explosion.createdAt <= 950),
    actionLog: drownedName
      ? pushActionLog(state.actionLog, text.drowned(drownedName))
      : state.actionLog,
    updatedAt: now
  };
  const focus = resolveCameraFocus(nextState);

  return {
    ...syncTurnPresentation(nextState, now),
    cameraFocusX: focus.x,
    cameraFocusY: focus.y
  };
}

function resolveWinnerLock(state: ChaosKommandoRuntimeState, now: number): ChaosKommandoRuntimeState | null {
  if (state.activeDeathSequence || state.deathQueueMercenaryIds.length > 0) {
    return null;
  }

  const alivePlayers = state.players.filter((player) => player.aliveMercenaryCount > 0);

  if (alivePlayers.length > 1) {
    return null;
  }

  const winner = alivePlayers[0];
  const text = chaosKommandoText[state.language];
  const message = winner ? text.winner(winner.name) : text.draw;

  return transitionRoundState(
    {
      ...state,
      winnerPlayerId: winner?.playerId,
      winnerName: winner?.name,
      isDraw: !winner,
      message
    },
    "locked",
    now,
    {
      durationMs: phaseTimings.lockedMs,
      message
    }
  ) as ChaosKommandoRuntimeState;
}

function maybeAdvanceAfterShot(state: ChaosKommandoRuntimeState, now: number): ChaosKommandoRuntimeState {
  if (
    !state.turn.resolvingShot ||
    state.projectiles.length > 0 ||
    state.activeDeathSequence ||
    state.deathQueueMercenaryIds.length > 0
  ) {
    return state;
  }

  if (state.turn.settleEndsAt !== null && now < state.turn.settleEndsAt) {
    return state;
  }

  const winnerLocked = resolveWinnerLock(state, now);

  if (winnerLocked) {
    return winnerLocked;
  }

  const activeMercenary = findMercenaryById(state, state.turn.activeMercenaryId);
  const text = chaosKommandoText[state.language];

  // Worms retreat: a short escape window before the next team takes over.
  if (state.turn.retreatEndsAt === null && activeMercenary?.alive) {
    return {
      ...state,
      turn: {
        ...state.turn,
        retreatEndsAt: now + retreatDurationMs
      },
      actionLog: pushActionLog(state.actionLog, text.retreat),
      updatedAt: now
    };
  }

  if (state.turn.retreatEndsAt !== null && now < state.turn.retreatEndsAt) {
    return state;
  }

  return resolveNextTurn(state, now, text.smokeClears);
}

function buildPublicPlayers(players: RuntimePlayerState[]): ChaosKommandoPlayerState[] {
  return players.map((player) => ({
    ...player,
    mercenaries: player.mercenaries.map(
      ({
        moveInputX: _moveInputX,
        jumpReadyAt: _jumpReadyAt,
        airborneFromY: _airborneFromY,
        deathExploded: _deathExploded,
        ...mercenary
      }) => mercenary
    )
  }));
}

function buildPublicGravestones(gravestones: RuntimeGravestoneState[]): ChaosKommandoGravestoneState[] {
  return gravestones.map((gravestone) => ({ ...gravestone }));
}

function buildPublicProjectiles(projectiles: RuntimeProjectileState[]): ChaosKommandoProjectileState[] {
  return projectiles.map(
    ({
      damage: _damage,
      blastRadius: _blastRadius,
      craterDepth: _craterDepth,
      gravityScale: _gravityScale,
      windScale: _windScale,
      splashColor: _splashColor,
      bounceFactor: _bounceFactor,
      generation: _generation,
      ...projectile
    }) => projectile
  );
}

function buildPublicMines(mines: RuntimeMineState[]): ChaosKommandoMineState[] {
  return mines.map((mine) => ({ ...mine }));
}

function buildPublicCrates(crates: RuntimeCrateState[]): ChaosKommandoCrateState[] {
  return crates.map((crate) => ({ ...crate }));
}

function buildPublicTurn(turn: RuntimeTurnState): ChaosKommandoTurnState {
  const { orderPlayerIds: _orderPlayerIds, ...publicTurn } = turn;
  return publicTurn;
}

function buildControllerState(state: ChaosKommandoRuntimeState): ChaosKommandoState {
  return {
    terrain: {
      mapId: state.terrain.mapId,
      mapName: state.terrain.mapName,
      width: state.terrain.width,
      height: state.terrain.height,
      waterlineY: state.terrain.waterlineY,
      sampleSpacing: state.terrain.sampleSpacing,
      // The controller UI does not render terrain; omitting the heightmap and
      // craters keeps the 60 Hz controller stream dramatically smaller.
      samples: [],
      craters: []
    },
    players: buildPublicPlayers(state.players),
    turn: buildPublicTurn(state.turn),
    weapons: state.weapons,
    projectiles: [],
    explosions: [],
    gravestones: [],
    mines: [],
    crates: [],
    wind: state.wind,
    suddenDeath: state.suddenDeath,
    winnerPlayerId: state.winnerPlayerId,
    winnerName: state.winnerName,
    isDraw: state.isDraw,
    cameraFocusX: 0,
    cameraFocusY: 0,
    actionLog: []
  };
}

function buildScore(state: ChaosKommandoRuntimeState): ScoreEntry[] {
  return state.players.map((player) => ({
    playerId: player.playerId,
    delta:
      player.playerId === state.winnerPlayerId
        ? 4 + player.aliveMercenaryCount
        : player.aliveMercenaryCount,
    reason: "Chaos-Kommando"
  }));
}

export const chaosKommandoServerGame: ServerGame<
  ChaosKommandoRuntimeState,
  ChaosKommandoInput,
  ChaosKommandoState
> = {
  manifest: chaosKommandoManifest,
  createInitialState(context) {
    const seed = createSeed(context);
    const terrain = createTerrain(context.players.length || 2, seed);
    const players = refreshPlayerSummaries(createPlayers(context.players, terrain));
    const turn = buildTurnState(players, context.now);
    const activeMercenary = findMercenaryById({ players }, turn.activeMercenaryId);
    const text = chaosKommandoText[context.language];

    return {
      ...createBaseRoundState("round_intro", context.now, {
        durationMs: phaseTimings.roundIntroMs,
        message: text.intro
      }),
      seed,
      language: context.language,
      terrain,
      players,
      turn: {
        ...turn,
        currentWeaponId: resolveAvailableWeapon(activeMercenary, "kicher-bazooka")
      },
      weapons: localizeWeaponDefinitions(context.language),
      projectiles: [],
      explosions: [],
      gravestones: [],
      mines: createMines(terrain, context.players.length || 2, seed),
      crates: [],
      wind: buildWind(seed, context.language),
      suddenDeath: false,
      isDraw: false,
      cameraFocusX: activeMercenary?.x ?? terrain.width / 2,
      cameraFocusY: activeMercenary?.y ?? terrain.height / 2,
      actionLog: [text.introLog],
      deathQueueMercenaryIds: [],
      activeDeathSequence: null
    };
  },
  startRound(state, context) {
    const currentPlayer = findPlayer(state, state.turn.currentPlayerId) ?? state.players[0];
    const text = chaosKommandoText[state.language];

    return transitionRoundState(
      startPlayerTurn(
        {
          ...state,
          phase: "playing",
          wind: buildWind(state.seed ^ context.roundNumber * 97, state.language),
          weapons: localizeWeaponDefinitions(state.language)
        },
        currentPlayer?.playerId ?? "",
        resolveFirstAliveMercenaryId(currentPlayer),
        context.now,
        1,
        text.start
      ),
      "playing",
      context.now,
      {
        startedAt: context.now,
        message: text.start
      }
    ) as ChaosKommandoRuntimeState;
  },
  handleInput(state, input, context) {
    if (state.phase !== "playing") {
      return state;
    }

    if (input.playerId !== state.turn.currentPlayerId) {
      return state;
    }

    const player = findPlayer(state, input.playerId);
    const activeMercenary = findMercenaryById(state, state.turn.activeMercenaryId);

    if (!player || !activeMercenary || !activeMercenary.alive) {
      return state;
    }

    if (input.type === "select-mercenary") {
      const nextMercenary = player.mercenaries.find((mercenary) => mercenary.id === input.mercenaryId && mercenary.alive);

      if (!nextMercenary || state.turn.hasFired || state.turn.resolvingShot) {
        return state;
      }

      return startPlayerTurn(
        {
          ...state,
          turn: {
            ...state.turn,
            currentPlayerId: player.playerId
          }
        },
        player.playerId,
        nextMercenary.id,
        input.sentAt ?? context.now,
        state.turn.turnNumber,
        chaosKommandoText[state.language].mercenaryForward(player.name, nextMercenary.name)
      );
    }

    if (input.type === "select-weapon") {
      if (state.turn.hasFired || state.turn.resolvingShot) {
        return state;
      }

      if ((activeMercenary.ammo[input.weaponId] ?? 0) <= 0) {
        return state;
      }

      return syncTurnPresentation(
        {
          ...state,
          turn: {
            ...state.turn,
            currentWeaponId: input.weaponId,
            chargeStartedAt: null,
            chargeRatio: 0
          },
          updatedAt: input.sentAt ?? context.now
        },
        input.sentAt ?? context.now
      );
    }

    if (input.type === "move") {
      const nextX = clamp(input.moveX, -1, 1);

      return syncTurnPresentation(
        {
          ...state,
          players: state.players.map((entry) => ({
            ...entry,
            mercenaries: entry.mercenaries.map((mercenary) =>
              mercenary.id === activeMercenary.id
                ? {
                    ...mercenary,
                    moveInputX: nextX
                  }
                : mercenary
            )
          })),
          updatedAt: input.sentAt ?? context.now
        },
        input.sentAt ?? context.now
      );
    }

    if (input.type === "aim") {
      return syncTurnPresentation(
        {
          ...state,
          players: state.players.map((entry) => ({
            ...entry,
            mercenaries: entry.mercenaries.map((mercenary) =>
              mercenary.id === activeMercenary.id
                ? {
                    ...mercenary,
                    aimAngleRad: resolveAimAngle(input.aimX, input.aimY, mercenary.aimAngleRad),
                    facing:
                      Math.abs(input.aimX) > 0.08
                        ? input.aimX >= 0
                          ? "right"
                          : "left"
                        : mercenary.facing
                  }
                : mercenary
            )
          })),
          updatedAt: input.sentAt ?? context.now
        },
        input.sentAt ?? context.now
      );
    }

    if (input.type === "jump") {
      if (!activeMercenary.grounded || activeMercenary.jumpReadyAt > (input.sentAt ?? context.now)) {
        return state;
      }

      // Worms forward hop: jumps always carry momentum in facing direction.
      const hopDirection = activeMercenary.facing === "right" ? 1 : -1;

      return syncTurnPresentation(
        {
          ...state,
          players: state.players.map((entry) => ({
            ...entry,
            mercenaries: entry.mercenaries.map((mercenary) =>
              mercenary.id === activeMercenary.id
                ? {
                    ...mercenary,
                    grounded: false,
                    vy: jumpVelocity,
                    vx: mercenary.vx + hopDirection * jumpForwardBoost,
                    jumpReadyAt: (input.sentAt ?? context.now) + jumpCooldownMs,
                    airborneFromY: mercenary.y
                  }
                : mercenary
            )
          })),
          updatedAt: input.sentAt ?? context.now
        },
        input.sentAt ?? context.now
      );
    }

    if (input.type === "fire:start") {
      if (state.turn.hasFired || state.turn.resolvingShot) {
        return state;
      }

      const definition = findWeaponDefinition(state.turn.currentWeaponId);

      if ((activeMercenary.ammo[state.turn.currentWeaponId] ?? 0) <= 0) {
        return state;
      }

      if (definition.fireMode === "instant") {
        return fireActiveWeapon(state, input.sentAt ?? context.now, 1);
      }

      return syncTurnPresentation(
        {
          ...state,
          turn: {
            ...state.turn,
            chargeStartedAt: input.sentAt ?? context.now
          },
          updatedAt: input.sentAt ?? context.now
        },
        input.sentAt ?? context.now
      );
    }

    if (input.type === "fire:release") {
      if (state.turn.hasFired || state.turn.resolvingShot) {
        return state;
      }

      const definition = findWeaponDefinition(state.turn.currentWeaponId);

      if (definition.fireMode === "instant") {
        return state;
      }

      const chargeStartedAt = state.turn.chargeStartedAt ?? (input.sentAt ?? context.now) - 420;
      const chargeRatio = clamp(((input.sentAt ?? context.now) - chargeStartedAt) / chargeWindowMs, 0.2, 1);
      return fireActiveWeapon(state, input.sentAt ?? context.now, chargeRatio);
    }

    return state;
  },
  tick(state, deltaMs, context) {
    if (state.phase !== "playing") {
      return state;
    }

    let nextState = applyMercenaryPhysics(state, deltaMs, context.now);
    nextState = applyGravestonePhysics(nextState, deltaMs, context.now);
    nextState = applyMinePhysics(nextState, deltaMs, context.now);
    nextState = applyCratePhysics(nextState, deltaMs, context.now);
    nextState = resolveDeathSequences(nextState, context.now);

    for (const projectile of [...nextState.projectiles]) {
      if (!nextState.projectiles.some((entry) => entry.id === projectile.id)) {
        continue;
      }

      nextState = updateProjectile(nextState, projectile, deltaMs, context.now);
      nextState = resolveDeathSequences(nextState, context.now);

      if (nextState.phase === "locked") {
        return nextState;
      }
    }

    if (
      nextState.turn.chargeStartedAt !== null &&
      !nextState.turn.hasFired &&
      findWeaponDefinition(nextState.turn.currentWeaponId).fireMode === "charged" &&
      context.now >= nextState.turn.turnEndsAt
    ) {
      const chargeRatio = clamp((context.now - nextState.turn.chargeStartedAt) / chargeWindowMs, 0.35, 1);
      nextState = fireActiveWeapon(nextState, context.now, chargeRatio);
    }

    if (!nextState.turn.hasFired && context.now >= nextState.turn.turnEndsAt) {
      nextState = resolveNextTurn(nextState, context.now, chaosKommandoText[nextState.language].clockFaster);
    }

    nextState = maybeAdvanceAfterShot(nextState, context.now);

    const winnerLocked = resolveWinnerLock(nextState, context.now);

    if (winnerLocked) {
      return winnerLocked;
    }

    const focus = resolveCameraFocus(nextState);

    return {
      ...syncTurnPresentation(nextState, context.now),
      cameraFocusX: focus.x,
      cameraFocusY: focus.y,
      message: buildTurnMessage(nextState),
      updatedAt: context.now
    };
  },
  isRoundFinished(state) {
    return state.phase === "locked";
  },
  buildScore(state) {
    return buildScore(state);
  },
  toPublicState(state) {
    return {
      terrain: state.terrain,
      players: buildPublicPlayers(state.players),
      turn: buildPublicTurn(state.turn),
      weapons: state.weapons,
      projectiles: buildPublicProjectiles(state.projectiles),
      explosions: state.explosions,
      gravestones: buildPublicGravestones(state.gravestones),
      mines: buildPublicMines(state.mines),
      crates: buildPublicCrates(state.crates),
      wind: state.wind,
      suddenDeath: state.suddenDeath,
      winnerPlayerId: state.winnerPlayerId,
      winnerName: state.winnerName,
      isDraw: state.isDraw,
      cameraFocusX: state.cameraFocusX,
      cameraFocusY: state.cameraFocusY,
      actionLog: state.actionLog
    };
  },
  toControllerState(state) {
    return buildControllerState(state);
  },
  toControllerStateForPlayer(state) {
    return buildControllerState(state);
  }
};
