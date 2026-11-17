const assert = require('node:assert/strict'),
  R = require('../src/simulation/player.cjs'),
  B = require('../src/simulation/battle.cjs');
let s = R.fresh(),
  events = [];
s.distance = 650;
B.step(s, 0, events);
assert.equal(s.battle.enemies.filter((e) => e.active).length, 13);
assert(events.includes('boss'));
const pool = s.battle.enemies.slice();
const boss = s.battle.enemies[12];
B.hit(s, boss, 50, events);
assert.equal(boss.hp, 850);
B.hit(s, boss, 401, events);
assert.equal(boss.hp, 449);
assert(boss.stagger > 0);
B.step(s, 0.01, events);
assert.equal(boss.phase, 1);
assert(events.includes('boss-rage'));
B.hit(s, s.battle.enemies[0], 3, events);
assert.equal(s.battle.enemies[0].hp, 87, 'heavy survives shoulder hit');
B.hit(s, s.battle.enemies[1], 12, events);
for (let i = 0; i < 90; i++) B.step(s, 1 / 60, events);
assert(s.battle.enemies[0].active, 'chain cannot erase heavy escorts');
assert(
  s.battle.enemies.some((e) => e.active && !e.boss),
  'chain damages instead of wiping the whole squad',
);
const score = s.score;
B.hit(s, boss, 9999, events);
assert(!boss.active);
assert(events.some((e) => e.type === 'enemy-burst' && e.boss));
B.hit(s, boss, 9999, events);
assert.equal(s.score, score + 3000, 'death reward only once');
for (let i = 0; i < 1000; i++) {
  s.distance += 500;
  B.step(s, 0.05, []);
  for (const e of s.battle.enemies) B.hit(s, e, 9999, []);
}
s.battle.enemies.forEach((e, i) => assert.equal(e, pool[i]));
assert.equal(s.missiles.length, 8);
s = R.fresh();
s.distance = 70;
const w = R.create();
w.sync(70);
B.step(s, 0, []);
s.enemyClock = 100;
s.battle.enemies.forEach((e) => (e.fire = 100));
let fired = false;
for (let i = 0; i < 120; i++) {
  const e = R.step(s, { fire: true }, 1 / 60, w);
  fired ||= e.includes('fire');
}
assert(fired);
assert(
  s.battle.enemies.some((e) => e.active && e.hp < e.maxHp),
  'shoulder shots damage durable enemies',
);
console.log(
  'BATTLE PASS: formation, boss phases, chained deaths, one-time rewards, 1000 wave pool reuse, projectile hits',
);
s = R.fresh();
s.enemyClock = 100;
for (let i = 0; i < 3; i++)
  Object.assign(s.missiles[i], { active: true, phase: 1, x: 0, y: 2, d: 1, id: i });
R.step(s, {}, 1 / 60, R.create());
assert.equal(s.health, 99, 'one volley cannot consume all three health points in one frame');
console.log('DAMAGE PASS: short hit immunity');
s = R.fresh();
s.health = 60;
s.distance = 650;
B.step(s, 0, []);
B.hit(s, s.battle.enemies[12], 4, []);
assert.equal(s.health, 61, 'skill leeches one quarter of actual enemy damage');
s.health = 99.9;
B.hit(s, s.battle.enemies[12], 4, []);
assert.equal(s.health, 100);
assert.equal(R.fresh().health, 100);
console.log('HEALTH PASS: 100 durability, damage-based leech, cap');

s = R.fresh();
s.distance = 650;
B.step(s, 0, []);
const heavy = s.battle.enemies[0];
events = [];
B.hit(s, heavy, 30, events);
assert.equal(heavy.hp, 60);
assert(heavy.stagger > 0);
assert.equal(heavy.armorStage, 1);
assert(events.some((e) => e.type === 'armor-break'));
B.hit(s, heavy, 4, []);
assert.equal(heavy.hp, 53, 'stagger grants 1.75x damage');
heavy.age = 50;
B.step(s, 0.05, []);
assert(heavy.active, 'heavy does not vanish at old 32s timeout');
console.log('HEAVY PASS: durability, armor stages, stagger bonus and no timed retreat');

s = R.fresh();
s.distance = 650;
B.step(s, 0, []);
const target = s.battle.enemies[12];
B.hit(s, target, 10, [], 2.5);
assert.equal(target.hp, 890);
assert.equal(target.impact, 25, 'impact power is independent of damage');
console.log('IMPACT ROLE PASS: pressure skills build stagger without inflating health damage');

{
  const s = R.fresh(),
    world = R.create(431),
    events = [];
  s.distance = 650;
  world.sync(s.distance);
  B.step(s, 0, events);
  const boss = s.battle.enemies[12];
  B.hit(s, boss, 10, events, 12);
  assert.equal(s.overload, 5);
  assert(events.includes('overload'));
  s.sixCooldowns[3] = 4;
  assert(R.step(s, { six3: true, tier3: true }, 0.05, world).includes('six-impact3'));
  assert(!R.step(s, { six3: true }, 0.05, world).includes('six3'));
  R.step(s, {}, 0.05, world);
  assert(R.step(s, { six3: true }, 0.05, world).includes('six-impact3'));
  for (let i = 0; i < 22; i++) R.step(s, {}, 0.05, world);
  assert(s.speed > 225, 'overload flight accelerates past the regular 150 m/s cap');
  assert.equal(s.sixCooldowns[3], 4);
  s.overload = 0.02;
  assert(!R.step(s, { six3: true }, 0.05, world).includes('six3'));
  assert(s.sixCooldowns[3] < 4);
  boss.stagger = 0;
  B.hit(s, boss, 1, [], 120);
  assert.equal(s.overload, 0, 'spent armor stage cannot trigger again');
  boss.stagger = 0;
  boss.armorStage = 1;
  B.hit(s, boss, 1, [], 120);
  assert.equal(s.overload, 5);
  console.log('OVERLOAD PASS: stage trigger, repeat presses, flight boost and cooldown resume');
}
