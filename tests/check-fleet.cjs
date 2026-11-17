const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  R = require('../src/simulation/player.cjs'),
  B = require('../src/simulation/battle.cjs');
const context = vm.createContext({ console, AbortController });
vm.runInContext(
  fs.readFileSync(__dirname + '/../vendor/three.js', 'utf8') +
    '\n' +
    fs.readFileSync(__dirname + '/../src/render/fleet.js', 'utf8') +
    '\nglobalThis.api={THREE,createFleet};',
  context,
);
const { THREE: T, createFleet } = context.api,
  scene = new T.Scene(),
  fleet = createFleet(T, scene),
  s = R.fresh();
s.distance = 650;
B.step(s, 0, []);
const boss = s.battle.enemies[12],
  visual = fleet.models[12];
let count = 0;
scene.traverse(() => count++);
boss.fire = 0.2;
boss.recoil = 0.2;
boss.phase = 1;
fleet.update(s, 10);
assert(visual.charge.material.opacity > 0);
assert(visual.guns.every((g) => g.recoil.position.z < 0));
assert(visual.panels.every((p) => Math.abs(p.rotation.z) > 0.4));
for (let i = 0; i < 1000; i++) {
  s.elapsed += 0.016;
  fleet.update(s, 10);
}
let after = 0;
scene.traverse(() => after++);
assert.equal(after, count);
boss.active = false;
fleet.update(s, 10);
assert(!visual.g.visible);
assert.equal(fleet.models.length, 13);
console.log('FLEET PASS: charge, recoil, armor opening, hidden dead hull, fixed nodes');

boss.active = true;
boss.hp = 300;
boss.armorStage = 2;
boss.flash = 0.15;
fleet.update(s, 10);
assert.equal(visual.plates.count, 24);
assert(visual.hitShell.material.opacity > 0);
assert(visual.hp.scale.x < 1);
const heavy = s.battle.enemies[0];
heavy.active = true;
heavy.armorStage = 1;
fleet.update(s, 10);
assert.equal(fleet.models[0].armorChunks.filter((p) => p.visible).length, 2);
console.log('ARMOR VISUAL PASS: hit flash, damaged plates, health bar, heavy armor loss');
