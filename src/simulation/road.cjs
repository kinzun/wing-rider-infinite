const RoadGenerator = (() => {
  const LENGTH = 64,
    POOL = 12,
    BATCH = 12,
    tiles = [];
  const sockets = [
    { x: -7.5, w: 7 },
    { x: 0, w: 7 },
    { x: 7.5, w: 7 },
    { x: -7.5, w: 3.2 },
    { x: 0, w: 3.2 },
    { x: 7.5, w: 3.2 },
  ];
  for (let a = 0; a < 6; a++)
    for (let b = 0; b < 6; b++) {
      if (Math.abs(sockets[a].x - sockets[b].x) > 7.5) continue;
      for (const hazard of [0, -1, 1]) {
        if (hazard && (a > 2 || b > 2 || a !== b)) continue;
        tiles.push({
          a,
          b,
          hazard,
          hard: (a > 2 && b > 2) || hazard !== 0,
          weight: hazard ? 2 : a === b ? 3 : 4,
        });
      }
    }
  const compatible = (a, b) => a.b === b.a && !(a.hard && b.hard);
  const rng = (seed) => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function solve(batch, seed = 431) {
    const random = rng((seed ^ Math.imul(batch + 1, 2654435761)) >>> 0);
    for (let attempt = 0; attempt < 8; attempt++) {
      const domains = Array.from({ length: BATCH }, (_, i) =>
        tiles
          .map((_, j) => j)
          .filter(
            (j) =>
              (i !== 0 || (tiles[j].a === 1 && !tiles[j].hard)) &&
              (i !== BATCH - 1 || (tiles[j].b === 1 && !tiles[j].hard)) &&
              (i !== 4 + (batch % 4) || tiles[j].hazard !== 0) &&
              (batch !== 0 || i > 1 || (tiles[j].a === 1 && tiles[j].b === 1 && !tiles[j].hard)),
          ),
      );
      let failed = false,
        done = false;
      while (!done && !failed) {
        let changed = true;
        while (changed && !failed) {
          changed = false;
          for (let i = 0; i < BATCH; i++)
            for (const dir of [-1, 1]) {
              const n = i + dir;
              if (n < 0 || n >= BATCH) continue;
              const filtered = domains[i].filter((v) =>
                domains[n].some((u) =>
                  dir === 1 ? compatible(tiles[v], tiles[u]) : compatible(tiles[u], tiles[v]),
                ),
              );
              if (filtered.length !== domains[i].length) {
                domains[i] = filtered;
                changed = true;
              }
              if (!filtered.length) {
                failed = true;
                break;
              }
            }
        }
        if (failed) break;
        let cell = -1,
          min = Infinity;
        for (let i = 0; i < BATCH; i++)
          if (domains[i].length > 1) {
            let sum = 0,
              log = 0;
            for (const j of domains[i]) {
              const w = tiles[j].weight;
              sum += w;
              log += w * Math.log(w);
            }
            const entropy = Math.log(sum) - log / sum + random() * 1e-6;
            if (entropy < min) {
              min = entropy;
              cell = i;
            }
          }
        if (cell < 0) {
          done = true;
          break;
        }
        let pick = random() * domains[cell].reduce((n, j) => n + tiles[j].weight, 0),
          selected = domains[cell][0];
        for (const j of domains[cell]) {
          pick -= tiles[j].weight;
          if (pick <= 0) {
            selected = j;
            break;
          }
        }
        domains[cell] = [selected];
      }
      if (!failed) return { ids: domains.map((d) => d[0]), fallback: false };
    }
    // shortcut: bounded retries fall back to a safe straight; use backtracking for richer tile sets.
    return {
      ids: Array(BATCH).fill(tiles.findIndex((t) => t.a === 1 && t.b === 1 && !t.hard)),
      fallback: true,
    };
  }
  function profile(tile, t) {
    const a = sockets[tile.a],
      b = sockets[tile.b],
      u = Math.max(0, Math.min(1, t)),
      f = u * u * (3 - 2 * u);
    return { x: a.x + (b.x - a.x) * f, w: a.w + (b.w - a.w) * f };
  }
  function create(seed = 431) {
    const slots = Array.from({ length: POOL }, () => ({
      index: -999,
      tile: null,
      got: false,
      hit: false,
      near: false,
      launched: false,
      destroyed: false,
    }));
    let cachedBatch = -1,
      ids = [],
      fallbacks = 0,
      origin = 0;
    function sync(distance) {
      origin = Math.floor(Math.max(0, distance) / LENGTH);
      for (let i = origin - 2; i < origin + POOL - 2; i++) {
        const slot = slots[((i % POOL) + POOL) % POOL];
        if (slot.index === i) continue;
        const batch = Math.floor(Math.max(0, i) / BATCH);
        if (batch !== cachedBatch) {
          const solved = solve(batch, seed);
          ids = solved.ids;
          fallbacks += Number(solved.fallback);
          cachedBatch = batch;
        }
        const tile =
          i < 0 ? tiles.find((t) => t.a === 1 && t.b === 1 && !t.hard) : tiles[ids[i % BATCH]];
        Object.assign(slot, {
          index: i,
          tile,
          got: false,
          hit: false,
          near: false,
          launched: false,
          destroyed: false,
        });
      }
      return slots;
    }
    const at = (distance) =>
      slots[((Math.floor(Math.max(0, distance) / LENGTH) % POOL) + POOL) % POOL];
    sync(0);
    return {
      slots,
      sync,
      at,
      get origin() {
        return origin;
      },
      get stats() {
        return { slots: slots.length, cachedTiles: ids.length, fallbacks, origin };
      },
    };
  }
  return { LENGTH, POOL, BATCH, tiles, sockets, compatible, solve, profile, create };
})();
if (typeof module !== 'undefined') module.exports = RoadGenerator;
