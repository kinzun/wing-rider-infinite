function createRoadView(T, scene, kit, aircraft) {
  const { deckTexture, mesh, block, mat, cyan, gold } = kit;
  const roadMaterial = new T.MeshStandardMaterial({
    color: 0x62718b,
    map: deckTexture,
    metalness: 0.25,
    roughness: 0.7,
    side: T.DoubleSide,
  });
  deckTexture.repeat.set(1, 3);
  const edgeMaterial = new T.LineBasicMaterial({ color: 0x69ffdf });
  const ringGeometry = new T.TorusGeometry(1.7, 0.075, 8, 32),
    gateMaterial = mat(0xf53d89, 0.1, 0.6, 0x8b1036);
  const roadPool = Array.from({ length: InfiniteRoad.POOL }, () => {
    const group = new T.Group();
    scene.add(group);
    const geometry = new T.BufferGeometry(),
      positions = new Float32Array(17 * 2 * 3),
      uv = new Float32Array(17 * 2 * 2),
      indices = [];
    for (let j = 0; j <= 16; j++) {
      uv.set([0, j / 16, 1, j / 16], j * 4);
      if (j < 16) {
        const v = j * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    geometry.setAttribute(
      'position',
      new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
    );
    geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    mesh(group, geometry, roadMaterial);
    const edges = [-1, 1].map(() => {
      const geo = new T.BufferGeometry();
      geo.setAttribute(
        'position',
        new T.BufferAttribute(new Float32Array(17 * 3), 3).setUsage(T.DynamicDrawUsage),
      );
      const line = new T.Line(geo, edgeMaterial);
      group.add(line);
      return line;
    });
    const ring = mesh(group, ringGeometry, cyan, 0, 2.6, 0);
    const gate = block(group, gateMaterial, 0, 1.5, 0, 3.3, 3, 1.1);
    const stripe = block(gate, gold, 0, 0, 0.53, 0.96, 0.08, 0.06);
    const pad = block(group, gold, 0, 0.08, 0, 10, 0.15, 3);
    const padStripe = block(pad, cyan, 0, 0.6, 0, 0.8, 0.05, 0.18);
    return { group, geometry, edges, ring, gate, pad, index: -999 };
  });
  function syncRoad(world, state, ambient) {
    world.slots.forEach((slot, i) => {
      const visual = roadPool[i],
        tile = slot.tile;
      if (visual.index !== slot.index) {
        visual.index = slot.index;
        for (let j = 0; j <= 16; j++) {
          const p = InfiniteRoad.profile(tile, j / 16);
          visual.geometry.attributes.position.array.set(
            [p.x - p.w, 0, -j * 4, p.x + p.w, 0, -j * 4],
            j * 6,
          );
          visual.edges.forEach((edge, k) =>
            edge.geometry.attributes.position.array.set(
              [p.x + (k ? 1 : -1) * p.w, 0.06, -j * 4],
              j * 3,
            ),
          );
        }
        visual.geometry.attributes.position.needsUpdate = true;
        visual.geometry.computeVertexNormals();
        visual.geometry.computeBoundingSphere();
        visual.edges.forEach((edge) => {
          edge.geometry.attributes.position.needsUpdate = true;
          edge.geometry.computeBoundingSphere();
        });
        const r = InfiniteRoad.profile(tile, 0.76),
          g = InfiniteRoad.profile(tile, 0.56);
        visual.ring.position.set(r.x - tile.hazard * 2.7, 2.6, -InfiniteRoad.LENGTH * 0.76);
        visual.gate.position.set(g.x + tile.hazard * 3.1, 1.5, -InfiniteRoad.LENGTH * 0.56);
      }
      visual.group.position.z = -(slot.index - world.origin) * InfiniteRoad.LENGTH;
      visual.ring.visible = !slot.got && slot.index >= 0;
      visual.ring.rotation.z = ambient * 0.4;
      const crossbar = !!tile.hazard && slot.index % 3 === 1,
        g = InfiniteRoad.profile(tile, 0.56),
        p = InfiniteRoad.profile(tile, 0.4);
      visual.gate.visible = !!tile.hazard && !slot.destroyed;
      visual.gate.scale.set(crossbar ? g.w * 2 : 3.3, crossbar ? 1.2 : 3, 1.1);
      visual.gate.position.set(
        g.x + (crossbar ? 0 : tile.hazard * 3.1 + Math.sin(state.elapsed * 2.6 + slot.index) * 1.2),
        crossbar ? 0.6 : 1.5,
        -InfiniteRoad.LENGTH * 0.56,
      );
      visual.pad.visible = crossbar;
      visual.pad.scale.x = p.w * 2;
      visual.pad.position.set(p.x, 0.08, -InfiniteRoad.LENGTH * 0.4);
    });
    aircraft.visible = world.origin < 3;
    aircraft.position.z = aircraft.visible ? world.origin * InfiniteRoad.LENGTH : 0;
  }

  return { pool: roadPool, update: syncRoad };
}
