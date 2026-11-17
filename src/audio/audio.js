/* Original procedural sound palette; one-shot PCM buffers are shared by bounded voices. */
function createBattleAudio(Context = window.AudioContext || window.webkitAudioContext) {
  let ctx,
    master,
    musicBus,
    fxBus,
    compressor,
    enabled = false,
    next = 0,
    step = 0,
    fly = 0,
    thrust = 0,
    lastBlast = -10,
    peak = 0,
    played = 0;
  const voices = new Set(),
    buffers = {};
  const recipes = {
    ice: [0.6, 1700, 430, 0.18, 0.1, 0.01],
    thunder: [1.1, 110, 32, 0.9, 0.7, 0.003],
    meteor: [1.5, 70, 24, 0.7, 0.8, 0.2],
    beam: [0.8, 150, 900, 0.1, 0.4, 0.08],
    snare: [1.2, 510, 95, 0.18, 0.2, 0.2],
    glacier: [1.4, 260, 45, 0.65, 0.3, 0.2],
    charge: [0.7, 80, 650, 0.12, 0.15, 0.4],
    impact: [0.65, 95, 28, 0.8, 0.5, 0.003],
    alarm: [0.4, 580, 820, 0, 0.2, 0.02],
    fly: [0.55, 290, 65, 0.65, 0.2, 0.12],
    roar: [1.2, 100, 35, 0.7, 0.8, 0.07],
    cloud: [0.9, 350, 1050, 0.2, 0.1, 0.08],
    cannon: [0.24, 180, 38, 0.45, 0.65, 0.002],
    whiz: [0.32, 1600, 180, 0.72, 0.12, 0.05],
    fire: [0.15, 900, 100, 0.3, 0.4, 0.002],
    bell: [0.35, 880, 880, 0, 0, 0.003],
    kick: [0.22, 140, 38, 0.04, 0.2, 0.001],
    snareDrum: [0.17, 180, 90, 0.9, 0.2, 0.001],
    hat: [0.06, 5000, 3500, 0.95, 0, 0.001],
    bass: [0.25, 55, 55, 0, 0.6, 0.004],
    arp: [0.18, 220, 220, 0, 0.08, 0.003],
    pad: [1.6, 110, 110, 0.02, 0.1, 0.18],
  };
  function init() {
    if (ctx) return;
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = 0.45;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.25;
    fxBus = ctx.createGain();
    fxBus.gain.value = 0.65;
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 8;
    compressor.ratio.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;
    musicBus.connect(master);
    fxBus.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);
    for (const [name, [duration, f0, f1, noise, grit, attack]] of Object.entries(recipes)) {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate),
        data = buffer.getChannelData(0);
      let phase = 0,
        brown = 0,
        seed = 17;
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate,
          u = t / duration;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const white = seed / 2147483648;
        brown = 0.96 * brown + 0.04 * white;
        phase += (2 * Math.PI * f0 * (f1 / f0) ** u) / ctx.sampleRate;
        const tonal =
          Math.sin(phase) + 0.22 * Math.sin(phase * 2.01) + 0.1 * Math.sin(phase * 3.98);
        let sample =
          (1 - noise) * tonal + noise * (name === 'hat' ? white : white * 0.45 + brown * 4);
        sample = Math.tanh(sample * (1 + grit * 3)) / (1 + grit);
        const env = Math.min(1, t / Math.max(0.001, attack)) * Math.pow(1 - u, 2);
        data[i] = sample * env * 0.7;
      }
      buffers[name] = buffer;
    }
  }
  function stop() {
    for (const v of [...voices]) {
      v.source.stop();
      v.source.disconnect();
      v.gain.disconnect();
      v.pan.disconnect();
      voices.delete(v);
    }
    next = ctx?.currentTime || 0;
    thrust = next;
  }
  function play(name, level = 1, pan = 0, time = ctx?.currentTime || 0, music = false, rate = 1) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    if (voices.size >= 32) {
      if (music) return;
      const oldest = voices.values().next().value;
      oldest.source.stop();
      oldest.source.disconnect();
      oldest.gain.disconnect();
      oldest.pan.disconnect();
      voices.delete(oldest);
    }
    const source = ctx.createBufferSource(),
      gain = ctx.createGain(),
      panner = ctx.createStereoPanner();
    source.buffer = buffers[name];
    source.playbackRate.value = rate;
    gain.gain.value = level;
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(gain);
    gain.connect(panner);
    panner.connect(music ? musicBus : fxBus);
    const voice = { source, gain, pan: panner };
    voices.add(voice);
    peak = Math.max(peak, voices.size);
    played++;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
      voices.delete(voice);
    };
    source.start(time);
  }
  const names = ['ice', 'thunder', 'meteor', 'beam', 'snare', 'glacier'];
  return {
    enable(on) {
      if (on) {
        init();
        ctx.resume().catch(() => {});
      }
      enabled = on;
      if (master) master.gain.setTargetAtTime(on ? 0.45 : 0, ctx.currentTime, 0.02);
      if (!on) stop();
      next = ctx?.currentTime || 0;
      return enabled;
    },
    stop,
    event(event, s) {
      if (!enabled || !ctx) return;
      const name = typeof event === 'string' ? event : event.type,
        pan = typeof event === 'object' ? (event.x - s.x) / 60 : 0;
      if (name === 'swarm-fire') {
        const distance = Math.hypot(event.x - s.x, event.y - s.y, event.d - s.distance),
          level = Math.max(0.12, 0.5 / (1 + distance / 70));
        play('cannon', event.boss ? 0.65 : level, pan);
        return;
      }
      if (name === 'bullet-whiz') {
        play('whiz', 0.5, pan);
        return;
      }
      if (name === 'enemy-hit-point') {
        if (ctx.currentTime - lastBlast > 0.065) {
          lastBlast = ctx.currentTime;
          play('fire', 0.35, pan, ctx.currentTime, false, 0.5);
        }
        return;
      }
      if (name === 'armor-break' || name === 'enemy-stagger') {
        play('impact', 0.8, pan);
        play('bell', 0.3, pan, ctx.currentTime + 0.04, false, 0.5);
        return;
      }
      if (name === 'overload') {
        play('fly', 1.25, 0, ctx.currentTime, false, 0.7);
        play('impact', 1.1);
        play('charge', 0.75, 0, ctx.currentTime + 0.12, false, 1.5);
        return;
      }
      if (name.startsWith('six-impact')) {
        const i = +name.slice(10);
        play(names[i], 0.9);
        if (s.overload > 0)
          play('cannon', 1.15, (i % 2 ? 1 : -1) * 0.2, ctx.currentTime, false, 0.78 + i * 0.07);
        musicBus.gain.setTargetAtTime(0.1, ctx.currentTime, 0.01);
        musicBus.gain.setTargetAtTime(0.25, ctx.currentTime + 0.3, 0.15);
        return;
      }
      if (/^six[0-5]$/.test(name)) {
        if (s.overload > 0) return;
        play('charge', 0.55, 0, ctx.currentTime, false, 1 + Number(name.slice(3)) * 0.1);
        play(names[+name.slice(3)], 0.45);
        return;
      }
      if (['swarm-burst', 'enemy-burst', 'blast'].includes(name)) {
        if (ctx.currentTime - lastBlast < 0.065) return;
        lastBlast = ctx.currentTime;
        play('impact', event.boss ? 1 : 0.6, pan);
        return;
      }
      const sound = {
        fire: 'fire',
        'enemy-fire': 'fire',
        roar: 'roar',
        pelican: 'roar',
        tier1: 'fly',
        tier2: 'meteor',
        tier3: 'cloud',
        rescue: 'cloud',
        ring: 'bell',
        near: 'bell',
        hit: 'impact',
        fall: 'meteor',
        crash: 'impact',
        jump: 'fly',
        launch: 'fly',
        lock: 'alarm',
        'boss-area-warning': 'alarm',
        'boss-area-fire': 'thunder',
        'boss-down': 'meteor',
      }[name];
      if (sound) {
        play(sound, name === 'enemy-fire' ? 0.15 : 0.75, pan);
        if (name === 'boss-area-warning') {
          play('alarm', 0.8, 0, ctx.currentTime + 0.5);
          play('charge', 0.75, 0, ctx.currentTime + 1);
        }
      }
    },
    update(s) {
      if (!enabled || !ctx || ctx.state !== 'running' || s.status !== 'playing') return;
      const now = ctx.currentTime,
        intensity = s.swarm.attack
          ? 3
          : s.battle.enemies[12].active
            ? 2
            : s.swarm.drones.some((e) => e.active)
              ? 1
              : 0;
      const tempo = 132 + intensity * 10;
      if (next < now - 0.15) next = now;
      while (next < now + 0.12) {
        const root = [1, 1, 1.1892, 1.3348][Math.floor(step / 32) % 4];
        if (step % 4 === 0) play('kick', 0.9, 0, next, true);
        if (step % 8 === 4) play('snareDrum', 0.55, 0, next, true);
        if (step % (intensity ? 2 : 4) === 0)
          play('hat', 0.17, step % 4 === 0 ? -0.25 : 0.25, next, true);
        if (step % 2 === 0) play('bass', 0.6, 0, next, true, root);
        if (intensity && step % 2 === 0)
          play(
            'arp',
            0.22,
            ((step % 4) - 1.5) * 0.3,
            next,
            true,
            root * [1, 1.5, 2, 1.5, 1.1892, 1.7818, 2.3784, 1.5][step % 8],
          );
        if (step % 16 === 0) play('pad', 0.18, 0, next, true, root);
        if (intensity === 3 && step % 4 === 2) play('kick', 0.5, 0, next, true);
        next += 60 / tempo / 4;
        step++;
      }
      if (s.overload > 0 && (s.mode || s.pelicanTime > 0) && now >= thrust) {
        thrust = now + 0.28;
        play('fly', 0.66, 0, now, false, Math.min(1.35, 0.68 + s.speed / 350));
      }
      if (now > fly && intensity) {
        fly = now + 0.5;
        const e = s.swarm.drones.find((e) => e.active && e.d - s.distance < 55);
        if (e) play('fly', 0.12, (e.x - s.x) / 40);
      }
    },
    get context() {
      return ctx;
    },
    get enabled() {
      return enabled;
    },
    get stats() {
      return {
        enabled,
        state: ctx?.state || 'not-started',
        voices: voices.size,
        peak,
        limit: 32,
        buffers: Object.keys(buffers).length,
        played,
      };
    },
  };
}
