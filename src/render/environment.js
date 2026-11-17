function createEnvironment(T, scene, kit, hemi, sunLight, rim) {
  const {
    sphere,
    cylinder,
    mat,
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
    random,
  } = kit;
  const lerp = T.MathUtils.lerp;
  let dayValue = 0;
  const aircraft = new T.Group();
  scene.add(aircraft);
  ball(aircraft, mat(0x49617b, 0.65), 0, -4, 25, 67, 5.6, 6.3);
  ball(aircraft, metal, 59, -3.5, 25, 10, 4.9, 5.5);
  const canopy = ball(aircraft, mat(0x173b54, 0.4, 0.18), 57, 0.1, 25, 7, 3.1, 4.8);
  block(aircraft, pink, -36, -0.5, 25, 1.3, 9, 1);
  const fin = block(aircraft, metal, -49, 3.1, 25, 12, 18, 1);
  fin.rotation.z = 0.28;
  block(aircraft, pink, -49, 5, 25, 6, 8, 1.13);
  for (let i = 0; i < 16; i++) {
    const x = -40 + i * 5;
    ball(aircraft, dark, x, -1, 30.1, 0.8, 1.1, 0.35);
    ball(aircraft, cyan, x, -0.6, 30.35, 0.32, 0.57, 0.08);
  }
  for (const z of [-26, -77, -125]) {
    const e = mesh(aircraft, cylinder, metal, 0, -4, z, 3.4, 10, 3.4);
    e.rotation.z = Math.PI / 2;
    const intake = mesh(aircraft, cylinder, dark, 5.05, -4, z, 2.6, 0.1, 2.6);
    intake.rotation.z = Math.PI / 2;
  }
  const opposite = block(aircraft, metal, 0, -0.5, 65, 30, 1, 80);
  opposite.rotation.y = -0.15;
  // Wukong's procedural pilot bust and staff sit inside the forward cockpit.
  const monkey = new T.Group();
  monkey.position.set(57, 1.7, 25);
  aircraft.add(monkey);
  ball(monkey, gold, 0, 0.7, 0, 1, 1.3, 0.8);
  ball(monkey, mat(0xac784e), 0, 2.1, 0, 0.85);
  ball(monkey, orange, 0.56, 2.1, 0, 0.42, 0.64, 0.65);
  for (const z of [-0.85, 0.85]) ball(monkey, orange, 0, 2.15, z, 0.25);
  rod(monkey, [0.3, 2.6, -0.7], [0.3, 2.6, 0.7], 0.1, gold);
  rod(monkey, [-1, -0.4, -1], [-1, 4.2, -1], 0.12, gold);
  for (const z of [-0.3, 0.3]) ball(monkey, dark, 0.92, 2.2, z, 0.1);
  ball(monkey, pink, 0.7, 0.8, 0, 0.6, 0.25, 1);
  // Low-poly ocean: analytic wave height and normals in the GPU, no texture files.
  const waterUniforms = {
    uTime: { value: 0 },
    uDay: { value: 0.2 },
    uSun: { value: new T.Vector3(-0.5, 0.6, -0.6).normalize() },
  };
  const oceanMaterial = new T.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: `uniform float uTime;varying vec3 vP;varying vec3 vN;
void main(){vec3 p=position;float a=p.x*.075+uTime*.8,b=p.z*.12-uTime*.6,c=(p.x+p.z)*.043+uTime*.5;p.y+=sin(a)*1.2+sin(b)*.8+sin(c)*1.8;float dx=cos(a)*.09+cos(c)*.0774,dz=cos(b)*.096+cos(c)*.0774;vN=normalize(vec3(-dx,1.,-dz));vec4 world=modelMatrix*vec4(p,1.);vP=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float uDay;uniform vec3 uSun;varying vec3 vP;varying vec3 vN;void main(){vec3 n=normalize(vN),v=normalize(cameraPosition-vP);float f=pow(1.-max(0.,dot(n,v)),3.);vec3 deep=mix(vec3(.012,.045,.095),vec3(.025,.22,.27),uDay),edge=mix(vec3(.12,.17,.31),vec3(.32,.68,.68),uDay);vec3 col=mix(deep,edge,f*.8);float spec=pow(max(dot(n,normalize(v+uSun)),0.),100.);col+=spec*mix(vec3(.6,.18,.39),vec3(1.,.7,.4),uDay);float ripple=smoothstep(.93,1.,sin(vP.x*.45+vP.z*.3))*smoothstep(.5,1.,n.y)*.025;col+=ripple;float fog=1.-exp(-length(cameraPosition-vP)*.0012);col=mix(col,mix(vec3(.038,.055,.12),vec3(.39,.62,.69),uDay),fog);gl_FragColor=vec4(col,1.);}`,
  });
  const oceanGeo = new T.PlaneGeometry(1500, 1500, 130, 130);
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = mesh(scene, oceanGeo, oceanMaterial, 0, -29, -90);
  const skyUniforms = { uDay: { value: 0.2 } };
  const sky = mesh(
    scene,
    new T.SphereGeometry(850, 24, 16),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader:
        'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'uniform float uDay;varying vec3 vP;void main(){float h=clamp(normalize(vP).y,0.,1.);vec3 low=mix(vec3(.16,.11,.23),vec3(.66,.78,.78),uDay);vec3 high=mix(vec3(.008,.015,.052),vec3(.16,.43,.65),uDay);gl_FragColor=vec4(mix(low,high,pow(h,.5)),1.);}',
    }),
  );
  const sun = ball(scene, new T.MeshBasicMaterial({ color: 0xff91ba }), -140, 80, -310, 25);
  const sunRing = mesh(
    scene,
    new T.TorusGeometry(32, 0.12, 6, 70),
    new T.MeshBasicMaterial({ color: 0xff5b9d, transparent: true, opacity: 0.5 }),
    -140,
    80,
    -311,
  );
  sunRing.rotation.y = 0.2;
  const starGeo = new T.BufferGeometry(),
    starPoints = [];
  for (let i = 0; i < 550; i++) {
    const a = random() * Math.PI * 2,
      y = 80 + random() * 500,
      r = 400 + random() * 300;
    starPoints.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  starGeo.setAttribute('position', new T.Float32BufferAttribute(starPoints, 3));
  const starMaterial = new T.PointsMaterial({
    color: 0xcce7ff,
    size: 1.6,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const stars = new T.Points(starGeo, starMaterial);
  scene.add(stars);
  const cloudMat = new T.MeshStandardMaterial({
    color: 0xaebad4,
    roughness: 1,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const clouds = new T.InstancedMesh(sphere, cloudMat, 80),
    dummy = new T.Object3D();
  scene.add(clouds);
  const cloudSeeds = [];
  for (let i = 0; i < 20; i++) {
    const x = (random() - 0.5) * 650,
      y = 13 + random() * 45,
      z = (random() - 0.5) * 650,
      size = 5 + random() * 6;
    for (let k = 0; k < 4; k++)
      cloudSeeds.push({
        x: x + (k - 1.5) * size,
        y: y + (k % 2) * size * 0.3,
        z: z + (random() - 0.5) * size,
        size: size * (0.65 + random() * 0.45),
      });
  }

  return {
    aircraft,
    update(state, camera, ambient, dayMode, dt) {
      const phase = (ambient / 65) * Math.PI * 2,
        desired = dayMode === 1 ? 1 : dayMode === 2 ? 0 : 0.5 + 0.5 * Math.sin(phase - 0.6);
      dayValue = lerp(dayValue, desired, Math.min(1, dt * 0.7));
      skyUniforms.uDay.value = dayValue;
      waterUniforms.uDay.value = dayValue;
      waterUniforms.uTime.value = ambient;
      ocean.position.z = state.z - 80;
      sky.position.copy(camera.position);
      stars.position.z = state.z;
      starMaterial.opacity = (1 - dayValue) ** 2;
      hemi.intensity = 0.65 + dayValue * 1.55;
      sunLight.intensity = 0.7 + dayValue * 2.2;
      rim.intensity = 2.3 - dayValue;
      sun.material.color.setRGB(1, 0.34 + dayValue * 0.45, 0.61 - dayValue * 0.17);
      sun.position.set(-140, 45 + dayValue * 110, state.z - 310);
      sunRing.position.copy(sun.position);
      sunRing.material.opacity = (1 - dayValue) * 0.45;
      cloudSeeds.forEach((c, i) => {
        dummy.position.set(((c.x + ambient * 5 + 350) % 700) - 350, c.y, c.z);
        dummy.scale.set(c.size * 1.45, c.size * 0.68, c.size);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        clouds.setMatrixAt(i, dummy.matrix);
      });
      clouds.instanceMatrix.needsUpdate = true;
      cloudMat.color.setRGB(0.25 + dayValue * 0.55, 0.31 + dayValue * 0.52, 0.47 + dayValue * 0.4);
    },
  };
}
