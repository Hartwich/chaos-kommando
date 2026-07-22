import type { PlayerInput } from "@open-party-lab/game-core";

export type ChaosKommandoWeaponId =
  | "kicher-bazooka"
  | "enten-granate"
  | "plunder-pistole"
  | "regenbogen-rakete"
  | "splitter-granate"
  | "konfetti-schrot"
  | "bohrer-rakete"
  | "gummi-huhn"
  | "seifenblasen-bombe"
  | "keks-moerser"
  | "dynamit"
  | "heilige-granate"
  | "banane"
  | "luftschlag"
  | "baseball-schlaeger"
  | "minigun";

export type ChaosKommandoMercenaryRole =
  | "sprinter"
  | "grenadier"
  | "chaos-schuetze";

export type ChaosKommandoWeaponFireMode = "charged" | "instant";
export type ChaosKommandoExplosionSourceId = ChaosKommandoWeaponId | "abschieds-bumm" | "mine";

export interface ChaosKommandoMoveInput extends PlayerInput {
  type: "move";
  moveX: number;
  moveY: number;
}

export interface ChaosKommandoAimInput extends PlayerInput {
  type: "aim";
  aimX: number;
  aimY: number;
}

export interface ChaosKommandoJumpInput extends PlayerInput {
  type: "jump";
}

export interface ChaosKommandoSelectMercenaryInput extends PlayerInput {
  type: "select-mercenary";
  mercenaryId: string;
}

export interface ChaosKommandoSelectWeaponInput extends PlayerInput {
  type: "select-weapon";
  weaponId: ChaosKommandoWeaponId;
}

export interface ChaosKommandoFireStartInput extends PlayerInput {
  type: "fire:start";
}

export interface ChaosKommandoFireReleaseInput extends PlayerInput {
  type: "fire:release";
}

export type ChaosKommandoInput =
  | ChaosKommandoMoveInput
  | ChaosKommandoAimInput
  | ChaosKommandoJumpInput
  | ChaosKommandoSelectMercenaryInput
  | ChaosKommandoSelectWeaponInput
  | ChaosKommandoFireStartInput
  | ChaosKommandoFireReleaseInput;

export interface ChaosKommandoWeaponDefinition {
  id: ChaosKommandoWeaponId;
  displayName: string;
  description: string;
  iconPath: string;
  accentColor: string;
  fireMode: ChaosKommandoWeaponFireMode;
  damage: number;
  blastRadius: number;
  projectileSpeed: number;
  gravityScale: number;
  /** How strongly wind pushes this projectile (Worms: rockets 1, grenades 0). */
  windScale: number;
  fuseMs: number | null;
  /** <= 0 means the weapon does not carve a crater (e.g. baseball bat). */
  craterDepth: number;
}

export interface ChaosKommandoMercenaryState {
  id: string;
  name: string;
  role: ChaosKommandoMercenaryRole;
  playerId: string;
  playerName: string;
  teamColor: string;
  accentColor: string;
  spritePath: string;
  portraitPath: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  grounded: boolean;
  facing: "left" | "right";
  aimAngleRad: number;
  ammo: Record<ChaosKommandoWeaponId, number>;
}

export interface ChaosKommandoPlayerState {
  playerId: string;
  name: string;
  color: string;
  mercenaries: ChaosKommandoMercenaryState[];
  aliveMercenaryCount: number;
  eliminated: boolean;
}

export interface ChaosKommandoProjectileState {
  id: string;
  weaponId: ChaosKommandoWeaponId;
  ownerPlayerId: string;
  ownerMercenaryId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  ageMs: number;
  fuseMs: number | null;
  armed: boolean;
}

export interface ChaosKommandoExplosionState {
  id: string;
  sourceWeaponId: ChaosKommandoExplosionSourceId;
  x: number;
  y: number;
  radius: number;
  color: string;
  createdAt: number;
}

export interface ChaosKommandoGravestoneState {
  id: string;
  mercenaryId: string;
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  grounded: boolean;
}

export interface ChaosKommandoTurnState {
  turnNumber: number;
  currentPlayerId: string;
  activeMercenaryId: string;
  currentWeaponId: ChaosKommandoWeaponId;
  turnEndsAt: number;
  hasFired: boolean;
  resolvingShot: boolean;
  chargeStartedAt: number | null;
  chargeRatio: number;
  settleEndsAt: number | null;
  /** While set, the active team may retreat (move/jump) but not fire again. */
  retreatEndsAt: number | null;
  crosshairX: number;
  crosshairY: number;
  crosshairDistance: number;
}

/** A circular hole punched out of the terrain (true 2D destruction incl. tunnels). */
export interface ChaosKommandoCraterState {
  x: number;
  y: number;
  r: number;
}

export interface ChaosKommandoTerrainState {
  mapId: string;
  mapName: string;
  width: number;
  height: number;
  waterlineY: number;
  sampleSpacing: number;
  samples: number[];
  craters: ChaosKommandoCraterState[];
}

export interface ChaosKommandoMineState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  grounded: boolean;
  /** Timestamp when the mine will explode after being triggered; null = dormant. */
  explodesAt: number | null;
}

export interface ChaosKommandoCrateState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  grounded: boolean;
  weaponId: ChaosKommandoWeaponId;
  amount: number;
}

export interface ChaosKommandoWindState {
  strength: number;
  direction: -1 | 1;
  label: string;
}

export interface ChaosKommandoState {
  terrain: ChaosKommandoTerrainState;
  players: ChaosKommandoPlayerState[];
  turn: ChaosKommandoTurnState;
  weapons: ChaosKommandoWeaponDefinition[];
  projectiles: ChaosKommandoProjectileState[];
  explosions: ChaosKommandoExplosionState[];
  gravestones: ChaosKommandoGravestoneState[];
  mines: ChaosKommandoMineState[];
  crates: ChaosKommandoCrateState[];
  wind: ChaosKommandoWindState;
  /** True once the rising-water sudden death has started. */
  suddenDeath: boolean;
  winnerPlayerId?: string;
  winnerName?: string;
  isDraw: boolean;
  cameraFocusX: number;
  cameraFocusY: number;
  actionLog: string[];
}
