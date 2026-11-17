const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const ctx = vm.createContext({ console, AbortController });
vm.runInContext(
  fs.readFileSync(__dirname + '/../vendor/three.js', 'utf8') +
    '\n' +
    fs.readFileSync(__dirname + '/../src/effects/reference-particles.js', 'utf8') +
    '\n' +
    fs.readFileSync(__dirname + '/../src/effects/camera-shake.js', 'utf8') +
    '\n' +
    fs.readFileSync(__dirname + '/../src/effects/vfx.js', 'utf8') +
    '\nglobalThis.exports={THREE,RiderVFX};',
  ctx,
);
const { THREE: T, RiderVFX } = ctx.exports,
  scene = new T.Scene(),
  camera = new T.PerspectiveCamera(),
  fx = new RiderVFX(scene, camera),
  state = { x: 0, y: 2, z: 0, mode: 3 };
const objects = scene.children.slice(),
  geometry = fx.trails.map((t) => t.ribbon.geometry),
  buffers = fx.trails.map((t) => t.ribbon.positions);
for (let i = 0; i < 1000; i++) {
  fx.spawn(0, 2, 0, i % 2 === 0);
  state.mode = i % 4;
  fx.update(1 / 60, state, false);
}
assert.equal(fx.bursts.length, 8);
assert.equal(fx.sparks.length, 384);
assert.equal(fx.trails.length, 8);
assert.deepEqual(scene.children, objects);
fx.trails.forEach((t, i) => {
  assert.equal(t.ribbon.geometry, geometry[i]);
  assert.equal(t.ribbon.positions, buffers[i]);
  assert.ok(t.ribbon.positions.every(Number.isFinite));
});
fx.spawn(1, 2, 3);
const b = fx.bursts[(fx.cursor - 1) % 8];
fx.rebase(64);
assert.equal(b.mesh.position.z, 67);
assert.equal(b.halo.position.z, 67);
const age = b.age,
  time = fx.time;
fx.update(0, state, false);
assert.equal(b.age, age);
assert.equal(fx.time, time);
camera.position.set(0, 0, 0);
fx.shake(camera, true);
assert.equal(camera.position.length(), 0);
fx.update(2, state, false);
assert.ok(fx.bursts.every((b) => !b.mesh.visible && !b.halo.visible));
assert.ok(fx.sparks.every((s) => s.life <= 0));
fx.reset();
assert.ok(fx.trails.every((t) => !t.mesh.visible));
assert.equal(fx.trauma, 0);
console.log(
  'VFX PASS: 1000 bursts, fixed identities/buffers, rebase, pause, expiry, reduced motion, reset',
);

fx.trigger('pelican', state, 0);
fx.update(0.4, state, false);
assert(fx.storm.visible && fx.sideStorm.visible);
const t = fx.stormTime;
fx.update(0, state, false);
assert.equal(fx.stormTime, t);
fx.update(4, state, false);
assert(!fx.storm.visible && !fx.sideStorm.visible);
fx.trigger('pelican', state, 0);
fx.reset();
assert.equal(fx.stormTime, 0);
assert(!fx.storm.visible && !fx.sideStorm.visible);
console.log('Storm PASS: lifetime, pause, expiry, reset');
fx.trigger({ type: 'enemy-burst', x: 0, y: 3, d: 20, boss: true }, state, 0);
assert.equal(fx.detonations.filter((d) => d.active).length, 12);
assert(fx.debris.some((d) => d.life > 0));
const z = fx.detonations[0].z;
fx.rebase(64);
assert.equal(fx.detonations[0].z, z + 64);
fx.update(0, state, false);
assert.equal(fx.detonations.filter((d) => d.active).length, 12);
fx.reset();
assert(fx.detonations.every((d) => !d.active));
assert(fx.debris.every((d) => d.life === 0));
assert.equal(fx.flash, 0);
console.log('DETONATION PASS: fixed queue, debris, rebase, pause, reset');
fx.reset();
fx.shatter(1, 2, 3, true);
fx.update(0.1, state, false);
assert(fx.gpuSystems.reduce((n, p) => n + p.countLive(fx.time), 0) > 0);
const start = fx.gpuSparks.data.start[2];
fx.rebase(64);
assert(Math.abs(fx.gpuSparks.data.start[2] - start - 64) < 1e-4);
fx.emitGPU(fx.gpuSparks, 2, 0, 0, 0, 1, 10, 1);
fx.gpuSparks.flush();
assert(
  fx.gpuSparks.attributes.start.updateRanges.some(
    (r) => r.start === 0 && r.count === fx.gpuSparks.capacity * 3,
  ),
  'rebasing must upload the whole pool even when emission follows',
);
const arrays = fx.gpuSystems.map((p) => p.data.start);
for (let i = 0; i < 100; i++) {
  fx.shatter(0, 0, 0, true);
  fx.update(0.05, state, false);
}
fx.gpuSystems.forEach((p, i) => {
  assert.equal(p.data.start, arrays[i]);
  assert(p.countLive(fx.time) <= p.capacity);
});
fx.reset();
assert.equal(
  fx.gpuSystems.reduce((n, p) => n + p.countLive(fx.time), 0),
  0,
);
console.log('GPU PARTICLES PASS: copied emitter, bounded buffers, rebase+emit upload, reset');

fx.reset();
fx.motion.add(0.6, 0.8, 17);
assert.equal(fx.motion.decay, 0.8);
assert.equal(fx.motion.frequency, 17);
fx.update(0.016, state, false);
camera.position.set(0, 0, 0);
camera.rotation.set(0, 0, 0);
fx.shake(camera, false);
assert(camera.position.length() > 0.1);
assert(Math.abs(camera.rotation.z) > 0);
fx.unshake(camera);
assert(camera.position.length() < 1e-9);
const trauma = fx.trauma;
fx.update(0, state, false);
assert.equal(fx.trauma, trauma);
fx.trigger('six-impact2', state, 0);
assert(fx.impactKick === 1);
assert(fx.detonations.filter((d) => d.active).length === 6);
for (let i = 0; i < 1000; i++) fx.trigger('six-impact' + (i % 6), state, 0);
assert.equal(fx.detonations.length, 16);
assert.equal(fx.bursts.length, 8);
assert.deepEqual(scene.children, objects);
fx.reset();
assert.equal(fx.impactKick, 0);
assert.equal(fx.motion.rig.shakeRoll, 0);
console.log(
  'IMPACT PASS: copied shake duration/frequency, depth/roll, no offset accumulation, pause/reset, bounded chain explosions',
);
