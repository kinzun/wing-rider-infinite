function createSixSkills(T, scene, camera, vfx) {
  const get = SixModules,
    settings = get('config/settings.js').settings,
    frame = get('core/FrameUniforms.js').frame;
  settings.global.emissionRate = 0.85;
  settings.global.particleCount = 1;
  settings.global.particleSize = 1.65;
  settings.meteor.trailSteps = 22;
  settings.meteor.radius = 1.5;
  settings.meteor.trailWidth = 1.1;
  settings.meteor.shockRadius = 10;
  settings.ice.height = 5;
  settings.ice.width = 4;
  settings.beam.radius = 1.2;
  settings.snare.zoneRadius = 7.5;
  settings.glacier.zoneRadius = 7.2;
  const root = new T.Scene(),
    anchor = new T.Vector3();
  root.add(new T.HemisphereLight(0xc4eaff, 0x22243a, 2));
  const key = new T.DirectionalLight(0xffe0bb, 2);
  key.position.set(-20, 40, 10);
  root.add(key);
  const localCamera = camera.clone();
  const particles = new (get('particles/ParticleEngine.js').ParticleEngine)(root);
  const bursts = new (get('effects/BurstSphere.js').BurstSystem)(root),
    decals = new (get('effects/GroundDecals.js').DecalSystem)(root),
    fissures = new (get('effects/GroundFissures.js').FissureSystem)(root),
    lights = new (get('effects/LightPool.js').LightPool)(root);
  // Preallocate per-kind impact budgets and retire the oldest of that kind.
  for (const [system, kinds, key] of [
    [bursts, 6, 'mode'],
    [decals, 8, 'type'],
  ]) {
    for (let k = 0; k < kinds; k++) {
      const pool = system._poolFor(k),
        items = Array.from({ length: 3 }, () => pool.acquire());
      items.forEach((x) => pool.release(x));
    }
    const spawn = system.spawn.bind(system);
    system.spawn = (kind, ...args) => {
      const same = system.active.filter((a) => a[key] === kind);
      if (same.length >= 3) {
        const old = same[0];
        system.active.splice(system.active.indexOf(old), 1);
        system._poolFor(kind).release(old);
      }
      const [position, options = {}] = args;
      const enhanced = { ...options };
      if (system === bursts) {
        enhanced.endRadius = (options.endRadius ?? 3) * 1.7;
        enhanced.intensity = (options.intensity ?? 1) * 1.35;
      } else if (kind === 3 || kind === 4) {
        enhanced.radius = (options.radius ?? 2) * 1.65;
      }
      return spawn(kind, position, enhanced);
    };
  }
  const release = fissures.prewarm(2);
  release();
  const spawnFissure = fissures.spawn.bind(fissures);
  fissures.spawn = (...args) => {
    if (fissures.active.length >= 2) fissures.pool.release(fissures.active.shift());
    return spawnFissure(...args);
  };
  const ctx = {
    scene: root,
    camera: localCamera,
    particles,
    bursts,
    decals,
    fissures,
    lights,
    environment: {
      registerShadowCasterWithPatch(material, patch) {
        material.onBeforeCompile = patch;
      },
    },
    shake: {
      add(n, decay, frequency) {
        vfx.motion.add(n, decay, frequency);
      },
      rumble(n, dt) {
        vfx.motion.rumble(n, dt);
      },
    },
    flash: {
      trigger(color, n) {
        vfx.flash = Math.max(vfx.flash, Math.min(0.8, n));
      },
    },
  };
  const names = ['Ice', 'Thunder', 'Meteor', 'Beam', 'Snare', 'Glacier'];
  const abilities = names.map((name) => {
    const a = new (get('abilities/' + name + 'Ability.js')[name + 'Ability'])(ctx);
    root.add(a.group);
    a.group.visible = false;
    return a;
  });
  const active = [],
    origin = new T.Vector3(0, 0, -3),
    direction = new T.Vector3(0, 0, -1);
  return {
    root,
    camera: localCamera,
    abilities,
    particles,
    syncCamera() {
      localCamera.position.copy(camera.position).sub(anchor).divideScalar(6);
      localCamera.quaternion.copy(camera.quaternion);
      localCamera.fov = camera.fov;
      localCamera.aspect = camera.aspect;
      localCamera.near = camera.near / 6;
      localCamera.far = camera.far / 6;
      localCamera.updateProjectionMatrix();
    },
    cast(i) {
      const a = abilities[i];
      const old = active.indexOf(a);
      if (old >= 0) {
        a.destroy();
        active.splice(old, 1);
      }
      if (active.length >= 2) active.shift().destroy();
      a.spawn(origin, direction, [18, 18, 12, 22, 12, 12][i]);
      active.push(a);
    },
    update(dt, s) {
      anchor.set(s.x, Math.max(-35, s.y) + 1, s.z - 3);
      this.syncCamera();
      frame.uTime.value += dt;
      frame.uResolution.value.set(innerWidth, innerHeight);
      frame.uCameraNear.value = localCamera.near;
      frame.uCameraFar.value = localCamera.far;
      for (let i = active.length - 1; i >= 0; i--) {
        active[i].update(dt);
        if (active[i].isFinished) {
          active[i].destroy();
          active.splice(i, 1);
        }
      }
      bursts.update(dt);
      decals.update(dt);
      fissures.update(dt);
      particles.flush();
    },
    reset() {
      for (const a of active) a.destroy();
      active.length = 0;
      bursts.clear();
      decals.clear();
      fissures.clear();
      particles.reset();
    },
    get stats() {
      return {
        active: active.length,
        objects: (() => {
          let n = 0;
          root.traverse(() => n++);
          return n;
        })(),
        burstSlots: [...bursts.pools.values()].reduce(
          (n, p) => n + p.free.length + p.activeCount,
          0,
        ),
        decalSlots: [...decals.pools.values()].reduce(
          (n, p) => n + p.free.length + p.activeCount,
          0,
        ),
        fissureSlots: fissures.pool.free.length + fissures.pool.activeCount,
        systems: particles.systems.size,
        capacity: [...particles.systems.values()].reduce((n, p) => n + p.capacity, 0),
      };
    },
  };
}
