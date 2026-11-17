(() => {
  'use strict';
  const $ = (id) => document.getElementById(id),
    T = THREE,
    clamp = T.MathUtils.clamp,
    lerp = T.MathUtils.lerp;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    $('panel-title').textContent = '暂时无法起飞';
    $('description').textContent =
      '浏览器无法创建 WebGL 2 画面。请开启硬件加速，或在支持 WebGL 2 的浏览器中重试。';
    $('mission').hidden = true;
    $('start').textContent = '刷新重试';
    $('start').disabled = false;
    $('start').onclick = () => location.reload();
    return;
  }
  const touch = matchMedia('(pointer: coarse)').matches;
  let portrait = touch && innerWidth < innerHeight;
  document.body.classList.toggle('touch', touch);
  function sizeRenderer() {
    const pixelRatio = touch
      ? Math.min(devicePixelRatio, 1.25, Math.sqrt(650000 / (innerWidth * innerHeight)))
      : Math.min(devicePixelRatio, 1.5);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(innerWidth, innerHeight);
  }
  sizeRenderer();
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  $('view').append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '云上奇行：WASD 控制鹈鹕在飞机机翼上骑行');
  renderer.domElement.tabIndex = 0;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1400);
  const hemi = new T.HemisphereLight(0x9edcfc, 0x292345, 2.2);
  scene.add(hemi);
  const sunLight = new T.DirectionalLight(0xffc9ab, 2.7);
  sunLight.position.set(-80, 120, -100);
  scene.add(sunLight);
  const rim = new T.DirectionalLight(0x51e8e0, 2.5);
  rim.position.set(30, 10, 25);
  scene.add(rim);
  const kit = createPrimitives(T, renderer);
  const { white, pink, gold, mesh, ball, random } = kit;
  const environment = createEnvironment(T, scene, kit, hemi, sunLight, rim);
  const { aircraft } = environment;
  const riderView = createRider(T, scene, kit);
  const { rider, carrier, engineFlames, magicCloud, cloudHalo, bearCannons } = riderView;
  const exhaust = new T.Group();
  scene.add(exhaust);
  exhaust.visible = false;
  const plume = new T.ConeGeometry(0.38, 1, 12);
  plume.rotateX(Math.PI / 2);
  plume.translate(0, 0, 0.5);
  const plumeMaterial = new T.ShaderMaterial({
    uniforms: { clock: { value: 0 }, pulse: { value: 0 } },
    vertexShader: `
      varying float axial;
      void main() {
        axial = position.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform float clock;
      uniform float pulse;
      varying float axial;
      void main() {
        float bands = .72 + .28 * sin(axial * 87. - clock * 85.);
        vec3 tint = mix(vec3(.9, 1., 1.), vec3(.06, .46, 1.), smoothstep(0., .65, axial));
        gl_FragColor = vec4(tint, pow(1. - axial, 1.55) * bands * (.65 + .32 * pulse));
      }`,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  for (const x of [-0.8, 0.8]) {
    const jet = new T.Mesh(plume, plumeMaterial);
    jet.position.x = x;
    exhaust.add(jet);
  }
  const streakGeometry = new T.BufferGeometry();
  const streakPoints = [];
  for (const side of [-1, 1])
    for (let i = 0; i < 7; i++) {
      const x = side * (2.6 + i * 0.64),
        y = Math.sin(i * 2.4) * 2,
        z = (i % 3) * 0.5;
      streakPoints.push(x, y, z, x * 1.3, y, z + 0.65);
    }
  streakGeometry.setAttribute('position', new T.Float32BufferAttribute(streakPoints, 3));
  const streaks = new T.LineSegments(
    streakGeometry,
    new T.LineBasicMaterial({
      color: 0x8cfaff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  exhaust.add(streaks);
  const vfx = new RiderVFX(scene, camera);
  const six = createSixSkills(T, scene, camera, vfx);
  const swarm = createSwarm(T, scene, vfx);
  const lockGeometry = new T.TorusGeometry(1.5, 0.06, 6, 32),
    rocketGeometry = new T.ConeGeometry(0.23, 1.2, 7),
    rocketPink = new T.MeshBasicMaterial({ color: 0xff4477 }),
    rocketIce = new T.MeshBasicMaterial({ color: 0x88ffff });
  const enemyVisuals = Array.from({ length: 8 }, () => {
    const g = new T.Group();
    scene.add(g);
    const rocket = mesh(g, rocketGeometry, rocketPink);
    rocket.rotation.x = Math.PI / 2;
    const flame = ball(g, gold, 0, 0, -1, 0.12, 0.12, 0.7);
    const lock = mesh(scene, lockGeometry, pink);
    return { g, lock };
  });
  const shotVisuals = Array.from({ length: 8 }, () => {
    const g = new T.Group();
    scene.add(g);
    const rocket = mesh(g, rocketGeometry, rocketIce);
    rocket.rotation.x = -Math.PI / 2;
    ball(g, white, 0, 0, 0.8, 0.09, 0.09, 0.7);
    return g;
  });
  const fleet = createFleet(T, scene);
  function syncAbilities() {
    fleet.update(state, world.origin);
    const boss = state.battle.enemies[12];
    $('boss-hud').hidden = !boss.active;
    $('boss-life').max = boss.maxHp;
    $('boss-life').value = boss.hp;
    $('boss-impact').value = boss.stagger > 0 ? 120 : boss.impact;
    $('boss-hud').classList.toggle('broken', boss.stagger > 0);
    $('boss-impact-label').textContent =
      boss.stagger > 0
        ? '失衡 ' + boss.stagger.toFixed(1) + 's · R/F 爆发 ×1.75'
        : '姿态压力 · ' + Math.round((boss.impact / 120) * 100) + '% · Q/E/V 压制';
    $('boss-phase').textContent =
      boss.stagger > 0
        ? '核心失衡 · 伤害 ×1.75 · ' + boss.stagger.toFixed(1) + 's'
        : state.swarm.attack
          ? (state.swarm.attack === 1 ? '弹幕墙' : '横扫主炮') +
            ' · ' +
            (state.swarm.attackTime < 1.8
              ? '蓄能 ' + (1.8 - state.swarm.attackTime).toFixed(1) + 's'
              : '开火')
          : boss.fire < 1.1
            ? '齐射蓄能 · ' + Math.max(0, boss.fire).toFixed(1) + 's'
            : boss.phase
              ? '母舰 · 狂暴齐射'
              : '母舰 · 装甲核心';

    carrier.visible = state.mode === 1 || state.mode === 2;
    carrier.position.set(state.x, state.y, state.z);
    carrier.rotation.z = state.roll * 0.4;
    engineFlames.forEach((f, i) => {
      f.scale.set(0.14, 0.14, state.mode === 2 ? 1.5 : 0.8);
    });
    magicCloud.visible = state.mode === 3;
    magicCloud.position.set(state.x, state.y, state.z);
    cloudHalo.rotation.z = ambient * 4;

    bearCannons.forEach((c) => (c.rotation.x = state.fireCooldown > 0.2 ? -0.15 : 0));
    state.missiles.forEach((m, i) => {
      const v = enemyVisuals[i];
      v.g.visible = m.active;
      v.g.position.set(m.x, m.y, -(m.d - world.origin * 64));
      v.lock.visible = m.active && m.phase === 0;
      v.lock.position.set(m.x, m.y, state.z - 8);
      v.lock.scale.setScalar(0.7 + Math.max(0, m.clock) * 0.5);
    });
    state.shots.forEach((b, i) => {
      const v = shotVisuals[i];
      v.visible = b.active;
      v.position.set(b.x, b.y, -(b.d - world.origin * 64));
    });
  }

  let world = InfiniteRoad.create(431);
  const roadView = createRoadView(T, scene, kit, aircraft),
    roadPool = roadView.pool;
  function syncRoad() {
    roadView.update(world, state, ambient);
  }
  const particleGeo = new T.BufferGeometry(),
    particlePositions = new Float32Array(180 * 3),
    particleColors = new Float32Array(180 * 3),
    particles = [];
  for (let i = 0; i < 180; i++) {
    particles.push({ life: 0, vx: 0, vy: 0, vz: 0 });
    particlePositions[i * 3 + 1] = -100;
    particleColors.set([0.3, 1, 0.8], i * 3);
  }
  particleGeo.setAttribute('position', new T.BufferAttribute(particlePositions, 3));
  particleGeo.setAttribute('color', new T.BufferAttribute(particleColors, 3));
  const sparks = new T.Points(
    particleGeo,
    new T.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  scene.add(sparks);
  let particleCursor = 0;
  function burst(x, y, z, isPink = false) {
    for (let k = 0; k < 20; k++) {
      const i = particleCursor++ % 180,
        p = particles[i];
      p.life = 0.7 + random() * 0.5;
      p.vx = (random() - 0.5) * 8;
      p.vy = 2 + random() * 5;
      p.vz = (random() - 0.5) * 8;
      particlePositions.set([x, y, z], i * 3);
      particleColors.set(isPink ? [1, 0.25, 0.55] : [0.4, 1, 0.8], i * 3);
    }
    particleGeo.attributes.color.needsUpdate = true;
  }
  // Audio starts inside the first keyboard/button gesture, so browser autoplay rules are respected.
  const sound = createBattleAudio();
  let musicOn = false,
    audioContext;
  function setMusic(on) {
    try {
      musicOn = sound.enable(on);
      audioContext = sound.context;
    } catch {
      $('sound-state').textContent = '音频不可用，可继续静音游戏';
      musicOn = false;
    }
    $('music').textContent = (musicOn ? '♫ 声音：开' : '♫ 声音：关') + (touch ? '' : ' · M');
    $('music').setAttribute('aria-pressed', String(musicOn));
  }
  function scheduleMusic() {
    sound.update(state);
  }
  let state = InfiniteRoad.fresh();
  state.status = 'ready';
  let ambient = 0,
    dayMode = 2,
    lastTime = null,
    fpsTime = 0,
    fpsFrames = 0,
    lastFps = 0,
    noticeUntil = 0,
    lastHud = -1;
  const controls = createControls({
      getState: () => state,
      start,
      pause,
      toggleSound: () => setMusic(!musicOn),
    }),
    input = controls.input,
    clearInput = controls.clear;
  let reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  $('motion').checked = reduced;
  $('motion').addEventListener('change', () => {
    reduced = $('motion').checked;
  });

  function notice(message) {
    $('banner').textContent = message;
    noticeUntil = ambient + 2.5;
  }
  function start() {
    if (state.status === 'ready') setMusic(true);
    sound.stop();
    six.reset();
    swarm.reset();
    vfx.reset();
    clearInput();
    world = InfiniteRoad.create(431);
    state = InfiniteRoad.fresh();
    roadPool.forEach((v) => (v.index = -999));
    $('overlay').hidden = true;
    $('pause').disabled = false;
    $('pause').textContent = 'Ⅱ 暂停';
    $('hud').classList.remove('paused');
    $('hud').classList.add('running');
    $('banner').textContent = '';
    camera.position.set(portrait ? 1.2 : 8, 8, portrait ? 15 : 12);
    renderer.domElement.focus({ preventScroll: true });
  }
  function end(reason) {
    clearInput();
    $('hud').classList.remove('running');
    $('overlay').hidden = false;
    $('pause').disabled = true;
    $('overline').textContent = 'RUN COMPLETE / 下次更远';
    $('panel-title').textContent = reason === 'crash' ? '撞击过载。' : '坠入云海。';
    $('subtitle').textContent = '休息一秒，再挑战自己的极限。';
    $('description').textContent =
      `本次骑行 ${Math.floor(state.distance)} 米 · 收集 ${state.count} 环 · 擦身 ${state.near} 次 · 得分 ${Math.floor(state.distance) + state.score}`;
    $('mission').innerHTML =
      '青色光环引导安全路线，粉色移动障碍需要绕行或起跳。<br>窄桥前松开 Shift；按 S 减速，空格起跳；金色跳板会自动弹起。';
    if (touch) $('mission').textContent = '窄桥前按住刹车，遇到障碍可点起跳。';
    $('start').textContent = '↻ 再骑一局';
    $('start').disabled = false;
    $('start').onclick = start;
    $('start').focus({ preventScroll: true });
  }
  function pause() {
    if (!['playing', 'paused'].includes(state.status)) return;
    const paused = state.status === 'playing';
    state.status = paused ? 'paused' : 'playing';
    if (paused) sound.stop();
    clearInput();
    $('pause').textContent = paused ? '▶ 继续' : 'Ⅱ 暂停';
    $('hud').classList.toggle('paused', paused);
    $('next').textContent = paused
      ? touch
        ? '已暂停 · 点击继续'
        : '已暂停 · 按 P 或点击继续'
      : nextText();
  }
  function nextText() {
    if (touch) {
      if (state.falling) return '正在坠落 · 点任一飞行技能自救';
      const side = SwarmCombat.threat(state);
      if (side || state.missiles.some((m) => m.active)) return '来弹接近 · 横移 / 清弹';
      return state.mode || state.pelicanTime > 0 ? '飞行中' : '长按方向转向 · 点按技能';
    }
    const side = SwarmCombat.threat(state);
    if (side) return '⚠ ' + side + '炮弹接近 · 横移 / C 清弹';
    const threat = state.missiles.find((m) => m.active);
    if (threat)
      return threat.phase === 0
        ? '⚠ 导弹锁定 ' + Math.max(0, threat.clock).toFixed(1) + 's · Z 拦截 / C 熊吼'
        : '导弹来袭！横移躲避 / C 清弹 / 3 筋斗云';
    if (state.mode)
      return (
        ['', 'Ⅰ 飞机推进 · 自动辅助转向', 'Ⅱ 四发超燃 · 保持警戒', 'Ⅲ 筋斗云 · 无敌突进'][
          state.mode
        ] +
        ' · ' +
        state.modeTime.toFixed(1) +
        's'
      );
    const slot = world.at(state.distance),
      p = InfiniteRoad.profile(slot.tile, (state.distance % 64) / 64);
    return state.y > 0.2
      ? '腾空中 · A / D 修正落点'
      : slot.tile.hazard && slot.index % 3 === 1
        ? '⚠ 横栏！踩金色跳板弹起 / 空格手动起跳'
        : p.w < 4
          ? '⚠ 高速窄桥 · S 减速，盯紧落点'
          : slot.tile.hazard
            ? '⚠ 移动障碍 · 侧身绕行 / 空格跃过'
            : slot.tile.a !== slot.tile.b
              ? '↝ 高速变线 · 提前转向'
              : 'Shift 极限冲刺 · 空格腾空';
  }
  $('start').disabled = false;
  $('start').textContent = '开始骑行  ↗';
  $('start').onclick = start;
  $('pause').onclick = () => {
    pause();
    renderer.domElement.focus({ preventScroll: true });
  };
  $('music').onclick = () => {
    setMusic(!musicOn);
    renderer.domElement.focus({ preventScroll: true });
  };
  $('day').onclick = () => {
    dayMode = (dayMode + 1) % 3;
    $('day').textContent = ['☾ 日夜：自动', '☀ 日夜：白昼', '☾ 日夜：霓虹'][dayMode];
    renderer.domElement.focus({ preventScroll: true });
  };
  for (let i = 0; i < 6; i++) controls.bind($('six' + i), 'six' + i);
  for (const [id, key, hold] of [
    ['power1', 'tier1'],
    ['power2', 'tier2'],
    ['power3', 'tier3'],
    ['fire-button', 'fire', true],
    ['roar-button', 'roar'],
    ['pelican-button', 'pelican'],
    ['touch-left', 'left', true],
    ['touch-right', 'right', true],
    ['touch-brake', 'brake', true],
    ['touch-boost', 'boost', true],
    ['touch-jump', 'jump'],
  ])
    controls.bind($(id), key, hold);
  if (touch) {
    $('description').textContent = '自动前进。600 米后母舰入场，打满姿态条可进入火力超载。';
    $('mission').textContent =
      '长按方向键转向，可同时冲刺或施放技能。坠落时点飞机、筋斗云或鹈鹕自救。';
    $('focus-note').textContent = '';
    for (const [id, label] of [
      ['pelican-button', '鹈鹕'],
      ['power1', '推进'],
      ['power2', '超燃'],
      ['power3', '筋斗云'],
      ['fire-button', '肩炮'],
      ['roar-button', '清弹'],
    ])
      $(id).querySelector('span').textContent = label;
  }
  window.addEventListener('resize', () => {
    clearInput();
    portrait = touch && innerWidth < innerHeight;
    sizeRenderer();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (state.status === 'playing') pause();
    $('overlay').hidden = false;
    $('panel-title').textContent = '画面连接中断';
    $('description').textContent = '显卡上下文丢失，请刷新页面重新生成世界。';
    $('mission').hidden = true;
    $('start').textContent = '刷新重试';
    $('start').onclick = () => location.reload();
  });
  const cameraTarget = new T.Vector3(),
    cameraPos = new T.Vector3();
  camera.position.set(12, 10, 23);
  camera.lookAt(0, 2, -5);
  function update(timeMs) {
    const time = timeMs / 1000,
      rawDt = lastTime === null ? 0 : time - lastTime,
      dt = Math.min(0.05, rawDt);
    lastTime = time;
    if (state.status !== 'paused') ambient += dt;
    if (state.status === 'playing') {
      controls.sample();
      const oldOrigin = world.origin,
        events = InfiniteRoad.step(state, input, dt, world),
        shift = (world.origin - oldOrigin) * 64;
      if (shift) {
        vfx.rebase(shift);
        camera.position.z += shift;
        cameraTarget.z += shift;
        for (let i = 0; i < particles.length; i++)
          if (particles[i].life > 0) particlePositions[i * 3 + 2] += shift;
      }
      for (const event of events) {
        vfx.trigger(event, state, world.origin);
        sound.event(event, state);
        if (typeof event === 'string' && /^six[0-5]$/.test(event)) six.cast(+event.slice(3));
        if (typeof event !== 'string') {
          if (event.type === 'armor-break')
            notice(event.boss ? '母舰装甲剥离！继续压制核心' : '重装护卫装甲破裂');
          if (event.type === 'enemy-stagger')
            notice(event.boss ? '母舰失衡！现在集火 · 伤害 ×1.75' : '护卫失衡！追击');
          continue;
        }
        if (event === 'overload') {
          notice('火力超载！六招无冷却 · 飞行推力提升');
          vfx.trauma = Math.max(vfx.trauma, 0.8);
          burst(state.x, state.y + 1, state.z);
        }
        if (event.startsWith('tier'))
          notice(['', '飞机一级推进！', '飞机二级超燃！', '悟空：筋斗云！'][state.mode]);
        if (event === 'boss-area-warning')
          notice(
            state.swarm.attack === 1
              ? '母舰弹幕墙！绿色走廊是缺口 · C 清弹'
              : '母舰横扫蓄能！红色区域将从左向右扫射 · 3 无敌穿越',
          );
        if (event === 'boss-area-fire') {
          vfx.trauma = Math.max(vfx.trauma, 0.6);
        }
        if (event === 'rescue') notice('飞行救援！冲破云海，接回航线');
        if (event === 'edge') notice('正在坠落！5 秒内按 1 / 2 / 3 / 4 起飞自救');
        if (event === 'wave') notice('蜂群两翼包抄 · Z 肩炮 / Q E R F V X 清场');
        if (event === 'boss') notice('空中母舰来袭！攻击红色核心');
        if (event === 'boss-rage') notice('母舰狂暴！弹幕墙 / 扫射交替 · C 清弹 / 3 护航');
        if (event === 'boss-down') notice('母舰击破！+3000 · 耐久恢复');
        if (event === 'pelican') {
          notice('鹈鹕：吞天嗝！风暴清场');
        }

        if (event === 'incoming') notice('来袭！横移 / 清弹 / 筋斗云');
        if (event === 'roar') {
          notice('北极熊咆哮！清弹护盾');
        }

        if (event === 'blast')
          burst(
            state.lastBlast.x,
            state.lastBlast.y,
            -(state.lastBlast.d - world.origin * 64),
            true,
          );
        if (event === 'kill') notice('拦截成功 +150 · 能量补充');
        if (event === 'dodge') notice('极限躲弹 +100');
        if (event === 'power-end') notice('动力结束 · 接回赛道');
        if (event === 'ring') {
          burst(state.x, 2.5, state.z);
        }
        if (event === 'hit') {
          burst(state.x, 2, state.z, true);
          notice('撞击！耐久 -1，立即减速。');
        }
        if (event === 'jump' || event === 'launch') {
          notice(event === 'launch' ? '跳板弹射！空中修正落点' : '腾空！');
        }
        if (event === 'land' && state.speed > 30) burst(state.x, 0.3, state.z);
        if (event === 'near') {
          notice('极限穿越 ×' + Math.min(5, state.combo) + ' · +' + 75 * Math.min(5, state.combo));
        }
        if (['fall', 'crash'].includes(event)) end(event);
      }
    }
    environment.update(state, camera, ambient, dayMode, dt);
    const moving = riderView.update(state, ambient, reduced);
    const overloading = state.overload > 0;
    exhaust.visible = overloading && !!(state.mode || state.pelicanTime > 0);
    streaks.visible = !reduced;
    if (exhaust.visible) {
      exhaust.position.set(state.x, state.y + 0.4, state.z + 0.8);
      const pulse = Math.min(1, vfx.impactKick);
      plumeMaterial.uniforms.clock.value = reduced ? 0 : ambient;
      plumeMaterial.uniforms.pulse.value = pulse;
      exhaust.scale.set(1 + pulse * 0.2, 1.6, 13 + state.speed * 0.075 + pulse * 3);
      streaks.position.z = reduced ? 0 : (ambient * state.speed * 0.043) % 1;
      exhaust.rotation.z = state.roll * 0.4;
    }
    syncRoad();
    syncAbilities();
    six.update(state.status === 'paused' ? 0 : dt, state);
    swarm.update(state.status === 'paused' ? 0 : dt, state, world.origin);
    vfx.update(state.status === 'paused' ? 0 : dt, state, reduced);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.life > 0) {
        p.life -= dt;
        particlePositions[i * 3] += p.vx * dt;
        particlePositions[i * 3 + 1] += p.vy * dt;
        p.vy -= 8 * dt;
        particlePositions[i * 3 + 2] += p.vz * dt;
      } else particlePositions[i * 3 + 1] = -100;
    }
    particleGeo.attributes.position.needsUpdate = true;
    const targetFov = reduced
      ? 55
      : 57 +
        Math.min(30, Math.max(0, state.speed - 20) * 0.65) +
        vfx.impactKick * 7 +
        (overloading ? 9 : 0);
    camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 3));
    camera.updateProjectionMatrix();
    const zoom =
      state.status === 'ready' ? 1.05 : state.pelicanTime > 0 ? 1.65 : state.mode ? 1.5 : 1;
    cameraPos.set(
      state.x + (portrait ? 1.2 : 6.2) * zoom,
      Math.max(-8, state.y * 0.85) + 6.8 * zoom,
      state.z + (portrait ? 15 : 10.5) * zoom,
    );
    if (!reduced && moving) {
      cameraPos.y += Math.sin(ambient * state.speed) * 0.035;
      cameraPos.x += Math.sin(ambient * 2) * 0.08;
    }
    vfx.unshake(camera);
    camera.position.lerp(cameraPos, 1 - Math.exp(-dt * (reduced ? 15 : 5)));
    cameraTarget.set(state.x, Math.max(-8, state.y * 0.85) + 2.2, state.z - (portrait ? 5 : 8));
    camera.lookAt(cameraTarget);
    vfx.shake(camera, reduced || state.status === 'paused');
    if (time - lastHud > 0.1) {
      lastHud = time;
      updateHud($, state, ambient, noticeUntil, nextText);
    }

    fpsTime += rawDt;
    fpsFrames++;
    if (fpsTime >= 1) {
      lastFps = Math.round(fpsFrames / fpsTime);
      $('perf').textContent =
        `${lastFps} FPS · ${renderer.domElement.width} × ${renderer.domElement.height} · 地图 ${world.stats.slots}/12 · 几何 ${renderer.info.memory.geometries} · 贴图 ${renderer.info.memory.textures}`;
      fpsFrames = 0;
      fpsTime = 0;
    }
    $('cloud-dive').style.opacity = state.falling
      ? String(Math.min(0.8, state.fallTime * 0.16))
      : 0;
    $('impact-flash').style.opacity = reduced ? 0 : String(vfx.flash * 0.32);
    $('rush-vignette').classList.toggle('overload', overloading);
    $('rush-vignette').style.opacity =
      !reduced && state.status === 'playing'
        ? String(
            Math.max(
              state.hit * 0.6,
              overloading ? 0.95 : state.mode ? 0.7 : input.boost && state.energy > 1 ? 0.6 : 0,
            ),
          )
        : 0;
    scheduleMusic();
    renderer.info.reset();
    renderer.render(scene, camera);
    six.syncCamera();
    renderer.autoClear = false;
    renderer.render(six.root, six.camera);
    renderer.autoClear = true;
  }
  renderer.info.autoReset = false;
  renderer.setAnimationLoop(update);
  if (new URLSearchParams(location.search).has('audit'))
    window.auditSix = (i, steps = 0) => {
      six.cast(i);
      for (let n = 0; n < steps; n++) six.update(1 / 60, state);
      renderer.info.reset();
      renderer.render(scene, camera);
      six.syncCamera();
      renderer.autoClear = false;
      renderer.render(six.root, six.camera);
      renderer.autoClear = true;
      return six.stats;
    };
  if (new URLSearchParams(location.search).has('audit'))
    window.auditFall = () => {
      start();
      state.falling = true;
      state.y = -12;
      state.vy = -5;
      return window.wingRider.snapshot;
    };
  if (new URLSearchParams(location.search).has('audit'))
    window.auditBattle = (destroy = false) => {
      start();
      state.distance = 650;
      world.sync(650);
      state.z = -(650 - world.origin * 64);
      SkyBattle.step(state, 0, []);
      SwarmCombat.step(state, 0.001, []);
      state.status = 'paused';
      if (destroy) {
        const events = [];
        SkyBattle.hit(state, state.battle.enemies[12], 9999, events);
        for (const e of events) vfx.trigger(e, state, world.origin);
      }
      syncRoad();
      syncAbilities();
      vfx.update(0.15, state, false);
      return window.wingRider.snapshot;
    };
  if (new URLSearchParams(location.search).has('audit'))
    window.auditVFX = (mode, event = 'roar', steps = 0) => {
      state.status = 'paused';
      state.pelicanTime = event === 'pelican' ? 4 : 0;
      state.mode = mode;
      state.y = mode === 3 ? 7 : 4;
      state.z = 0;
      syncAbilities();
      rider.position.set(state.x, state.y, 0);
      vfx.trigger(event, state, world.origin);
      sound.event(event, state);
      for (let i = 0; i < steps; i++) vfx.update(1 / 60, state, true);
      vfx.update(0, state, true);
      camera.position.set(state.x + 12, state.y + 9, 19);
      camera.lookAt(state.x, state.y + 1, 0);
      renderer.info.reset();
      renderer.render(scene, camera);
      six.syncCamera();
      renderer.autoClear = false;
      renderer.render(six.root, six.camera);
      renderer.autoClear = true;
      return window.wingRider.snapshot;
    };
  if (new URLSearchParams(location.search).has('audit'))
    window.auditStep = (distance) => {
      state.status = 'paused';
      state.distance = distance;
      world.sync(distance);
      state.z = -(distance - world.origin * 64);
      syncRoad();
      renderer.info.reset();
      renderer.render(scene, camera);
      six.syncCamera();
      renderer.autoClear = false;
      renderer.render(six.root, six.camera);
      renderer.autoClear = true;
      return window.wingRider.snapshot;
    };

  // Read-only diagnostics for local verification, without changing gameplay state.
  Object.defineProperty(window, 'wingRider', {
    value: {
      get status() {
        return state.status;
      },
      get snapshot() {
        return {
          x: state.x,
          z: state.z,
          vx: state.vx,
          distance: state.distance,
          y: state.y,
          vy: state.vy,
          jumps: state.jumps,
          combo: state.combo,
          health: state.health,
          energy: state.energy,
          speed: state.speed,
          rings: state.count,
          falling: state.falling,
          fps: lastFps,
          music: musicOn,
          audio: sound.stats,
          audioState: audioContext?.state || 'not-started',
          dayMode,
          mode: state.mode,
          enemies: state.battle.enemies.filter((e) => e.active).length,
          bossHp: state.battle.enemies[12].hp,
          modeTime: state.modeTime,
          pelicanTime: state.pelicanTime,
          pelicanCooldown: state.pelicanCooldown,
          cooldowns: [...state.cooldowns],
          ammo: state.ammo,
          shield: state.shield,
          kills: state.kills,
          enemyActive: state.missiles.filter((m) => m.active).length,
          shotActive: state.shots.filter((m) => m.active).length,
          missilePool: state.missiles.length,
          shotPool: state.shots.length,
          six: six.stats,
          swarm: swarm.stats,
          gpuParticles: vfx.gpuSystems.reduce((n, p) => n + p.countLive(vfx.time), 0),
          gpuCapacity: vfx.gpuSystems.reduce((n, p) => n + p.capacity, 0),
          drawCalls: renderer.info.render.calls,
          stream: world.stats,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          sceneObjects: (() => {
            let n = 0;
            scene.traverse(() => n++);
            return n;
          })(),
        };
      },
    },
    writable: false,
  });
})();
