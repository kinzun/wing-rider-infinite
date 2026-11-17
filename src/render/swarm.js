function createSwarm(T, scene, vfx) {
  const count = 1024;
  // Bake the silhouette once: swept wings, fuselage, twin nacelles and canopy.
  function merge(parts) {
    const positions = [],
      normals = [];
    for (const part of parts) {
      const g = part.index ? part.toNonIndexed() : part;
      positions.push(...g.attributes.position.array);
      normals.push(...g.attributes.normal.array);
      if (g !== part) g.dispose();
      part.dispose();
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    g.computeBoundingSphere();
    return g;
  }
  const outline = new T.Shape();
  [
    [0, 2.8],
    [-0.65, 0.7],
    [-3.1, -0.9],
    [-2.8, -1.5],
    [-0.5, -0.8],
    [0.5, -0.8],
    [2.8, -1.5],
    [3.1, -0.9],
    [0.65, 0.7],
  ].forEach(([x, y], i) => (i ? outline.lineTo(x, y) : outline.moveTo(x, y)));
  outline.closePath();
  const wing = new T.ExtrudeGeometry(outline, { depth: 0.18, bevelEnabled: false, steps: 1 });
  wing.rotateX(Math.PI / 2);
  const geo = merge([
    wing,
    new T.OctahedronGeometry(1).scale(0.6, 0.4, 2.2),
    ...[-1, 1].map((side) => new T.BoxGeometry(0.55, 0.55, 2).translate(side * 1.2, 0, -0.8)),
    new T.BoxGeometry(0.15, 0.8, 0.8).translate(0, 0.35, -1.5),
  ]);
  const canopy = merge([
    new T.IcosahedronGeometry(0.4, 0).scale(1, 0.7, 1.7).translate(0, 0.45, 0.5),
    ...[-1, 1].map((side) => new T.SphereGeometry(0.24, 6, 4).translate(side * 1.2, 0, -1.9)),
  ]);
  const ships = new T.InstancedMesh(
    geo,
    new T.MeshStandardMaterial({
      color: 0x8a9bad,
      metalness: 0.5,
      roughness: 0.5,
      emissive: 0x163c55,
    }),
    count,
  );
  const cores = new T.InstancedMesh(canopy, new T.MeshBasicMaterial({ color: 0xff733a }), count);
  const deaths = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader:
        'varying vec3 p;varying vec3 tint;void main(){p=position;tint=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec3 p;varying vec3 tint;void main(){float n=.5+.5*sin(p.x*17.+sin(p.y*13.)+p.z*19.);gl_FragColor=vec4(tint*(.5+n),.24);}',
    }),
    count,
  );
  const bullets = new T.InstancedMesh(
      new T.CylinderGeometry(0.13, 0.24, 2.4, 8),
      new T.MeshBasicMaterial({ color: 0xffffff }),
      384,
    ),
    dummy = new T.Object3D(),
    color = new T.Color(),
    direction = new T.Vector3(),
    up = new T.Vector3(0, 1, 0);
  const glow = new T.InstancedMesh(
    bullets.geometry,
    new T.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
    384,
  );
  const tailPositions = new Float32Array(384 * 6),
    tailColors = new Float32Array(384 * 6),
    tailGeo = new T.BufferGeometry();
  tailGeo.setAttribute(
    'position',
    new T.BufferAttribute(tailPositions, 3).setUsage(T.DynamicDrawUsage),
  );
  tailGeo.setAttribute('color', new T.BufferAttribute(tailColors, 3).setUsage(T.DynamicDrawUsage));
  const tails = new T.LineSegments(
    tailGeo,
    new T.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  tails.frustumCulled = false;
  scene.add(tails);
  for (const o of [ships, cores, deaths, bullets, glow]) {
    o.frustumCulled = false;
    o.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(o);
  }
  const warning = new T.Mesh(
    new T.BoxGeometry(36, 14, 150),
    new T.MeshBasicMaterial({
      color: 0xff325b,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  const beam = new T.Mesh(
    new T.BoxGeometry(4.8, 14, 150),
    new T.MeshBasicMaterial({
      color: 0xff365e,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  const gap = new T.Mesh(
    new T.BoxGeometry(10, 0.1, 150),
    new T.MeshBasicMaterial({
      color: 0x56ffcc,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  scene.add(warning, beam, gap);
  let state = null;
  return {
    reset() {
      state = null;
    },
    update(dt, s, origin) {
      state = s;
      const b = s.swarm,
        base = origin * 64;
      for (const e of b.drones) {
        dummy.position.set(e.x, e.y, -(e.d - base));
        dummy.rotation.set(
          0.12,
          Math.atan2(s.x - e.x, e.d - s.distance),
          (e.id % 2 ? 1 : -1) * 0.22,
        );
        dummy.scale.setScalar(e.active ? 1.15 : 0);
        dummy.updateMatrix();
        ships.setMatrixAt(e.id, dummy.matrix);

        dummy.scale.setScalar(e.active ? (e.flash > 0 ? 1.25 : 1) : 0);
        dummy.updateMatrix();
        cores.setMatrixAt(e.id, dummy.matrix);

        dummy.scale.setScalar(e.dead > 0 ? Math.sqrt(1 - e.dead / 0.9) * 5 : 0);
        dummy.rotation.set(e.dead * 3, e.id, e.dead * 5);
        dummy.updateMatrix();
        deaths.setMatrixAt(e.id, dummy.matrix);
        const fade = e.dead / 0.9;
        color.setRGB(fade * 1.5, fade * fade * 0.6, fade * fade * fade * 0.12);
        deaths.setColorAt(e.id, color);
      }
      for (let i = 0; i < b.bullets.length; i++) {
        const p = b.bullets[i];
        dummy.position.set(p.x, p.y, -(p.d - base));
        direction.set(p.vx, p.vy, -p.vd).normalize();
        if (direction.lengthSq() === 0) direction.set(0, 0, 1);
        dummy.quaternion.setFromUnitVectors(up, direction);
        dummy.scale.setScalar(p.active ? 1 : 0);
        dummy.updateMatrix();
        bullets.setMatrixAt(i, dummy.matrix);
        color.setHex(p.boss ? 0xffd6e8 : 0xffede0);
        bullets.setColorAt(i, color);
        dummy.scale.set(p.active ? 3 : 0, p.active ? 1.25 : 0, p.active ? 3 : 0);
        dummy.updateMatrix();
        glow.setMatrixAt(i, dummy.matrix);
        color.setHex(p.boss ? 0xff337a : 0xff6028);
        glow.setColorAt(i, color);
        const tail = p.active ? Math.min(9, 3 + Math.hypot(p.vx, p.vy, p.vd) * 0.035) : 0;
        tailPositions.set(
          [
            p.x,
            p.y,
            -(p.d - base),
            p.x - direction.x * tail,
            p.y - direction.y * tail,
            -(p.d - base) - direction.z * tail,
          ],
          i * 6,
        );
        tailColors.set(p.active ? [color.r, color.g, color.b, 0, 0, 0] : [0, 0, 0, 0, 0, 0], i * 6);
      }
      for (const o of [ships, cores, deaths, bullets, glow]) o.instanceMatrix.needsUpdate = true;
      bullets.instanceColor.needsUpdate = glow.instanceColor.needsUpdate = true;
      tailGeo.attributes.position.needsUpdate = tailGeo.attributes.color.needsUpdate = true;
      deaths.instanceColor.needsUpdate = true;
      warning.visible = b.attack !== 0 && b.attackTime < 1.8;
      warning.position.set(b.attackX, 7, s.z - 55);
      warning.material.opacity = 0.07 + 0.06 * (0.5 + 0.5 * Math.sin(b.time * 15));
      gap.visible = b.attack === 1;
      gap.position.set(b.attackX, 0.1, s.z - 55);
      beam.visible = b.attack === 2 && b.attackTime >= 1.8;
      beam.position.set(b.beamX, 7, s.z - 55);
    },
    get stats() {
      return {
        capacity: count,
        alive: state ? state.swarm.drones.reduce((n, e) => n + e.active, 0) : 0,
        bulletCapacity: 384,
        bullets: state ? state.swarm.bullets.reduce((n, p) => n + p.active, 0) : 0,
        fired: state?.swarm.fired || 0,
        hits: state?.swarm.hits || 0,
        killed: state?.swarm.killed || 0,
        attack: state?.swarm.attack || 0,
        attackTime: state?.swarm.attackTime || 0,
      };
    },
  };
}
