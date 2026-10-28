import Phaser from "phaser";
import { CharacterPresentation } from "./CharacterPresentation.js";
import { resolveWeaponMuzzle } from "../combatGeometry.js";
import { paintCoastalTerrain } from "./ChaosKommandoTerrainPainter.js";
import { ChaosKommandoBattleEffects } from "./ChaosKommandoBattleEffects.js";
import type {
  ChaosKommandoCraterState,
  ChaosKommandoMercenaryState,
  ChaosKommandoPlatformState,
  ChaosKommandoState,
  ChaosKommandoWeaponId
} from "../protocol.js";
import {
  clamp,
  findWeapon,
  hashString,
  resolveChargeRatio,
  resolveCrosshairPoint,
  resolveHealthRatio,
  resolveSelection,
  toColorNumber
} from "./ChaosKommandoViewModel.js";
import {
  createChaosKommandoCharacterRenderState,
  destroyChaosKommandoCharacterRenderState,
  hideChaosKommandoCharacters,
  syncChaosKommandoCharacters,
  type ChaosKommandoCharacterRenderState
} from "./character/ChaosKommandoCharacterRenderer.js";
import { tokens } from "./platformTheme.js";

const idleWorld = {
  width: 1_680,
  height: 900,
  waterlineY: 792,
  sampleSpacing: 8,
  samples: Array.from({ length: 211 }, (_, index) => {
    const x = index * 8;
    const ridge = Math.sin(x / 140) * 54 + Math.cos(x / 56) * 18 + Math.sin(x / 310) * 32;
    return clamp(552 + ridge, 455, 720);
  }),
  craters: [] as ChaosKommandoCraterState[],
  platforms: [] as ChaosKommandoPlatformState[]
};

const terrainTextureKey = "chaos-kommando-terrain";
const idleTerrainTextureKey = "chaos-kommando-terrain-idle";

interface TerrainLike {
  mapId?: string;
  width: number;
  height: number;
  sampleSpacing: number;
  samples: number[];
  craters: ChaosKommandoCraterState[];
  platforms: ChaosKommandoPlatformState[];
}

export interface ChaosKommandoRenderState {
  skyGraphics: Phaser.GameObjects.Graphics;
  background: Phaser.GameObjects.Image | null;
  battleEffects: ChaosKommandoBattleEffects;
  presentation: CharacterPresentation;
  terrainImage: Phaser.GameObjects.Image | null;
  terrainSignature: string;
  waterGraphics: Phaser.GameObjects.Graphics;
  waterFrontGraphics: Phaser.GameObjects.Graphics;
  actorGraphics: Phaser.GameObjects.Graphics;
  effectsGraphics: Phaser.GameObjects.Graphics;
  characterRenderState: ChaosKommandoCharacterRenderState;
  nameLabels: Map<string, Phaser.GameObjects.Text>;
  explosionSeenAtMs: Map<string, number>;
  cameraCenterX: number;
  cameraCenterY: number;
  cameraZoom: number;
  camera: CameraDirector;
  overviewMode: boolean;
}

interface CameraTarget {
  centerX: number;
  centerY: number;
  zoom: number;
}

/**
 * Kameraregie nach einem Angriff, in fester Reihenfolge:
 *
 * `overview`  alles im Bild
 * `casualty`  Blick auf den Gefallenen und seinen Grabstein
 * `cheer`     Jubel des gegnerischen Teams
 * `crate`     eingeschwebte Nachschubkiste
 * `banner`    Name des naechsten Teams, danach Zoom auf den Soeldner
 * `follow`    normales Verfolgen
 *
 * Phasen ohne Anlass werden uebersprungen: kein Toter, keine Kiste, kein Jubel.
 */
type CameraPhase = "follow" | "overview" | "casualty" | "cheer" | "crate" | "banner";

interface CameraDirector {
  phase: CameraPhase;
  phaseEndsAtMs: number;
  /** Bis dahin faehrt die Kamera betont langsam zurueck zum Geschehen. */
  calmUntilMs: number;
  casualtyX: number | null;
  casualtyY: number | null;
  cheerX: number | null;
  cheerY: number | null;
  crateX: number | null;
  crateY: number | null;
  aliveById: Map<string, boolean>;
  seenExplosionIds: Set<string>;
  seenCrateIds: Set<string>;
  /** Name des Teams, das als naechstes dran ist. Treibt das Banner. */
  bannerText: string;
  bannerUntilMs: number;
  lastTurnNumber: number;
}

const cameraPhaseDurationsMs = {
  overview: 900,
  casualty: 1000,
  /** Dreifache Jubeldauer, wie gewuenscht. */
  cheer: 1400,
  crate: 1_300,
  banner: 1_500,
  calm: 1_200
} as const;

function createCameraDirector(): CameraDirector {
  return {
    phase: "follow",
    phaseEndsAtMs: 0,
    calmUntilMs: 0,
    casualtyX: null,
    casualtyY: null,
    cheerX: null,
    cheerY: null,
    crateX: null,
    crateY: null,
    aliveById: new Map(),
    seenExplosionIds: new Set(),
    seenCrateIds: new Set(),
    bannerText: "",
    bannerUntilMs: 0,
    lastTurnNumber: 0
  };
}

interface TerrainTheme {
  skyTop: number;
  skyMid: number;
  skyGlow: number;
  hillNear: number;
  hillFar: number;
  terrainBody: string;
  terrainMid: string;
  terrainDeep: string;
  grass: string;
  grassHighlight: string;
  grassShadow: string;
  craterRim: string;
  /** Helle Gesteinsader in den Erdschichten. */
  rockLight: string;
  /** Dunkle Gesteinsader und Kieselschatten. */
  rockDark: string;
  /** Wurzeln unter der Grasnarbe. */
  root: string;
  /** Duenne Sandschicht direkt unter dem Gras. */
  topsoil: string;
  hillMist: number;
  treeLine: number;
}

export function createChaosKommandoRenderState(scene: Phaser.Scene): ChaosKommandoRenderState {
  const skyGraphics = scene.add.graphics();
  skyGraphics.setDepth(-60);
  const waterGraphics = scene.add.graphics();
  waterGraphics.setDepth(-4);
  const effectsGraphics = scene.add.graphics();
  effectsGraphics.setDepth(11);
  const actorGraphics = scene.add.graphics();
  actorGraphics.setDepth(24);
  const waterFrontGraphics = scene.add.graphics();
  waterFrontGraphics.setDepth(28);

  return {
    skyGraphics,
    background: scene.textures.exists("chaos-coastal-background") ? scene.add.image(0, 0, "chaos-coastal-background").setOrigin(0).setDepth(-59) : null,
    battleEffects: new ChaosKommandoBattleEffects(scene),
    presentation: new CharacterPresentation(),
    terrainImage: null,
    terrainSignature: "",
    waterGraphics,
    waterFrontGraphics,
    actorGraphics,
    effectsGraphics,
    characterRenderState: createChaosKommandoCharacterRenderState(),
    nameLabels: new Map(),
    explosionSeenAtMs: new Map(),
    cameraCenterX: idleWorld.width / 2,
    cameraCenterY: idleWorld.height / 2,
    cameraZoom: 0.92,
    camera: createCameraDirector(),
    overviewMode: false
  };
}

export function destroyChaosKommandoRenderState(renderState: ChaosKommandoRenderState): void {
  renderState.skyGraphics.destroy();
  renderState.background?.destroy();
  renderState.battleEffects.destroy();
  renderState.presentation.clear();
  renderState.terrainImage?.destroy();
  renderState.terrainImage = null;
  renderState.waterGraphics.destroy();
  renderState.waterFrontGraphics.destroy();
  renderState.actorGraphics.destroy();
  renderState.effectsGraphics.destroy();
  destroyChaosKommandoCharacterRenderState(renderState.characterRenderState);
  for (const label of renderState.nameLabels.values()) {
    label.destroy();
  }
  renderState.nameLabels.clear();
  renderState.explosionSeenAtMs.clear();
}

/** Text des Namensbanners, oder null wenn gerade keines laeuft. */
export function resolveChaosKommandoBanner(
  renderState: ChaosKommandoRenderState,
  nowMs: number
): string | null {
  return nowMs < renderState.camera.bannerUntilMs && renderState.camera.bannerText
    ? renderState.camera.bannerText
    : null;
}

/** True, solange die Regie laeuft und der Zug noch nicht freigegeben ist. */
export function isChaosKommandoCameraScripted(renderState: ChaosKommandoRenderState): boolean {
  return renderState.camera.phase !== "follow";
}

export function snapChaosKommandoCamera(
  scene: Phaser.Scene,
  renderState: ChaosKommandoRenderState,
  state: ChaosKommandoState
): void {
  const target = resolveCameraTarget(scene, state, renderState.camera, renderState.overviewMode);
  renderState.cameraCenterX = target.centerX;
  renderState.cameraCenterY = target.centerY;
  renderState.cameraZoom = target.zoom;
  applyCamera(scene, renderState, state.terrain.width, state.terrain.height);
}

export function renderChaosKommandoIdleFrame(
  scene: Phaser.Scene,
  renderState: ChaosKommandoRenderState,
  timeMs: number
): void {
  renderState.cameraCenterX = Phaser.Math.Linear(renderState.cameraCenterX, idleWorld.width / 2, 0.08);
  renderState.cameraCenterY = Phaser.Math.Linear(renderState.cameraCenterY, idleWorld.height / 2 - 60, 0.08);
  renderState.cameraZoom = Phaser.Math.Linear(
    renderState.cameraZoom,
    Math.min(scene.scale.width / idleWorld.width, scene.scale.height / idleWorld.height) * 0.95,
    0.08
  );
  applyCamera(scene, renderState, idleWorld.width, idleWorld.height);
  drawSky(renderState.skyGraphics, idleWorld.width, idleWorld.height, idleWorld.waterlineY, timeMs, 1, 1, "klapperkueste");
  syncBackground(scene, renderState, idleWorld.width, idleWorld.height);
  syncTerrainTexture(scene, renderState, idleWorld, idleTerrainTextureKey, "klapperkueste");
  drawWater(
    renderState.waterGraphics,
    renderState.waterFrontGraphics,
    idleWorld.width,
    idleWorld.height,
    idleWorld.waterlineY,
    timeMs,
    0.55,
    1,
    false
  );
  renderState.effectsGraphics.clear();
  renderState.actorGraphics.clear();
  hideChaosKommandoCharacters(renderState.characterRenderState);
  for (const label of renderState.nameLabels.values()) {
    label.setVisible(false);
  }
}

export function renderChaosKommandoFrame(
  scene: Phaser.Scene,
  renderState: ChaosKommandoRenderState,
  state: ChaosKommandoState,
  nowMs: number
): void {
  updateCameraDirector(renderState.camera, state, nowMs);
  const target = resolveCameraTarget(scene, state, renderState.camera, renderState.overviewMode);
  // Waehrend der Regie und kurz danach bewusst traege nachfuehren.
  const scripted = renderState.camera.phase !== "follow";
  const calming = nowMs < renderState.camera.calmUntilMs;
  const trackingSpeed = scripted || calming ? 0.045 : state.projectiles.length > 0 ? 0.18 : 0.11;
  const zoomSpeed = scripted || calming ? 0.035 : 0.1;
  renderState.cameraCenterX = Phaser.Math.Linear(renderState.cameraCenterX, target.centerX, trackingSpeed);
  renderState.cameraCenterY = Phaser.Math.Linear(renderState.cameraCenterY, target.centerY, trackingSpeed * 0.9);
  renderState.cameraZoom = Phaser.Math.Linear(renderState.cameraZoom, target.zoom, zoomSpeed);
  applyCamera(scene, renderState, state.terrain.width, state.terrain.height);

  drawSky(
    renderState.skyGraphics,
    state.terrain.width,
    state.terrain.height,
    state.terrain.waterlineY,
    nowMs,
    state.wind.strength,
    state.wind.direction,
    state.terrain.mapId
  );
  syncBackground(scene, renderState, state.terrain.width, state.terrain.height);
  renderState.battleEffects.update(state, nowMs);
  syncTerrainTexture(scene, renderState, state.terrain, terrainTextureKey, state.terrain.mapId);
  drawWater(
    renderState.waterGraphics,
    renderState.waterFrontGraphics,
    state.terrain.width,
    state.terrain.height,
    state.terrain.waterlineY,
    nowMs,
    state.wind.strength,
    state.wind.direction,
    state.suddenDeath
  );
  drawEffects(renderState.effectsGraphics, state, nowMs, renderState.explosionSeenAtMs);
  const presentedState = renderState.presentation.sample(state, nowMs);
  syncChaosKommandoCharacters(scene, renderState.characterRenderState, presentedState, nowMs);
  drawActors(renderState.actorGraphics, presentedState, nowMs);
  syncNameLabels(scene, renderState, presentedState);
}

function syncBackground(scene: Phaser.Scene, renderState: ChaosKommandoRenderState, width: number, height: number): void {
  const camera = scene.cameras.main;
  const backgroundWidth = Math.max(width, camera.width / camera.zoom) + 8;
  const backgroundHeight = Math.max(height, camera.height / camera.zoom) + 8;
  renderState.background?.setDisplaySize(backgroundWidth, backgroundHeight)
    .setPosition((width - backgroundWidth) / 2, (height - backgroundHeight) / 2);
}

function applyCamera(
  scene: Phaser.Scene,
  renderState: ChaosKommandoRenderState,
  worldWidth: number,
  worldHeight: number
): void {
  const camera = scene.cameras.main;
  camera.setViewport(0, 58, scene.scale.width, Math.max(100, scene.scale.height - 112));
  const worldViewWidth = scene.scale.width / Math.max(0.01, renderState.cameraZoom);
  const worldViewHeight = camera.height / Math.max(0.01, renderState.cameraZoom);
  const halfWidth = worldViewWidth / 2;
  const halfHeight = worldViewHeight / 2;
  const paddingX = Math.max(0, (worldViewWidth - worldWidth) / 2);
  const paddingY = Math.max(0, (worldViewHeight - worldHeight) / 2);
  const centerX = clamp(renderState.cameraCenterX, halfWidth - paddingX, Math.max(halfWidth - paddingX, worldWidth + paddingX - halfWidth));
  const centerY = clamp(renderState.cameraCenterY, halfHeight - paddingY, Math.max(halfHeight - paddingY, worldHeight + paddingY - halfHeight));

  renderState.cameraCenterX = centerX;
  renderState.cameraCenterY = centerY;

  camera.setBounds(-paddingX, -paddingY, worldWidth + paddingX * 2, worldHeight + paddingY * 2);
  camera.setZoom(renderState.cameraZoom);
  camera.centerOn(centerX, centerY);
}

/**
 * Artillery camera: close-up while aiming, wide while shots fly,
 * whole map on game end.
 */
/**
 * Fuehrt die Regie weiter. Ausgeloest wird sie vom ersten neuen Einschlag
 * eines Zuges; Todesfaelle haengen die beiden Zusatzphasen an.
 */
function updateCameraDirector(
  director: CameraDirector,
  state: ChaosKommandoState,
  nowMs: number
): void {
  let impact = false;
  for (const explosion of state.explosions) {
    if (director.seenExplosionIds.has(explosion.id)) {
      continue;
    }
    director.seenExplosionIds.add(explosion.id);
    impact = true;
  }
  if (director.seenExplosionIds.size > 64) {
    director.seenExplosionIds = new Set([...director.seenExplosionIds].slice(-32));
  }

  // Neu eingeschwebte Kiste merken, damit die Regie sie zeigen kann.
  for (const crate of state.crates) {
    if (director.seenCrateIds.has(crate.id)) {
      continue;
    }
    director.seenCrateIds.add(crate.id);
    director.crateX = crate.x;
    director.crateY = crate.y;
  }

  // Gefallene einsammeln und den Jubelpunkt beim Gegnerteam setzen.
  for (const player of state.players) {
    for (const mercenary of player.mercenaries) {
      const wasAlive = director.aliveById.get(mercenary.id);
      director.aliveById.set(mercenary.id, mercenary.alive);

      if (wasAlive !== true || mercenary.alive) {
        continue;
      }

      director.casualtyX = mercenary.x;
      director.casualtyY = mercenary.y;

      const mourners = state.players
        .filter((entry) => entry.playerId !== mercenary.playerId)
        .flatMap((entry) => entry.mercenaries.filter((entry2) => entry2.alive));

      if (mourners.length > 0) {
        director.cheerX = mourners.reduce((sum, entry) => sum + entry.x, 0) / mourners.length;
        director.cheerY = mourners.reduce((sum, entry) => sum + entry.y, 0) / mourners.length;
      }
    }
  }

  if (state.winnerPlayerId || state.isDraw) {
    director.phase = "follow";
    director.bannerUntilMs = 0;
    return;
  }

  // Zugwechsel: Grabstein am Boden statt Leiche zeigen, dann Banner.
  if (state.turn.turnNumber !== director.lastTurnNumber) {
    director.lastTurnNumber = state.turn.turnNumber;
    const grave = state.gravestones[state.gravestones.length - 1];

    if (grave && director.casualtyX !== null) {
      director.casualtyX = grave.x;
      director.casualtyY = grave.y;
    }
  }

  if (impact && director.phase === "follow") {
    director.phase = "overview";
    director.phaseEndsAtMs = nowMs + cameraPhaseDurationsMs.overview;
    return;
  }

  if (director.phase === "follow" || nowMs < director.phaseEndsAtMs) {
    return;
  }

  const next = (phase: CameraPhase, durationMs: number): void => {
    director.phase = phase;
    director.phaseEndsAtMs = nowMs + durationMs;
  };

  if (director.phase === "overview") {
    if (director.casualtyX !== null) {
      next("casualty", cameraPhaseDurationsMs.casualty);
      return;
    }
    if (director.cheerX !== null) {
      next("cheer", cameraPhaseDurationsMs.cheer);
      return;
    }
    if (director.crateX !== null) {
      next("crate", cameraPhaseDurationsMs.crate);
      return;
    }
    startCameraBanner(director, state, nowMs);
    return;
  }

  if (director.phase === "casualty") {
    if (director.cheerX !== null) {
      next("cheer", cameraPhaseDurationsMs.cheer);
      return;
    }
    if (director.crateX !== null) {
      next("crate", cameraPhaseDurationsMs.crate);
      return;
    }
    startCameraBanner(director, state, nowMs);
    return;
  }

  if (director.phase === "cheer") {
    if (director.crateX !== null) {
      next("crate", cameraPhaseDurationsMs.crate);
      return;
    }
    startCameraBanner(director, state, nowMs);
    return;
  }

  if (director.phase === "crate") {
    startCameraBanner(director, state, nowMs);
    return;
  }

  finishCameraSequence(director, nowMs);
}

/** Blendet den Namen des naechsten Teams ein und faehrt dabei schon hin. */
function startCameraBanner(
  director: CameraDirector,
  state: ChaosKommandoState,
  nowMs: number
): void {
  const nextPlayer = state.players.find((player) => player.playerId === state.turn.currentPlayerId);
  const nextMercenary = nextPlayer?.mercenaries.find(
    (mercenary) => mercenary.id === state.turn.activeMercenaryId
  );

  director.phase = "banner";
  director.phaseEndsAtMs = nowMs + cameraPhaseDurationsMs.banner;
  director.bannerText = nextPlayer
    ? nextMercenary
      ? `${nextPlayer.name} · ${nextMercenary.name}`
      : nextPlayer.name
    : "";
  director.bannerUntilMs = nowMs + cameraPhaseDurationsMs.banner;
  director.casualtyX = null;
  director.casualtyY = null;
  director.cheerX = null;
  director.cheerY = null;
  director.crateX = null;
  director.crateY = null;
}

function finishCameraSequence(director: CameraDirector, nowMs: number): void {
  director.phase = "follow";
  director.phaseEndsAtMs = 0;
  director.calmUntilMs = nowMs + cameraPhaseDurationsMs.calm;
  director.casualtyX = null;
  director.casualtyY = null;
  director.cheerX = null;
  director.cheerY = null;
  director.crateX = null;
  director.crateY = null;
}

function resolveCameraTarget(
  scene: Phaser.Scene, state: ChaosKommandoState, director: CameraDirector, overview: boolean
): CameraTarget {
  const { width, height } = state.terrain;
  const availableHeight = Math.max(100, scene.scale.height - 112);
  const fit = Math.min(scene.scale.width / width, availableHeight / height);
  if (overview || state.winnerPlayerId || state.isDraw) return { centerX: width / 2, centerY: height / 2, zoom: fit };
  const active = resolveSelection(state).mercenary;
  if (!active) return { centerX: width / 2, centerY: height / 2, zoom: fit };
  const points = [{ x: active.x, y: active.y - 80 }];
  if (state.rope) points.push({ x: state.rope.anchorX, y: state.rope.anchorY });
  points.push(...state.projectiles.map((p) => ({ x: p.x, y: p.y })));
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const viewWidth = Math.max(1400, right - left + 520);
  const viewHeight = Math.max(720, bottom - top + 420);
  return {
    centerX: (left + right) / 2 + (state.projectiles.length ? 0 : Math.cos(active.aimAngleRad) * 130),
    centerY: (top + bottom) / 2 - (state.rope || state.projectiles.length ? 30 : 150),
    zoom: Math.max(fit, Math.min(scene.scale.width / viewWidth, availableHeight / viewHeight, 1.1))
  };
}

function resolveTerrainTheme(mapId?: string): TerrainTheme {
  switch (mapId) {
    case "klapperkueste":
      return {
        skyTop: 0x8fd6ff,
        skyMid: 0xffd6a8,
        skyGlow: 0xfff0d1,
        hillNear: 0x7890a3,
        hillFar: 0xa1b6c5,
        hillMist: 0xc6d7e2,
        treeLine: 0x5c7183,
        terrainBody: "#8c5d33",
        terrainMid: "#6e4725",
        terrainDeep: "#3f2814",
        grass: "#8bcf52",
        grassHighlight: "#eaf9b8",
        grassShadow: "#4f7f2e",
        craterRim: "#33200f",
        rockLight: "#a67b4c",
        rockDark: "#4a2f18",
        root: "#6b4a26",
        topsoil: "#a9743f"
      };
    case "seeschlund":
      return {
        skyTop: 0x7dc9f6,
        skyMid: 0xffc18c,
        skyGlow: 0xffefcb,
        hillNear: 0x607a89,
        hillFar: 0x91adbf,
        hillMist: 0xbcd0dd,
        treeLine: 0x4b626f,
        terrainBody: "#7b4f32",
        terrainMid: "#5f3e24",
        terrainDeep: "#331f10",
        grass: "#7fc550",
        grassHighlight: "#e8f7af",
        grassShadow: "#47762a",
        craterRim: "#2c1b0c",
        rockLight: "#9a7048",
        rockDark: "#402816",
        root: "#634324",
        topsoil: "#9c6a3b"
      };
    case "wurmfelsen":
      return {
        skyTop: 0x9bb8e8,
        skyMid: 0xf3b8a0,
        skyGlow: 0xffe9d3,
        hillNear: 0x6a7a94,
        hillFar: 0x9aa9c0,
        hillMist: 0xc2cddd,
        treeLine: 0x53627a,
        terrainBody: "#79553a",
        terrainMid: "#5c3f28",
        terrainDeep: "#33220f",
        grass: "#93d15e",
        grassHighlight: "#eefabf",
        grassShadow: "#54812f",
        craterRim: "#2e1d0e",
        rockLight: "#9d7852",
        rockDark: "#3f2a17",
        root: "#664726",
        topsoil: "#9b6f45"
      };
    default:
      return {
        skyTop: 0x88d0ff,
        skyMid: 0xffcf99,
        skyGlow: 0xfff0d1,
        hillNear: 0x738a98,
        hillFar: 0xa0b6c5,
        hillMist: 0xc4d5e1,
        treeLine: 0x586d7d,
        terrainBody: "#845833",
        terrainMid: "#684425",
        terrainDeep: "#3a2412",
        grass: "#87c959",
        grassHighlight: "#eaf9b8",
        grassShadow: "#4d7c2c",
        craterRim: "#31200f",
        rockLight: "#a2784c",
        rockDark: "#452c17",
        root: "#684826",
        topsoil: "#a26f3e"
      };
  }
}

function buildTerrainSignature(terrain: TerrainLike, textureKey: string): string {
  return `${textureKey}:${terrain.mapId ?? "idle"}:${terrain.width}:${terrain.samples.length}:${terrain.craters.length}:${terrain.platforms.length}`;
}

/**
 * Paints the destructible terrain into a canvas texture. Craters are punched
 * out with destination-out compositing, which is what makes real tunnels and
 * overhangs visible, exactly like classic Worms bitmap terrain.
 */
function syncTerrainTexture(
  scene: Phaser.Scene,
  renderState: ChaosKommandoRenderState,
  terrain: TerrainLike,
  textureKey: string,
  mapId?: string
): void {
  const signature = buildTerrainSignature(terrain, textureKey);

  if (renderState.terrainSignature === signature && renderState.terrainImage) {
    return;
  }

  let texture = scene.textures.exists(textureKey)
    ? (scene.textures.get(textureKey) as Phaser.Textures.CanvasTexture)
    : scene.textures.createCanvas(textureKey, terrain.width, terrain.height);

  if (!texture) {
    return;
  }

  if (texture.width !== terrain.width || texture.height !== terrain.height) {
    scene.textures.remove(textureKey);
    const recreated = scene.textures.createCanvas(textureKey, terrain.width, terrain.height);

    if (!recreated) {
      return;
    }

    texture = recreated;
  }
  const source = (key: string): HTMLImageElement | undefined => scene.textures.exists(key)
    ? scene.textures.get(key).getSourceImage() as HTMLImageElement : undefined;
  paintCoastalTerrain(texture.getContext(), terrain, source("chaos-sandstone"), {
    palm: source("chaos-coastal-palm"), grass: source("chaos-coastal-grass")
  });
  texture.refresh();
  if (!renderState.terrainImage || renderState.terrainImage.texture.key !== textureKey) {
    renderState.terrainImage?.destroy();
    renderState.terrainImage = scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDepth(-10);
  } else {
    renderState.terrainImage.setTexture(textureKey);
  }

  renderState.terrainSignature = signature;
}

function terrainNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
}


function drawSky(
  graphics: Phaser.GameObjects.Graphics,
  worldWidth: number,
  worldHeight: number,
  waterlineY: number,
  timeMs: number,
  windStrength: number,
  windDirection: -1 | 1,
  mapId?: string
): void {
  const theme = resolveTerrainTheme(mapId);
  graphics.clear();
  graphics.fillStyle(theme.skyTop, 1);
  graphics.fillRect(0, 0, worldWidth, worldHeight);

  // Weicher Verlauf durch gestapelte, halbtransparente Baender.
  for (let band = 0; band < 8; band += 1) {
    const ratio = band / 7;
    graphics.fillStyle(theme.skyMid, 0.1 + ratio * 0.12);
    graphics.fillRect(0, waterlineY * ratio * 0.62, worldWidth, waterlineY * 0.62);
  }
  graphics.fillStyle(theme.skyGlow, 0.26);
  graphics.fillRect(0, 0, worldWidth, waterlineY * 0.3);

  // Sonne mit gestaffeltem Halo.
  const sunX = worldWidth * 0.78;
  for (let ring = 4; ring >= 1; ring -= 1) {
    graphics.fillStyle(theme.skyGlow, 0.07 * ring);
    graphics.fillCircle(sunX, 126, 66 + ring * 34);
  }
  graphics.fillStyle(0xfffdf2, 0.9);
  graphics.fillCircle(sunX, 126, 58);

  // Drei Parallax-Ebenen: ferner Dunst, Berge, bewaldeter Ruecken.
  drawHillBand(graphics, worldWidth, worldHeight, 330, 62, theme.hillMist, 0.55, 268, 0.00068);
  drawHillBand(graphics, worldWidth, worldHeight, 424, 86, theme.hillFar, 0.76, 188, 0.00092);
  drawHillBand(graphics, worldWidth, worldHeight, 540, 128, theme.hillNear, 0.84, 108, 0.00114);
  drawTreeLine(graphics, worldWidth, theme);
  drawClouds(graphics, worldWidth, timeMs, windStrength, windDirection);

  // Leichter Dunstschleier vor den Bergen, damit das Terrain vorne abhebt.
  graphics.fillStyle(theme.hillMist, 0.16);
  graphics.fillRect(0, 430, worldWidth, 240);
}

function drawHillBand(
  graphics: Phaser.GameObjects.Graphics,
  worldWidth: number,
  worldHeight: number,
  baseY: number,
  amplitude: number,
  color: number,
  alpha: number,
  wavelength: number,
  seedScale: number
): void {
  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(0, worldHeight);

  for (let x = 0; x <= worldWidth; x += 18) {
    const y =
      baseY +
      Math.sin(x / wavelength) * amplitude +
      Math.cos(x * seedScale) * amplitude * 0.32;
    graphics.lineTo(x, y);
  }

  graphics.lineTo(worldWidth, worldHeight);
  graphics.closePath();
  graphics.fillPath();
}

/** Baumsilhouetten auf dem vorderen Huegelruecken. */
function drawTreeLine(
  graphics: Phaser.GameObjects.Graphics,
  worldWidth: number,
  theme: TerrainTheme
): void {
  graphics.fillStyle(theme.treeLine, 0.72);

  for (let x = 20; x < worldWidth; x += 46) {
    const noise = terrainNoise(x * 0.017);

    if (noise < 0.4) {
      continue;
    }

    const baseY =
      540 + Math.sin(x / 108) * 128 + Math.cos(x * 0.00114) * 128 * 0.32;
    const height = 34 + noise * 44;
    const halfWidth = 9 + noise * 9;
    graphics.fillTriangle(x, baseY - height, x - halfWidth, baseY + 6, x + halfWidth, baseY + 6);
    graphics.fillRect(x - 2, baseY, 4, 10);
  }
}

function drawClouds(
  graphics: Phaser.GameObjects.Graphics,
  worldWidth: number,
  timeMs: number,
  windStrength: number,
  windDirection: -1 | 1
): void {
  for (let index = 0; index < 7; index += 1) {
    const seed = hashString(`cloud:${index}`);
    const speed = (14 + (seed % 9) + windStrength * 24) * windDirection;
    const drift = ((timeMs / 1000) * speed + (seed % 300)) % (worldWidth + 360);
    const baseX = windDirection > 0 ? drift - 180 : worldWidth + 180 - drift;
    const baseY = 90 + index * 42 + (seed % 11);
    const width = 70 + (seed % 55);
    const height = 22 + (seed % 13);

    graphics.fillStyle(0xf8fafc, 0.08);
    graphics.fillEllipse(baseX, baseY, width, height);
    graphics.fillEllipse(baseX + width * 0.22, baseY - 9, width * 0.72, height * 0.78);
    graphics.fillEllipse(baseX - width * 0.18, baseY - 7, width * 0.65, height * 0.7);
  }
}

function drawWater(
  backGraphics: Phaser.GameObjects.Graphics,
  frontGraphics: Phaser.GameObjects.Graphics,
  worldWidth: number,
  worldHeight: number,
  waterlineY: number,
  timeMs: number,
  windStrength: number,
  windDirection: -1 | 1,
  suddenDeath: boolean
): void {
  const phase = (timeMs / 1000) * (0.8 + windStrength) * windDirection;
  const amplitude = 8 + windStrength * 6;
  const deepColor = suddenDeath ? 0x3a0d24 : 0x087f9c;
  const crestColor = suddenDeath ? 0xfb7185 : 0xc2fff2;
  const frontColor = suddenDeath ? 0x59102f : 0x089fb1;
  backGraphics.clear();
  backGraphics.fillStyle(deepColor, 0.9);
  backGraphics.beginPath();
  backGraphics.moveTo(0, worldHeight);
  for (let x = 0; x <= worldWidth; x += 24) {
    const y = waterlineY + Math.sin(x / 48 + phase) * amplitude + Math.cos(x / 120 + phase * 0.8) * 2;
    backGraphics.lineTo(x, y);
  }
  backGraphics.lineTo(worldWidth, worldHeight);
  backGraphics.closePath();
  backGraphics.fillPath();

  // Foreground wave band drawn over the worms: they visibly sink into it.
  frontGraphics.clear();
  frontGraphics.fillStyle(frontColor, 0.62);
  frontGraphics.beginPath();
  frontGraphics.moveTo(0, worldHeight);
  for (let x = 0; x <= worldWidth; x += 24) {
    const y =
      waterlineY +
      14 +
      Math.sin(x / 42 - phase * 1.15) * (amplitude * 0.8) +
      Math.cos(x / 96 - phase * 0.6) * 3;
    frontGraphics.lineTo(x, y);
  }
  frontGraphics.lineTo(worldWidth, worldHeight);
  frontGraphics.closePath();
  frontGraphics.fillPath();

  frontGraphics.lineStyle(4, crestColor, 0.55);
  frontGraphics.beginPath();
  frontGraphics.moveTo(0, waterlineY);
  for (let x = 0; x <= worldWidth; x += 24) {
    const y = waterlineY + Math.sin(x / 48 + phase) * amplitude + Math.cos(x / 120 + phase * 0.8) * 2;
    frontGraphics.lineTo(x, y);
  }
  frontGraphics.strokePath();
}

function drawEffects(
  graphics: Phaser.GameObjects.Graphics,
  state: ChaosKommandoState,
  nowMs: number,
  explosionSeenAtMs: Map<string, number>
): void {
  graphics.clear();
  drawWindStreaks(graphics, state, nowMs);

  for (const projectile of state.projectiles) {
    drawProjectile(graphics, state, projectile, nowMs);
  }

  const liveExplosionIds = new Set(state.explosions.map((explosion) => explosion.id));
  for (const explosionId of [...explosionSeenAtMs.keys()]) {
    if (!liveExplosionIds.has(explosionId)) {
      explosionSeenAtMs.delete(explosionId);
    }
  }

  for (const explosion of state.explosions) {
    if (!explosionSeenAtMs.has(explosion.id)) {
      explosionSeenAtMs.set(explosion.id, nowMs);
    }

    drawExplosionBurst(graphics, explosion, Math.max(0, nowMs - (explosionSeenAtMs.get(explosion.id) ?? nowMs)));
  }
}

function drawExplosionBurst(
  graphics: Phaser.GameObjects.Graphics,
  explosion: ChaosKommandoState["explosions"][number],
  ageMs: number
): void {
  const bullet = ["plunder-pistole", "minigun", "konfetti-schrot", "baseball-schlaeger"].includes(explosion.sourceWeaponId);
  if (bullet) {
    const fade = Math.max(0, 1 - ageMs / 250);
    graphics.lineStyle(3, 0xfff4a8, fade);
    for (let index = 0; index < 7; index++) {
      const angle = index * Math.PI * 2 / 7;
      graphics.lineBetween(explosion.x + Math.cos(angle) * 3, explosion.y + Math.sin(angle) * 3,
        explosion.x + Math.cos(angle) * (10 + ageMs * 0.08), explosion.y + Math.sin(angle) * (10 + ageMs * 0.08));
    }
    return;
  }
  const progress = clamp(ageMs / 1600, 0, 1);
  const fade = 1 - progress;
  const color = toColorNumber(explosion.color, 0xf59e0b);
  const shockRadius = explosion.radius * (0.22 + progress * 1.04);
  const coreRadius = explosion.radius * (0.16 + fade * 0.24);
  const seed = hashString(explosion.id);
  // Ejected terrain fragments follow ballistic arcs instead of expanding discs.
  const seconds = ageMs / 1000;
  for (let index = 0; index < 22; index++) {
    const angle = -Math.PI + index / 22 * Math.PI + (seed % 13) * 0.02;
    const speed = 90 + (index * 43 % 180) + explosion.radius * 0.6;
    const x = explosion.x + Math.cos(angle) * speed * seconds;
    const y = explosion.y + Math.sin(angle) * speed * seconds + 250 * seconds * seconds;
    graphics.fillStyle(index % 3 === 0 ? 0xf6c571 : 0x815334, fade * 0.9);
    graphics.fillTriangle(x - 3, y + 3, x + 5, y + 1, x, y - 5);
  }
  for (let index = 0; index < 9; index++) {
    const angle = index * Math.PI * 2 / 9;
    const spread = explosion.radius * (0.18 + progress * 0.32);
    graphics.fillStyle(progress < 0.18 ? (index % 2 ? 0xff9b26 : 0xffe078) : 0x493d39, fade * 0.46);
    graphics.fillCircle(explosion.x + Math.cos(angle) * spread, explosion.y + Math.sin(angle) * spread - seconds * 55,
      explosion.radius * (0.12 + progress * 0.12));
  }
  graphics.fillStyle(color, fade * 0.18);
  graphics.fillCircle(explosion.x, explosion.y, shockRadius);
  graphics.lineStyle(5, color, 0.18 + fade * 0.46);
  graphics.strokeCircle(explosion.x, explosion.y, shockRadius);
  graphics.lineStyle(2, 0xfff7d6, 0.12 + fade * 0.24);
  graphics.strokeCircle(explosion.x, explosion.y, shockRadius * 0.68);

  for (let index = 0; index < 14; index += 1) {
    const angle = (Math.PI * 2 * index) / 14 + (seed % 37) * 0.01;
    const lengthJitter = 0.72 + ((seed >> (index % 8)) & 7) * 0.045;
    const innerRadius = explosion.radius * (0.12 + progress * 0.16);
    const outerRadius = explosion.radius * (0.38 + progress * 0.78) * lengthJitter;
    const startX = explosion.x + Math.cos(angle) * innerRadius;
    const startY = explosion.y + Math.sin(angle) * innerRadius;
    const endX = explosion.x + Math.cos(angle) * outerRadius;
    const endY = explosion.y + Math.sin(angle) * outerRadius;

    graphics.lineStyle(2 + fade * 4, index % 3 === 0 ? 0xfff7d6 : color, 0.1 + fade * 0.42);
    graphics.lineBetween(startX, startY, endX, endY);
  }

  for (let index = 0; index < 7; index += 1) {
    const angle = (Math.PI * 2 * index) / 7 + progress * 0.9;
    const distance = explosion.radius * (0.2 + progress * (0.42 + index * 0.03));
    const puffRadius = explosion.radius * (0.07 + fade * 0.08) * (1 + (index % 2) * 0.3);

    graphics.fillStyle(index % 2 === 0 ? 0x1f2937 : 0x334155, 0.08 + fade * 0.16);
    graphics.fillCircle(
      explosion.x + Math.cos(angle) * distance,
      explosion.y + Math.sin(angle) * distance * 0.72,
      puffRadius
    );
  }

  graphics.fillStyle(color, 0.18 + fade * 0.34);
  graphics.fillCircle(explosion.x, explosion.y, coreRadius * 1.36);
  graphics.fillStyle(0xfff7d6, 0.28 + fade * 0.52);
  graphics.fillCircle(explosion.x, explosion.y, coreRadius);
}

function drawWindStreaks(
  graphics: Phaser.GameObjects.Graphics,
  state: ChaosKommandoState,
  nowMs: number
): void {
  const laneCount = 8;
  const swing = 90 + state.wind.strength * 80;
  const length = 52 + state.wind.strength * 58;

  graphics.lineStyle(2, 0xe0f2fe, 0.14 + state.wind.strength * 0.1);
  for (let index = 0; index < laneCount; index += 1) {
    const seed = hashString(`wind:${index}`);
    const speed = (42 + (seed % 17) + state.wind.strength * 80) * state.wind.direction;
    const cycle = state.terrain.width + swing * 2;
    const drift = ((nowMs / 1000) * speed + (seed % 500)) % cycle;
    const baseX = state.wind.direction > 0 ? drift - swing : state.terrain.width + swing - drift;
    const y = 118 + index * 52 + (seed % 20);
    const x2 = baseX + length * state.wind.direction;

    graphics.lineBetween(baseX, y, x2, y - 6);
    graphics.lineStyle(1, 0xf8fafc, 0.1 + state.wind.strength * 0.07);
    graphics.lineBetween(baseX - 12 * state.wind.direction, y + 10, x2 - 12 * state.wind.direction, y + 4);
    graphics.lineStyle(2, 0xe0f2fe, 0.14 + state.wind.strength * 0.1);
  }
}

function drawProjectile(
  graphics: Phaser.GameObjects.Graphics,
  state: ChaosKommandoState,
  projectile: ChaosKommandoState["projectiles"][number],
  nowMs: number
): void {
  const angle = Math.atan2(projectile.vy, projectile.vx);
  const color = toColorNumber(findWeapon(state, projectile.weaponId)?.accentColor, 0xf8fafc);
  const tailX = projectile.x - Math.cos(angle) * Math.max(20, projectile.radius * 2.6);
  const tailY = projectile.y - Math.sin(angle) * Math.max(20, projectile.radius * 2.6);
  const spin = (nowMs / 90 + hashString(projectile.id) % 20) % (Math.PI * 2);

  if (projectile.weaponId === "plunder-pistole" || projectile.weaponId === "minigun") {
    graphics.lineStyle(Math.max(2, projectile.radius * 0.8), color, 0.74);
    graphics.lineBetween(tailX, tailY, projectile.x, projectile.y);
    graphics.fillStyle(0xfff7d6, 0.95);
    graphics.fillCircle(projectile.x, projectile.y, Math.max(3, projectile.radius * 0.8));
    return;
  }

  if (projectile.weaponId === "dynamit") {
    const fuseFlicker = Math.sin(nowMs / 60) * 0.5 + 0.5;
    graphics.fillStyle(0xdc2626, 0.96);
    graphics.fillRoundedRect(projectile.x - 6, projectile.y - 14, 12, 26, 4);
    graphics.lineStyle(2, 0x7f1d1d, 0.9);
    graphics.strokeRoundedRect(projectile.x - 6, projectile.y - 14, 12, 26, 4);
    graphics.lineStyle(2, 0xd6d3d1, 0.9);
    graphics.lineBetween(projectile.x, projectile.y - 14, projectile.x + 4, projectile.y - 22);
    graphics.fillStyle(0xfbbf24, 0.6 + fuseFlicker * 0.4);
    graphics.fillCircle(projectile.x + 4, projectile.y - 22, 3 + fuseFlicker * 2.4);
    graphics.fillStyle(0xfff7d6, 0.8);
    graphics.fillCircle(projectile.x + 4, projectile.y - 22, 1.6);
    return;
  }

  if (projectile.weaponId === "heilige-granate") {
    graphics.fillStyle(0xfacc15, 0.28);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius * 2.2);
    graphics.fillStyle(0xeab308, 0.97);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius * 1.15);
    graphics.lineStyle(2, 0x854d0e, 0.9);
    graphics.strokeCircle(projectile.x, projectile.y, projectile.radius * 1.15);
    graphics.fillStyle(0xb45309, 0.95);
    graphics.fillRect(projectile.x - 2, projectile.y - projectile.radius * 1.9, 4, projectile.radius * 0.9);
    graphics.fillRect(
      projectile.x - projectile.radius * 0.5,
      projectile.y - projectile.radius * 1.72,
      projectile.radius,
      4
    );
    graphics.fillStyle(0xfff7d6, 0.6);
    graphics.fillCircle(projectile.x - projectile.radius * 0.35, projectile.y - projectile.radius * 0.4, projectile.radius * 0.3);
    return;
  }

  if (projectile.weaponId === "banane") {
    graphics.lineStyle(3, 0xfff7d6, 0.3);
    graphics.lineBetween(tailX, tailY, projectile.x, projectile.y);
    const bend = 0.8;
    graphics.lineStyle(Math.max(4, projectile.radius * 0.9), 0xfde047, 0.97);
    graphics.beginPath();
    graphics.arc(projectile.x, projectile.y, projectile.radius * 1.15, spin, spin + Math.PI * bend, false);
    graphics.strokePath();
    graphics.lineStyle(2, 0x854d0e, 0.85);
    graphics.beginPath();
    graphics.arc(projectile.x, projectile.y, projectile.radius * 1.15, spin, spin + 0.3, false);
    graphics.strokePath();
    return;
  }

  if (
    projectile.weaponId === "funk-bombenteppich" ||
    projectile.weaponId === "leucht-salve" ||
    projectile.weaponId === "signal-schauer" ||
    projectile.weaponId === "pfeifen-sturzflug"
  ) {
    graphics.fillStyle(0x64748b, 0.97);
    graphics.fillEllipse(projectile.x, projectile.y, projectile.radius * 1.6, projectile.radius * 2.4);
    graphics.fillStyle(0x334155, 0.95);
    graphics.fillTriangle(
      projectile.x - projectile.radius * 0.9,
      projectile.y - projectile.radius * 1.3,
      projectile.x + projectile.radius * 0.9,
      projectile.y - projectile.radius * 1.3,
      projectile.x,
      projectile.y - projectile.radius * 2.1
    );
    graphics.fillStyle(0xfff7d6, 0.4);
    graphics.fillCircle(projectile.x - projectile.radius * 0.3, projectile.y + projectile.radius * 0.4, projectile.radius * 0.34);
    return;
  }

  if (projectile.weaponId === "enten-granate") {
    graphics.fillStyle(0xffd34d, 0.96);
    graphics.fillEllipse(projectile.x, projectile.y, projectile.radius * 2.3, projectile.radius * 1.8);
    graphics.fillStyle(0xf97316, 0.88);
    graphics.fillTriangle(
      projectile.x + projectile.radius * 0.78,
      projectile.y,
      projectile.x + projectile.radius * 1.5,
      projectile.y - projectile.radius * 0.28,
      projectile.x + projectile.radius * 1.5,
      projectile.y + projectile.radius * 0.28
    );
    graphics.fillStyle(0x111827, 0.92);
    graphics.fillCircle(projectile.x - projectile.radius * 0.42, projectile.y - projectile.radius * 0.18, Math.max(2, projectile.radius * 0.18));
    graphics.lineStyle(2, 0xfff6c8, 0.45);
    graphics.lineBetween(tailX, tailY, projectile.x - Math.cos(angle) * projectile.radius * 0.65, projectile.y - Math.sin(angle) * projectile.radius * 0.65);
    return;
  }

  if (projectile.weaponId === "splitter-granate") {
    graphics.lineStyle(3, 0xfff7d6, 0.42);
    graphics.lineBetween(tailX, tailY, projectile.x, projectile.y);
    graphics.fillStyle(0xfb923c, 0.96);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius * 1.05);
    graphics.lineStyle(2, 0x7c2d12, 0.84);
    graphics.strokeCircle(projectile.x, projectile.y, projectile.radius * 1.05);
    for (let index = 0; index < 8; index += 1) {
      const spikeAngle = (Math.PI * 2 * index) / 8;
      graphics.lineBetween(
        projectile.x + Math.cos(spikeAngle) * projectile.radius * 0.65,
        projectile.y + Math.sin(spikeAngle) * projectile.radius * 0.65,
        projectile.x + Math.cos(spikeAngle) * projectile.radius * 1.42,
        projectile.y + Math.sin(spikeAngle) * projectile.radius * 1.42
      );
    }
    graphics.fillStyle(0xfef3c7, 0.9);
    graphics.fillCircle(projectile.x - projectile.radius * 0.32, projectile.y - projectile.radius * 0.28, projectile.radius * 0.22);
    return;
  }

  if (projectile.weaponId === "konfetti-schrot") {
    const colors = [0xf0abfc, 0x67e8f9, 0xfde047, 0xfb7185];
    graphics.lineStyle(2, color, 0.45);
    graphics.lineBetween(tailX, tailY, projectile.x, projectile.y);
    for (let index = 0; index < 4; index += 1) {
      const offsetAngle = angle + Math.PI / 2;
      const offset = (index - 1.5) * projectile.radius * 0.42;
      graphics.fillStyle(colors[index] ?? color, 0.92);
      graphics.fillRect(
        projectile.x + Math.cos(offsetAngle) * offset - 2,
        projectile.y + Math.sin(offsetAngle) * offset - 2,
        4,
        4
      );
    }
    return;
  }

  if (projectile.weaponId === "gummi-huhn") {
    graphics.lineStyle(3, 0xfff7d6, 0.36);
    graphics.lineBetween(tailX, tailY, projectile.x, projectile.y);
    graphics.fillStyle(0xfde047, 0.96);
    graphics.fillEllipse(projectile.x, projectile.y, projectile.radius * 2.5, projectile.radius * 1.35);
    graphics.fillStyle(0xef4444, 0.95);
    graphics.fillCircle(projectile.x - Math.cos(angle) * projectile.radius * 0.6, projectile.y - Math.sin(angle) * projectile.radius * 0.6, projectile.radius * 0.34);
    graphics.fillStyle(0xfb923c, 0.96);
    graphics.fillTriangle(
      projectile.x + Math.cos(angle) * projectile.radius * 1.2,
      projectile.y + Math.sin(angle) * projectile.radius * 1.2,
      projectile.x + Math.cos(angle + 0.55) * projectile.radius * 0.78,
      projectile.y + Math.sin(angle + 0.55) * projectile.radius * 0.78,
      projectile.x + Math.cos(angle - 0.55) * projectile.radius * 0.78,
      projectile.y + Math.sin(angle - 0.55) * projectile.radius * 0.78
    );
    return;
  }

  if (projectile.weaponId === "seifenblasen-bombe") {
    graphics.lineStyle(2, 0x67e8f9, 0.26);
    graphics.lineBetween(tailX, tailY, projectile.x, projectile.y);
    graphics.fillStyle(0x67e8f9, 0.22);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius * 1.4);
    graphics.lineStyle(3, 0xe0faff, 0.62);
    graphics.strokeCircle(projectile.x, projectile.y, projectile.radius * 1.35);
    graphics.fillStyle(0xffffff, 0.48);
    graphics.fillCircle(projectile.x - projectile.radius * 0.38, projectile.y - projectile.radius * 0.42, projectile.radius * 0.26);
    graphics.fillStyle(0x67e8f9, 0.14);
    graphics.fillCircle(tailX, tailY, projectile.radius * 0.72);
    return;
  }

  if (projectile.weaponId === "bohrer-rakete") {
    graphics.lineStyle(4, color, 0.32);
    graphics.lineBetween(tailX, tailY, projectile.x, projectile.y);
    const drillTipX = projectile.x + Math.cos(angle) * projectile.radius * 1.85;
    const drillTipY = projectile.y + Math.sin(angle) * projectile.radius * 1.85;
    const drillBackX = projectile.x + Math.cos(angle) * projectile.radius * 0.35;
    const drillBackY = projectile.y + Math.sin(angle) * projectile.radius * 0.35;
    const drillWingX = Math.cos(angle + Math.PI / 2) * projectile.radius * 0.9;
    const drillWingY = Math.sin(angle + Math.PI / 2) * projectile.radius * 0.9;
    graphics.fillStyle(0xb6f34b, 0.96);
    graphics.fillTriangle(drillTipX, drillTipY, drillBackX + drillWingX, drillBackY + drillWingY, drillBackX - drillWingX, drillBackY - drillWingY);
    graphics.lineStyle(2, 0x365314, 0.8);
    graphics.lineBetween(drillTipX, drillTipY, drillBackX + drillWingX * 0.6, drillBackY + drillWingY * 0.6);
    graphics.lineBetween(drillTipX, drillTipY, drillBackX - drillWingX * 0.6, drillBackY - drillWingY * 0.6);
    graphics.fillStyle(0x334155, 0.92);
    graphics.fillCircle(projectile.x - Math.cos(angle) * projectile.radius * 0.7, projectile.y - Math.sin(angle) * projectile.radius * 0.7, projectile.radius * 0.72);
    return;
  }

  if (projectile.weaponId === "keks-moerser") {
    graphics.lineStyle(4, 0xd97706, 0.34);
    graphics.lineBetween(tailX, tailY, projectile.x, projectile.y);
    graphics.fillStyle(0xd97706, 0.96);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius * 1.05);
    graphics.fillStyle(0x7c2d12, 0.8);
    graphics.fillCircle(projectile.x - projectile.radius * 0.36, projectile.y - projectile.radius * 0.18, projectile.radius * 0.18);
    graphics.fillCircle(projectile.x + projectile.radius * 0.28, projectile.y + projectile.radius * 0.22, projectile.radius * 0.15);
    graphics.fillCircle(projectile.x + projectile.radius * 0.18, projectile.y - projectile.radius * 0.38, projectile.radius * 0.13);
    graphics.lineStyle(2, 0xffedd5, 0.62);
    graphics.strokeCircle(projectile.x, projectile.y, projectile.radius * 1.05);
    return;
  }

  if (projectile.weaponId === "regenbogen-rakete") {
    drawRainbowTrail(graphics, tailX, tailY, projectile.x, projectile.y, angle);
  } else {
    graphics.lineStyle(4, color, 0.38);
    graphics.lineBetween(tailX, tailY, projectile.x, projectile.y);
  }

  const noseX = projectile.x + Math.cos(angle) * projectile.radius * 1.6;
  const noseY = projectile.y + Math.sin(angle) * projectile.radius * 1.6;
  const rearX = projectile.x - Math.cos(angle) * projectile.radius * 1.2;
  const rearY = projectile.y - Math.sin(angle) * projectile.radius * 1.2;
  const wingX = Math.cos(angle + Math.PI / 2) * projectile.radius * 0.85;
  const wingY = Math.sin(angle + Math.PI / 2) * projectile.radius * 0.85;

  graphics.fillStyle(color, 0.96);
  graphics.fillTriangle(noseX, noseY, rearX + wingX, rearY + wingY, rearX - wingX, rearY - wingY);
  graphics.lineStyle(2, 0xfff6d7, 0.72);
  graphics.strokeTriangle(noseX, noseY, rearX + wingX, rearY + wingY, rearX - wingX, rearY - wingY);
  graphics.fillStyle(0xfff1bf, 0.56);
  graphics.fillCircle(rearX, rearY, Math.max(4, projectile.radius * 0.48));
}

function drawRainbowTrail(
  graphics: Phaser.GameObjects.Graphics,
  tailX: number,
  tailY: number,
  headX: number,
  headY: number,
  angle: number
): void {
  const perpendicularX = Math.cos(angle + Math.PI / 2);
  const perpendicularY = Math.sin(angle + Math.PI / 2);
  const bands = [
    { color: 0xfb7185, offset: -6 },
    { color: 0xfacc15, offset: 0 },
    { color: 0x38bdf8, offset: 6 }
  ];

  for (const band of bands) {
    graphics.lineStyle(3, band.color, 0.48);
    graphics.lineBetween(
      tailX + perpendicularX * band.offset,
      tailY + perpendicularY * band.offset,
      headX + perpendicularX * band.offset,
      headY + perpendicularY * band.offset
    );
  }
}

/** Ninjaseil: leicht durchhaengendes Tau vom Soeldner zum Ankerpunkt. */
function drawRope(graphics: Phaser.GameObjects.Graphics, state: ChaosKommandoState): void {
  const rope = state.rope;

  if (!rope) {
    return;
  }

  const mercenary = state.players
    .flatMap((player) => player.mercenaries)
    .find((entry) => entry.id === rope.mercenaryId);

  if (!mercenary || !mercenary.alive) {
    return;
  }

  const handX = mercenary.x;
  const handY = mercenary.y - mercenary.radius * 0.2;
  const distance = Math.max(1, Math.hypot(handX - rope.anchorX, handY - rope.anchorY));
  // Wie stark das Seil durchhaengt: straff bei voller Laenge, locker beim Klettern.
  const slack = clamp((rope.length - distance) / Math.max(1, rope.length), 0, 1) * 26;
  const segments = 14;

  graphics.lineStyle(3, 0x3f2a17, 0.95);
  graphics.beginPath();
  graphics.moveTo(rope.anchorX, rope.anchorY);

  for (let step = 1; step <= segments; step += 1) {
    const t = step / segments;
    const sag = Math.sin(t * Math.PI) * slack;
    graphics.lineTo(
      rope.anchorX + (handX - rope.anchorX) * t,
      rope.anchorY + (handY - rope.anchorY) * t + sag
    );
  }

  graphics.strokePath();

  graphics.fillStyle(0xd9b382, 1);
  graphics.fillCircle(rope.anchorX, rope.anchorY, 5);
  graphics.lineStyle(2, 0x3f2a17, 0.95);
  graphics.strokeCircle(rope.anchorX, rope.anchorY, 5);
}

function drawActors(
  graphics: Phaser.GameObjects.Graphics,
  state: ChaosKommandoState,
  nowMs: number
): void {
  graphics.clear();
  const selection = resolveSelection(state);

  drawRope(graphics, state);

  for (const gravestone of state.gravestones) {
    drawGravestone(graphics, gravestone);
  }

  for (const mine of state.mines) {
    drawMine(graphics, mine, nowMs);
  }

  for (const crate of state.crates) {
    drawCrate(graphics, crate, state, nowMs);
  }

  if (selection.mercenary && selection.weapon && (!state.turn.hasFired || state.turn.chargeRatio > 0)) {
    drawAimGuide(graphics, state, selection.mercenary, selection.weapon);
  }

  for (const player of state.players) {
    for (const mercenary of player.mercenaries) {
      drawMercenaryOverlay(
        graphics,
        mercenary,
        selection.mercenary?.id === mercenary.id,
        nowMs
      );
    }
  }
}

function drawMercenaryOverlay(
  graphics: Phaser.GameObjects.Graphics,
  mercenary: ChaosKommandoMercenaryState,
  isActive: boolean,
  nowMs: number
): void {
  if (!mercenary.alive) {
    return;
  }

  const radius = mercenary.radius * 1.3;
  const x = mercenary.x;
  const y = mercenary.y;
  const teamColor = toColorNumber(mercenary.teamColor, 0x38bdf8);
  const hpRatio = resolveHealthRatio(mercenary.hp, mercenary.maxHp);
  const barWidth = radius * 2.2;
  const barX = x - barWidth / 2;
  const barY = y - radius * 2.72;

  graphics.fillStyle(0x020617, 0.82);
  graphics.fillRoundedRect(barX - 1, barY - 1, barWidth + 2, 9, 4);
  graphics.fillStyle(0x0f172a, 0.96);
  graphics.fillRoundedRect(barX, barY, barWidth, 7, 3);
  graphics.fillStyle(teamColor, 1);
  graphics.fillRoundedRect(barX, barY, hpRatio > 0 ? Math.max(5, barWidth * hpRatio) : 0, 7, 3);

  if (isActive) {
    graphics.lineStyle(2, teamColor, 0.55 + Math.sin(nowMs / 180) * 0.25);
    graphics.strokeRoundedRect(barX - 3, barY - 3, barWidth + 6, 13, 4);
  }
}


function drawGravestone(
  graphics: Phaser.GameObjects.Graphics,
  gravestone: ChaosKommandoState["gravestones"][number]
): void {
  const r = gravestone.radius;
  const x = gravestone.x;
  const y = gravestone.y;
  const tilt = gravestone.grounded ? 0 : clamp(gravestone.vx * 0.002, -0.16, 0.16);

  graphics.fillStyle(0x64748b, 0.97);
  graphics.fillRoundedRect(x - r * 0.85 + tilt * 20, y - r * 1.15, r * 1.7, r * 1.9, { tl: r * 0.8, tr: r * 0.8, bl: 3, br: 3 });
  graphics.lineStyle(2, 0x334155, 0.9);
  graphics.strokeRoundedRect(x - r * 0.85 + tilt * 20, y - r * 1.15, r * 1.7, r * 1.9, { tl: r * 0.8, tr: r * 0.8, bl: 3, br: 3 });
  graphics.fillStyle(0x334155, 0.95);
  graphics.fillRect(x - 2, y - r * 0.75, 4, r * 1.05);
  graphics.fillRect(x - r * 0.42, y - r * 0.45, r * 0.84, 4);
  graphics.fillStyle(0x94a3b8, 0.4);
  graphics.fillEllipse(x - r * 0.3, y - r * 0.7, r * 0.4, r * 0.24);
}

function drawMine(
  graphics: Phaser.GameObjects.Graphics,
  mine: ChaosKommandoState["mines"][number],
  nowMs: number
): void {
  const r = mine.radius;
  const triggered = mine.explodesAt !== null;
  const blink = triggered
    ? Math.sin(nowMs / 60) > 0
    : Math.sin(nowMs / 600 + mine.x * 0.05) > 0.65;

  // Spikes.
  graphics.lineStyle(3, 0x1e293b, 0.95);
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6 + Math.PI / 6;
    graphics.lineBetween(
      mine.x + Math.cos(angle) * r * 0.6,
      mine.y + Math.sin(angle) * r * 0.6,
      mine.x + Math.cos(angle) * r * 1.45,
      mine.y + Math.sin(angle) * r * 1.45
    );
  }

  graphics.fillStyle(0x1e293b, 0.97);
  graphics.fillCircle(mine.x, mine.y, r);
  graphics.lineStyle(2, 0x0f172a, 0.9);
  graphics.strokeCircle(mine.x, mine.y, r);
  graphics.fillStyle(0x475569, 0.7);
  graphics.fillCircle(mine.x - r * 0.3, mine.y - r * 0.32, r * 0.3);

  // Blinking light: green while dormant, furious red when triggered.
  const lightColor = triggered ? 0xef4444 : 0x4ade80;
  graphics.fillStyle(lightColor, blink ? 1 : 0.25);
  graphics.fillCircle(mine.x, mine.y - r * 0.1, r * 0.32);

  if (triggered && blink) {
    graphics.fillStyle(0xef4444, 0.2);
    graphics.fillCircle(mine.x, mine.y, r * 2.4);
  }
}

function drawCrate(
  graphics: Phaser.GameObjects.Graphics,
  crate: ChaosKommandoState["crates"][number],
  state: ChaosKommandoState,
  nowMs: number
): void {
  const r = crate.radius;
  const x = crate.x;
  const y = crate.y;
  const accent = toColorNumber(findWeapon(state, crate.weaponId)?.accentColor, 0xfbbf24);

  // Parachute while falling.
  if (!crate.grounded) {
    const sway = Math.sin(nowMs / 320 + x * 0.01) * r * 0.4;
    const canopyX = x + sway;
    const canopyY = y - r * 3.1;

    graphics.fillStyle(0xf8fafc, 0.92);
    graphics.beginPath();
    graphics.arc(canopyX, canopyY, r * 1.9, Math.PI, Math.PI * 2, false);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(2, 0xcbd5e1, 0.9);
    graphics.beginPath();
    graphics.arc(canopyX, canopyY, r * 1.9, Math.PI, Math.PI * 2, false);
    graphics.strokePath();
    graphics.lineStyle(1.5, 0x94a3b8, 0.85);
    graphics.lineBetween(canopyX - r * 1.7, canopyY, x - r * 0.7, y - r * 0.8);
    graphics.lineBetween(canopyX + r * 1.7, canopyY, x + r * 0.7, y - r * 0.8);
    graphics.lineBetween(canopyX, canopyY, x, y - r * 0.9);
  }

  // Wooden box with accent stripe.
  graphics.fillStyle(0x926640, 0.97);
  graphics.fillRoundedRect(x - r, y - r * 0.85, r * 2, r * 1.7, 3);
  graphics.lineStyle(2, 0x5d4027, 0.95);
  graphics.strokeRoundedRect(x - r, y - r * 0.85, r * 2, r * 1.7, 3);
  graphics.lineStyle(2, 0x5d4027, 0.7);
  graphics.lineBetween(x - r, y, x + r, y);
  graphics.fillStyle(accent, 0.95);
  graphics.fillRect(x - r * 0.24, y - r * 0.85, r * 0.48, r * 1.7);
  const glint = Math.sin(nowMs / 260) * 0.5 + 0.5;
  graphics.fillStyle(0xfff7d6, 0.25 + glint * 0.3);
  graphics.fillCircle(x - r * 0.5, y - r * 0.42, r * 0.2);
}

function drawAimGuide(
  graphics: Phaser.GameObjects.Graphics,
  state: ChaosKommandoState,
  mercenary: ChaosKommandoMercenaryState,
  weapon: NonNullable<ReturnType<typeof findWeapon>>
): void {
  const color = toColorNumber(weapon.accentColor, 0xfbbf24);
  const muzzle = resolveWeaponMuzzle(mercenary, weapon.id);
  const crosshair = resolveCrosshairPoint(state);
  if (!crosshair) return;
  const ux = Math.cos(mercenary.aimAngleRad), uy = Math.sin(mercenary.aimAngleRad);
  const length = Math.hypot(crosshair.x - muzzle.x, crosshair.y - muzzle.y);
  graphics.fillStyle(0xfff7dc, 0.65);
  for (let d = 14; d < length - 12; d += 17) graphics.fillCircle(muzzle.x + ux * d, muzzle.y + uy * d, 1.6);
  graphics.lineStyle(2.5, 0x193331, 0.85); graphics.strokeCircle(crosshair.x, crosshair.y, 10);
  graphics.lineStyle(2, 0xfff7dc, 0.9); graphics.strokeCircle(crosshair.x, crosshair.y, 8);
  for (const direction of [-1, 1]) {
    graphics.lineBetween(crosshair.x + direction * 12, crosshair.y, crosshair.x + direction * 17, crosshair.y);
    graphics.lineBetween(crosshair.x, crosshair.y + direction * 12, crosshair.x, crosshair.y + direction * 17);
  }
  if (weapon.fireMode === "charged" && state.turn.chargeStartedAt !== null) {
    const charge = resolveChargeRatio(state);
    const x = mercenary.x - 35, y = mercenary.y + mercenary.radius + 15;
    graphics.fillStyle(0x132f36, 0.9); graphics.fillRoundedRect(x - 4, y - 3, 78, 13, 4);
    for (let i = 0; i < 10; i++) {
      graphics.fillStyle(i / 10 < charge ? i > 6 ? 0xffb85e : color : 0x61736c, i / 10 < charge ? 1 : 0.45);
      graphics.fillRect(x + i * 7, y, 5, 7);
    }
  }
}

/**
 * Floating name plates above every living marshmallow.
 */
function syncNameLabels(
  scene: Phaser.Scene,
  renderState: ChaosKommandoRenderState,
  state: ChaosKommandoState
): void {
  const knownIds = new Set<string>();

  for (const player of state.players) {
    for (const mercenary of player.mercenaries) {
      if (!mercenary.alive) {
        continue;
      }

      knownIds.add(mercenary.id);
      let label = renderState.nameLabels.get(mercenary.id);

      if (!label) {
        label = scene.add
          .text(0, 0, mercenary.name, {
            fontFamily: '"Nunito Sans", "Arial", sans-serif',
            fontSize: "21px",
            fontStyle: "bold",
            align: "center",
            color: "#fff7df",
            stroke: "#193331",
            strokeThickness: 4
          })
          .setOrigin(0.5, 1)
          .setPadding(6, 2, 6, 2)
          .setDepth(25);
        renderState.nameLabels.set(mercenary.id, label);
      }

      label
        .setVisible(true)
        .setText(mercenary.id === state.turn.activeMercenaryId ? `${mercenary.playerName}\n${Math.ceil(mercenary.hp)}` : `${Math.ceil(mercenary.hp)}`)
        .setPosition(mercenary.x, mercenary.y - mercenary.radius * 4);
    }
  }

  for (const [mercenaryId, label] of renderState.nameLabels.entries()) {
    if (knownIds.has(mercenaryId)) {
      continue;
    }

    label.destroy();
    renderState.nameLabels.delete(mercenaryId);
  }
}
