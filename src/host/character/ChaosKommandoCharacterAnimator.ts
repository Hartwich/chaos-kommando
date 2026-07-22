import type {
  ChaosKommandoMercenaryState,
  ChaosKommandoState,
  ChaosKommandoWeaponId
} from "../../protocol.js";
import {
  chaosKommandoWeaponVisuals,
  type ChaosKommandoWeaponHandling
} from "./ChaosKommandoCharacterAssets.js";

export type ChaosKommandoExpression = "neutral" | "focus" | "hurt" | "happy" | "defeated";

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
}

export interface ChaosKommandoCharacterPose {
  bodyOffsetYInRadii: number;
  bodyRotationRad: number;
  bodyScaleX: number;
  bodyScaleY: number;
  stride: number;
  rearStepLift: number;
  frontStepLift: number;
  armSwingRad: number;
  eyeOpenRatio: number;
  expression: ChaosKommandoExpression;
  showWeapon: boolean;
  weaponHandling: ChaosKommandoWeaponHandling;
  weaponAngleOffsetRad: number;
  weaponKickInRadii: number;
}

interface ResolvePoseOptions {
  mercenary: ChaosKommandoMercenaryState;
  state: ChaosKommandoState;
  isActive: boolean;
  nowMs: number;
  memory: ChaosKommandoCharacterMemory;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export function createChaosKommandoCharacterMemory(
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  nowMs: number
): ChaosKommandoCharacterMemory {
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
    recoilWeaponId: state.turn.currentWeaponId
  };
}

export function resolveChaosKommandoCharacterPose({
  mercenary,
  state,
  isActive,
  nowMs,
  memory
}: ResolvePoseOptions): ChaosKommandoCharacterPose {
  updateTransientAnimationMemory(mercenary, state, isActive, nowMs, memory);
  const handling = chaosKommandoWeaponVisuals[state.turn.currentWeaponId].handling;
  const speedRatio = clamp(Math.abs(mercenary.vx) / 240, 0, 1);
  const moving = mercenary.grounded && speedRatio > 0.05;
  const walkPhase = nowMs * (0.0062 + speedRatio * 0.0085) + hashId(mercenary.id) * 0.001;
  const step = Math.sin(walkPhase);
  const breath = Math.sin(nowMs * 0.0021 + hashId(mercenary.id) * 0.01);
  const blinkPhase = (nowMs + hashId(mercenary.id)) % 4_900;
  const aiming = isActive && !state.turn.hasFired && !state.turn.resolvingShot;
  const pose: ChaosKommandoCharacterPose = {
    bodyOffsetYInRadii: breath * 0.018,
    bodyRotationRad: 0,
    bodyScaleX: 1 - breath * 0.0035,
    bodyScaleY: 1 + breath * 0.0045,
    stride: 0,
    rearStepLift: 0,
    frontStepLift: 0,
    armSwingRad: 0,
    eyeOpenRatio: blinkPhase > 4_720 ? clamp(Math.abs(blinkPhase - 4_810) / 90, 0.12, 1) : 1,
    expression: aiming ? "focus" : "neutral",
    showWeapon: aiming,
    weaponHandling: handling,
    weaponAngleOffsetRad: 0,
    weaponKickInRadii: 0
  };

  if (!mercenary.alive) {
    pose.bodyOffsetYInRadii = 0.2;
    pose.bodyRotationRad = mercenary.facing === "right" ? 0.16 : -0.16;
    pose.bodyScaleX = 1.06;
    pose.bodyScaleY = 0.9;
    pose.expression = "defeated";
    pose.showWeapon = false;
    return pose;
  }

  if (state.winnerPlayerId || state.isDraw) {
    if (state.winnerPlayerId === mercenary.playerId) {
      const bounce = Math.max(0, Math.sin(nowMs * 0.009));
      pose.bodyOffsetYInRadii = -bounce * 0.18;
      pose.bodyRotationRad = Math.sin(nowMs * 0.006) * 0.035;
      pose.armSwingRad = Math.sin(nowMs * 0.01) * 0.22;
      pose.expression = "happy";
    } else {
      pose.bodyOffsetYInRadii = 0.16;
      pose.bodyScaleX = 1.04;
      pose.bodyScaleY = 0.92;
      pose.expression = "defeated";
    }
    pose.showWeapon = false;
    return pose;
  }

  if (moving) {
    pose.stride = step * speedRatio;
    pose.rearStepLift = Math.max(0, step) * speedRatio;
    pose.frontStepLift = Math.max(0, -step) * speedRatio;
    pose.bodyOffsetYInRadii = -Math.abs(Math.cos(walkPhase)) * 0.045 * speedRatio;
    pose.bodyRotationRad = clamp(mercenary.vx / 2_800, -0.055, 0.055);
    pose.armSwingRad = -step * 0.24 * speedRatio;
  } else if (!mercenary.grounded) {
    const rising = mercenary.vy < -30;
    pose.bodyOffsetYInRadii = rising ? -0.04 : 0.02;
    pose.bodyRotationRad = clamp(mercenary.vx / 2_100, -0.11, 0.11);
    pose.stride = clamp(mercenary.vx / 360, -0.38, 0.38);
    pose.rearStepLift = rising ? 0.52 : 0.28;
    pose.frontStepLift = rising ? 0.32 : 0.18;
    pose.armSwingRad = rising ? -0.16 : 0.1;
  }

  if (memory.landingUntilMs > nowMs) {
    const progress = progressBetween(nowMs, memory.landingStartedAtMs, memory.landingUntilMs);
    const squash = Math.sin(progress * Math.PI) * (1 - progress * 0.35);
    pose.bodyOffsetYInRadii += squash * 0.11;
    pose.bodyScaleX *= 1 + squash * 0.055;
    pose.bodyScaleY *= 1 - squash * 0.07;
  }

  if (aiming && state.turn.chargeStartedAt !== null) {
    const ratio = clamp(state.turn.chargeRatio, 0, 1);
    const tension = 0.006 + ratio * 0.01 + Math.sin(nowMs * 0.018) * 0.0025 * ratio;
    pose.bodyScaleX *= 1 + tension;
    pose.bodyScaleY *= 1 - tension * 0.7;
    pose.bodyOffsetYInRadii -= ratio * 0.016;
    pose.expression = "focus";
  }

  if (memory.recoilUntilMs > nowMs) {
    const progress = progressBetween(nowMs, memory.recoilStartedAtMs, memory.recoilUntilMs);
    const kick = Math.sin(progress * Math.PI) * (1 - progress * 0.4);
    pose.weaponHandling = chaosKommandoWeaponVisuals[memory.recoilWeaponId].handling;
    pose.weaponKickInRadii = kick * recoilStrength(memory.recoilWeaponId);
    pose.bodyRotationRad -= (mercenary.facing === "right" ? 1 : -1) * kick * 0.035;
    pose.showWeapon = pose.weaponHandling !== "throwable" && pose.weaponHandling !== "placeable";
    pose.expression = "focus";
  }

  if (memory.hitUntilMs > nowMs) {
    const progress = progressBetween(nowMs, memory.hitStartedAtMs, memory.hitUntilMs);
    const impact = Math.sin(progress * Math.PI) * (1 - progress * 0.3);
    pose.bodyRotationRad -= (mercenary.facing === "right" ? 1 : -1) * impact * 0.1;
    pose.bodyScaleX *= 1 + impact * 0.045;
    pose.bodyScaleY *= 1 - impact * 0.055;
    pose.expression = "hurt";
  }

  if (nowMs - memory.createdAtMs < 260) {
    const appearProgress = clamp((nowMs - memory.createdAtMs) / 260, 0, 1);
    const settle = Math.sin(appearProgress * Math.PI) * (1 - appearProgress);
    pose.bodyScaleX *= 1 + settle * 0.04;
    pose.bodyScaleY *= 1 - settle * 0.05;
  }
  return pose;
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
  } else if (isActive && !memory.previousHasFired && state.turn.hasFired) {
    memory.recoilStartedAtMs = nowMs;
    memory.recoilUntilMs = nowMs + resolveRecoilDuration(state.turn.currentWeaponId);
    memory.recoilWeaponId = state.turn.currentWeaponId;
  }
  memory.previousHp = mercenary.hp;
  memory.previousGrounded = mercenary.grounded;
  memory.previousHasFired = state.turn.hasFired;
}

function progressBetween(nowMs: number, startedAtMs: number, untilMs: number): number {
  return clamp((nowMs - startedAtMs) / Math.max(1, untilMs - startedAtMs), 0, 1);
}

function resolveRecoilDuration(weaponId: ChaosKommandoWeaponId): number {
  const handling = chaosKommandoWeaponVisuals[weaponId].handling;
  if (handling === "melee") return 500;
  if (handling === "launcher") return 360;
  if (handling === "two-handed") return 290;
  if (handling === "pistol") return 220;
  return 360;
}

function recoilStrength(weaponId: ChaosKommandoWeaponId): number {
  const handling = chaosKommandoWeaponVisuals[weaponId].handling;
  if (handling === "launcher") return 0.3;
  if (handling === "two-handed") return 0.2;
  if (handling === "pistol") return 0.13;
  if (handling === "melee") return 0.18;
  return 0.1;
}

function hashId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}
