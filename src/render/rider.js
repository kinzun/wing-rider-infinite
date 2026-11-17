function createRider(T, scene, kit) {
  const {
    mat,
    white,
    whiteShade,
    dark,
    pink,
    cyan,
    gold,
    orange,
    metal,
    mesh,
    ball,
    block,
    rod,
    canvasTexture,
  } = kit;
  // One bicycle, all geometry built here. Local forward is -Z.
  const rider = new T.Group();
  rider.scale.setScalar(1.15);
  scene.add(rider);
  const wheels = [];
  for (const z of [-1, 1]) {
    const w = new T.Group();
    w.position.set(0, 0.66, z);
    rider.add(w);
    const tire = mesh(w, new T.TorusGeometry(0.59, 0.085, 8, 24), dark);
    tire.rotation.y = Math.PI / 2;
    const rimMesh = mesh(w, new T.TorusGeometry(0.51, 0.025, 6, 24), cyan);
    rimMesh.rotation.y = Math.PI / 2;
    for (let a = 0; a < Math.PI; a += Math.PI / 4)
      rod(
        w,
        [0, Math.sin(a) * 0.5, Math.cos(a) * 0.5],
        [0, -Math.sin(a) * 0.5, -Math.cos(a) * 0.5],
        0.014,
        metal,
      );
    rod(w, [-0.15, 0, 0], [0.15, 0, 0], 0.07, gold);
    wheels.push(w);
  }
  const bikeLines = [
    [
      [0, 0.66, 1],
      [0, 0.72, -0.1],
    ],
    [
      [0, 0.72, -0.1],
      [0, 1.45, 0.5],
    ],
    [
      [0, 1.45, 0.5],
      [0, 0.66, 1],
    ],
    [
      [0, 1.45, 0.5],
      [0, 1.5, -0.7],
    ],
    [
      [0, 1.5, -0.7],
      [0, 0.72, -0.1],
    ],
    [
      [0, 1.5, -0.7],
      [0, 0.66, -1],
    ],
    [
      [0, 1.5, -0.7],
      [0, 1.9, -0.83],
    ],
  ];
  bikeLines.forEach(([a, b]) => rod(rider, a, b, 0.045, pink));
  rod(rider, [-0.4, 1.9, -0.83], [0.4, 1.9, -0.83], 0.04, cyan);
  ball(rider, dark, 0, 1.5, 0.5, 0.29, 0.08, 0.23);
  const pedals = new T.Group();
  pedals.position.set(0, 0.72, -0.1);
  rider.add(pedals);
  rod(pedals, [-0.25, 0.2, 0], [0.25, -0.2, 0], 0.035, metal);
  block(pedals, dark, -0.32, 0.2, 0, 0.25, 0.06, 0.15);
  block(pedals, dark, 0.32, -0.2, 0, 0.25, 0.06, 0.15);
  const bird = new T.Group();
  rider.add(bird);
  ball(bird, white, 0, 2.12, 0.1, 0.61, 0.69, 0.85);
  ball(bird, whiteShade, 0, 2.13, 0.68, 0.4, 0.38, 0.7);
  const neck = ball(bird, white, 0.65, 2.82, -1.05, 0.22, 0.8, 0.25);
  neck.rotation.x = -0.6;
  neck.rotation.z = -0.45;
  ball(bird, white, 1.2, 3.43, -1.5, 0.35, 0.36, 0.41);
  const bill = ball(bird, orange, 1.2, 3.3, -2.23, 0.22, 0.14, 0.76);
  const pouch = ball(bird, mat(0xdb8ea1), 1.2, 3.05, -2.03, 0.26, 0.34, 0.55);
  for (const x of [-0.3, 0.3]) {
    ball(bird, gold, 1.2 + x, 3.48, -1.63, 0.09);
    ball(bird, dark, 1.2 + x * 1.04, 3.48, -1.67, 0.045);
  }
  rod(bird, [-0.22, 1.65, 0.15], [-0.24, 0.95, -0.1], 0.055, gold);
  rod(bird, [0.22, 1.65, 0.15], [0.24, 0.65, 0.04], 0.055, gold);
  block(bird, gold, -0.24, 0.93, -0.25, 0.18, 0.055, 0.35);
  block(bird, gold, 0.24, 0.63, -0.12, 0.18, 0.055, 0.35);
  const scarf = ball(bird, pink, 0, 2.86, -0.64, 0.26, 0.12, 0.3);
  const ribbon = ball(bird, pink, 0, 2.7, 0.01, 0.09, 0.11, 0.67);
  ribbon.rotation.x = 0.2;
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new T.Group();
    w.position.set(side * 0.4, 2.57, 0.1);
    bird.add(w);
    const base = ball(w, white, side * 0.7, 0, 0, 0.9, 0.12, 0.5);
    base.rotation.z = side * 0.08;
    for (let i = 0; i < 11; i++) {
      const f = ball(
        w,
        i % 3 === 0 ? whiteShade : white,
        side * (0.35 + i * 0.13),
        -0.01,
        0.14 + i * 0.075,
        0.105,
        0.055,
        0.59 - i * 0.017,
      );
      f.rotation.y = side * (-0.1 - i * 0.05);
    }
    wings.push(w);
  }
  const bear = new T.Group();
  bear.position.set(0, 2.72, 0.23);
  bear.rotation.y = -Math.PI / 2;
  rider.add(bear);
  // A neutral fur shader preserves the polar bear's ivory silhouette in neon light.
  const polarFur = new T.ShaderMaterial({
    vertexShader: `varying vec3 n;void main(){n=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 n;void main(){float light=.76+.24*max(dot(normalize(n),normalize(vec3(.4,1.,.6))),0.);gl_FragColor=vec4(vec3(.96,.945,.89)*light,1.);}`,
  });
  const polarDark = new T.MeshBasicMaterial({ color: 0x151b21 }),
    polarInner = new T.MeshBasicMaterial({ color: 0xb1aaa0 });
  ball(bear, polarFur, 0, 0.91, 0.12, 0.55, 0.58, 1.02);
  ball(bear, polarFur, 0, 1.04, -0.45, 0.49, 0.6, 0.57);
  const bearNeck = ball(bear, polarFur, 0, 1.22, -0.92, 0.34, 0.39, 0.65);
  bearNeck.rotation.x = -0.25;
  ball(bear, polarFur, 0, 1.42, -1.4, 0.36, 0.32, 0.44);
  ball(bear, polarFur, 0, 1.3, -1.79, 0.25, 0.2, 0.42);
  ball(bear, polarFur, 0, 1.19, -1.75, 0.21, 0.1, 0.35);
  ball(bear, polarDark, 0, 1.35, -2.14, 0.155, 0.105, 0.085);
  for (const side of [-1, 1]) {
    ball(bear, polarFur, side * 0.28, 1.69, -1.24, 0.115, 0.14, 0.09);
    ball(bear, polarInner, side * 0.28, 1.7, -1.315, 0.058, 0.078, 0.018);
    ball(bear, polarDark, side * 0.267, 1.47, -1.64, 0.036, 0.04, 0.027);
    ball(bear, new T.MeshBasicMaterial({ color: 0xffffff }), side * 0.277, 1.48, -1.661, 0.01);
    rod(bear, [side * 0.17, 1.2, -1.96], [side * 0.22, 1.19, -1.76], 0.012, polarDark);
    for (const z of [-0.66, 0.73]) {
      ball(bear, polarFur, side * 0.4, 0.48, z, 0.22, 0.49, 0.24);
      ball(bear, polarFur, side * 0.42, 0.13, z - 0.09, 0.255, 0.14, 0.34);
      for (let toe = -1; toe <= 1; toe++)
        ball(bear, polarInner, side * 0.42 + toe * 0.095, 0.095, z - 0.39, 0.025, 0.025, 0.055);
    }
  }
  ball(bear, polarFur, 0, 1.01, 1.13, 0.13, 0.16, 0.16);
  const wukong = new T.Group();
  wukong.position.set(0, 4.04, 0.32);
  wukong.rotation.y = -2.15;
  rider.add(wukong);
  // Keep the hero's warm palette readable under the cyan arcade lighting.
  const fur = new T.MeshBasicMaterial({ color: 0xc97b28 }),
    furLight = new T.MeshBasicMaterial({ color: 0xf0b34e }),
    face = new T.MeshBasicMaterial({ color: 0xffd3a0 }),
    red = new T.MeshBasicMaterial({ color: 0xc52d35 }),
    heroGold = new T.MeshBasicMaterial({ color: 0xffce53 }),
    ink = new T.MeshBasicMaterial({ color: 0x34201c }),
    cream = new T.MeshBasicMaterial({ color: 0xfff2ce });
  ball(wukong, heroGold, 0, 0.47, 0, 0.29, 0.46, 0.23);
  block(wukong, red, 0, 0.21, -0.02, 0.63, 0.11, 0.48);
  for (const side of [-1, 1]) {
    const x = side * 0.32;
    ball(wukong, fur, x, 0.03, 0, 0.13, 0.3, 0.15);
    block(wukong, ink, x, -0.2, -0.12, 0.18, 0.13, 0.34);
    ball(wukong, heroGold, x, 0.65, 0, 0.16, 0.14, 0.2);
    const skirt = ball(wukong, furLight, side * 0.17, 0.14, -0.05, 0.2, 0.2, 0.29);
    for (let k = 0; k < 3; k++) {
      const stripe = block(wukong, ink, side * (0.08 + k * 0.07), 0.14, -0.33, 0.035, 0.22, 0.012);
      stripe.rotation.z = side * 0.4;
    }
  }
  const head = new T.Group();
  head.position.set(0, 1.04, -0.01);
  wukong.add(head);
  ball(head, fur, 0, 0.06, 0, 0.37, 0.4, 0.3);
  for (const side of [-1, 1]) {
    ball(head, fur, side * 0.37, 0.05, 0, 0.15, 0.19, 0.1);
    ball(head, face, side * 0.39, 0.05, -0.075, 0.09, 0.12, 0.035);
    ball(head, face, side * 0.13, 0.07, -0.265, 0.18, 0.24, 0.085);
    ball(head, cream, side * 0.13, 0.085, -0.35, 0.105, 0.055, 0.025);
    ball(head, ink, side * 0.12, 0.08, -0.374, 0.032, 0.046, 0.018);
    rod(head, [side * 0.05, 0.19, -0.34], [side * 0.23, 0.235, -0.3], 0.035, fur);
    for (let k = 0; k < 3; k++) {
      const tuft = mesh(
        head,
        new T.ConeGeometry(0.09, 0.24, 5),
        furLight,
        side * (0.28 + k * 0.025),
        -0.08 - k * 0.07,
        0,
      );
      tuft.rotation.z = side * 0.8;
    }
  }
  ball(head, face, 0, -0.13, -0.29, 0.22, 0.14, 0.12);
  ball(head, fur, 0, -0.045, -0.39, 0.08, 0.05, 0.04);
  rod(head, [-0.09, -0.16, -0.397], [0.09, -0.16, -0.397], 0.014, ink);
  for (let i = -1; i <= 1; i++) {
    const tuft = mesh(head, new T.ConeGeometry(0.12, 0.26, 5), furLight, i * 0.12, 0.4, 0);
    tuft.rotation.z = -i * 0.3;
  }
  const headband = mesh(head, new T.TorusGeometry(0.345, 0.04, 8, 32), heroGold, 0, 0.26, 0);
  headband.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const curl = mesh(
      head,
      new T.TorusGeometry(0.065, 0.022, 6, 16, Math.PI * 1.65),
      heroGold,
      side * 0.065,
      0.26,
      -0.335,
    );
    curl.rotation.z = (side * Math.PI) / 2;
  }
  ball(wukong, red, 0, 0.78, 0, 0.3, 0.075, 0.24);
  const capeShape = new T.Shape();
  capeShape.moveTo(-0.25, 0.72);
  capeShape.lineTo(0.25, 0.72);
  capeShape.lineTo(0.44, -0.18);
  capeShape.lineTo(0.12, -0.09);
  capeShape.lineTo(-0.08, -0.2);
  capeShape.lineTo(-0.4, -0.12);
  capeShape.closePath();
  const cape = mesh(
    wukong,
    new T.ShapeGeometry(capeShape),
    new T.MeshBasicMaterial({ color: 0xb72231, side: T.DoubleSide }),
    0,
    0,
    0.28,
  );
  cape.rotation.x = 0.3;
  rod(wukong, [-0.52, -0.12, 0.36], [0.48, 1.52, 0.36], 0.045, red);
  rod(wukong, [0.35, 1.3, 0.36], [0.5, 1.56, 0.36], 0.06, heroGold);
  rod(wukong, [-0.55, -0.16, 0.36], [-0.4, 0.1, 0.36], 0.06, heroGold);
  const tail = new T.CatmullRomCurve3([
    new T.Vector3(0, 0.2, 0.25),
    new T.Vector3(0.5, 0.1, 0.55),
    new T.Vector3(0.72, 0.48, 0.65),
    new T.Vector3(0.58, 0.7, 0.58),
  ]);
  mesh(wukong, new T.TubeGeometry(tail, 16, 0.045, 6, false), fur);
  rod(wukong, [-0.3, 0.65, 0], [-0.39, 0.38, -0.34], 0.09, heroGold);
  ball(wukong, furLight, -0.39, 0.38, -0.34, 0.1);
  const drillArm = new T.Group();
  drillArm.position.set(0.22, 0.65, -0.03);
  wukong.add(drillArm);
  rod(drillArm, [0, 0, 0], [0.34, -0.13, -0.4], 0.09, heroGold);
  ball(drillArm, furLight, 0.34, -0.13, -0.4, 0.1);
  block(drillArm, heroGold, 0.34, -0.05, -0.54, 0.2, 0.17, 0.33);
  rod(drillArm, [0.34, -0.07, -0.7], [0.34, -0.07, -0.9], 0.025, metal);
  block(wukong, mat(0x9a6a6d), 0.4, 0.28, -0.82, 0.65, 0.06, 0.42);

  // Fixed ability models and projectile pools: never allocated during play.
  const carrier = new T.Group();
  scene.add(carrier);
  ball(carrier, metal, 0, -0.75, 0, 0.85, 0.65, 5.2);
  ball(carrier, cyan, 0, -0.25, -3, 0.65, 0.35, 1);
  const mainWing = block(carrier, whiteShade, 0, -0.12, 0.3, 14, 0.16, 2.4);
  block(carrier, whiteShade, 0, -0.3, 3.7, 5, 0.15, 1.2);
  block(carrier, pink, 0, 0.3, 4.2, 0.13, 1.8, 1.6);
  const engineFlames = [],
    flameMaterial = new T.MeshBasicMaterial({ color: 0xff932c });
  for (const x of [-4.8, -2.7, 2.7, 4.8]) {
    ball(carrier, metal, x, -0.65, 0.7, 0.45, 0.45, 1.3);
    ball(carrier, dark, x, -0.65, 2, 0.36, 0.36, 0.08);
    const flame = ball(carrier, flameMaterial, x, -0.65, 2.8, 0.3, 0.3, 0.9);
    engineFlames.push(flame);
    ball(carrier, cyan, x, -0.08, -0.85, 0.13);
  }
  const magicCloud = new T.Group();
  scene.add(magicCloud);
  const cloudGold = polarFur.clone();
  cloudGold.fragmentShader = cloudGold.fragmentShader.replace(
    'vec3(.96,.945,.89)',
    'vec3(1.,.8,.32)',
  );
  ball(magicCloud, cloudGold, 0, -0.25, 0, 2, 0.5, 1.25);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ball(magicCloud, cloudGold, Math.cos(a) * 1.6, -0.18, Math.sin(a) * 0.95, 0.8, 0.5, 0.7);
  }
  for (let i = 0; i < 5; i++)
    ball(
      magicCloud,
      cloudGold,
      Math.sin(i * 0.8) * 0.3,
      -0.3 + i * 0.04,
      1.5 + i * 0.8,
      0.65 - i * 0.09,
      0.3 - i * 0.03,
      0.65,
    );
  const cloudHalo = mesh(magicCloud, new T.TorusGeometry(2.8, 0.045, 6, 48), heroGold, 0, -0.25, 0);
  cloudHalo.rotation.x = Math.PI / 2;
  const bearCannons = [];
  for (const side of [-1, 1]) {
    const cannon = new T.Group();
    cannon.position.set(side * 0.65, 0.95, 0.2);
    bear.add(cannon);
    block(cannon, dark, 0, 0, 0, 0.3, 0.3, 0.8);
    ball(cannon, cyan, 0, 0, -0.45, 0.14, 0.14, 0.09);
    bearCannons.push(cannon);
  }
  const shadowTexture = canvasTexture(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  const shadow = mesh(
    scene,
    new T.PlaneGeometry(6, 5),
    new T.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
    0,
    0.025,
    0,
  );
  shadow.rotation.x = -Math.PI / 2;
  return {
    rider,
    carrier,
    engineFlames,
    magicCloud,
    cloudHalo,
    bearCannons,
    update(state, ambient, reduced) {
      const bob = reduced ? 0 : Math.sin(ambient * 1.4) * 0.06;
      rider.position.set(state.x, state.y + bob, state.z);
      rider.rotation.set(
        state.falling ? state.y * 0.035 : state.y > 0 ? -0.12 : 0,
        Math.atan2(-state.vx, Math.max(6, Math.abs(state.speed))) * 0.3,
        state.roll,
      );
      shadow.position.set(state.x, 0.025, state.z);
      shadow.visible = !state.falling;
      shadow.scale.setScalar(Math.max(0.4, 1 - state.y * 0.1));
      const moving = state.status === 'playing' && !state.falling;
      const pedalAngle = state.distance * 1.1;
      wheels.forEach((w) => {
        w.rotation.x = -(state.distance % 10000) / 0.6;
      });
      pedals.rotation.x = pedalAngle;
      wings.forEach((w, i) => {
        w.scale.setScalar(state.pelicanTime > 0 ? 2.6 : 1);
        w.rotation.z =
          (i ? 1 : -1) *
          (0.08 + (moving ? Math.sin(ambient * 4) * 0.06 : Math.sin(ambient * 1.2) * 0.025));
      });
      pouch.position.y = state.pelicanTime > 0 ? 2.75 : 3.05;
      pouch.scale.y = state.pelicanTime > 0 ? 0.58 : 0.34;
      bill.rotation.x = state.pelicanTime > 0 ? -0.55 : 0;
      bill.scale.z = state.pelicanTime > 0 ? 1.4 : 0.76;
      bear.rotation.z = -state.roll * 0.4;
      drillArm.rotation.x = moving ? Math.sin(ambient * 36) * 0.09 : 0;
      ribbon.rotation.x = 0.2 + Math.sin(ambient * 5) * 0.12;

      return moving;
    },
  };
}
