const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const param = () => ({ value: 0, setTargetAtTime() {} }),
  nodes = [];
function node() {
  const n = {
    gain: param(),
    pan: param(),
    playbackRate: param(),
    connect() {},
    disconnect() {},
    start() {},
    stop() {
      this.onended?.();
    },
  };
  nodes.push(n);
  return n;
}
class Context {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 16000;
    this.state = 'running';
    this.destination = {};
    this.buffers = [];
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return node();
  }
  createStereoPanner() {
    return node();
  }
  createBufferSource() {
    return node();
  }
  createDynamicsCompressor() {
    return Object.assign(
      node(),
      Object.fromEntries(
        ['threshold', 'knee', 'ratio', 'attack', 'release'].map((k) => [k, param()]),
      ),
    );
  }
  createBuffer(ch, n) {
    const data = new Float32Array(n),
      buffer = {
        getChannelData() {
          return data;
        },
      };
    this.buffers.push(buffer);
    return buffer;
  }
}
const ctx = vm.createContext({});
vm.runInContext(
  fs.readFileSync(__dirname + '/../src/audio/audio.js', 'utf8') +
    '\nglobalThis.create=createBattleAudio;',
  ctx,
);
const sound = ctx.create(Context),
  s = require('../src/simulation/player.cjs').fresh();
sound.enable(true);
assert.equal(sound.stats.buffers, 22);
for (const b of sound.context.buffers) {
  const data = b.getChannelData(0);
  assert(data.every(Number.isFinite));
  assert(data.some((x) => Math.abs(x) > 0.01));
  assert(data.every((x) => Math.abs(x) <= 1));
}
for (let i = 0; i < 1000; i++) {
  sound.event('six' + (i % 6), s);
  sound.event('six-impact' + (i % 6), s);
  assert(sound.stats.voices <= 32);
}
sound.stop();
assert.equal(sound.stats.voices, 0);
sound.update(s);
assert(sound.stats.voices > 0);
sound.enable(false);
const played = sound.stats.played;
sound.event('fire', s);
sound.update(s);
assert.equal(sound.stats.played, played);
assert.equal(sound.stats.voices, 0);
sound.enable(true);
assert.equal(sound.context.buffers.length, 22, 'reuse buffers on unmute');
sound.stop();
console.log(
  'AUDIO PASS: 22 finite non-silent procedural buffers, 32 voice cap, release, mute, restart reuse, music scheduling',
);

sound.enable(true);
const fired = sound.stats.played;
sound.event({ type: 'swarm-fire', x: 10, y: 2, d: 30, boss: false }, s);
sound.event({ type: 'bullet-whiz', x: -3, y: 2, d: 0 }, s);
assert.equal(sound.stats.played, fired + 2);
sound.stop();
assert.equal(sound.stats.voices, 0);
console.log('PROJECTILE AUDIO PASS: salvo and near-miss each produce a bounded voice');
