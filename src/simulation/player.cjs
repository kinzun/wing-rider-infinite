/* Bounded 1-D tiled WFC: each cell is a complete traversable road segment. */
const InfiniteRoad = (() => {
  const Battle = typeof module !== 'undefined' ? require('./battle.cjs') : SkyBattle;
  const Swarm = typeof module !== 'undefined' ? require('./swarm.cjs') : SwarmCombat;
  const Road = typeof module !== 'undefined' ? require('./road.cjs') : RoadGenerator;
  const { LENGTH, POOL, BATCH, tiles, sockets, compatible, solve, profile, create } = Road;
  const fresh = () => ({
    battle: Battle.fresh(),
    swarm: Swarm.fresh(),
    x: 0,
    z: 0,
    distance: 0,
    y: 0,
    vx: 0,
    speed: 0,
    vy: 0,
    elapsed: 0,
    count: 0,
    score: 0,
    health: 100,
    energy: 100,
    falling: false,
    status: 'playing',
    hit: 0,
    roll: 0,
    near: 0,
    jumpHeld: false,
    jumps: 0,
    combo: 0,
    mode: 0,
    modeTime: 0,
    overload: 0,
    cooldowns: [0, 0, 0],
    skillHeld: [false, false, false],
    fallTime: 0,
    sixCooldowns: [0, 0, 0, 0, 0, 0],
    sixHeld: [false, false, false, false, false, false],
    sixTimers: [0, 0, 0, 0, 0, 0],
    pelicanHeld: false,
    pelicanCooldown: 0,
    pelicanTime: 0,
    roarHeld: false,
    roarCooldown: 0,
    shield: 0,
    ammo: 8,
    fireCooldown: 0,
    enemyClock: 2,
    serial: 0,
    kills: 0,
    missiles: Array.from({ length: 8 }, () => ({
      active: false,
      phase: 0,
      clock: 0,
      x: 0,
      y: 0,
      d: 0,
      id: 0,
    })),
    shots: Array.from({ length: 8 }, () => ({
      active: false,
      x: 0,
      y: 0,
      d: 0,
      life: 0,
      kind: 0,
      target: -1,
    })),
    lastBlast: { x: 0, y: 0, d: 0 },
  });

  function blast(s, x, y, d) {
    s.lastBlast.x = x;
    s.lastBlast.y = y;
    s.lastBlast.d = d;
  }
  function sixHit(s, i, events, damageScale) {
    for (const e of s.battle.enemies)
      if (e.active && Swarm.contains(s, e, i)) {
        Battle.hit(
          s,
          e,
          [12, 18, 32, 22, 10, 25][i] * damageScale,
          events,
          [1.8, 2, 0.8, 0.6, 2.5, 1.5][i],
        );
        if (i === 0 || i === 4 || i === 5) e.fire += 2;
      }
    for (const m of s.missiles) m.active = false;
    Swarm.sweep(s, i, events);
    events.push('six-impact' + i);
  }
  function abilities(s, input, dt, world, events) {
    for (let i = 0; i < 6; i++) {
      if (!s.overload) s.sixCooldowns[i] = Math.max(0, s.sixCooldowns[i] - dt);
      const pressed = !!input['six' + i];
      if (pressed && !s.sixHeld[i] && (s.overload || s.sixCooldowns[i] === 0)) {
        events.push('six' + i);
        if (s.overload) {
          sixHit(s, i, events, 1.25);
        } else {
          s.sixCooldowns[i] = [5, 7, 10, 6, 8, 12][i];
          s.sixTimers[i] = [1.3, 0.7, 1.5, 0.5, 0.7, 1][i];
        }
      }
      s.sixHeld[i] = pressed;
      if (s.sixTimers[i] > 0) {
        s.sixTimers[i] -= dt;
        if (s.sixTimers[i] <= 0) {
          sixHit(s, i, events, 1);
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      s.cooldowns[i] = Math.max(0, s.cooldowns[i] - dt);
      const pressed = !!input['tier' + (i + 1)];
      if (pressed && !s.skillHeld[i] && s.cooldowns[i] === 0 && s.mode === 0) {
        s.mode = i + 1;
        s.modeTime = [3.2, 3.8, 4.5][i];
        s.cooldowns[i] = [8, 13, 20][i];
        s.falling = false;
        s.vy = 0;
        events.push('tier' + s.mode);
      }
      s.skillHeld[i] = pressed;
    }
    if (s.mode) {
      s.modeTime -= dt;
      if (s.modeTime <= 0) {
        s.mode = 0;
        s.modeTime = 0;
        s.speed = Math.min(s.speed, 36);
        s.vy = -2;
        const slot = world.at(s.distance),
          p = profile(slot.tile, (s.distance % 64) / 64);
        s.x = p.x - slot.tile.hazard * 2.7;
        s.vx = 0;
        s.shield = Math.max(s.shield, 1);
        events.push('power-end');
      }
    }
    s.roarCooldown = Math.max(0, s.roarCooldown - dt);
    s.shield = Math.max(0, s.shield - dt);
    if (input.roar && !s.roarHeld && s.roarCooldown === 0) {
      s.roarCooldown = 8;
      s.shield = 1.6;
      let cleared = 0;
      for (const m of s.missiles)
        if (m.active) {
          m.active = false;
          cleared++;
        }
      s.score += cleared * 50;
      s.kills += cleared;
      events.push('roar');
    }
    s.roarHeld = !!input.roar;
    s.pelicanCooldown = Math.max(0, s.pelicanCooldown - dt);
    const wasPelican = s.pelicanTime > 0;
    s.pelicanTime = Math.max(0, s.pelicanTime - dt);
    if (wasPelican && s.pelicanTime === 0 && !s.mode) {
      s.shield = Math.max(1, s.shield);
      s.vy = -2;
      s.speed = Math.min(36, s.speed);
    }
    if (input.pelican && !s.pelicanHeld && s.pelicanCooldown === 0) {
      s.pelicanCooldown = 14;
      s.pelicanTime = 4;
      events.push('pelican');
    }
    s.pelicanHeld = !!input.pelican;
    if (s.pelicanTime > 0) {
      for (const m of s.missiles)
        if (
          m.active &&
          m.d >= s.distance - 2 &&
          m.d <= s.distance + 65 &&
          Math.abs(m.x - s.x) < 15
        ) {
          m.active = false;
          s.kills++;
          s.score += 50;
        }
      for (const slot of world.slots)
        if (
          slot.tile.hazard &&
          !slot.destroyed &&
          slot.index * 64 >= s.distance &&
          slot.index * 64 < s.distance + 65
        ) {
          slot.destroyed = true;
          s.score += 75;
        }
    }
  }
  function combat(s, input, dt, world, events) {
    Battle.step(s, dt, events);
    s.enemyClock -= dt;
    s.fireCooldown = Math.max(0, s.fireCooldown - dt);
    s.ammo = Math.min(8, s.ammo + dt * 2.8);
    if (s.distance > 70 && s.enemyClock <= 0) {
      for (const offset of s.distance > 300 ? [-2.8, 0, 2.8] : [0]) {
        const m = s.missiles.find((m) => !m.active);
        if (m) {
          Object.assign(m, {
            active: true,
            phase: 0,
            clock: 1.4,
            x: s.x + offset,
            y: s.y + 2,
            d: s.distance + 95,
            id: ++s.serial,
            offset,
          });
        }
      }
      events.push('lock');
      s.enemyClock = Math.max(2.5, 4.5 - s.distance / 4000);
    }
    for (const m of s.missiles)
      if (m.active) {
        if (m.phase === 0) {
          m.clock -= dt;
          m.d = s.distance + 95;
          if (m.clock > 0.45) {
            m.x = s.x + (m.offset || 0);
            m.y = s.y + 2;
          }
          if (m.clock <= 0) {
            m.phase = 1;
            events.push('incoming');
          }
        } else {
          m.d -= 65 * dt;
          if (m.d - s.distance < 4) {
            m.active = false;
            if (
              Math.abs(m.x - s.x) < 2 &&
              Math.abs(m.y - (s.y + 2)) < 2 &&
              s.mode !== 3 &&
              s.shield === 0 &&
              s.hit === 0
            ) {
              s.health = Math.max(0, s.health - 1);
              s.combo = 0;
              s.hit = 0.7;
              s.speed *= 0.7;
              events.push('hit');
              if (s.health <= 0) {
                s.status = 'lost';
                events.push('crash');
              }
            } else {
              s.combo++;
              s.score += 100;
              s.energy = Math.min(100, s.energy + 15);
              events.push('dodge');
            }
            blast(s, m.x, m.y, m.d);
            events.push('blast');
          }
        }
      }
    if (input.fire && s.ammo >= 1 && s.fireCooldown === 0) {
      const shot = s.shots.find((b) => !b.active);
      if (shot) {
        let target = s.missiles.find(
            (m) => m.active && !s.shots.some((b) => b.active && b.kind === 1 && b.target === m.id),
          ),
          kind = target ? 1 : 0,
          id = target ? target.id : -1,
          nearest = Infinity;
        if (!target) {
          const enemy = s.battle.enemies.find(
            (e) => e.active && !s.shots.some((b) => b.active && b.kind === 3 && b.target === e.id),
          );
          if (enemy) {
            kind = 3;
            id = enemy.id;
            target = enemy;
          }
        }
        if (!target) {
          const enemy = s.swarm.drones.find(
            (e) =>
              e.active &&
              e.d > s.distance &&
              !s.shots.some((b) => b.active && b.kind === 4 && b.target === e.id),
          );
          if (enemy) {
            kind = 4;
            id = enemy.id;
            target = enemy;
          }
        }
        if (!target)
          for (const slot of world.slots) {
            const d = slot.index * 64 + 64 * 0.56 - s.distance;
            if (
              slot.tile.hazard &&
              !slot.destroyed &&
              !s.shots.some((b) => b.active && b.kind === 2 && b.target === slot.index) &&
              d > 0 &&
              d < 160 &&
              d < nearest
            ) {
              nearest = d;
              kind = 2;
              id = slot.index;
            }
          }
        if (kind) {
          Object.assign(shot, {
            active: true,
            x: s.x,
            y: s.y + 3.8,
            d: s.distance + 2,
            life: 2,
            kind,
            target: id,
          });
          s.ammo -= 1;
          s.fireCooldown = 0.18;
          events.push('fire');
        }
      }
    }
    for (const shot of s.shots)
      if (shot.active) {
        shot.life -= dt;
        shot.d += (s.speed + 160) * dt;
        let target = null;
        if (shot.kind === 1) {
          const m = s.missiles.find((m) => m.active && m.id === shot.target);
          if (m) target = { x: m.x, y: m.y, d: m.d, object: m };
        }
        if (shot.kind === 2) {
          const slot = world.slots.find((t) => t.index === shot.target && !t.destroyed);
          if (slot) {
            const p = profile(slot.tile, 0.56);
            target = {
              x: p.x + slot.tile.hazard * 3.1,
              y: 1.2,
              d: slot.index * 64 + 64 * 0.56,
              object: slot,
            };
          }
        }
        if (shot.kind === 3) {
          const e = s.battle.enemies[shot.target];
          if (e?.active) target = { x: e.x, y: e.y, d: e.d, object: e };
        }
        if (shot.kind === 4) {
          const e = s.swarm.drones[shot.target];
          if (e?.active) target = { x: e.x, y: e.y, d: e.d, object: e };
        }
        if (target) {
          shot.x += (target.x - shot.x) * Math.min(1, dt * 12);
          shot.y += (target.y - shot.y) * Math.min(1, dt * 12);
          if (shot.d >= target.d) {
            shot.active = false;
            if (shot.kind === 4) {
              Swarm.kill(s, target.object, events);
              continue;
            }
            if (shot.kind === 3) {
              Battle.hit(s, target.object, 3, events);
              events.push('enemy-hit');
              continue;
            }
            if (shot.kind === 1) target.object.active = false;
            else target.object.destroyed = true;
            s.kills++;
            s.combo++;
            s.score += 150;
            s.energy = Math.min(100, s.energy + 12);
            blast(s, target.x, target.y, target.d);
            events.push('blast');
            events.push('kill');
          }
        }
        if (shot.life <= 0) shot.active = false;
      }
  }
  function step(s, input, dt, world) {
    if (s.status !== 'playing') return [];
    dt = Math.max(0, Math.min(0.05, dt));
    const events = [];
    s.swarm.fxBudget = 0;
    const previousX = s.x,
      previousY = s.y;
    s.elapsed += dt;
    s.overload = Math.max(0, s.overload - dt);
    s.hit = Math.max(0, s.hit - dt);
    const wasFalling = s.falling;
    abilities(s, input, dt, world, events);
    const flying = !!(s.mode || s.pelicanTime > 0);
    if (flying) {
      if (wasFalling) events.push('rescue');
      s.falling = false;
      s.fallTime = 0;
      s.vy = 0;
    }
    if (s.falling) {
      s.fallTime += dt;
      s.vy -= 12 * dt;
      s.y += s.vy * dt;
      if (s.fallTime >= 5 - 1e-9) {
        s.status = 'lost';
        events.push('fall');
      }
      return events;
    }
    const boost = input.boost && s.energy > 1 && !input.brake && !input.back;
    const cruise = Math.min(36, 24 + s.distance / 350),
      target = s.mode
        ? [0, 75, 110, 150][s.mode]
        : input.brake || input.back
          ? 9
          : boost
            ? 58
            : input.forward
              ? Math.min(44, cruise + 10)
              : cruise;
    s.energy = Math.max(0, Math.min(100, s.energy + (boost ? -23 : 10) * dt));
    const braking = input.brake || input.back;
    const speedTarget =
      s.overload && flying
        ? (s.mode ? target : 95) * 1.6
        : s.overload && !braking
          ? target * 1.25
          : target;
    s.speed += (speedTarget - s.speed) * Math.min(1, dt * (braking ? 6 : s.overload ? 7 : 2.8));
    s.vx += (((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 76 - s.vx * 5.5) * dt;
    s.x += s.vx * dt;
    if (input.jump && !s.jumpHeld && s.y === 0 && !s.mode) {
      s.vy = 12;
      s.jumps++;
      events.push('jump');
    }
    s.jumpHeld = !!input.jump;
    if (!flying && (s.vy !== 0 || s.y > 0)) {
      s.vy -= 24 * dt;
      s.y += s.vy * dt;
      if (s.y <= 0) {
        s.y = 0;
        s.vy = 0;
        events.push('land');
      }
    }
    const previous = s.distance;
    s.distance += s.speed * dt;
    world.sync(s.distance);
    s.z = -(s.distance - world.origin * LENGTH);
    const segment = world.at(s.distance),
      t = (s.distance - segment.index * LENGTH) / LENGTH,
      p = profile(segment.tile, t);
    if (flying || (s.shield > 0 && s.y > 0)) {
      const aim = p.x - segment.tile.hazard * 2.7,
        steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      s.x += (aim + steer * 1.1 - s.x) * Math.min(1, dt * 12);
      if (flying) {
        s.y +=
          ((s.mode ? [0, 1.8, 4.2, 7][s.mode] : 5) - s.y) * Math.min(1, dt * (s.overload ? 12 : 7));
        s.vy = 0;
      }
    }
    s.roll += (-s.vx * 0.022 - s.roll) * Math.min(1, dt * 8);
    if (!flying && s.y === 0 && Math.abs(s.x - p.x) > p.w - 0.35) {
      s.falling = true;
      s.fallTime = 0;
      events.push('edge');
      return events;
    }
    const gateDistance = segment.index * LENGTH + LENGTH * 0.56,
      gate = profile(segment.tile, 0.56),
      side = segment.tile.hazard,
      crossbar = !!side && segment.index % 3 === 1;
    const padDistance = segment.index * LENGTH + LENGTH * 0.4;
    if (
      crossbar &&
      !s.mode &&
      !segment.launched &&
      previous <= padDistance &&
      s.distance >= padDistance &&
      s.y < 0.15
    ) {
      const speed = Math.max(7, s.speed),
        early = Math.max(0.06, (gateDistance - 2 - s.distance) / speed),
        late = Math.max(0.06, (gateDistance + 2 - s.distance) / speed);
      s.vy = Math.max(12, 12 * early + 2.4 / early, 12 * late + 2.4 / late);
      segment.launched = true;
      s.jumps++;
      events.push('launch');
    }
    if (
      side &&
      !segment.destroyed &&
      !segment.hit &&
      previous <= gateDistance + 1.8 &&
      s.distance >= gateDistance - 1.8
    ) {
      const hx = gate.x + side * 3.1 + Math.sin(s.elapsed * 2.6 + segment.index) * 1.2,
        dx = Math.abs(s.x - hx);
      if (
        (crossbar ? s.y < 1.6 : dx < 2 && s.y < 2.5) &&
        s.mode !== 3 &&
        s.shield === 0 &&
        s.hit === 0
      ) {
        segment.hit = true;
        s.combo = 0;
        s.health = Math.max(0, s.health - 1);
        s.speed *= 0.55;
        s.hit = 0.7;
        s.vx += s.x < hx ? -3 : 3;
        events.push('hit');
        if (s.health <= 0) {
          s.status = 'lost';
          events.push('crash');
        }
      } else if (s.distance >= gateDistance + 1.8 && (crossbar || dx < 3.4) && !segment.near) {
        segment.near = true;
        s.near++;
        s.combo++;
        s.score += 75 * Math.min(5, s.combo);
        events.push('near');
      }
    }
    const ringDistance = segment.index * LENGTH + LENGTH * 0.76,
      rp = profile(segment.tile, 0.76),
      rx = rp.x - side * 2.7;
    if (
      !segment.got &&
      previous <= ringDistance + 1.7 &&
      s.distance >= ringDistance - 1.7 &&
      Math.abs(s.x - rx) < 2
    ) {
      segment.got = true;
      s.count++;
      s.score += 100;
      s.energy = Math.min(100, s.energy + 10);
      events.push('ring');
    }
    combat(s, input, dt, world, events);
    Swarm.step(s, dt, events, previous, previousX, previousY);
    return events;
  }
  return { LENGTH, POOL, BATCH, tiles, sockets, compatible, solve, profile, create, fresh, step };
})();
if (typeof module !== 'undefined') module.exports = InfiniteRoad;
