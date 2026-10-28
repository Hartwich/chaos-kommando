import assert from "node:assert/strict";
import test from "node:test";
import { chaosKommandoServerGame as game } from "../dist/server/index.js";
import { buildChaosKommandoControllerModel } from "../dist/controller/ChaosKommandoController.js";
import { CharacterPresentation, resolveFootSurface } from "../dist/host/CharacterPresentation.js";
import { createChaosKommandoCharacterMemory, resolveChaosKommandoCharacterPose } from "../dist/host/character/ChaosKommandoCharacterAnimator.js";
import { chaosKommandoWeaponVisuals } from "../dist/host/character/ChaosKommandoCharacterAssets.js";
import { heldGunWeapons, resolveWeaponMuzzle } from "../dist/combatGeometry.js";
import { manifest } from "../dist/manifest.js";

function fixture() {
  const context = { roomCode: "TEST", roundNumber: 1, now: 1000, deltaMs: 16,
    language: "de", theme: "paper", selectedGame: manifest, previousRound: null, roomSettings: {},
    players: ["a", "b"].map((id) => ({ id, name: id, color: "#ff8800", score: 0, isReady: true, connected: true })) };
  let state = game.startRound(game.createInitialState(context), context);
  state.terrain = { ...state.terrain, samples: state.terrain.samples.map(() => 600), craters: [], platforms: [] };
  state.mines = [];
  state.players.forEach((player, pi) => player.mercenaries.forEach((mercenary, mi) => {
    Object.assign(mercenary, { x: 300 + pi * 1000 + mi * 250, y: 580, vx: 0, vy: 0,
      grounded: true, airborneFromY: null, facing: "right", aimAngleRad: -Math.PI / 2 });
  }));
  context.now = state.turn.prepEndsAt + 16;
  const active = () => state.players.flatMap((p) => p.mercenaries).find((m) => m.id === state.turn.activeMercenaryId);
  const input = (type, extra = {}) => {
    state = game.handleInput(state, { type, playerId: state.turn.currentPlayerId, sentAt: -999999, ...extra }, context);
    return state;
  };
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) { context.now += 16; state = game.tick(state, 16, context); }
    return state;
  };
  return { context, active, input, tick, get state() { return state; } };
}

test("forward hop and backflip have fixed, distinct trajectories", () => {
  const f = fixture(); f.active().vx = 68; f.input("jump");
  assert.equal(f.active().vx, 195); assert.equal(f.active().vy, -390);
  const b = fixture(); b.input("jump", { kind: "backflip" });
  assert.equal(b.active().vx, -40); assert.equal(b.active().vy, -600);
  b.input("move", { moveX: 1, moveY: 0 }); b.tick();
  assert.ok(b.active().vx < 0, "airborne steering cannot reverse a backflip");
});

test("normal backflip lands without fall damage or ending the turn", () => {
  const f = fixture(); const hp = f.active().hp; f.input("jump", { kind: "backflip" }); f.tick(110);
  assert.equal(f.active().grounded, true); assert.equal(f.active().hp, hp); assert.equal(f.state.turn.hasFired, false);
});

test("fall injury ends the turn, cancels charge, and denies another attack", () => {
  const f = fixture(); Object.assign(f.active(), { y: 340, grounded: false, airborneFromY: 340 });
  f.tick(50); assert.ok(f.active().hp < f.active().maxHp); assert.equal(f.state.turn.resolvingShot, true);
  const before = f.state; f.input("fire:start"); assert.equal(f.state, before);
});

test("retreat starts on release and expires despite a five-second grenade fuse", () => {
  const f = fixture(); f.input("select-weapon", { weaponId: "enten-granate" }); f.input("set-fuse", { seconds: 5 });
  f.input("fire:start"); f.context.now += 900; f.input("fire:release");
  assert.equal(f.state.turn.retreatEndsAt, f.context.now + 3000); assert.equal(f.state.projectiles[0].fuseMs, 5000);
  f.input("move", { moveX: 1, moveY: 0 }); f.tick(189);
  const x = f.active().x; const turn = f.state.turn.turnNumber; f.tick(5);
  assert.equal(f.active().x, x); assert.equal(f.state.turn.turnNumber, turn); assert.ok(f.state.projectiles.length > 0);
  const before = f.state; f.input("move", { moveX: -1, moveY: 0 }); assert.equal(f.state, before);
});

test("a spent turn cannot cast rope, switch weapons, aim, or fire again", () => {
  const f = fixture(); f.input("end-turn");
  for (const [type, extra] of [["fire:start", {}], ["aim", { aimX: 1, aimY: 0 }], ["select-weapon", { weaponId: "seilzug" }]]) {
    const before = f.state; f.input(type, extra); assert.equal(f.state, before);
  }
});

test("release without a charge never fabricates a shot", () => {
  const f = fixture(); const before = f.state; f.input("fire:release"); assert.equal(f.state, before);
});

test("charging locks locomotion and jump", () => {
  const f = fixture(); const x = f.active().x; f.input("fire:start");
  f.input("move", { moveX: 1, moveY: 0 }); f.input("jump"); f.tick(10);
  assert.equal(f.active().x, x); assert.equal(f.active().grounded, true);
});

test("timeout waits for an airborne survivor before handing off", () => {
  const f = fixture(); f.input("jump", { kind: "backflip" }); f.context.now = f.state.turn.turnEndsAt;
  f.tick(); assert.equal(f.state.turn.turnNumber, 1); assert.equal(f.state.turn.resolvingShot, true);
  f.tick(100); assert.equal(f.state.turn.turnNumber, 2);
});

test("armed mines delay handoff even after the settling deadline", () => {
  const f = fixture(); f.input("end-turn");
  f.state.mines.push({ id: "pending", x: 2200, y: 589, vx: 0, vy: 0, radius: 11, grounded: true, explodesAt: f.context.now + 5000 });
  f.tick(100); assert.equal(f.state.turn.turnNumber, 1);
  f.tick(350); assert.equal(f.state.turn.turnNumber, 2);
});

test("invalid fuse values and nonfinite vectors do not corrupt state", () => {
  const f = fixture();
  for (const seconds of [0, 6, 2.5, NaN]) { const before = f.state; f.input("set-fuse", { seconds }); assert.equal(f.state, before); }
  const before = f.state; f.input("move", { moveX: NaN, moveY: 0 }); assert.equal(f.state, before);
});

test("preparation blocks locomotion and skipping; player rotation survives skipping", () => {
  const f = fixture(); f.context.now = f.state.turn.prepEndsAt - 1;
  const before = f.state; f.input("end-turn"); f.input("jump"); assert.equal(f.state, before);
  f.context.now += 2; const first = f.active().id; f.input("end-turn"); f.tick(100);
  assert.equal(f.state.turn.currentPlayerId, "b"); f.context.now = f.state.turn.prepEndsAt + 1;
  f.input("end-turn"); f.tick(100); assert.equal(f.state.turn.currentPlayerId, "a"); assert.notEqual(f.active().id, first);
});

test("six teams spawn as 18 distinct surviving units on every arena", () => {
  assert.equal(manifest.maxPlayers, 6);
  const maps = new Set();
  for (let seed = 0; seed < 30; seed++) {
    const context = { ...fixture().context, roomCode: `S${seed}`, roundNumber: seed + 1, now: 1000 + seed * 2341,
      players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Team ${i}`, color: "#ff8800", score: 0, isReady: true, connected: true })) };
    let state = game.startRound(game.createInitialState(context), context);
    maps.add(state.terrain.mapId);
    const units = state.players.flatMap((p) => p.mercenaries);
    assert.equal(units.length, 18);
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
      assert.ok(Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y) > 48, `overlapping spawn ${seed}`);
    }
    for (let i = 0; i < 200; i++) { context.now += 16; state = game.tick(state, 16, context); }
    assert.ok(state.players.every((p) => p.aliveMercenaryCount === 3), `unsafe spawn on ${state.terrain.mapId}, seed ${seed}`);
    assert.ok(state.players.flatMap((p) => p.mercenaries).every((u) => u.hp === 100), `spawn injury seed ${seed}`);
  }
  assert.equal(maps.size, 3);
});

test("basic and specialist weapons are available without waiting for a crate", () => {
  const f = fixture();
  for (const id of ["kicher-bazooka", "enten-granate", "bohrer-rakete", "konfetti-schrot", "dynamit", "seilzug"]) {
    assert.ok(f.active().ammo[id] > 0); assert.ok(Number.isFinite(f.active().ammo[id]));
  }
});

test("drill rockets cut a long tunnel instead of one circular impact", () => {
  const f = fixture(); f.input("select-weapon", { weaponId: "bohrer-rakete" });
  f.input("aim", { aimX: 1, aimY: 0.45 }); f.input("fire:start"); f.context.now += 1200; f.input("fire:release");
  f.tick(20);
  assert.ok(f.state.terrain.craters.length >= 60);
  const xs = f.state.terrain.craters.map((c) => c.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 140);
});

test("direct gun hits do not carve rocket-size craters", () => {
  const f = fixture(); f.input("select-weapon", { weaponId: "plunder-pistole" });
  f.input("aim", { aimX: 1, aimY: 0.5 }); f.input("fire:start"); f.tick(20);
  assert.equal(f.state.terrain.craters.length, 0);
});


test("weapon barrels and spawned projectiles agree for left, right and vertical aim", () => {
  for (const weaponId of heldGunWeapons.filter((id) => id !== "leucht-salve")) for (const angle of [0, -0.7, -Math.PI / 2, -2.4, Math.PI]) {
    const f = fixture(); f.input("select-weapon", { weaponId });
    f.input("aim", { aimX: Math.cos(angle), aimY: Math.sin(angle) });
    const unit = f.active(), state = game.toPublicState(f.state);
    const memory = createChaosKommandoCharacterMemory(unit, state, 1000, 0xff8800);
    const pose = resolveChaosKommandoCharacterPose({ mercenary: unit, state, isActive: true, nowMs: 1000, memory, teamColor: 0xff8800 });
    assert.ok(pose.weapon);
    const art = chaosKommandoWeaponVisuals[weaponId]; const sprite = pose.weapon;
    const dx = (art.muzzle.x - art.primaryGrip.x) * sprite.displaySize * (sprite.facesLeft ? -1 : 1);
    const dy = (art.muzzle.y - art.primaryGrip.y) * sprite.displaySize / art.aspect;
    const muzzle = { x: sprite.gripX + dx * Math.cos(sprite.angle) - dy * Math.sin(sprite.angle),
      y: sprite.gripY + dx * Math.sin(sprite.angle) + dy * Math.cos(sprite.angle) };
    const expected = resolveWeaponMuzzle(unit, weaponId);
    assert.ok(Math.hypot(muzzle.x - expected.x, muzzle.y - expected.y) < 0.001, `${weaponId} barrel angle ${angle}`);
    f.input("fire:start");
    if (!f.state.turn.hasFired) { f.context.now += 600; f.input("fire:release"); }
    assert.ok(Math.hypot(f.state.projectiles[0].x - muzzle.x, f.state.projectiles[0].y - muzzle.y) < 0.001, `${weaponId} launch angle ${angle}`);
  }
});

test("skipping never pretends to shoot; each minigun round has its own public animation event", () => {
  const skipped = fixture(); skipped.input("end-turn"); assert.deepEqual(skipped.state.weaponActions, []);
  const f = fixture(); f.input("select-weapon", { weaponId: "minigun" });
  const memory = createChaosKommandoCharacterMemory(f.active(), game.toPublicState(f.state), 1000, 0xff8800);
  f.input("fire:start");
  const pose = (at) => resolveChaosKommandoCharacterPose({ mercenary: f.active(), state: game.toPublicState(f.state), isActive: true, nowMs: at, memory, teamColor: 0xff8800 });
  pose(1016); const first = memory.previousShotId;
  f.tick(6); pose(1112); assert.notEqual(memory.previousShotId, first); assert.equal(memory.recoilStartedAtMs, 1112);
  f.tick(35); assert.equal(f.state.weaponActions.length, 6);
  assert.equal(new Set(f.state.weaponActions.map((event) => event.id)).size, 6);
  assert.equal(game.toPublicState(f.state).weaponActions.length, 6);
  assert.deepEqual(game.toControllerState(f.state).weaponActions, []);
});

test("a nearby wall cannot be bypassed by spawning a projectile beyond the barrel", () => {
  const f = fixture(); f.state.terrain.platforms = [{ x: 326, y: 565, rx: 4, ry: 55 }];
  f.input("select-weapon", { weaponId: "plunder-pistole" }); f.input("aim", { aimX: 1, aimY: 0 }); f.input("fire:start");
  assert.ok(f.state.projectiles[0].x < 322); f.tick(3);
  assert.equal(f.state.projectiles.length, 0); assert.ok(f.state.explosions.some((e) => e.x < 334));
});

test("presentation eases snapshots without changing physics and keeps feet on local slopes", () => {
  const f = fixture(); const presentation = new CharacterPresentation(); const publicState = game.toPublicState(f.state);
  const first = presentation.sample(publicState, 1000); const x = first.players[0].mercenaries[0].x;
  publicState.players[0].mercenaries[0].x += 20;
  const next = presentation.sample(publicState, 1016).players[0].mercenaries[0].x;
  assert.ok(next > x && next < x + 20); assert.equal(publicState.players[0].mercenaries[0].x, x + 20);
  for (let i = 2; i <= 15; i++) presentation.sample(publicState, 1000 + i * 16);
  assert.ok(Math.abs(presentation.sample(publicState, 1256).players[0].mercenaries[0].x - x - 20) < 0.1);
  assert.equal(resolveFootSurface(publicState.terrain, 200, 600), 600);
  publicState.terrain.craters = [{ x: 200, y: 610, r: 50 }];
  assert.equal(resolveFootSurface(publicState.terrain, 200, 600), null, "feet cannot snap down into a deep crater");
});

test("jump pose tucks limbs without adding a second jump above the physics body", () => {
  const f = fixture(); const state = game.toPublicState(f.state), unit = f.active();
  const memory = createChaosKommandoCharacterMemory(unit, state, 1000, 0xff8800);
  const standing = resolveChaosKommandoCharacterPose({ mercenary: unit, state, isActive: true, nowMs: 1000, memory, teamColor: 0xff8800 });
  const airborne = { ...unit, grounded: false, jumpKind: "forward", vy: 0, vx: 150 };
  const jumping = resolveChaosKommandoCharacterPose({ mercenary: airborne, state, isActive: true, nowMs: 1016, memory, teamColor: 0xff8800 });
  assert.equal(jumping.motionState, "longJump"); assert.ok(Math.abs(jumping.bodyBottom - standing.bodyBottom) < 0.01);
});


test("every starting terrace leaves a surviving backflip in both directions", () => {
  const seen = new Set();
  for (let seed = 0; seen.size < 3 && seed < 30; seed++) {
    const ctx = { ...fixture().context, now: 1000 + seed * 2341,
      players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Team ${i}`, color: "#ff8800", score: 0, isReady: true, connected: true })) };
    const original = game.startRound(game.createInitialState(ctx), ctx);
    if (seen.has(original.terrain.mapId)) continue;
    seen.add(original.terrain.mapId);
    for (const start of original.players.flatMap((p) => p.mercenaries)) for (const facing of ["left", "right"]) {
      let state = structuredClone(original); state.mines = [];
      const context = { ...ctx, now: original.turn.prepEndsAt + 16 };
      state.turn.activeMercenaryId = start.id; state.turn.currentPlayerId = start.playerId;
      state.players.flatMap((p) => p.mercenaries).find((u) => u.id === start.id).facing = facing;
      state = game.handleInput(state, { type: "jump", kind: "backflip", playerId: start.playerId, sentAt: context.now }, context);
      for (let i = 0; i < 100; i++) { context.now += 16; state = game.tick(state, 16, context); }
      const unit = state.players.flatMap((p) => p.mercenaries).find((u) => u.id === start.id);
      assert.equal(unit.alive, true, `${original.terrain.mapId} spawn ${start.x}, facing ${facing}`);
      assert.equal(unit.grounded, true, `${original.terrain.mapId} backflip must settle`);
    }
  }
  assert.equal(seen.size, 3);
});


test("controller deadlines follow the synchronized server clock and lock immediately at expiry", () => {
  const f = fixture();
  let serverTime = f.state.turn.turnEndsAt - 1000;
  const context = { state: { player: { id: f.state.turn.currentPlayerId }, room: { language: "en" },
    game: { phase: "playing", state: game.toControllerState(f.state) }, getServerTime: () => serverTime }, onInput() {} };
  const before = buildChaosKommandoControllerModel(context);
  assert.equal(before.disabled, false); assert.equal(before.stats[0].value, "1s");
  serverTime = f.state.turn.turnEndsAt + 1;
  const expired = buildChaosKommandoControllerModel(context);
  assert.equal(expired.disabled, true); assert.equal(expired.fireDisabled, true);
  assert.equal(expired.subtitle, "Resolving consequences");
  context.state.game.state.turn.resolvingShot = true;
  context.state.game.state.turn.hasFired = true;
  context.state.game.state.turn.retreatEndsAt = serverTime + 2000;
  const retreat = buildChaosKommandoControllerModel(context);
  assert.equal(retreat.disabled, false); assert.equal(retreat.fireDisabled, true); assert.equal(retreat.stats[0].value, "2s");
});


test("quick hook grips a ceiling without switching the selected weapon and reels upward", () => {
  const f = fixture(); f.state.terrain.platforms = [{ x: 300, y: 330, rx: 200, ry: 30 }];
  const weapon = f.state.turn.currentWeaponId, y = f.active().y;
  f.input("rope:toggle"); assert.ok(f.state.rope); assert.equal(f.state.turn.currentWeaponId, weapon);
  assert.equal(f.state.turn.hasFired, false); assert.equal(f.active().ammo.seilzug, 11);
  assert.ok(f.state.rope.anchorY < y - 100);
  assert.ok(game.toControllerState(f.state).rope, "phone must know that the rope is attached");
  f.input("rope:reel", { direction: -1 }); f.tick(60);
  assert.ok(f.active().y < y - 140); assert.ok(f.active().y - f.active().radius >= 359, "pulling must not phase through the ceiling");
  f.input("rope:reel", { direction: 0 }); const length = f.state.rope.length; f.tick(5);
  assert.equal(f.state.rope.length, length);
  f.input("jump"); assert.equal(f.state.rope, null); assert.equal(f.active().jumpKind, "rope"); assert.equal(f.active().vy, -660);
  f.tick(120); assert.equal(f.active().hp, 100, "a deliberate rope launch must not injure its owner on landing");
});

test("pulling at a cliff lip climbs onto its ledge instead of entering solid rock", () => {
  const f = fixture();
  f.state.terrain.samples = f.state.terrain.samples.map((_, i) => i * f.state.terrain.sampleSpacing >= 400 ? 420 : 600);
  Object.assign(f.active(), { x: 340, y: 580, aimAngleRad: -Math.PI / 2 });
  f.input("rope:toggle"); assert.ok(f.state.rope);
  f.input("rope:reel", { direction: -1 }); f.tick(100);
  assert.equal(f.state.rope, null); assert.ok(f.active().x > 400); assert.ok(f.active().y < 402);
  assert.equal(f.active().grounded, true); assert.equal(f.active().hp, 100);
});

test("all large arenas have floating rock contours, three spawn levels and reachable ceiling hooks", () => {
  const maps = new Set();
  for (let seed = 0; maps.size < 3 && seed < 30; seed++) {
    const context = { ...fixture().context, now: 1000 + seed * 2341,
      players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Team ${i}`, color: "#ff8800", score: 0, isReady: true, connected: true })) };
    const original = game.startRound(game.createInitialState(context), context);
    if (maps.has(original.terrain.mapId)) continue; maps.add(original.terrain.mapId);
    assert.ok(original.terrain.width >= 3200 && original.terrain.height >= 1600);
    assert.ok(original.terrain.platforms.filter((p) => p.rx > 250 && p.ry > 50 && p.ry < 150).length >= 2);
    assert.equal(original.terrain.platforms.filter((p) => p.contour).length, 4);
    assert.ok(original.terrain.platforms.every((p) => p.rx > p.ry), "no vertical supporting columns");
    const units = original.players.flatMap((p) => p.mercenaries);
    assert.ok(units.filter((u) => u.y < 250).length >= 2, "upper islands have starting units");
    assert.ok(units.filter((u) => u.y > 250 && u.y < 500).length >= 2, "middle islands have starting units");
    assert.ok(units.filter((u) => u.y > 600).length >= 2, "ground islands have starting units");
    let grips = 0;
    for (const unit of original.players.flatMap((p) => p.mercenaries)) {
      const state = structuredClone(original); state.turn.activeMercenaryId = unit.id; state.turn.currentPlayerId = unit.playerId;
      const next = game.handleInput(state, { type: "rope:toggle", playerId: unit.playerId, sentAt: 0 }, { ...context, now: state.turn.prepEndsAt + 1 });
      if (next.rope && next.rope.anchorY < unit.y - 30) grips++;
    }
    assert.ok(grips >= 4, `missing accessible ceilings on ${original.terrain.mapId}`);
  }
  assert.equal(maps.size, 3);
});


test("quick hook prefers a high wall grip over the current horizontal gun aim", () => {
  const f = fixture();
  f.state.terrain.samples = f.state.terrain.samples.map((_, i) => i * f.state.terrain.sampleSpacing >= 400 ? 300 : 600);
  const unit = f.active(); unit.x = 340; unit.y = 580; unit.aimAngleRad = 0;
  f.input("rope:toggle");
  assert.ok(f.state.rope); assert.ok(f.state.rope.anchorY < unit.y - 80);
});
