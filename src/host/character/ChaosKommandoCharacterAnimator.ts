import type {
  ChaosKommandoMercenaryState,
  ChaosKommandoState,
  ChaosKommandoWeaponId
} from "../../protocol.js";
import {
  chaosKommandoWeaponVisuals,
  type ChaosKommandoWeaponPosture
} from "./ChaosKommandoCharacterAssets.js";
import {
  armBaseGap,
  lerpAngle,
  marshmallowRigProfiles,
  marshmallowRigScale,
  marshmallowTorsoLayout,
  resolveHeadbandVariant,
  resolveTorsoVariantForId,
  smoothstep,
  hashString,
  MARSHMALLOW_DEFAULT_FPS,
  MARSHMALLOW_FRAME_COUNT,
  MARSHMALLOW_THROW_HOLD_FRAME,
  MARSHMALLOW_THROW_RELEASE_END_FRAME,
  type MarshmallowActionHand,
  type MarshmallowHeadbandVariantId,
  type MarshmallowHeadgear,
  type MarshmallowMotionState,
  type MarshmallowRigProfile,
  type MarshmallowTorsoVariant
} from "./marshmallowRig.js";

export type ChaosKommandoExpression = "neutral" | "focus" | "hurt" | "happy" | "defeated";

/** Wie lange die gegnerischen Teams nach einem Abschuss jubeln. */
export const CHAOS_KOMMANDO_JOY_DURATION_MS = 1_600;

/** Dauer der Wurfphase nach dem Loslassen (Frames 6..16 bei 16 fps). */
const THROW_RELEASE_DURATION_MS =
  ((MARSHMALLOW_FRAME_COUNT - MARSHMALLOW_THROW_HOLD_FRAME) / MARSHMALLOW_DEFAULT_FPS) * 1_000;

/** Referenz-Vertikalgeschwindigkeit fuer den Sprungbogen. */
const JUMP_REFERENCE_SPEED = 520;

/** Ab dieser Horizontalgeschwindigkeit wird aus `jump` ein `longJump`. */
const LONG_JUMP_SPEED = 150;

export interface ChaosKommandoCharacterMemory {
  createdAtMs: number;
  previousHp: number;
  previousGrounded: boolean;
  previousHasFired: boolean;
  previousTurnNumber: number;
  hitStartedAtMs: number;
  hitUntilMs: number;
  landingStartedAtMs: number;
  landingUntilMs: number;
  recoilStartedAtMs: number;
  recoilUntilMs: number;
  recoilWeaponId: ChaosKommandoWeaponId;
  /** Gesetzt, wenn ein gegnerischer Soeldner gefallen ist. */
  joyUntilMs: number;
  /** Zeitpunkt des Loslassens fuer die Wurfphasen. */
  throwReleasedAtMs: number;
  /** Freilaufender Zyklusframe 0..16 fuer idle/walk/joy. */
  frame: number;
  /** Gehaltener Wurfframe 0..16. */
  throwFrame: number;
  lastUpdateMs: number;
  torsoVariant: MarshmallowTorsoVariant;
  headbandVariant: MarshmallowHeadbandVariantId;
  phaseOffset: number;
}

export interface MarshmallowHandPose {
  x: number;
  y: number;
  rotation: number;
  /** Zielbreite in Weltpixeln */
  width: number;
  /** Zielhoehe in Weltpixeln */
  height: number;
  alpha: number;
}

export interface MarshmallowFootPose {
  x: number;
  y: number;
  rotation: number;
}

export interface MarshmallowAim {
  ux: number;
  uy: number;
  angle: number;
  targetX: number;
  targetY: number;
}

export interface MarshmallowWeaponPose {
  weaponId: ChaosKommandoWeaponId;
  posture: ChaosKommandoWeaponPosture;
  /** Weltpunkt, an dem der primaere Griff sitzt. */
  gripX: number;
  gripY: number;
  angle: number;
  facesLeft: boolean;
  displaySize: number;
}

export interface MarshmallowHeadgearPose {
  kind: Exclude<MarshmallowHeadgear, "none">;
  headbandVariant: MarshmallowHeadbandVariantId;
  /** Lokale Zeichenecke innerhalb der Warp-Matrix (Rig-Raum * scale). */
  localX: number;
  localY: number;
  width: number;
  height: number;
}

export interface MarshmallowFacePose {
  faceScale: number;
  eyeCenterY: number;
  eyeGap: number;
  /** Zielpunkt zurueckgerechnet in den lokalen, invers transformierten Koerperraum. */
  targetLocalX: number;
  targetLocalY: number;
  blink: number;
}

export interface ChaosKommandoCharacterPose {
  motionState: MarshmallowMotionState;
  profile: MarshmallowRigProfile;
  expression: ChaosKommandoExpression;
  alpha: number;
  /** Rig-Pixel -> Weltpixel */
  scale: number;

  bodyX: number;
  bodyBottom: number;
  scaleX: number;
  scaleY: number;
  shearX: number;

  torsoVariant: MarshmallowTorsoVariant;
  torsoWidth: number;
  torsoHeight: number;

  leftFoot: MarshmallowFootPose;
  rightFoot: MarshmallowFootPose;
  footWidth: number;
  footHeight: number;
  leftFootInFront: boolean;

  leftHand: MarshmallowHandPose;
  rightHand: MarshmallowHandPose;
  /** -1 = linke Hand hinter dem Torso, 1 = rechte Hand, 0 = beide vorne. */
  handBehindSide: -1 | 0 | 1;

  headgear: MarshmallowHeadgearPose | null;
  face: MarshmallowFacePose;
  weapon: MarshmallowWeaponPose | null;
  aim: MarshmallowAim;
}

interface ResolvePoseOptions {
  mercenary: ChaosKommandoMercenaryState;
  state: ChaosKommandoState;
  isActive: boolean;
  nowMs: number;
  memory: ChaosKommandoCharacterMemory;
  teamColor: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export function createChaosKommandoCharacterMemory(
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  nowMs: number,
  teamColor: number
): ChaosKommandoCharacterMemory {
  const hash = hashString(mercenary.id);
  return {
    createdAtMs: nowMs,
    previousHp: mercenary.hp,
    previousGrounded: mercenary.grounded,
    previousHasFired: state.turn.hasFired,
    previousTurnNumber: state.turn.turnNumber,
    hitStartedAtMs: 0,
    hitUntilMs: 0,
    landingStartedAtMs: 0,
    landingUntilMs: 0,
    recoilStartedAtMs: 0,
    recoilUntilMs: 0,
    recoilWeaponId: state.turn.currentWeaponId,
    joyUntilMs: 0,
    throwReleasedAtMs: 0,
    frame: hash % MARSHMALLOW_FRAME_COUNT,
    throwFrame: 0,
    lastUpdateMs: nowMs,
    torsoVariant: resolveTorsoVariantForId(mercenary.id),
    headbandVariant: resolveHeadbandVariant(teamColor),
    phaseOffset: (hash % 997) / 997
  };
}

export function resolveChaosKommandoCharacterPose({
  mercenary,
  state,
  isActive,
  nowMs,
  memory,
  teamColor
}: ResolvePoseOptions): ChaosKommandoCharacterPose {
  const deltaMs = clamp(nowMs - memory.lastUpdateMs, 0, 50);
  memory.lastUpdateMs = nowMs;
  memory.headbandVariant = resolveHeadbandVariant(teamColor);
  updateTransientAnimationMemory(mercenary, state, isActive, nowMs, memory);

  const profile = marshmallowRigProfiles[memory.torsoVariant];
  const radius = Math.max(14, mercenary.radius);
  const scale = marshmallowRigScale(radius);
  const groundY = mercenary.y + radius * 1.02;
  const anchorX = mercenary.x;

  const visual = chaosKommandoWeaponVisuals[state.turn.currentWeaponId];
  const aiming = isActive && mercenary.alive && !state.turn.hasFired && !state.turn.resolvingShot;
  const recoiling = memory.recoilUntilMs > nowMs;
  const throwing = recoiling && chaosKommandoWeaponVisuals[memory.recoilWeaponId].posture === "throw";
  const displayedWeaponId = aiming
    ? state.turn.currentWeaponId
    : recoiling
      ? memory.recoilWeaponId
      : null;
  const displayedVisual = displayedWeaponId ? chaosKommandoWeaponVisuals[displayedWeaponId] : null;

  const aim = resolveAim(mercenary, state, isActive, groundY, scale, profile);
  // Geschossen wird mit der Hand auf der Zielseite, geworfen mit der abgewandten:
  // die Wurfhand holt entgegen dem Zielvektor aus und braucht dort Platz.
  const aimsRight = aim.ux >= 0;
  const throwPosture = (displayedVisual?.posture ?? null) === "throw";
  const actionHand: MarshmallowActionHand = throwPosture
    ? aimsRight
      ? "left"
      : "right"
    : aimsRight
      ? "right"
      : "left";

  const motionState = resolveMotionState({
    mercenary,
    state,
    nowMs,
    memory,
    aiming,
    throwing,
    recoiling,
    posture: displayedVisual?.posture ?? null
  });

  const frame = advanceFrame(motionState, mercenary, state, nowMs, deltaMs, memory, aiming);
  const expression = resolveExpression(mercenary, state, nowMs, memory, aiming);

  const pose = buildPose({
    motionState,
    profile: { ...profile, actionHand },
    frame,
    anchorX,
    groundY,
    scale,
    aim,
    memory,
    nowMs,
    torsoVariant: memory.torsoVariant
  });

  pose.expression = expression;
  pose.alpha = mercenary.alive ? 1 : 0.72;
  applyTransientOffsets(pose, mercenary, state, nowMs, memory, scale);
  pose.headgear = resolveHeadgear(pose, profile, displayedVisual?.wearsHelmet ?? false, memory, mercenary, scale);
  pose.weapon = resolveWeaponPose(pose, displayedWeaponId, radius, aim);
  return pose;
}

/* ------------------------------------------------------------------ */
/* Zustandswahl                                                        */
/* ------------------------------------------------------------------ */

interface MotionStateOptions {
  mercenary: ChaosKommandoMercenaryState;
  state: ChaosKommandoState;
  nowMs: number;
  memory: ChaosKommandoCharacterMemory;
  aiming: boolean;
  throwing: boolean;
  recoiling: boolean;
  posture: ChaosKommandoWeaponPosture | null;
}

function resolveMotionState({
  mercenary,
  state,
  nowMs,
  memory,
  aiming,
  throwing,
  recoiling,
  posture
}: MotionStateOptions): MarshmallowMotionState {
  if (!mercenary.alive) return "idle";
  if (state.winnerPlayerId === mercenary.playerId) return "joy";
  if (state.winnerPlayerId || state.isDraw) return "idle";
  if (memory.joyUntilMs > nowMs) return "joy";
  if (throwing) return "grenade";
  if (!mercenary.grounded) {
    return Math.abs(mercenary.vx) > LONG_JUMP_SPEED ? "longJump" : "jump";
  }
  if (Math.abs(mercenary.vx) > 12) {
    return mercenary.vx < 0 ? "walk" : "walkRight";
  }
  if ((aiming || recoiling) && posture) {
    if (posture === "throw") return "grenade";
    if (posture === "one-hand") return "handgun";
    return "shoot";
  }
  return "idle";
}

function advanceFrame(
  motionState: MarshmallowMotionState,
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  nowMs: number,
  deltaMs: number,
  memory: ChaosKommandoCharacterMemory,
  aiming: boolean
): number {
  const speedRatio = clamp(Math.abs(mercenary.vx) / 240, 0, 1);
  const fps =
    motionState === "walk" || motionState === "walkRight"
      ? 9 + speedRatio * 13
      : motionState === "joy"
        ? 20
        : MARSHMALLOW_DEFAULT_FPS;
  memory.frame = (memory.frame + (deltaMs * fps) / 1_000) % MARSHMALLOW_FRAME_COUNT;

  if (motionState === "jump" || motionState === "longJump") {
    // Der Sprungbogen wird aus der echten Vertikalgeschwindigkeit abgeleitet,
    // damit der Scheitel exakt auf Frame 8 liegt.
    const normalized = clamp(Math.abs(mercenary.vy) / JUMP_REFERENCE_SPEED, 0, 1);
    const progress = mercenary.vy < 0 ? 0.5 * (1 - normalized) : 0.5 + 0.5 * normalized;
    return progress * MARSHMALLOW_FRAME_COUNT;
  }

  if (motionState === "grenade") {
    memory.throwFrame = advanceThrowFrame(state, nowMs, deltaMs, memory, aiming);
    return memory.throwFrame;
  }

  memory.throwFrame = 0;
  return memory.frame;
}

/**
 * Granatenzustand nach IMPLEMENTATION.md:
 * Frames 0-6 Ausholen, Halten auf Frame 6, 6-10 Vorwaertsschwung, 10-16 Rueckkehr.
 */
function advanceThrowFrame(
  state: ChaosKommandoState,
  nowMs: number,
  deltaMs: number,
  memory: ChaosKommandoCharacterMemory,
  aiming: boolean
): number {
  const advance = (deltaMs * MARSHMALLOW_DEFAULT_FPS) / 1_000;
  if (memory.throwReleasedAtMs > 0 && nowMs - memory.throwReleasedAtMs <= THROW_RELEASE_DURATION_MS + 120) {
    return Math.min(MARSHMALLOW_FRAME_COUNT, memory.throwFrame + advance);
  }
  if (aiming && state.turn.chargeStartedAt !== null) {
    return Math.min(MARSHMALLOW_THROW_HOLD_FRAME, memory.throwFrame + advance);
  }
  if (aiming) {
    return Math.max(0, memory.throwFrame - advance);
  }
  return 0;
}

function resolveExpression(
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  nowMs: number,
  memory: ChaosKommandoCharacterMemory,
  aiming: boolean
): ChaosKommandoExpression {
  if (!mercenary.alive) return "defeated";
  if (state.winnerPlayerId === mercenary.playerId) return "happy";
  if (state.winnerPlayerId || state.isDraw) return "defeated";
  if (memory.hitUntilMs > nowMs) return "hurt";
  if (memory.joyUntilMs > nowMs) return "happy";
  if (aiming || memory.recoilUntilMs > nowMs) return "focus";
  return "neutral";
}

/* ------------------------------------------------------------------ */
/* Zielvektor                                                          */
/* ------------------------------------------------------------------ */

function resolveAim(
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  isActive: boolean,
  groundY: number,
  scale: number,
  profile: MarshmallowRigProfile
): MarshmallowAim {
  const shoulderY = groundY - (155 + profile.armHeight * 92) * scale;
  if (isActive) {
    const dx = state.turn.crosshairX - mercenary.x;
    const dy = state.turn.crosshairY - shoulderY;
    const length = Math.max(1, Math.hypot(dx, dy));
    return {
      ux: dx / length,
      uy: dy / length,
      angle: Math.atan2(dy, dx),
      targetX: state.turn.crosshairX,
      targetY: state.turn.crosshairY
    };
  }
  // Passive Figuren blicken entlang ihres Zielwinkels ins Leere.
  const angle = mercenary.aimAngleRad;
  const distance = 520 * scale;
  return {
    ux: Math.cos(angle),
    uy: Math.sin(angle),
    angle,
    targetX: mercenary.x + Math.cos(angle) * distance,
    targetY: shoulderY + Math.sin(angle) * distance
  };
}

/* ------------------------------------------------------------------ */
/* Pose-Aufbau (Port aus motion-lab.js)                                */
/* ------------------------------------------------------------------ */

interface BuildPoseOptions {
  motionState: MarshmallowMotionState;
  profile: MarshmallowRigProfile;
  frame: number;
  anchorX: number;
  groundY: number;
  scale: number;
  aim: MarshmallowAim;
  memory: ChaosKommandoCharacterMemory;
  nowMs: number;
  torsoVariant: MarshmallowTorsoVariant;
}

function buildPose({
  motionState,
  profile,
  frame,
  anchorX,
  groundY,
  scale,
  aim,
  memory,
  nowMs,
  torsoVariant
}: BuildPoseOptions): ChaosKommandoCharacterPose {
  const phase = (frame / MARSHMALLOW_FRAME_COUNT) * Math.PI * 2;
  const isWalk = motionState === "walk" || motionState === "walkRight";
  const walkDirection = motionState === "walkRight" ? -1 : 1;
  const isJump = motionState === "jump";
  const isLongJump = motionState === "longJump";
  const isJoy = motionState === "joy";
  const isShoot = motionState === "shoot" || motionState === "handgun";
  const isIdle = motionState === "idle";

  const step = isWalk ? Math.sin(phase) * walkDirection : 0;
  const jumpArc = isJump || isLongJump ? Math.sin((frame / MARSHMALLOW_FRAME_COUNT) * Math.PI) : 0;
  const compression = isWalk
    ? Math.cos(phase * 2)
    : isJump || isLongJump
      ? Math.cos(phase)
      : isJoy
        ? Math.cos(phase * 2)
        : Math.sin(phase);
  const warpAmount = (isWalk || isJump || isLongJump || isJoy ? 0.032 : 0.018) * profile.warp;
  const stride =
    (isWalk ? step * 25 * scale : isIdle ? Math.sin(phase) * 1.5 * scale : 0) * profile.legMotion;
  const walkBounce = isWalk ? (1 - Math.cos(phase * 2)) * 2.2 * scale : 0;
  const idleBob = isIdle ? Math.sin(phase) * 0.8 * scale : 0;
  const joyBounce = isJoy ? (1 - Math.cos(phase * 2)) * 4.5 * scale : 0;
  const jumpLift = jumpArc * (isLongJump ? 72 : 92) * scale;

  const shotPulse = resolveShotPulse(memory, nowMs);
  const shootRecoil = isShoot ? shotPulse * 4 * scale : 0;
  const recoilX = aim.ux * shootRecoil;
  const recoilY = aim.uy * shootRecoil;

  const bodyX = anchorX + (isWalk ? step * 2.2 * scale : 0) - recoilX;
  const bodyBottom =
    groundY - profile.torsoHeight * 145 * scale - walkBounce - idleBob - joyBounce - jumpLift - recoilY;
  const scaleX = 1 + compression * warpAmount;
  const scaleY = 1 - compression * warpAmount * 0.92;
  const shearX = (isWalk ? step * 0.012 : Math.sin(phase) * 0.004) * profile.warp;
  const limbDistance = Math.max(0, profile.limbGap * 162 - jumpArc * 12) * scale;
  const leftLift =
    (isWalk
      ? Math.max(0, step) * 20 * profile.legMotion
      : isJoy
        ? Math.max(0, Math.sin(phase * 2)) * 6 * profile.legMotion
        : jumpArc * 88) * scale;
  const rightLift =
    (isWalk
      ? Math.max(0, -step) * 20 * profile.legMotion
      : isJoy
        ? Math.max(0, -Math.sin(phase * 2)) * 6 * profile.legMotion
        : jumpArc * 88) * scale;

  const footScale = scale * 1.08 * profile.legSize;
  const footCenterY = groundY - 31 * footScale;
  const footRotation = step * 0.13 * profile.legMotion;

  const layout = marshmallowTorsoLayout(torsoVariant);
  const torsoWidth = layout.width * scale;
  const torsoHeight = layout.height * scale;

  const hands = resolveHands({
    motionState,
    profile,
    frame,
    phase,
    bodyX,
    groundY,
    scale,
    aim,
    shotPulse,
    nowMs,
    memory
  });

  return {
    motionState,
    profile,
    expression: "neutral",
    alpha: 1,
    scale,
    bodyX,
    bodyBottom,
    scaleX,
    scaleY,
    shearX,
    torsoVariant,
    torsoWidth,
    torsoHeight,
    leftFoot: {
      x: bodyX - limbDistance + stride,
      y: footCenterY - leftLift,
      rotation: footRotation
    },
    rightFoot: {
      x: bodyX + limbDistance - stride,
      y: footCenterY - rightLift,
      rotation: -footRotation
    },
    footWidth: 86 * footScale,
    footHeight: 62 * footScale,
    // walk (nach links): rechter Fuss vorne. walkRight: linker Fuss vorne.
    leftFootInFront: motionState === "walkRight",
    leftHand: hands.left,
    rightHand: hands.right,
    handBehindSide: motionState === "walk" ? -1 : motionState === "walkRight" ? 1 : 0,
    headgear: null,
    face: {
      faceScale: scale * 0.92,
      eyeCenterY: -torsoHeight * 0.62,
      eyeGap: Math.min(49 * scale, torsoWidth * 0.15),
      ...resolveFaceTarget(aim, bodyX, bodyBottom, scaleX, scaleY, shearX),
      blink: resolveBlink(nowMs + memory.phaseOffset * 4_600)
    },
    weapon: null,
    aim
  };
}

function resolveFaceTarget(
  aim: MarshmallowAim,
  bodyX: number,
  bodyBottom: number,
  scaleX: number,
  scaleY: number,
  shearX: number
): { targetLocalX: number; targetLocalY: number } {
  // Zielkoordinaten muessen vor der Blickberechnung in den lokalen,
  // invers transformierten Koerperraum zurueckgerechnet werden.
  const targetLocalY = (aim.targetY - bodyBottom) / scaleY;
  const targetLocalX = (aim.targetX - bodyX - shearX * targetLocalY) / scaleX;
  return { targetLocalX, targetLocalY };
}

function resolveBlink(nowMs: number): number {
  const blinkPhase = nowMs % 4_600;
  return blinkPhase > 4_390 ? Math.max(0.1, Math.abs(blinkPhase - 4_495) / 105) : 1;
}

function resolveShotPulse(memory: ChaosKommandoCharacterMemory, nowMs: number): number {
  if (memory.recoilUntilMs <= nowMs) return 0;
  const progress = clamp((nowMs - memory.recoilStartedAtMs) / 210, 0, 1);
  return Math.pow(Math.sin(progress * Math.PI), 1.7);
}

/* ------------------------------------------------------------------ */
/* Handplatzierung (Port aus drawArms)                                 */
/* ------------------------------------------------------------------ */

interface HandOptions {
  motionState: MarshmallowMotionState;
  profile: MarshmallowRigProfile;
  frame: number;
  phase: number;
  bodyX: number;
  groundY: number;
  scale: number;
  aim: MarshmallowAim;
  shotPulse: number;
  nowMs: number;
  memory: ChaosKommandoCharacterMemory;
}

function hand(
  x: number,
  y: number,
  rotation: number,
  blobScale: number,
  alpha: number,
  radiusX = 37,
  radiusY = 28
): MarshmallowHandPose {
  return {
    x,
    y,
    rotation,
    width: radiusX * 2 * blobScale,
    height: radiusY * 2 * blobScale,
    alpha
  };
}

function resolveHands({
  motionState,
  profile,
  frame,
  phase,
  bodyX,
  groundY,
  scale,
  aim,
  shotPulse,
  nowMs,
  memory
}: HandOptions): { left: MarshmallowHandPose; right: MarshmallowHandPose } {
  const cycle = (frame / MARSHMALLOW_FRAME_COUNT) * Math.PI * 2;
  const isJumpState = motionState === "jump" || motionState === "longJump";
  const jumpArmLift = isJumpState
    ? Math.sin((frame / MARSHMALLOW_FRAME_COUNT) * Math.PI) * (motionState === "longJump" ? 52 : 70) * scale
    : 0;
  const shoulderY = groundY - jumpArmLift - (155 + profile.armHeight * 92) * scale;
  const gap = armBaseGap(profile.armGap) * scale;
  const blobScale = scale * profile.armSize;
  const anchorX = bodyX;
  const { ux, uy } = aim;

  if (motionState === "jump") {
    const jumpArc = Math.sin((frame / MARSHMALLOW_FRAME_COUNT) * Math.PI);
    return {
      left: hand(
        anchorX - gap - jumpArc * 8 * scale,
        shoulderY - jumpArc * 28 * scale,
        -0.2 - jumpArc * 0.34,
        blobScale,
        0.95
      ),
      right: hand(
        anchorX + gap + jumpArc * 8 * scale,
        shoulderY - jumpArc * 28 * scale,
        0.2 + jumpArc * 0.34,
        blobScale,
        1
      )
    };
  }

  if (motionState === "longJump") {
    const air = Math.sin((frame / MARSHMALLOW_FRAME_COUNT) * Math.PI);
    return {
      left: hand(
        anchorX - gap - air * 18 * scale,
        shoulderY + air * 10 * scale,
        -0.35 + air * 0.42,
        blobScale,
        0.95
      ),
      right: hand(
        anchorX + gap - air * 10 * scale,
        shoulderY - air * 24 * scale,
        0.28 - air * 0.5,
        blobScale,
        1
      )
    };
  }

  if (motionState === "joy") {
    const cheer = (1 - Math.cos(cycle * 2)) * 0.5;
    return {
      left: hand(
        anchorX - gap - 14 * scale,
        shoulderY - (38 + cheer * 18) * scale,
        -0.72 - cheer * 0.16,
        blobScale,
        0.95
      ),
      right: hand(
        anchorX + gap + 14 * scale,
        shoulderY - (38 + cheer * 18) * scale,
        0.72 + cheer * 0.16,
        blobScale,
        1
      )
    };
  }

  if (motionState === "grenade") {
    const windUp = smoothstep(Math.min(1, frame / MARSHMALLOW_THROW_HOLD_FRAME));
    const release = smoothstep(
      Math.max(
        0,
        Math.min(
          1,
          (frame - MARSHMALLOW_THROW_HOLD_FRAME) /
            (MARSHMALLOW_THROW_RELEASE_END_FRAME - MARSHMALLOW_THROW_HOLD_FRAME)
        )
      )
    );
    const recover = smoothstep(
      Math.max(
        0,
        Math.min(
          1,
          (frame - MARSHMALLOW_THROW_RELEASE_END_FRAME) /
            (MARSHMALLOW_FRAME_COUNT - MARSHMALLOW_THROW_RELEASE_END_FRAME)
        )
      )
    );
    const activeSide = profile.actionHand === "left" ? -1 : 1;
    const restX = anchorX + activeSide * gap;
    const restY = shoulderY;
    const windX = anchorX - ux * (gap + 145 * scale);
    const windY = shoulderY - uy * (gap * 0.58 + 52 * scale) - 42 * scale;
    const forwardReach = Math.max(22 * scale, gap - 30 * scale);
    const forwardX = anchorX + ux * forwardReach;
    const forwardY = shoulderY + uy * 42 * scale;
    const stagedX = restX + (windX - restX) * windUp;
    const stagedY = restY + (windY - restY) * windUp;
    const releasedX = stagedX + (forwardX - windX) * release;
    const releasedY = stagedY + (forwardY - windY) * release;
    const activeX = releasedX + (restX - releasedX) * recover;
    const activeY = releasedY + (restY - releasedY) * recover;
    const restRotation = activeSide * 0.2;
    const stagedRotation = lerpAngle(restRotation, Math.atan2(-uy, -ux), windUp);
    const releasedRotation = lerpAngle(stagedRotation, Math.atan2(uy, ux), release);
    const activeRotation = lerpAngle(releasedRotation, restRotation, recover);
    const otherSide = -activeSide;
    const idleHand = hand(anchorX + otherSide * gap, shoulderY + 8 * scale, otherSide * 0.2, blobScale, 0.95);
    const actionHandPose = hand(activeX, activeY, activeRotation, blobScale, 1, 30, 23);
    return activeSide < 0
      ? { left: actionHandPose, right: idleHand }
      : { left: idleHand, right: actionHandPose };
  }

  if (motionState === "shoot") {
    const recoil = shotPulse * 13 * scale;
    const aimAngle = Math.atan2(uy, ux);
    const twoHandOffset = profile.twoHandOffset * scale;
    const rearHandX = anchorX + ux * (gap - 52 * scale + twoHandOffset - recoil * 0.5);
    const rearHandY = shoulderY + uy * 42 * scale + 18 * scale;
    const frontHandX = anchorX + ux * (gap + twoHandOffset - recoil);
    const frontHandY = shoulderY + uy * 58 * scale;
    const rear = hand(rearHandX, rearHandY, aimAngle, blobScale, 0.95, 29, 22);
    const front = hand(frontHandX, frontHandY, aimAngle, blobScale, 1, 29, 22);
    // Bei Zielrichtung nach links liegt die vordere Hand links vom Koerper.
    return ux < 0 ? { left: front, right: rear } : { left: rear, right: front };
  }

  if (motionState === "handgun") {
    const activeSide = profile.actionHand === "left" ? -1 : 1;
    const recoil = shotPulse * 16 * scale;
    const aimAngle = Math.atan2(uy, ux);
    const idleHand = hand(
      anchorX - activeSide * gap,
      shoulderY + 7 * scale,
      -activeSide * 0.2,
      blobScale,
      0.95
    );
    const handX = anchorX + ux * (gap - recoil);
    const handY = shoulderY + uy * 62 * scale;
    const actionHandPose = hand(handX, handY, aimAngle, blobScale, 1, 28, 21);
    return activeSide < 0
      ? { left: actionHandPose, right: idleHand }
      : { left: idleHand, right: actionHandPose };
  }

  const swing =
    motionState === "walk" || motionState === "walkRight"
      ? Math.sin(cycle) * (motionState === "walkRight" ? -1 : 1)
      : Math.sin((nowMs + memory.phaseOffset * 3_400) * 0.0018) * 0.12;
  return {
    left: hand(anchorX - gap, shoulderY + swing * 15 * scale, -0.2 + swing * 0.22, blobScale, 0.95),
    right: hand(anchorX + gap, shoulderY - swing * 15 * scale, 0.2 + swing * 0.22, blobScale, 1)
  };
}

/* ------------------------------------------------------------------ */
/* Kopfbedeckung und Waffe                                             */
/* ------------------------------------------------------------------ */

function resolveHeadgear(
  pose: ChaosKommandoCharacterPose,
  profile: MarshmallowRigProfile,
  wearsHelmet: boolean,
  memory: ChaosKommandoCharacterMemory,
  mercenary: ChaosKommandoMercenaryState,
  scale: number
): MarshmallowHeadgearPose | null {
  if (!mercenary.alive) return null;
  const kind: Exclude<MarshmallowHeadgear, "none"> = wearsHelmet ? "helmet" : "headband";
  if (!wearsHelmet && profile.headgear === "none") return null;

  const isHelmet = kind === "helmet";
  const accessoryScale = isHelmet ? profile.helmetScale : profile.headbandScale;
  const width = pose.torsoWidth * (isHelmet ? 1.08 : 1.16) * accessoryScale;
  const height = width * (isHelmet ? 0.56 : 0.18);
  const heightSetting = isHelmet ? profile.helmetHeight : profile.headbandHeight;
  const offset = (isHelmet ? 125 - heightSetting * 115 : 145 - heightSetting * 150) * scale;
  const anchorY = -pose.torsoHeight + offset;
  return {
    kind,
    headbandVariant: memory.headbandVariant,
    localX: isHelmet ? -width * 0.5 : -width * 0.4,
    localY: isHelmet ? anchorY - height : anchorY,
    width,
    height
  };
}

function resolveWeaponPose(
  pose: ChaosKommandoCharacterPose,
  weaponId: ChaosKommandoWeaponId | null,
  radius: number,
  aim: MarshmallowAim
): MarshmallowWeaponPose | null {
  if (!weaponId) return null;
  // Nur die zielgesteuerten Zustaende halten die Waffe. Beim Laufen, Springen
  // oder Jubeln haengen die Haende frei, sonst zeigt die Waffe ins Leere.
  if (pose.motionState !== "grenade" && pose.motionState !== "shoot" && pose.motionState !== "handgun") {
    return null;
  }
  const visual = chaosKommandoWeaponVisuals[weaponId];
  const facesLeft = aim.ux < 0;
  const displaySize = radius * visual.sizeInRadii;

  if (visual.posture === "throw") {
    const activeSide = pose.profile.actionHand === "left" ? -1 : 1;
    const activeHand = activeSide < 0 ? pose.leftHand : pose.rightHand;
    return {
      weaponId,
      posture: visual.posture,
      gripX: activeHand.x + activeSide * 7 * pose.scale,
      gripY: activeHand.y - 16 * pose.scale,
      angle: (facesLeft ? -1 : 1) * visual.rotationOffsetRad,
      facesLeft,
      displaySize
    };
  }

  if (visual.posture === "one-hand") {
    const activeSide = pose.profile.actionHand === "left" ? -1 : 1;
    const activeHand = activeSide < 0 ? pose.leftHand : pose.rightHand;
    return {
      weaponId,
      posture: visual.posture,
      gripX: activeHand.x,
      gripY: activeHand.y,
      angle: aimAngleForSprite(aim, facesLeft) + (facesLeft ? -1 : 1) * visual.rotationOffsetRad,
      facesLeft,
      displaySize
    };
  }

  // Zweihand: der primaere Griff sitzt an der hinteren Hand, der Renderer
  // zieht die vordere Hand auf den transformierten Sekundaergriff nach.
  const rearHand = facesLeft ? pose.rightHand : pose.leftHand;
  return {
    weaponId,
    posture: visual.posture,
    gripX: rearHand.x,
    gripY: rearHand.y,
    angle: aimAngleForSprite(aim, facesLeft) + (facesLeft ? -1 : 1) * visual.rotationOffsetRad,
    facesLeft,
    displaySize
  };
}

/** Die Waffen-Grafiken zeigen nach rechts; beim Zielen nach links wird gespiegelt. */
function aimAngleForSprite(aim: MarshmallowAim, facesLeft: boolean): number {
  return facesLeft ? Math.atan2(-aim.uy, -aim.ux) : Math.atan2(aim.uy, aim.ux);
}

/* ------------------------------------------------------------------ */
/* Transiente Effekte                                                  */
/* ------------------------------------------------------------------ */

function applyTransientOffsets(
  pose: ChaosKommandoCharacterPose,
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  nowMs: number,
  memory: ChaosKommandoCharacterMemory,
  scale: number
): void {
  if (!mercenary.alive) {
    pose.bodyBottom += 22 * scale;
    pose.scaleX *= 1.08;
    pose.scaleY *= 0.88;
    return;
  }

  if (memory.landingUntilMs > nowMs) {
    const progress = progressBetween(nowMs, memory.landingStartedAtMs, memory.landingUntilMs);
    const squash = Math.sin(progress * Math.PI) * (1 - progress * 0.35);
    pose.bodyBottom += squash * 8 * scale;
    pose.scaleX *= 1 + squash * 0.055;
    pose.scaleY *= 1 - squash * 0.07;
  }

  if (state.turn.chargeStartedAt !== null && mercenary.id === state.turn.activeMercenaryId) {
    const ratio = clamp(state.turn.chargeRatio, 0, 1);
    const tension = 0.006 + ratio * 0.01 + Math.sin(nowMs * 0.018) * 0.0025 * ratio;
    pose.scaleX *= 1 + tension;
    pose.scaleY *= 1 - tension * 0.7;
  }

  if (memory.hitUntilMs > nowMs) {
    const progress = progressBetween(nowMs, memory.hitStartedAtMs, memory.hitUntilMs);
    const impact = Math.sin(progress * Math.PI) * (1 - progress * 0.3);
    pose.scaleX *= 1 + impact * 0.045;
    pose.scaleY *= 1 - impact * 0.055;
    pose.shearX += (mercenary.facing === "right" ? -1 : 1) * impact * 0.05;
  }

  if (nowMs - memory.createdAtMs < 260) {
    const appearProgress = clamp((nowMs - memory.createdAtMs) / 260, 0, 1);
    const settle = Math.sin(appearProgress * Math.PI) * (1 - appearProgress);
    pose.scaleX *= 1 + settle * 0.04;
    pose.scaleY *= 1 - settle * 0.05;
  }
}

function updateTransientAnimationMemory(
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  isActive: boolean,
  nowMs: number,
  memory: ChaosKommandoCharacterMemory
): void {
  if (mercenary.hp < memory.previousHp && mercenary.alive) {
    memory.hitStartedAtMs = nowMs;
    memory.hitUntilMs = nowMs + 340;
  }
  if (!memory.previousGrounded && mercenary.grounded && mercenary.alive) {
    memory.landingStartedAtMs = nowMs;
    memory.landingUntilMs = nowMs + 210;
  }
  if (memory.previousTurnNumber !== state.turn.turnNumber) {
    memory.previousTurnNumber = state.turn.turnNumber;
    memory.previousHasFired = state.turn.hasFired;
    memory.recoilUntilMs = 0;
    memory.throwReleasedAtMs = 0;
    memory.throwFrame = 0;
  } else if (isActive && !memory.previousHasFired && state.turn.hasFired) {
    memory.recoilStartedAtMs = nowMs;
    memory.recoilUntilMs = nowMs + resolveRecoilDuration(state.turn.currentWeaponId);
    memory.recoilWeaponId = state.turn.currentWeaponId;
    if (chaosKommandoWeaponVisuals[state.turn.currentWeaponId].posture === "throw") {
      memory.throwReleasedAtMs = nowMs;
      memory.throwFrame = Math.max(memory.throwFrame, MARSHMALLOW_THROW_HOLD_FRAME);
    }
  }
  memory.previousHp = mercenary.hp;
  memory.previousGrounded = mercenary.grounded;
  memory.previousHasFired = state.turn.hasFired;
}

function progressBetween(nowMs: number, startedAtMs: number, untilMs: number): number {
  return clamp((nowMs - startedAtMs) / Math.max(1, untilMs - startedAtMs), 0, 1);
}

function resolveRecoilDuration(weaponId: ChaosKommandoWeaponId): number {
  const visual = chaosKommandoWeaponVisuals[weaponId];
  if (visual.posture === "throw") return THROW_RELEASE_DURATION_MS + 120;
  if (visual.handling === "melee") return 500;
  if (visual.handling === "launcher") return 360;
  if (visual.handling === "two-handed") return 290;
  if (visual.handling === "pistol") return 220;
  return 360;
}
