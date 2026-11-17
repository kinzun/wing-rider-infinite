const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  R = require('../src/simulation/player.cjs'),
  B = require('../src/simulation/battle.cjs'),
  S = require('../src/simulation/swarm.cjs');
function encounter() {
  const s = R.fresh();
  s.distance = 650;
  B.step(s, 0, []);
  S.step(s, 0.001, []);
  return s;
}
let s = encounter();
assert.equal(s.swarm.drones.filter((e) => e.active).length, 1024);
const drones = s.swarm.drones.slice(),
  bullets = s.swarm.bullets.slice();
s.shield = 100;
for (let i = 0; i < 240; i++) {
  s.elapsed += 0.05;
  S.step(s, 0.05, []);
}
assert(
  s.swarm.drones.every((e) => e.lastVolley >= 0),
  'every drone participates',
);
assert(s.swarm.fired > 512);
assert(s.swarm.bullets.filter((p) => p.active).length <= 384);
// Swept collision catches a bullet crossing the rider between frames.
s = encounter();
s.swarm.drones.forEach((e) => (e.active = false));
Object.assign(s.swarm.bullets[0], {
  active: true,
  x: 0,
  y: 2,
  d: 660,
  vx: 0,
  vy: 0,
  vd: -400,
  life: 2,
});
S.step(s, 0.05, []);
assert.equal(s.health, 99);
assert.equal(s.swarm.hits, 1);
Object.assign(s.swarm.bullets[1], {
  active: true,
  x: 0,
  y: 2,
  d: 650,
  vx: 0,
  vy: 0,
  vd: 0,
  life: 2,
});
S.step(s, 0.05, []);
assert.equal(s.health, 99, 'shared immunity');
s.hit = 0;
s.mode = 3;
Object.assign(s.swarm.bullets[1], { active: true });
S.step(s, 0.05, []);
assert.equal(s.health, 99, 'cloud protection');
// Spatial skills only destroy craft actually inside the effect volume; leech is capped.
for (let type = 0; type < 6; type++) {
  s = encounter();
  s.health = 90;
  s.swarm.drones.forEach((e) => (e.active = false));
  const near = s.swarm.drones[0],
    far = s.swarm.drones[1];
  Object.assign(near, { active: true, x: 0, y: 3, d: 750 });
  Object.assign(far, { active: true, x: 300, y: 3, d: 750 });
  assert.equal(S.sweep(s, type, []), 1);
  assert.equal(s.health, 90.25);
  assert(far.active);
  assert.equal(S.sweep(s, type, []), 0);
}
s = encounter();
s.health = 99;
const killed = S.sweep(s, 1, []);
assert(killed > 80, 'skill destroys whole nearby squads');
assert.equal(s.health, 100);
// Boss telegraph is harmless, sweep deals damage, destruction cancels area attack.
s = encounter();
s.swarm.drones.forEach((e) => (e.active = false));
s.swarm.attack = 2;
s.swarm.attackTime = 1;
s.swarm.attackX = 0;
S.step(s, 0.05, []);
assert.equal(s.health, 100);
s.swarm.attackTime = 2.95;
S.step(s, 0.05, []);
assert.equal(s.health, 99);
s.battle.enemies[12].active = false;
S.step(s, 0.05, []);
assert.equal(s.swarm.attack, 0);
s = encounter();
s.swarm.drones.forEach((e) => (e.active = false));
s.swarm.attack = 1;
s.swarm.attackTime = 1.79;
s.swarm.attackX = 0;
S.step(s, 0.02, []);
const wall = s.swarm.bullets.filter((p) => p.active);
assert(wall.length >= 100);
assert(
  wall.every((p) => Math.abs(p.x) >= 5),
  'wall leaves warned escape corridor',
);
// Fixed pools survive 1000 new waves, pause is a no-op, and reset clears combat.
s = encounter();
const ds = s.swarm.drones.slice(),
  ps = s.swarm.bullets.slice();
for (let i = 0; i < 1000; i++) {
  s.battle.wave++;
  s.swarm.fxBudget = 0;
  S.step(s, 0.05, []);
  S.sweep(s, i % 6, []);
}
ds.forEach((e, i) => assert.equal(e, s.swarm.drones[i]));
ps.forEach((p, i) => assert.equal(p, s.swarm.bullets[i]));
s.status = 'paused';
const before = JSON.stringify(s);
R.step(s, { fire: true, six0: true }, 0.05, R.create());
assert.equal(JSON.stringify(s), before);
assert.equal(R.fresh().swarm.fired, 0);
// Renderer shares simulation state and fixed instance buffers, including hundreds of death shells.
const ctx = vm.createContext({ console, AbortController });
vm.runInContext(
  fs.readFileSync(__dirname + '/../vendor/three.js', 'utf8') +
    '\n' +
    fs.readFileSync(__dirname + '/../src/render/swarm.js', 'utf8') +
    '\nglobalThis.api={THREE,createSwarm};',
  ctx,
);
const { THREE: T, createSwarm } = ctx.api,
  scene = new T.Scene(),
  view = createSwarm(T, scene, {});
s = encounter();
view.update(0.01, s, 10);
const objects = scene.children.slice(),
  buffers = objects.filter((o) => o.instanceMatrix).map((o) => o.instanceMatrix);
for (let i = 0; i < 1000; i++) {
  S.step(s, 0.01, []);
  view.update(0.01, s, 10);
}
objects.forEach((o, i) => assert.equal(o, scene.children[i]));
objects
  .filter((o) => o.instanceMatrix)
  .forEach((o, i) => assert.equal(o.instanceMatrix, buffers[i]));
assert.equal(view.stats.bulletCapacity, 384);
assert(fs.readFileSync(__dirname + '/../src/ui/input.js', 'utf8').match(/KeyZ:\s*['"]fire['"]/));
console.log(
  'SIEGE PASS: 1024 attackers, swept bullets, immunity, spatial skill kills/leech, telegraphed boss wall/sweep, 1000 wave/buffer reuse, pause/reset, Z control',
);

s = encounter();
s.swarm.drones.forEach((e) => (e.active = false));
s.speed = 0;
const bolt = s.swarm.bullets[0];
Object.assign(bolt, {
  active: true,
  x: 0,
  y: 2,
  d: s.distance + 20,
  vx: 0,
  vy: 0,
  vd: -20,
  life: 2,
});
assert.equal(S.threat(s), '正前方');
bolt.vd = 20;
assert.equal(S.threat(s), null);
Object.assign(bolt, { x: 3, d: s.distance + 1, vd: -40 });
const whiz = [];
S.step(s, 0.05, whiz);
assert(whiz.some((e) => e.type === 'bullet-whiz'));
assert.equal(s.health, 100, 'near miss does not count as a hit');
s = encounter();
let salvos = 0;
for (let i = 0; i < 180; i++) {
  const events = [];
  S.step(s, 1 / 60, events);
  salvos += events.filter((e) => e.type === 'swarm-fire').length;
}
assert(salvos > 0 && salvos <= 22, 'salvo audio is rate limited');
view.update(0.01, s, 10);
const projectile = scene.children.find(
  (o) => o.isInstancedMesh && o.count === 384 && !o.material.transparent,
);
assert.equal(projectile.geometry.type, 'CylinderGeometry');
console.log(
  'THREAT PASS: incoming/receding, near-miss sound, bounded salvo events, slim projectile model',
);
