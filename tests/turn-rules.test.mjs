import assert from "node:assert/strict";
import test from "node:test";
import { chaosKommandoServerGame as game } from "../dist/server/index.js";
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
  assert.equal(f.active().vx, 150); assert.equal(f.active().vy, -300);
  const b = fixture(); b.input("jump", { kind: "backflip" });
  assert.equal(b.active().vx, -70); assert.equal(b.active().vy, -460);
  b.input("move", { moveX: 1, moveY: 0 }); b.tick();
  assert.ok(b.active().vx < 0, "airborne steering cannot reverse a backflip");
});

test("normal backflip lands without fall damage or ending the turn", () => {
  const f = fixture(); const hp = f.active().hp; f.input("jump", { kind: "backflip" }); f.tick(80);
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
