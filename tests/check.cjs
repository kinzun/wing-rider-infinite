const assert = require('node:assert/strict'),
  R = require('../src/simulation/player.cjs'),
  { performance } = require('node:perf_hooks');
const start = performance.now();
let narrow = 0,
  turn = 0,
  hazard = 0,
  fallbacks = 0,
  maxMs = 0,
  prior;
for (let b = 0; b < 300; b++) {
  const t = performance.now(),
    result = R.solve(b);
  maxMs = Math.max(maxMs, performance.now() - t);
  fallbacks += result.fallback;
  assert.deepEqual(result, R.solve(b), 'same seed recreates the same world');
  result.ids.forEach((id, i) => {
    const tile = R.tiles[id];
    if (prior) assert(R.compatible(prior, tile), 'socket continuity / difficulty spacing');
    const p0 = R.profile(tile, 0),
      p1 = R.profile(tile, 1);
    assert(p0.w >= 3.2 && p1.w >= 3.2);
    for (let n = 0; n <= 64; n++) {
      const p = R.profile(tile, n / 64);
      assert(Number.isFinite(p.x));
      assert(p.w >= 3.2);
    }
    narrow += Number(tile.a > 2 || tile.b > 2);
    turn += Number(p0.x !== p1.x);
    hazard += Number(!!tile.hazard);
    prior = tile;
  });
}
assert(narrow && turn && hazard, 'all challenge families appear');
const world = R.create(),
  slots = world.slots.slice();
for (let i = 0; i < 100000; i++) {
  world.sync(i * 64);
  assert.equal(world.stats.slots, 12);
  assert.equal(world.stats.cachedTiles, 12);
  assert.equal(new Set(world.slots.map((s) => s.index)).size, 12);
  assert(
    world.slots.every((s, j) => s === slots[j]),
    'slot objects reused',
  );
  assert(
    world.slots.every((s) => Math.abs((s.index - world.origin) * 64) <= 576),
    'bounded render coordinates',
  );
}
let s = R.fresh(),
  w = R.create();
for (let i = 0; i < 120; i++) R.step(s, { forward: true }, 1 / 60, w);
assert(s.distance > 0 && s.speed > 0);
const prev = s.speed;
for (let i = 0; i < 60; i++) R.step(s, { brake: true }, 1 / 60, w);
assert(s.speed < prev);
s.status = 'paused';
const frozen = JSON.stringify(s);
R.step(s, { forward: true }, 0.05, w);
assert.equal(JSON.stringify(s), frozen);
s = R.fresh();
w = R.create();
s.x = 20;
assert(R.step(s, {}, 0.05, w).includes('edge'));
for (let i = 0; i < 100; i++) R.step(s, {}, 0.05, w);
assert.equal(s.status, 'lost');
s = R.fresh();
w = R.create();
for (let i = 0; i < 60; i++) R.step(s, { boost: true }, 1 / 60, w);
assert(s.energy < 90 && s.speed > 20, 'boost consumes finite energy');
s = R.fresh();
w = R.create();
s.distance = 48;
w.sync(48);
let events = R.step(s, {}, 0.01, w);
assert(events.includes('ring'));
events = R.step(s, {}, 0.01, w);
assert(!events.includes('ring'), 'no duplicate ring');
s = R.fresh();
w = R.create();
let obstacle;
for (let i = 0; i < 200; i++) {
  w.sync(i * 64);
  if (w.at(i * 64).tile.hazard) {
    obstacle = i;
    break;
  }
}
assert(obstacle !== undefined);
s.distance = obstacle * 64 + 64 * 0.56 - 1;
w.sync(s.distance);
const gate = w.at(s.distance),
  gp = R.profile(gate.tile, 0.56);
s.x = gp.x + gate.tile.hazard * 3.1;
assert(R.step(s, {}, 0.01, w).includes('hit'));
assert.equal(s.health, 99);
assert(!R.step(s, {}, 0.01, w).includes('hit'), 'obstacle hits once');
// Jump is edge-triggered: holding Space cannot auto-repeat after landing.
s = R.fresh();
w = R.create();
assert(R.step(s, { jump: true }, 1 / 60, w).includes('jump'));
for (let i = 0; i < 90; i++) R.step(s, { jump: true }, 1 / 60, w);
assert.equal(s.jumps, 1);
assert.equal(s.y, 0);
R.step(s, { jump: false }, 1 / 60, w);
assert(R.step(s, { jump: true }, 1 / 60, w).includes('jump'));
// A crossbar launch pad clears the obstacle across normal, braking and boost speeds.
for (const stepDt of [1 / 60, 1 / 20])
  for (const mode of [{ back: true }, {}, { forward: true }, { boost: true }]) {
    s = R.fresh();
    w = R.create();
    const index = 4;
    w.sync(index * 64);
    assert(w.at(index * 64).tile.hazard);
    s.battle.nextWave = Infinity;
    s.swarm.wave = s.battle.wave; // Isolate launch-pad collision from live swarm fire.
    const g = w.at(index * 64),
      p = R.profile(g.tile, 0.4);
    s.distance = index * 64 + 64 * 0.4 - 1;
    s.x = p.x;
    s.speed = mode.back ? 9 : mode.boost ? 58 : mode.forward ? 34 : 24;
    let launched = false,
      passed = false;
    for (let i = 0; i < 240 && s.status === 'playing'; i++) {
      const ev = R.step(s, mode, stepDt, w);
      launched ||= ev.includes('launch');
      if (s.distance > index * 64 + 64 * 0.56 + 2) {
        passed = true;
        break;
      }
    }
    assert(launched && passed);
    assert.equal(s.health, 100, 'launch pad must clear bar at supported speeds');
  }
// Tier modes have distinct speeds, finite durations/cooldowns, and safe return to the road.
for (let tier = 1; tier <= 3; tier++) {
  s = R.fresh();
  w = R.create();
  const key = 'tier' + tier;
  R.step(s, { [key]: true }, 1 / 60, w);
  assert.equal(s.mode, tier);
  for (let i = 0; i < 90; i++) R.step(s, { fire: true }, 1 / 60, w);
  assert(s.speed > [0, 65, 95, 135][tier]);
  assert(s.y > [0, 1, 3, 6][tier]);
  for (let i = 0; i < 360 && s.mode; i++) R.step(s, { fire: true }, 1 / 60, w);
  assert.equal(s.mode, 0);
  assert(s.cooldowns[tier - 1] > 0);
  assert(s.speed <= 36);
  assert(!s.falling);
  for (let i = 0; i < 120 && s.y > 0; i++) R.step(s, { fire: true }, 1 / 60, w);
  assert.equal(s.y, 0);
  assert(!s.falling, 'power must land inside the road');
  const remaining = s.cooldowns[tier - 1];
  R.step(s, { [key]: true }, 1 / 60, w);
  assert.equal(s.mode, 0);
  assert.equal(s.missiles.length, 8);
  assert.equal(s.shots.length, 8);
}
s = R.fresh();
w = R.create();
s.missiles[0].active = true;
s.missiles[0].phase = 0;
s.missiles[0].clock = 1;
assert(R.step(s, { roar: true }, 1 / 60, w).includes('roar'));
assert(!s.missiles[0].active);
assert(s.shield > 0 && s.roarCooldown > 0);
s = R.fresh();
w = R.create();
Object.assign(s.missiles[0], { active: true, phase: 0, clock: 1.4, x: 0, y: 2, d: 95, id: 1 });
R.step(s, { fire: true }, 1 / 60, w);
assert(s.ammo < 8, 'shot consumes ammo immediately');
for (let i = 0; i < 90 && !s.kills; i++) R.step(s, { fire: true }, 1 / 60, w);
assert(s.kills > 0, 'bear cannon must intercept the lock-on missile');
assert.equal(s.health, 100);
assert(s.ammo <= 8);
s = R.fresh();
w = R.create();
s.mode = 3;
s.modeTime = 3;
s.y = 7;
Object.assign(s.missiles[0], { active: true, phase: 1, x: 0, y: 9, d: 1, id: 1 });
R.step(s, {}, 1 / 60, w);
assert.equal(s.health, 100, 'cloud mode blocks missiles');
// Drive a boost-enabled controller over 10 km, steering along the verified safe corridor.
s = R.fresh();
w = R.create();
let frames = 0;
while (s.distance < 10000 && s.status === 'playing' && frames++ < 200000) {
  const d = s.distance + Math.max(3, s.speed * 0.3);
  w.sync(s.distance);
  const tile = w.at(d).tile,
    p = R.profile(tile, (d % 64) / 64),
    side = tile.hazard;
  const target = p.x - side * 2.7,
    delta = target - s.x - s.vx * 0.18;
  const available = s.mode === 0 ? [3, 2, 1].find((t) => s.cooldowns[t - 1] === 0) : 0;
  R.step(
    s,
    {
      left: delta < -0.18,
      right: delta > 0.18,
      boost: true,
      pelican: s.pelicanCooldown === 0,
      fire: true,
      roar: s.mode !== 3 && s.roarCooldown === 0 && s.missiles.some((m) => m.active),
      ['tier' + available]: true,
    },
    1 / 60,
    w,
  );
}
assert.equal(s.status, 'playing', 'reference controller must traverse 10km');
assert(s.count > 50);
console.log(
  JSON.stringify(
    {
      result: 'PASS',
      batches: 300,
      narrow,
      turn,
      hazard,
      fallbacks,
      maxSolveMs: +maxMs.toFixed(2),
      streamedChunks: 100000,
      streamedKm: 6400,
      pool: world.stats,
      controllerMeters: Math.floor(s.distance),
      rings: s.count,
      seconds: +((performance.now() - start) / 1000).toFixed(2),
    },
    null,
    2,
  ),
);

{
  const w = R.create(),
    s = R.fresh();
  s.missiles[0] = { ...s.missiles[0], active: true, d: 25, x: 0 };
  s.missiles[1] = { ...s.missiles[1], active: true, d: 200, x: 0 };
  const e = R.step(s, { pelican: true }, 1 / 60, w);
  assert(e.includes('pelican'));
  assert(!s.missiles[0].active);
  assert(s.missiles[1].active);
  assert.equal(s.pelicanTime, 4);
  assert(!R.step(s, { pelican: true }, 1 / 60, w).includes('pelican'));
  R.step(s, {}, 1 / 60, w);
  assert(!R.step(s, { pelican: true }, 1 / 60, w).includes('pelican'));
  s.status = 'paused';
  const t = s.pelicanTime;
  R.step(s, {}, 1, w);
  assert.equal(s.pelicanTime, t);
  assert.equal(R.fresh().pelicanCooldown, 0);
  console.log('Pelican PASS: trigger, range, held edge, cooldown, pause, reset');
}
