/* Shared geometries and instanced armor; no model allocation during combat. */
function createFleet(T, scene) {
  const armor = new T.MeshStandardMaterial({
    color: 0x72839a,
    metalness: 0.65,
    roughness: 0.42,
    emissive: 0x101b2c,
    emissiveIntensity: 0.8,
  });
  const dark = new T.MeshStandardMaterial({ color: 0x172235, metalness: 0.6, roughness: 0.48 }),
    trim = new T.MeshStandardMaterial({ color: 0x9a4564, metalness: 0.45, roughness: 0.4 });
  const cyan = new T.MeshBasicMaterial({ color: 0x39cfff }),
    orange = new T.MeshBasicMaterial({ color: 0xff783c });
  const box = new T.BoxGeometry(1, 1, 1),
    cylinder = new T.CylinderGeometry(1, 1, 1, 12),
    sphere = new T.SphereGeometry(1, 16, 12),
    ring = new T.TorusGeometry(1, 0.1, 6, 48);
  const shape = new T.Shape();
  [
    [0, -20],
    [-6, -8],
    [-25, -2],
    [-30, 12],
    [-10, 9],
    [-5, 19],
    [0, 16],
    [5, 19],
    [10, 9],
    [30, 12],
    [25, -2],
    [6, -8],
  ].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const hull = new T.ExtrudeGeometry(shape, {
    depth: 2,
    bevelEnabled: true,
    bevelSize: 0.8,
    bevelThickness: 0.7,
    bevelSegments: 1,
    steps: 1,
  });
  hull.rotateX(Math.PI / 2);
  function add(g, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    g.add(m);
    return m;
  }
  const models = Array.from({ length: 13 }, (_, i) => {
    const boss = i === 12,
      g = new T.Group();
    scene.add(g);
    const guns = [],
      engines = [],
      panels = [];
    let plates = null;
    const hitMaterial = new T.MeshBasicMaterial({
      color: 0xd6faff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    const hitShell = add(
      g,
      hull,
      hitMaterial,
      0,
      0,
      0,
      boss ? 1.21 : 0.112,
      boss ? 1.01 : 0.21,
      boss ? 1.11 : 0.162,
    );
    const armorChunks = [];
    if (!boss && i % 3 === 0)
      for (let k = 0; k < 3; k++)
        armorChunks.push(add(g, box, trim, (k - 1) * 1.4, 0.45, -0.2, 1, 0.3, 1.7));
    if (!boss) {
      add(g, hull, armor, 0, 0, 0, 0.11, 0.2, 0.16);
      add(g, sphere, dark, 0, 0.15, 0, 0.65, 0.45, 1.5);
      add(g, sphere, cyan, 0, 0.35, 0.7, 0.4, 0.18, 0.5);
      for (const side of [-1, 1]) {
        const nacelle = add(g, cylinder, dark, side * 1.8, 0, -0.4, 0.4, 2, 0.4);
        nacelle.rotation.x = Math.PI / 2;
        engines.push(add(g, sphere, cyan, side * 1.8, 0, -1.5, 0.24, 0.24, 0.65));
        const barrel = add(g, cylinder, trim, side * 0.7, -0.3, 1, 0.11, 1.7, 0.11);
        barrel.rotation.x = Math.PI / 2;
      }
    } else {
      add(g, hull, armor, 0, 0, 0, 1.2, 1, 1.1);
      add(g, hull, dark, 0, -2, 1, 1, 0.7, 0.93);
      add(g, hull, trim, 0, 1, -1, 0.48, 0.8, 0.65);
      add(g, box, dark, 0, 2, -4, 10, 3, 13);
      add(g, box, armor, 0, 4, -6, 6, 2, 7);
      add(g, box, cyan, 0, 4.2, -2.4, 5, 0.3, 0.15);
      plates = new T.InstancedMesh(box, armor, 48);
      const o = new T.Object3D();
      for (let j = 0; j < 48; j++) {
        const side = j < 24 ? -1 : 1,
          k = j % 24;
        o.position.set(
          side * (9 + (k % 6) * 3.5),
          0.7 + Math.floor(k / 6) * 0.16,
          -1 + Math.floor(k / 6) * 3.3,
        );
        o.rotation.set(0, side * 0.18, 0);
        o.scale.set(2.7, 0.4, 2.1);
        o.updateMatrix();
        plates.setMatrixAt(j, o.matrix);
      }
      g.add(plates);
      for (const side of [-1, 1]) {
        const panel = new T.Group();
        panel.position.set(side * 6, 1.5, 6);
        g.add(panel);
        add(panel, hull, armor, side * 4, 0, 0, 0.24, 0.4, 0.33);
        panels.push(panel);
        for (let j = 0; j < 3; j++) {
          const x = side * (9 + j * 7),
            z = -5 + j * 3;
          const nacelle = add(g, cylinder, dark, x, -1, z, 2.2, 8, 2.2);
          nacelle.rotation.x = Math.PI / 2;
          const nozzle = add(g, ring, trim, x, -1, z - 4.1, 1.9);
          engines.push(add(g, sphere, cyan, x, -1, z - 4.5, 1.4, 1.4, 3));
        }
        for (let j = 0; j < 3; j++) {
          const turret = new T.Group();
          turret.position.set(side * (8 + j * 7), 2, 5 + j);
          g.add(turret);
          add(turret, cylinder, dark, 0, 0, 0, 1.8, 0.8, 1.8);
          add(turret, sphere, armor, 0, 0.5, 0, 1.5, 0.8, 1.4);
          const recoil = new T.Group();
          turret.add(recoil);
          for (const dx of [-0.55, 0.55]) {
            const barrel = add(recoil, cylinder, dark, dx, 0.55, 2.3, 0.24, 5, 0.24);
            barrel.rotation.x = Math.PI / 2;
            add(recoil, ring, orange, dx, 0.55, 4.9, 0.28);
          }
          guns.push({ turret, recoil });
        }
        for (let j = 0; j < 2; j++) {
          add(g, box, dark, side * (7 + j * 9), -1, 10, 4, 2, 5);
          for (let k = 0; k < 3; k++)
            add(g, ring, orange, side * (7 + j * 9) + (k - 1), -1, 12.6, 0.33);
        }
      }
    }
    const coreMat = new T.MeshBasicMaterial({ color: 0xff6a36 });
    const core = add(
      g,
      sphere,
      coreMat,
      0,
      boss ? -0.4 : 0,
      boss ? 17 : 1.7,
      boss ? 3 : 0.23,
      boss ? 2 : 0.23,
      boss ? 1 : 0.18,
    );
    const halo = add(g, ring, orange, 0, boss ? -0.4 : 0, boss ? 18 : 1.9, boss ? 4 : 0.38);
    const charge = add(
      g,
      sphere,
      new T.MeshBasicMaterial({
        color: 0xffbb74,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
      0,
      boss ? -0.4 : 0,
      boss ? 20 : 2,
      boss ? 5 : 0.6,
    );
    const hpBack = add(g, new T.PlaneGeometry(boss ? 26 : 5, 0.25), dark, 0, boss ? 9 : 3, 0);
    const hp = add(
      g,
      hpBack.geometry,
      new T.MeshBasicMaterial({ color: boss ? 0xff547a : 0xffbd57 }),
      0,
      boss ? 9 : 3,
      0.02,
    );
    const stagger = add(
      g,
      hpBack.geometry,
      new T.MeshBasicMaterial({ color: 0x69f8ff }),
      0,
      boss ? 8.5 : 2.5,
      0.02,
    );
    return {
      g,
      core,
      halo,
      charge,
      guns,
      engines,
      panels,
      boss,
      hitShell,
      armorChunks,
      plates,
      hp,
      stagger,
    };
  });
  return {
    models,
    update(state, origin) {
      for (let i = 0; i < 13; i++) {
        const e = state.battle.enemies[i],
          v = models[i];
        v.g.visible = e.active;
        if (!e.active) continue;
        v.g.scale.setScalar(e.heavy ? 2.5 : e.boss ? 1.25 : 1.25);
        v.g.position.set(e.x, e.y, -(e.d - origin * 64) - e.flash * (e.boss ? 8 : 16));
        v.hitShell.material.opacity = Math.min(0.7, e.flash * 4);
        v.hp.scale.x = Math.max(0, e.hp / e.maxHp);
        v.hp.position.x = -(1 - v.hp.scale.x) * (e.boss ? 13 : 2.5);
        v.stagger.scale.x = e.stagger > 0 ? 1 : e.impact / (e.boss ? 120 : e.heavy ? 28 : 10);
        v.stagger.material.color.setHex(e.stagger > 0 ? 0xffffff : 0x69f8ff);
        if (v.plates) v.plates.count = 48 - e.armorStage * 12;
        v.armorChunks.forEach((part, j) => (part.visible = j >= e.armorStage));
        v.g.rotation.x =
          (e.boss ? 0.28 : 0.14) + (e.stagger > 0 ? Math.sin(state.elapsed * 23) * 0.04 : 0);
        v.g.rotation.y = e.boss ? -0.12 : 0;
        v.g.rotation.z = Math.sin(state.elapsed * (e.boss ? 0.7 : 2) + i) * (e.boss ? 0.035 : 0.2);
        const charging = Math.max(0, 1 - e.fire / 1.1);
        v.core.material.color.setRGB(1, 0.16 + charging * 0.7 + e.flash, 0.04 + charging * 0.3);
        v.halo.rotation.z = state.elapsed * (e.phase ? 4 : 1.5);
        v.halo.scale.setScalar((e.boss ? 4 : 0.38) * (1 + charging * 0.15));
        v.charge.material.opacity = e.stagger > 0 ? 0.7 : charging * 0.45;
        v.charge.scale.setScalar((e.boss ? 5 : 0.6) * (1 + charging * 0.5));
        v.guns.forEach(({ turret, recoil }) => {
          turret.rotation.y = Math.atan2(state.x - e.x, e.d - state.distance);
          recoil.position.z = -e.recoil * 7;
        });
        v.panels.forEach(
          (panel, j) =>
            (panel.rotation.z =
              (j ? 1 : -1) * (charging * 0.2 + e.phase * 0.4 + e.armorStage * 0.12)),
        );
        v.engines.forEach(
          (engine, j) =>
            (engine.scale.z = (e.boss ? 3 : 0.65) * (1 + 0.15 * Math.sin(state.elapsed * 17 + j))),
        );
      }
    },
  };
}
