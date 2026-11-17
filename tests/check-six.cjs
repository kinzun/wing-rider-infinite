const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  R = require('../src/simulation/player.cjs');
for (const key of ['tier1', 'tier2', 'tier3', 'pelican']) {
  const s = R.fresh(),
    w = R.create();
  s.x = 40;
  s.y = -50;
  s.vy = -20;
  s.falling = true;
  s.fallTime = 4.8;
  const events = R.step(s, { [key]: true }, 0.05, w);
  assert(events.includes('rescue'));
  assert(!s.falling && s.status === 'playing', key + ' rescues deep fall');
  for (let i = 0; i < 40; i++) R.step(s, {}, 0.05, w);
  assert(s.y > 0 && !s.falling, key + ' climbs above road');
}
let s = R.fresh(),
  w = R.create();
s.x = 40;
s.pelicanTime = 2;
R.step(s, {}, 0.05, w);
assert(!s.falling);
s = R.fresh();
s.falling = true;
for (let i = 0; i < 99; i++) R.step(s, {}, 0.05, w);
assert.equal(s.status, 'playing');
R.step(s, {}, 0.05, w);
assert.equal(s.status, 'lost');
s = R.fresh();
s.distance = 650;
w = R.create();
w.sync(650);
require('../src/simulation/battle.cjs').step(s, 0, []);
const hp = s.battle.enemies[12].hp;
R.step(s, { six0: true, tier3: true }, 0.01, w);
for (let i = 0; i < 100; i++) R.step(s, {}, 0.016, w);
assert(s.battle.enemies[12].hp < hp);
assert(s.sixCooldowns[0] > 0);
const ctx = vm.createContext({
  console,
  AbortController,
  structuredClone,
  innerWidth: 1440,
  innerHeight: 900,
});
vm.runInContext(
  ['vendor/three.js', 'build/six-bundle.js', 'src/effects/six-host.js', 'src/render/swarm.js']
    .map((f) => fs.readFileSync(__dirname + '/../' + f, 'utf8'))
    .join('\n') + '\nglobalThis.api={THREE,createSixSkills,createSwarm};',
  ctx,
);
const { THREE: T, createSixSkills, createSwarm } = ctx.api;
const skills = createSixSkills(T, new T.Scene(), new T.PerspectiveCamera(55, 1.6, 0.1, 1400), {
  motion: { add() {}, rumble() {} },
  trauma: 0,
  flash: 0,
});
s = R.fresh();
for (let i = 0; i < 6; i++) {
  skills.cast(i);
  for (let j = 0; j < 360; j++) skills.update(1 / 60, s);
  skills.reset();
}
const budget = JSON.stringify([
  skills.stats.burstSlots,
  skills.stats.decalSlots,
  skills.stats.fissureSlots,
]);
const capacity = skills.stats.capacity,
  abilities = skills.abilities.slice();
for (let i = 0; i < 120; i++) {
  skills.cast(i % 6);
  skills.update(0.05, s);
  assert(skills.stats.active <= 2);
}
assert.equal(skills.stats.capacity, capacity);
assert.equal(
  JSON.stringify([skills.stats.burstSlots, skills.stats.decalSlots, skills.stats.fissureSlots]),
  budget,
);
skills.abilities.forEach((a, i) => assert.equal(a, abilities[i]));
skills.reset();
assert.equal(skills.stats.active, 0);
console.log(
  'SIX PASS: four flight rescues, active flight support, 5s window, six skill damage, complete copied lifecycles, bounded concurrency/particle capacity',
);
