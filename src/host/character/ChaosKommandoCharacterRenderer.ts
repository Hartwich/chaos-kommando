import Phaser from "phaser";
import type {
  ChaosKommandoMercenaryState,
  ChaosKommandoState,
  ChaosKommandoWeaponId
} from "../../protocol.js";
import { toColorNumber } from "../ChaosKommandoViewModel.js";
import {
  chaosKommandoCharacterTextureKeys,
  chaosKommandoWeaponVisuals,
  type ChaosKommandoGripPoint,
  type ChaosKommandoWeaponVisual
} from "./ChaosKommandoCharacterAssets.js";
import {
  createChaosKommandoCharacterMemory,
  resolveChaosKommandoCharacterPose,
  type ChaosKommandoCharacterMemory,
  type ChaosKommandoCharacterPose
} from "./ChaosKommandoCharacterAnimator.js";

interface CharacterObjects {
  shadow: Phaser.GameObjects.Ellipse;
  backpack: Phaser.GameObjects.Image;
  rearFoot: Phaser.GameObjects.Image;
  rearArm: Phaser.GameObjects.Image;
  torso: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Graphics;
  teamMarker: Phaser.GameObjects.Graphics;
  weapon: Phaser.GameObjects.Image;
  frontArm: Phaser.GameObjects.Image;
  frontFoot: Phaser.GameObjects.Image;
  helmet: Phaser.GameObjects.Image;
  memory: ChaosKommandoCharacterMemory;
}

interface Point {
  x: number;
  y: number;
}

interface WeaponRig {
  primaryGrip: Point;
  secondaryGrip: Point | null;
}

export interface ChaosKommandoCharacterRenderState {
  characters: Map<string, CharacterObjects>;
}

export function createChaosKommandoCharacterRenderState(): ChaosKommandoCharacterRenderState {
  return { characters: new Map() };
}

export function destroyChaosKommandoCharacterRenderState(
  renderState: ChaosKommandoCharacterRenderState
): void {
  for (const objects of renderState.characters.values()) destroyCharacterObjects(objects);
  renderState.characters.clear();
}

export function hideChaosKommandoCharacters(renderState: ChaosKommandoCharacterRenderState): void {
  for (const objects of renderState.characters.values()) setCharacterVisibility(objects, false);
}

export function syncChaosKommandoCharacters(
  scene: Phaser.Scene,
  renderState: ChaosKommandoCharacterRenderState,
  state: ChaosKommandoState,
  nowMs: number
): void {
  const knownIds = new Set<string>();
  const gravestoneIds = new Set(state.gravestones.map((entry) => entry.mercenaryId));
  for (const player of state.players) {
    for (const mercenary of player.mercenaries) {
      knownIds.add(mercenary.id);
      let objects = renderState.characters.get(mercenary.id);
      if (!objects) {
        objects = createCharacterObjects(scene, mercenary, state, nowMs);
        renderState.characters.set(mercenary.id, objects);
      }
      if (!mercenary.alive && gravestoneIds.has(mercenary.id)) {
        setCharacterVisibility(objects, false);
        continue;
      }
      const isActive = mercenary.id === state.turn.activeMercenaryId;
      const pose = resolveChaosKommandoCharacterPose({ mercenary, state, isActive, nowMs, memory: objects.memory });
      syncCharacterObjects(objects, mercenary, state, pose, isActive, nowMs);
    }
  }
  for (const [id, objects] of renderState.characters) {
    if (knownIds.has(id)) continue;
    destroyCharacterObjects(objects);
    renderState.characters.delete(id);
  }
}

function createCharacterObjects(
  scene: Phaser.Scene,
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  nowMs: number
): CharacterObjects {
  const image = (texture: string, depth: number): Phaser.GameObjects.Image =>
    scene.add.image(mercenary.x, mercenary.y, texture).setDepth(depth);
  return {
    shadow: scene.add.ellipse(mercenary.x, mercenary.y, 48, 14, 0x020617, 0.22).setDepth(18),
    backpack: image(chaosKommandoCharacterTextureKeys.backpack, 19),
    rearFoot: image(chaosKommandoCharacterTextureKeys.foot, 19.1),
    rearArm: image(chaosKommandoCharacterTextureKeys.arm, 19.5),
    torso: image(chaosKommandoCharacterTextureKeys.torso, 20),
    face: scene.add.graphics().setDepth(21),
    teamMarker: scene.add.graphics().setDepth(21.2),
    weapon: image(chaosKommandoWeaponVisuals[state.turn.currentWeaponId].textureKey, 22).setVisible(false),
    frontArm: image(chaosKommandoCharacterTextureKeys.arm, 23),
    frontFoot: image(chaosKommandoCharacterTextureKeys.foot, 20.5),
    helmet: image(chaosKommandoCharacterTextureKeys.helmet, 24),
    memory: createChaosKommandoCharacterMemory(mercenary, state, nowMs)
  };
}

function syncCharacterObjects(
  objects: CharacterObjects,
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  pose: ChaosKommandoCharacterPose,
  isActive: boolean,
  nowMs: number
): void {
  const radius = Math.max(14, mercenary.radius);
  const direction = mercenary.facing === "right" ? 1 : -1;
  const groundY = mercenary.y + radius * 1.02;
  const bodyX = mercenary.x;
  const bodyY = groundY - radius * 1.62 + pose.bodyOffsetYInRadii * radius;
  const alpha = mercenary.alive ? 1 : 0.72;
  setCharacterVisibility(objects, true);

  objects.shadow
    .setPosition(mercenary.x, groundY)
    .setSize(radius * (mercenary.grounded ? 2.3 : 1.45), radius * 0.5)
    .setAlpha(mercenary.alive ? (mercenary.grounded ? 0.22 : 0.09) : 0.08);

  syncFeet(objects, bodyX, groundY, radius, direction, pose, alpha);
  objects.backpack
    .setPosition(bodyX - direction * radius * 0.72, bodyY - radius * 0.02)
    .setDisplaySize(radius * 2.05, radius * 2.05)
    .setFlipX(direction < 0)
    .setRotation(pose.bodyRotationRad - direction * 0.04)
    .setAlpha(alpha * 0.98)
    .setVisible(mercenary.alive);

  objects.torso
    .setPosition(bodyX, bodyY)
    .setDisplaySize(radius * 3.2 * pose.bodyScaleX, radius * 3.2 * pose.bodyScaleY)
    .setRotation(pose.bodyRotationRad)
    .setAlpha(alpha)
    .clearTint();

  const lowHealth = mercenary.hp / Math.max(1, mercenary.maxHp) < 0.25 && mercenary.alive;
  if (lowHealth) objects.torso.setTint(0xffe4d6);

  const weaponRig = syncWeapon(objects.weapon, mercenary, state, pose, bodyX, bodyY, radius, alpha);
  syncArms(objects, mercenary, pose, weaponRig, bodyX, bodyY, radius, direction, alpha, lowHealth);
  syncFace(objects.face, mercenary, pose, bodyX, bodyY, radius, direction, alpha, isActive);
  syncTeamMarker(objects.teamMarker, mercenary, bodyX, bodyY, radius, direction, alpha, isActive, nowMs);
  syncHelmet(objects.helmet, mercenary, pose, bodyX, bodyY, radius, direction, alpha);
}

function syncFeet(
  objects: CharacterObjects,
  bodyX: number,
  groundY: number,
  radius: number,
  direction: number,
  pose: ChaosKommandoCharacterPose,
  alpha: number
): void {
  const rearX = bodyX - direction * radius * 0.36 + direction * pose.stride * radius * 0.34;
  const frontX = bodyX + direction * radius * 0.36 - direction * pose.stride * radius * 0.34;
  const baseY = groundY - radius * 0.58;
  syncFoot(objects.rearFoot, rearX, baseY - pose.rearStepLift * radius * 0.22, radius, direction, pose.stride * 0.13, alpha * 0.94);
  syncFoot(objects.frontFoot, frontX, baseY - pose.frontStepLift * radius * 0.22, radius, direction, -pose.stride * 0.13, alpha);
}

function syncFoot(
  foot: Phaser.GameObjects.Image,
  x: number,
  y: number,
  radius: number,
  direction: number,
  rotation: number,
  alpha: number
): void {
  foot
    .setPosition(x, y)
    .setOrigin(0.36, 0.15)
    .setDisplaySize(radius * 1.25, radius * 1.25)
    .setFlipX(direction < 0)
    .setRotation(direction * rotation)
    .setAlpha(alpha);
}

function syncArms(
  objects: CharacterObjects,
  mercenary: ChaosKommandoMercenaryState,
  pose: ChaosKommandoCharacterPose,
  weaponRig: WeaponRig | null,
  bodyX: number,
  bodyY: number,
  radius: number,
  direction: number,
  alpha: number,
  lowHealth: boolean
): void {
  const rearShoulder = rotateAround(
    { x: bodyX - direction * radius * 0.66, y: bodyY - radius * 0.32 },
    { x: bodyX, y: bodyY },
    pose.bodyRotationRad
  );
  const frontShoulder = rotateAround(
    { x: bodyX + direction * radius * 0.65, y: bodyY - radius * 0.25 },
    { x: bodyX, y: bodyY },
    pose.bodyRotationRad
  );
  const relaxedAngle = direction > 0 ? 1.18 : Math.PI - 1.18;
  const rearTarget = pointAt(rearShoulder, relaxedAngle - direction * pose.armSwingRad, radius * 0.9);
  const frontTarget = pointAt(frontShoulder, relaxedAngle + direction * pose.armSwingRad, radius * 0.88);

  if (weaponRig) {
    if (weaponRig.secondaryGrip) {
      syncArm(objects.rearArm, rearShoulder, weaponRig.primaryGrip, radius, alpha * 0.96, lowHealth);
      syncArm(objects.frontArm, frontShoulder, weaponRig.secondaryGrip, radius, alpha, lowHealth);
    } else {
      syncArm(objects.rearArm, rearShoulder, rearTarget, radius, alpha * 0.96, lowHealth);
      syncArm(objects.frontArm, frontShoulder, weaponRig.primaryGrip, radius, alpha, lowHealth);
    }
  } else {
    syncArm(objects.rearArm, rearShoulder, rearTarget, radius, alpha * 0.96, lowHealth);
    syncArm(objects.frontArm, frontShoulder, frontTarget, radius, alpha, lowHealth);
  }
}

function syncArm(
  arm: Phaser.GameObjects.Image,
  shoulder: Point,
  hand: Point,
  radius: number,
  alpha: number,
  lowHealth: boolean
): void {
  const distance = Math.hypot(hand.x - shoulder.x, hand.y - shoulder.y);
  const displayWidth = Phaser.Math.Clamp(distance / 0.92, radius * 0.72, radius * 1.72);
  arm
    .setPosition(shoulder.x, shoulder.y)
    .setOrigin(0.035, 0.5)
    .setDisplaySize(displayWidth, displayWidth * 0.5)
    .setRotation(Math.atan2(hand.y - shoulder.y, hand.x - shoulder.x))
    .setFlipX(false)
    .setFlipY(false)
    .setAlpha(alpha)
    .clearTint();
  if (lowHealth) arm.setTint(0xffe4d6);
}

function syncWeapon(
  weapon: Phaser.GameObjects.Image,
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  pose: ChaosKommandoCharacterPose,
  bodyX: number,
  bodyY: number,
  radius: number,
  alpha: number
): WeaponRig | null {
  const weaponId = resolveDisplayedWeaponId(state, pose);
  if (!weaponId || !mercenary.alive) {
    weapon.setVisible(false);
    return null;
  }
  const visual = chaosKommandoWeaponVisuals[weaponId];
  const transform = resolveWeaponAnchor(mercenary, pose, visual, bodyX, bodyY, radius);
  const displaySize = radius * visual.sizeInRadii;
  const rotation = transform.angle + visual.rotationOffsetRad;
  weapon
    .setVisible(true)
    .setTexture(visual.textureKey)
    .setPosition(transform.grip.x, transform.grip.y)
    .setDisplaySize(displaySize, displaySize)
    .setOrigin(visual.primaryGrip.x, visual.primaryGrip.y)
    .setRotation(rotation)
    .setFlipX(false)
    .setFlipY(transform.flipY)
    .setAlpha(alpha);

  return {
    primaryGrip: transform.grip,
    secondaryGrip: visual.secondaryGrip
      ? transformGripPoint(visual.primaryGrip, visual.secondaryGrip, transform.grip, displaySize, rotation, transform.flipY)
      : null
  };
}

function resolveDisplayedWeaponId(
  state: ChaosKommandoState,
  pose: ChaosKommandoCharacterPose
): ChaosKommandoWeaponId | null {
  return pose.showWeapon ? state.turn.currentWeaponId : null;
}

function resolveWeaponAnchor(
  mercenary: ChaosKommandoMercenaryState,
  pose: ChaosKommandoCharacterPose,
  visual: ChaosKommandoWeaponVisual,
  bodyX: number,
  bodyY: number,
  radius: number
): { grip: Point; angle: number; flipY: boolean } {
  const direction = mercenary.facing === "right" ? 1 : -1;
  let angle = mercenary.aimAngleRad + pose.weaponAngleOffsetRad;
  let grip = { x: bodyX + direction * radius * 0.23, y: bodyY + radius * 0.22 };

  if (visual.handling === "pistol") {
    grip = { x: bodyX + direction * radius * 0.48, y: bodyY + radius * 0.2 };
  } else if (visual.handling === "melee") {
    const striking = pose.weaponKickInRadii > 0.02;
    angle = direction > 0 ? (striking ? 0.45 : -0.92) : Math.PI - (striking ? 0.45 : -0.92);
    grip = { x: bodyX + direction * radius * 0.42, y: bodyY + radius * 0.12 };
  } else if (visual.handling === "throwable") {
    angle = direction > 0 ? -0.92 : Math.PI + 0.92;
    grip = { x: bodyX + direction * radius * 0.72, y: bodyY - radius * 0.72 };
  } else if (visual.handling === "placeable") {
    angle = 0;
    grip = { x: bodyX + direction * radius * 0.62, y: bodyY + radius * 0.75 };
  } else if (visual.handling === "remote") {
    angle = 0;
    grip = { x: bodyX + direction * radius * 0.72, y: bodyY + radius * 0.24 };
  }

  grip.x -= Math.cos(angle) * pose.weaponKickInRadii * radius;
  grip.y -= Math.sin(angle) * pose.weaponKickInRadii * radius;
  return { grip, angle, flipY: Math.cos(angle) < 0 };
}

function transformGripPoint(
  primary: ChaosKommandoGripPoint,
  target: ChaosKommandoGripPoint,
  worldPrimary: Point,
  displaySize: number,
  rotation: number,
  flipY: boolean
): Point {
  const localX = (target.x - primary.x) * displaySize;
  const localY = (target.y - primary.y) * displaySize * (flipY ? -1 : 1);
  return {
    x: worldPrimary.x + localX * Math.cos(rotation) - localY * Math.sin(rotation),
    y: worldPrimary.y + localX * Math.sin(rotation) + localY * Math.cos(rotation)
  };
}

function syncFace(
  face: Phaser.GameObjects.Graphics,
  mercenary: ChaosKommandoMercenaryState,
  pose: ChaosKommandoCharacterPose,
  bodyX: number,
  bodyY: number,
  radius: number,
  direction: number,
  alpha: number,
  isActive: boolean
): void {
  face.clear().setPosition(bodyX, bodyY).setRotation(pose.bodyRotationRad).setAlpha(alpha);
  const eyeY = -radius * 0.28;
  const eyeX = radius * 0.37;
  const eyeWidth = radius * 0.25;
  const eyeHeight = radius * 0.46 * pose.eyeOpenRatio;
  const gazeX = (isActive ? Math.cos(mercenary.aimAngleRad) : direction * 0.35) * radius * 0.075;
  const gazeY = (isActive ? Math.sin(mercenary.aimAngleRad) : 0) * radius * 0.06;

  face.fillStyle(0x3b241b, 0.98);
  if (pose.expression === "defeated") {
    face.lineStyle(Math.max(2, radius * 0.1), 0x3b241b, 0.98);
    for (const x of [-eyeX, eyeX]) {
      face.lineBetween(x - eyeWidth * 0.45, eyeY - eyeWidth * 0.45, x + eyeWidth * 0.45, eyeY + eyeWidth * 0.45);
      face.lineBetween(x + eyeWidth * 0.45, eyeY - eyeWidth * 0.45, x - eyeWidth * 0.45, eyeY + eyeWidth * 0.45);
    }
  } else {
    face.fillEllipse(-eyeX + gazeX, eyeY + gazeY, eyeWidth, Math.max(radius * 0.045, eyeHeight));
    face.fillEllipse(eyeX + gazeX, eyeY + gazeY, eyeWidth, Math.max(radius * 0.045, eyeHeight));
    if (pose.eyeOpenRatio > 0.35) {
      face.fillStyle(0xffffff, 0.94);
      const glintRadius = radius * 0.055;
      face.fillCircle(-eyeX + gazeX - radius * 0.04, eyeY + gazeY - radius * 0.07, glintRadius);
      face.fillCircle(eyeX + gazeX - radius * 0.04, eyeY + gazeY - radius * 0.07, glintRadius);
    }
  }

  face.fillStyle(0xfb7185, pose.expression === "hurt" ? 0.58 : 0.38);
  face.fillCircle(-radius * 0.65, radius * 0.13, radius * 0.17);
  face.fillCircle(radius * 0.65, radius * 0.13, radius * 0.17);
  drawMouth(face, pose, radius);
}

function drawMouth(
  face: Phaser.GameObjects.Graphics,
  pose: ChaosKommandoCharacterPose,
  radius: number
): void {
  face.lineStyle(Math.max(2, radius * 0.085), 0x5b2f25, 0.95);
  if (pose.expression === "hurt") {
    face.fillStyle(0x5b2f25, 0.94);
    face.fillEllipse(0, radius * 0.3, radius * 0.3, radius * 0.38);
    return;
  }
  face.beginPath();
  if (pose.expression === "happy") {
    face.arc(0, radius * 0.13, radius * 0.34, 0.12, Math.PI - 0.12, false);
  } else if (pose.expression === "defeated") {
    face.arc(0, radius * 0.47, radius * 0.3, Math.PI + 0.18, Math.PI * 2 - 0.18, false);
  } else if (pose.expression === "focus") {
    face.moveTo(-radius * 0.18, radius * 0.27);
    face.lineTo(radius * 0.18, radius * 0.27);
  } else {
    face.arc(0, radius * 0.12, radius * 0.25, 0.18, Math.PI - 0.18, false);
  }
  face.strokePath();
}

function syncHelmet(
  helmet: Phaser.GameObjects.Image,
  mercenary: ChaosKommandoMercenaryState,
  pose: ChaosKommandoCharacterPose,
  bodyX: number,
  bodyY: number,
  radius: number,
  direction: number,
  alpha: number
): void {
  if (!mercenary.alive || pose.expression === "defeated") {
    helmet.setVisible(false);
    return;
  }
  const anchor = rotateAround(
    { x: bodyX, y: bodyY - radius * 1.25 },
    { x: bodyX, y: bodyY },
    pose.bodyRotationRad
  );
  helmet
    .setVisible(true)
    .setPosition(anchor.x, anchor.y)
    .setDisplaySize(radius * 3.05, radius * 2.02)
    .setFlipX(direction < 0)
    .setRotation(pose.bodyRotationRad - direction * 0.025)
    .setAlpha(alpha);
}

function syncTeamMarker(
  marker: Phaser.GameObjects.Graphics,
  mercenary: ChaosKommandoMercenaryState,
  bodyX: number,
  bodyY: number,
  radius: number,
  direction: number,
  alpha: number,
  isActive: boolean,
  nowMs: number
): void {
  marker.clear();
  if (!mercenary.alive) return;
  const color = toColorNumber(mercenary.teamColor, 0x38bdf8);
  const flutter = Math.sin(nowMs / 180 + mercenary.x * 0.02) * radius * 0.055;
  const knotX = bodyX - direction * radius * 0.77;
  const knotY = bodyY + radius * 0.08;
  marker.fillStyle(color, alpha);
  marker.fillCircle(knotX, knotY, radius * (isActive ? 0.24 : 0.2));
  marker.fillTriangle(
    knotX,
    knotY,
    knotX - direction * radius * 0.62,
    knotY - radius * 0.17 + flutter,
    knotX - direction * radius * 0.5,
    knotY + radius * 0.27 + flutter
  );
}

function pointAt(origin: Point, angle: number, distance: number): Point {
  return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
}

function rotateAround(point: Point, origin: Point, rotation: number): Point {
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  return {
    x: origin.x + x * Math.cos(rotation) - y * Math.sin(rotation),
    y: origin.y + x * Math.sin(rotation) + y * Math.cos(rotation)
  };
}

function setCharacterVisibility(objects: CharacterObjects, visible: boolean): void {
  objects.shadow.setVisible(visible);
  objects.backpack.setVisible(visible);
  objects.rearFoot.setVisible(visible);
  objects.rearArm.setVisible(visible);
  objects.torso.setVisible(visible);
  objects.face.setVisible(visible);
  objects.teamMarker.setVisible(visible);
  objects.frontArm.setVisible(visible);
  objects.frontFoot.setVisible(visible);
  objects.helmet.setVisible(visible);
  if (!visible) objects.weapon.setVisible(false);
}

function destroyCharacterObjects(objects: CharacterObjects): void {
  objects.shadow.destroy();
  objects.backpack.destroy();
  objects.rearFoot.destroy();
  objects.rearArm.destroy();
  objects.torso.destroy();
  objects.face.destroy();
  objects.teamMarker.destroy();
  objects.weapon.destroy();
  objects.frontArm.destroy();
  objects.frontFoot.destroy();
  objects.helmet.destroy();
}
