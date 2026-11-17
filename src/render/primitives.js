function createPrimitives(T, renderer) {
  const sphere = new T.SphereGeometry(1, 16, 12),
    box = new T.BoxGeometry(1, 1, 1),
    cylinder = new T.CylinderGeometry(1, 1, 1, 12),
    torus = new T.TorusGeometry(1, 0.06, 7, 28);
  const materials = {};
  function mat(color, metal = 0, rough = 0.65, emissive = 0) {
    const key = [color, metal, rough, emissive].join();
    return (materials[key] ??= new T.MeshStandardMaterial({
      color,
      metalness: metal,
      roughness: rough,
      emissive,
      emissiveIntensity: emissive ? 0.9 : 0,
    }));
  }
  const white = mat(0xdce8ee),
    whiteShade = mat(0xa0c3d8),
    dark = mat(0x101a2e, 0.3),
    pink = mat(0xfd589f, 0.2, 0.3, 0x7d1042),
    cyan = mat(0x70ffdf, 0.2, 0.3, 0x1e796e),
    gold = mat(0xeabb70, 0.45, 0.4),
    orange = mat(0xe9a179),
    metal = mat(0x60718f, 0.6, 0.45);
  function mesh(parent, geo, material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
    const o = new T.Mesh(geo, material);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    parent.add(o);
    return o;
  }
  function ball(p, m, x, y, z, sx, sy = sx, sz = sx) {
    return mesh(p, sphere, m, x, y, z, sx, sy, sz);
  }
  function block(p, m, x, y, z, sx, sy, sz) {
    return mesh(p, box, m, x, y, z, sx, sy, sz);
  }
  const tmpA = new T.Vector3(),
    tmpB = new T.Vector3(),
    up = new T.Vector3(0, 1, 0);
  function rod(parent, a, b, r, m) {
    tmpA.set(...a);
    tmpB.set(...b);
    const o = mesh(parent, cylinder, m, 0, 0, 0, r, tmpA.distanceTo(tmpB), r);
    o.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(up, tmpB.sub(tmpA).normalize());
    return o;
  }
  let seed = 431;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function canvasTexture(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'), w, h);
    const tx = new T.CanvasTexture(c);
    tx.colorSpace = T.SRGBColorSpace;
    return tx;
  }
  const deckTexture = canvasTexture(1024, 512, (c, w, h) => {
    c.fillStyle = '#66758d';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#46566c';
    c.lineWidth = 2;
    for (let y = 0; y <= h; y += 128) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    for (let x = 0; x < w; x += 256) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    c.fillStyle = '#c1cad4';
    for (let x = 9; x < w; x += 32)
      for (let y = 9; y < h; y += 128) {
        c.fillRect(x, y, 2, 2);
        c.fillRect(x, y + 108, 2, 2);
      }
    c.fillStyle = '#b54c7e';
    c.fillRect(w * 0.46, 0, 12, h);
    c.fillStyle = '#c5d5de';
    c.font = 'bold 24px monospace';
    c.save();
    c.translate(60, 76);
    c.fillText('CELESTIAL AIR / WK—072', 0, 0);
    c.restore();
  });
  deckTexture.wrapS = deckTexture.wrapT = T.RepeatWrapping;
  deckTexture.repeat.set(2, 12);
  deckTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  return {
    sphere,
    box,
    cylinder,
    torus,
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
    random,
    canvasTexture,
    deckTexture,
  };
}
