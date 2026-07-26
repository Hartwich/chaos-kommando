import Phaser from "phaser";
import type { ChaosKommandoMercenaryState, ChaosKommandoState } from "../../protocol.js";
import { toColorNumber } from "../ChaosKommandoViewModel.js";
import {
  chaosKommandoCharacterTextureKeys,
  chaosKommandoHeadbandTextureKey,
  chaosKommandoTorsoTextureKey,
  chaosKommandoWeaponVisuals,
  type ChaosKommandoGripPoint
} from "./ChaosKommandoCharacterAssets.js";
import {
  createChaosKommandoCharacterMemory,
  resolveChaosKommandoCharacterPose,
  CHAOS_KOMMANDO_JOY_DURATION_MS,
  type ChaosKommandoCharacterMemory,
  type ChaosKommandoCharacterPose,
  type MarshmallowHandPose
} from "./ChaosKommandoCharacterAnimator.js";

/**
 * Ebenenreihenfolge aus `marshmallow-motion-handoff.json`:
 * Fuesse, beim Walk der hintere Arm, Torso, Gesicht und Augen,
 * Kopfbedeckung, vordere Haende, Waffen.
 */
const depths = {
  shadow: 18,
  activeMarker: 18.4,
  rearFoot: 18.9,
  frontFoot: 19.2,
  rearHand: 19.5,
  torso: 20,
  face: 21,
  headgear: 21.5,
  frontHand: 22,
  weapon: 23
} as const;

interface CharacterObjects {
  shadow: Phaser.GameObjects.Ellipse;
  activeMarker: Phaser.GameObjects.Graphics;
  leftFoot: Phaser.GameObjects.Image;
  rightFoot: Phaser.GameObjects.Image;
  torso: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Graphics;
  headgear: Phaser.GameObjects.Image;
  leftHand: Phaser.GameObjects.Image;
  rightHand: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Image;
  memory: ChaosKommandoCharacterMemory;
}

interface Point {
  x: number;
  y: number;
}

export interface ChaosKommandoCharacterRenderState {
  characters: Map<string, CharacterObjects>;
  /** Letzter bekannter Lebendstatus, um Todesfaelle als Ereignis zu erkennen. */
  aliveById: Map<string, boolean>;
}

export function createChaosKommandoCharacterRenderState(): ChaosKommandoCharacterRenderState {
  return { characters: new Map(), aliveById: new Map() };
}

export function destroyChaosKommandoCharacterRenderState(
  renderState: ChaosKommandoCharacterRenderState
): void {
  for (const objects of renderState.characters.values()) destroyCharacterObjects(objects);
  renderState.characters.clear();
  renderState.aliveById.clear();
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
  const mournedPlayerIds = collectFreshCasualties(renderState, state);

  for (const player of state.players) {
    const teamColor = toColorNumber(player.color, 0x38bdf8);
    for (const mercenary of player.mercenaries) {
      knownIds.add(mercenary.id);
      let objects = renderState.characters.get(mercenary.id);
      if (!objects) {
        objects = createCharacterObjects(scene, mercenary, state, nowMs, teamColor);
        renderState.characters.set(mercenary.id, objects);
      }
      // Faellt ein Gegner, jubeln alle lebenden Soeldner der anderen Teams.
      if (mercenary.alive && mournedPlayerIds.size > 0 && !mournedPlayerIds.has(mercenary.playerId)) {
        objects.memory.joyUntilMs = nowMs + CHAOS_KOMMANDO_JOY_DURATION_MS;
      }
      if (!mercenary.alive && gravestoneIds.has(mercenary.id)) {
        setCharacterVisibility(objects, false);
        continue;
      }
      const isActive = mercenary.id === state.turn.activeMercenaryId;
      const pose = resolveChaosKommandoCharacterPose({
        mercenary,
        state,
        isActive,
        nowMs,
        memory: objects.memory,
        teamColor: toColorNumber(mercenary.teamColor, teamColor)
      });
      syncCharacterObjects(objects, mercenary, pose, isActive, nowMs, teamColor);
    }
  }

  for (const [id, objects] of renderState.characters) {
    if (knownIds.has(id)) continue;
    destroyCharacterObjects(objects);
    renderState.characters.delete(id);
    renderState.aliveById.delete(id);
  }
}

/** Liefert die Spieler-IDs, die in diesem Frame einen Soeldner verloren haben. */
function collectFreshCasualties(
  renderState: ChaosKommandoCharacterRenderState,
  state: ChaosKommandoState
): Set<string> {
  const mourned = new Set<string>();
  for (const player of state.players) {
    for (const mercenary of player.mercenaries) {
      const wasAlive = renderState.aliveById.get(mercenary.id);
      if (wasAlive === true && !mercenary.alive) {
        mourned.add(mercenary.playerId);
      }
      renderState.aliveById.set(mercenary.id, mercenary.alive);
    }
  }
  return mourned;
}

function createCharacterObjects(
  scene: Phaser.Scene,
  mercenary: ChaosKommandoMercenaryState,
  state: ChaosKommandoState,
  nowMs: number,
  teamColor: number
): CharacterObjects {
  const memory = createChaosKommandoCharacterMemory(mercenary, state, nowMs, teamColor);
  const image = (texture: string, depth: number): Phaser.GameObjects.Image =>
    scene.add.image(mercenary.x, mercenary.y, texture).setDepth(depth);
  return {
    shadow: scene.add.ellipse(mercenary.x, mercenary.y, 48, 14, 0x020617, 0.22).setDepth(depths.shadow),
    activeMarker: scene.add.graphics().setDepth(depths.activeMarker),
    leftFoot: image(chaosKommandoCharacterTextureKeys.foot, depths.rearFoot),
    rightFoot: image(chaosKommandoCharacterTextureKeys.foot, depths.frontFoot),
    torso: image(chaosKommandoTorsoTextureKey(memory.torsoVariant), depths.torso),
    face: scene.add.graphics().setDepth(depths.face),
    headgear: image(chaosKommandoHeadbandTextureKey(memory.headbandVariant), depths.headgear),
    leftHand: image(chaosKommandoCharacterTextureKeys.hand, depths.frontHand),
    rightHand: image(chaosKommandoCharacterTextureKeys.hand, depths.frontHand),
    weapon: image(chaosKommandoWeaponVisuals[state.turn.currentWeaponId].textureKey, depths.weapon).setVisible(false),
    memory
  };
}

function syncCharacterObjects(
  objects: CharacterObjects,
  mercenary: ChaosKommandoMercenaryState,
  pose: ChaosKommandoCharacterPose,
  isActive: boolean,
  nowMs: number,
  teamColor: number
): void {
  const radius = Math.max(14, mercenary.radius);
  const groundY = mercenary.y + radius * 1.02;
  setCharacterVisibility(objects, true);

  objects.shadow
    .setPosition(mercenary.x, groundY)
    .setSize(radius * (mercenary.grounded ? 2.3 : 1.45), radius * 0.5)
    .setAlpha(mercenary.alive ? (mercenary.grounded ? 0.22 : 0.09) : 0.08);

  syncActiveMarker(objects.activeMarker, mercenary, isActive, groundY, radius, teamColor, nowMs);
  syncFeet(objects, pose);
  syncTorso(objects.torso, pose, mercenary);
  syncFace(objects.face, pose);
  syncHeadgear(objects.headgear, pose);

  const weaponPull = syncWeapon(objects.weapon, pose, mercenary);
  syncHands(objects, pose, weaponPull);
}

function syncFeet(objects: CharacterObjects, pose: ChaosKommandoCharacterPose): void {
  objects.leftFoot.setDepth(pose.leftFootInFront ? depths.frontFoot : depths.rearFoot);
  objects.rightFoot.setDepth(pose.leftFootInFront ? depths.rearFoot : depths.frontFoot);
  syncFoot(objects.leftFoot, pose, pose.leftFoot);
  syncFoot(objects.rightFoot, pose, pose.rightFoot);
}

function syncFoot(
  foot: Phaser.GameObjects.Image,
  pose: ChaosKommandoCharacterPose,
  placement: { x: number; y: number; rotation: number }
): void {
  foot
    .setPosition(placement.x, placement.y)
    .setOrigin(0.5, 0.5)
    .setDisplaySize(pose.footWidth, pose.footHeight)
    .setRotation(placement.rotation)
    .setAlpha(pose.alpha);
}

/**
 * Der Warp besteht aus gegenphasiger X/Y-Skalierung plus leichter X-Scherung.
 * Phaser kennt keine Scherung; bei Betraegen unter 0.007 rad ist die Rotation
 * um `-shearX` visuell deckungsgleich.
 */
function warpRotation(pose: ChaosKommandoCharacterPose): number {
  return -pose.shearX;
}

/** Bildet einen lokalen Rig-Punkt ueber die Warp-Matrix in den Weltraum ab. */
function warpToWorld(pose: ChaosKommandoCharacterPose, localX: number, localY: number): Point {
  return {
    x: pose.bodyX + pose.scaleX * localX + pose.shearX * localY,
    y: pose.bodyBottom + pose.scaleY * localY
  };
}

function syncTorso(
  torso: Phaser.GameObjects.Image,
  pose: ChaosKommandoCharacterPose,
  mercenary: ChaosKommandoMercenaryState
): void {
  const lowHealth = mercenary.hp / Math.max(1, mercenary.maxHp) < 0.25 && mercenary.alive;
  torso
    .setTexture(chaosKommandoTorsoTextureKey(pose.torsoVariant))
    .setPosition(pose.bodyX, pose.bodyBottom)
    .setOrigin(0.5, 1)
    .setDisplaySize(pose.torsoWidth * pose.scaleX, pose.torsoHeight * pose.scaleY)
    .setRotation(warpRotation(pose))
    .setAlpha(pose.alpha)
    .clearTint();
  if (lowHealth) torso.setTint(0xffe4d6);
}

function syncHeadgear(headgear: Phaser.GameObjects.Image, pose: ChaosKommandoCharacterPose): void {
  const placement = pose.headgear;
  if (!placement) {
    headgear.setVisible(false);
    return;
  }
  const textureKey =
    placement.kind === "helmet"
      ? chaosKommandoCharacterTextureKeys.helmet
      : chaosKommandoHeadbandTextureKey(placement.headbandVariant);
  const anchor = warpToWorld(pose, placement.localX, placement.localY);
  headgear
    .setVisible(true)
    .setTexture(textureKey)
    .setPosition(anchor.x, anchor.y)
    .setOrigin(0, 0)
    .setDisplaySize(placement.width * pose.scaleX, placement.height * pose.scaleY)
    .setRotation(warpRotation(pose))
    .setAlpha(pose.alpha);
}

function syncHands(
  objects: CharacterObjects,
  pose: ChaosKommandoCharacterPose,
  weaponPull: Point | null
): void {
  const left = pose.leftHand;
  const right = pose.rightHand;
  // Beim Walk liegt genau eine Hand hinter dem Torso, sonst beide davor.
  objects.leftHand.setDepth(pose.handBehindSide === -1 ? depths.rearHand : depths.frontHand);
  objects.rightHand.setDepth(pose.handBehindSide === 1 ? depths.rearHand : depths.frontHand);

  const facesLeft = pose.aim.ux < 0;
  const pulledHand = facesLeft ? "left" : "right";
  syncHand(objects.leftHand, left, pose.alpha, weaponPull && pulledHand === "left" ? weaponPull : null);
  syncHand(objects.rightHand, right, pose.alpha, weaponPull && pulledHand === "right" ? weaponPull : null);
}

function syncHand(
  image: Phaser.GameObjects.Image,
  placement: MarshmallowHandPose,
  alpha: number,
  override: Point | null
): void {
  image
    .setPosition(override?.x ?? placement.x, override?.y ?? placement.y)
    .setOrigin(0.5, 0.5)
    .setDisplaySize(placement.width, placement.height)
    .setRotation(placement.rotation)
    .setAlpha(alpha * placement.alpha);
}

/**
 * Zeichnet die Waffe und liefert bei Zweihandwaffen den Weltpunkt des
 * Sekundaergriffs, damit die vordere Hand exakt daran haengt.
 */
function syncWeapon(
  weapon: Phaser.GameObjects.Image,
  pose: ChaosKommandoCharacterPose,
  mercenary: ChaosKommandoMercenaryState
): Point | null {
  const placement = pose.weapon;
  if (!placement || !mercenary.alive) {
    weapon.setVisible(false);
    return null;
  }
  const visual = chaosKommandoWeaponVisuals[placement.weaponId];
  // Die Arsenal-Grafiken sind nicht quadratisch; die Hoehe folgt dem Seitenverhaeltnis.
  const displayWidth = placement.displaySize;
  const displayHeight = displayWidth / visual.aspect;
  weapon
    .setVisible(true)
    .setTexture(visual.textureKey)
    .setPosition(placement.gripX, placement.gripY)
    .setDisplaySize(displayWidth, displayHeight)
    .setOrigin(
      placement.facesLeft ? 1 - visual.primaryGrip.x : visual.primaryGrip.x,
      visual.primaryGrip.y
    )
    .setRotation(placement.angle)
    .setFlipX(placement.facesLeft)
    .setFlipY(false)
    .setAlpha(pose.alpha);

  if (placement.posture !== "two-hand" || !visual.secondaryGrip) return null;
  return transformGripPoint(
    visual.primaryGrip,
    visual.secondaryGrip,
    { x: placement.gripX, y: placement.gripY },
    displayWidth,
    displayHeight,
    placement.angle,
    placement.facesLeft
  );
}

function transformGripPoint(
  primary: ChaosKommandoGripPoint,
  target: ChaosKommandoGripPoint,
  worldPrimary: Point,
  displayWidth: number,
  displayHeight: number,
  rotation: number,
  facesLeft: boolean
): Point {
  const localX = (target.x - primary.x) * displayWidth * (facesLeft ? -1 : 1);
  const localY = (target.y - primary.y) * displayHeight;
  return {
    x: worldPrimary.x + localX * Math.cos(rotation) - localY * Math.sin(rotation),
    y: worldPrimary.y + localX * Math.sin(rotation) + localY * Math.cos(rotation)
  };
}

/* ------------------------------------------------------------------ */
/* Gesicht                                                             */
/* ------------------------------------------------------------------ */

function syncFace(face: Phaser.GameObjects.Graphics, pose: ChaosKommandoCharacterPose): void {
  const { faceScale, eyeCenterY, eyeGap, targetLocalX, targetLocalY, blink } = pose.face;
  face
    .clear()
    .setPosition(pose.bodyX, pose.bodyBottom)
    .setScale(pose.scaleX, pose.scaleY)
    .setRotation(warpRotation(pose))
    .setAlpha(pose.alpha);

  if (pose.expression === "defeated") {
    face.lineStyle(Math.max(1.2, 3.4 * faceScale), 0x532d1f, 0.92);
    for (const direction of [-1, 1]) {
      const eyeX = direction * eyeGap;
      const arm = 15 * faceScale;
      face.lineBetween(eyeX - arm, eyeCenterY - arm, eyeX + arm, eyeCenterY + arm);
      face.lineBetween(eyeX + arm, eyeCenterY - arm, eyeX - arm, eyeCenterY + arm);
    }
    drawMouth(face, pose, faceScale, eyeCenterY);
    return;
  }

  for (const direction of [-1, 1]) {
    const eyeX = direction * eyeGap;
    const dx = targetLocalX - eyeX;
    const dy = targetLocalY - eyeCenterY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const gazeX = (dx / length) * 11 * faceScale;
    const gazeY = (dy / length) * 8 * faceScale;

    face.fillStyle(0xfffae1, 0.94);
    face.lineStyle(Math.max(1, 3 * faceScale), 0x532d1f, 0.9);
    const eyeHeight = Math.max(2, 54 * faceScale * blink);
    face.fillEllipse(eyeX, eyeCenterY, 44 * faceScale, eyeHeight);
    face.strokeEllipse(eyeX, eyeCenterY, 44 * faceScale, eyeHeight);

    if (blink > 0.26) {
      face.fillStyle(0x382119, 1);
      face.fillEllipse(eyeX + gazeX, eyeCenterY + gazeY, 20 * faceScale, 30 * faceScale);
      face.fillStyle(0xffffff, 0.96);
      face.fillCircle(
        eyeX + gazeX - 3 * faceScale,
        eyeCenterY + gazeY - 5 * faceScale,
        3.2 * faceScale
      );
    }
  }

  drawMouth(face, pose, faceScale, eyeCenterY);
}

function drawMouth(
  face: Phaser.GameObjects.Graphics,
  pose: ChaosKommandoCharacterPose,
  faceScale: number,
  eyeCenterY: number
): void {
  const mouthY = eyeCenterY + 30 * faceScale;
  if (pose.expression === "hurt") {
    face.fillStyle(0x5b2f25, 0.94);
    face.fillEllipse(0, mouthY + 4 * faceScale, 26 * faceScale, 32 * faceScale);
    return;
  }

  face.lineStyle(Math.max(1, 3.2 * faceScale), 0x633528, 0.95);
  face.beginPath();
  if (pose.expression === "happy") {
    face.arc(0, mouthY - 4 * faceScale, 32 * faceScale, 0.12, Math.PI - 0.12, false);
  } else if (pose.expression === "defeated") {
    face.arc(0, mouthY + 22 * faceScale, 26 * faceScale, Math.PI + 0.2, Math.PI * 2 - 0.2, false);
  } else if (pose.expression === "focus") {
    face.moveTo(-16 * faceScale, mouthY);
    face.lineTo(16 * faceScale, mouthY);
  } else {
    face.arc(0, mouthY, 24 * faceScale, 0.2, Math.PI - 0.2, false);
  }
  face.strokePath();
}

/* ------------------------------------------------------------------ */
/* Aktiv-Markierung                                                    */
/* ------------------------------------------------------------------ */

function syncActiveMarker(
  marker: Phaser.GameObjects.Graphics,
  mercenary: ChaosKommandoMercenaryState,
  isActive: boolean,
  groundY: number,
  radius: number,
  teamColor: number,
  nowMs: number
): void {
  marker.clear();
  if (!isActive || !mercenary.alive) return;
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.005);
  marker.lineStyle(Math.max(1.5, radius * 0.11), teamColor, 0.35 + pulse * 0.4);
  marker.strokeEllipse(mercenary.x, groundY + radius * 0.06, radius * (2.5 + pulse * 0.22), radius * 0.72);
}

/* ------------------------------------------------------------------ */
/* Lebenszyklus                                                        */
/* ------------------------------------------------------------------ */

function setCharacterVisibility(objects: CharacterObjects, visible: boolean): void {
  objects.shadow.setVisible(visible);
  objects.activeMarker.setVisible(visible);
  objects.leftFoot.setVisible(visible);
  objects.rightFoot.setVisible(visible);
  objects.torso.setVisible(visible);
  objects.face.setVisible(visible);
  objects.headgear.setVisible(visible);
  objects.leftHand.setVisible(visible);
  objects.rightHand.setVisible(visible);
  if (!visible) {
    objects.weapon.setVisible(false);
    objects.activeMarker.clear();
  }
}

function destroyCharacterObjects(objects: CharacterObjects): void {
  objects.shadow.destroy();
  objects.activeMarker.destroy();
  objects.leftFoot.destroy();
  objects.rightFoot.destroy();
  objects.torso.destroy();
  objects.face.destroy();
  objects.headgear.destroy();
  objects.leftHand.destroy();
  objects.rightHand.destroy();
  objects.weapon.destroy();
}
