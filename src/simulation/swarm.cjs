/* Fixed combat pools shared by simulation and instanced rendering. Positions use route distance. */
const SwarmCombat = (() => {
  const fresh = () => ({
    wave: -1,
    time: 0,
    cursor: 0,
    fired: 0,
    nextSalvoSound: 0,
    nextWhizSound: 0,
    fireX: 0,
    fireY: 0,
    fireD: 0,
    fireBoss: false,
    hits: 0,
    killed: 0,
    nextBoss: 5,
    attack: 0,
    attackTime: 0,
    attackX: 0,
    beamX: 0,
    cycle: 0,
    roarMark: 0,
    fxBudget: 0,
    drones: Array.from({ length: 1024 }, (_, id) => ({
      id,
      active: false,
      x: 0,
      y: 0,
      d: 0,
      age: 0,
      flash: 0,
      dead: 0,
      lastVolley: -1,
    })),
    bullets: Array.from({ length: 384 }, () => ({
      active: false,
      x: 0,
      y: 0,
      d: 0,
      vx: 0,
      vy: 0,
      vd: 0,
      life: 0,
      boss: false,
    })),
  });
  function damage(s, events) {
    if (s.mode === 3 || s.shield > 0 || s.hit > 0 || s.status !== 'playing') return;
    s.health = Math.max(0, s.health - 1);
    s.hit = 0.7;
    s.combo = 0;
    s.swarm.hits++;
    events.push('hit');
    if (s.health === 0) {
      s.status = 'lost';
      events.push('crash');
    }
  }
  function kill(s, e, events) {
    if (!e.active) return false;
    e.active = false;
    e.dead = 0.9;
    s.swarm.killed++;
    s.kills++;
    s.score += 10;
    s.health = Math.min(100, s.health + 0.25);
    if (s.swarm.fxBudget < 4) {
      events.push({ type: 'swarm-burst', x: e.x, y: e.y, d: e.d });
      s.swarm.fxBudget++;
    }
    return true;
  }
  // Same volumes drive drone, near-fleet and bullet clearing; no index-based fake kills.
  function contains(s, p, type) {
    const z = p.d - s.distance,
      x = p.x - s.x,
      y = p.y - (s.y + 3);
    if (type === 3) return z >= 0 && z < 210 && Math.abs(x) < 18 && Math.abs(y) < 25;
    const center = [108, 100, 72, 132, 72, 72, 0, 35, 25][type],
      rx = [48, 85, 80, 18, 75, 68, 60, 32, 25][type],
      ry = [42, 65, 65, 25, 55, 26, 40, 25, 25][type],
      rz = [85, 110, 100, 210, 100, 110, 60, 65, 55][type];
    return (x / rx) ** 2 + (y / ry) ** 2 + ((z - center) / rz) ** 2 <= 1;
  }
  function sweep(s, type, events) {
    const b = s.swarm;
    let count = 0;
    for (const e of b.drones) if (e.active && contains(s, e, type)) count += +kill(s, e, events);
    for (const p of b.bullets) if (p.active && contains(s, p, type)) p.active = false;
    return count;
  }
  function shoot(s, x, y, d, tx, ty, td, boss = false) {
    const b = s.swarm;
    let p = null;
    for (let n = 0; n < b.bullets.length; n++) {
      const candidate = b.bullets[b.cursor++ % b.bullets.length];
      if (!candidate.active) {
        p = candidate;
        break;
      }
    }
    if (!p) return;
    const duration = boss ? 1.8 : 1.4;
    Object.assign(p, {
      active: true,
      x,
      y,
      d,
      vx: (tx - x) / duration,
      vy: (ty - y) / duration,
      vd: (td - d) / duration,
      life: 3.5,
      boss,
    });
    b.fired++;
    b.fireX = x;
    b.fireY = y;
    b.fireD = d;
    b.fireBoss = boss;
  }
  function step(s, dt, events, previous = s.distance, previousX = s.x, previousY = s.y) {
    const b = s.swarm;
    if (dt <= 0) return;
    b.time += dt;
    const firedBefore = b.fired;
    if (s.distance >= 60 && b.wave !== s.battle.wave) {
      b.wave = s.battle.wave;
      for (const e of b.drones) Object.assign(e, { active: true, dead: 0, age: 0, lastVolley: -1 });
    }
    for (const e of b.drones) {
      e.dead = Math.max(0, e.dead - dt);
      e.flash = Math.max(0, e.flash - dt);
      if (!e.active) continue;
      e.age += dt;
      const squad = e.id >> 6,
        j = e.id % 64,
        t = (e.age + squad * 1.1) % 9,
        side = squad % 2 ? 1 : -1,
        approach = Math.sin(Math.PI * Math.min(1, t / 5));
      const angle = j * 2.39996 + squad * 0.4,
        radius = Math.sqrt(j) * 3.1;
      e.x = s.x + side * (78 - approach * 48) + Math.cos(angle) * radius;
      e.y = 18 + Math.sin(angle) * radius * 0.6 + (1 - approach) * 22 + (squad >> 3) * 14;
      e.d = s.distance + 115 - approach * 90 + Math.sin(j * 1.7) * 12 + (squad >> 3) * 65;
      const volley = Math.floor((e.age + squad * 1.1) / 9),
        fireAt = 2.4 + j * 0.018;
      if (t > fireAt - 0.5 && t < fireAt) e.flash = 0.1;
      if (e.age > 0.9 && t >= fireAt && e.lastVolley !== volley) {
        e.lastVolley = volley;
        e.flash = 0.18;
        shoot(
          s,
          e.x,
          e.y,
          e.d,
          s.x + ((j % 5) - 2) * 1.4,
          s.y + 2 + ((j % 3) - 1) * 0.8,
          s.distance + s.speed * 1.4,
        );
      }
    }
    if (s.roarCooldown > b.roarMark) sweep(s, 6, events);
    b.roarMark = s.roarCooldown;
    if (s.pelicanTime > 0) sweep(s, 7, events);
    if (s.mode === 3) sweep(s, 8, events);
    const boss = s.battle.enemies[12];
    if (!boss.active) {
      b.attack = 0;
      b.nextBoss = 4;
    } else if (boss.stagger > 0) {
      b.attack = 0;
      b.nextBoss = Math.max(b.nextBoss, 1);
    } else if (!b.attack) {
      b.nextBoss -= dt;
      if (b.nextBoss <= 0) {
        b.attack = ++b.cycle % 2 ? 1 : 2;
        b.attackTime = 0;
        b.attackX = s.x;
        events.push('boss-area-warning');
      }
    }
    if (b.attack) {
      const old = b.attackTime;
      b.attackTime += dt;
      if (b.attackTime >= 1.8) {
        if (old < 1.8) {
          events.push('boss-area-fire');
          if (b.attack === 1) {
            for (const p of b.bullets) if (!p.boss) p.active = false;
            for (let row = 0; row < 5; row++)
              for (let col = -14; col <= 14; col++) {
                const x = b.attackX + col * 3;
                if (Math.abs(x - b.attackX) < 5) continue;
                shoot(
                  s,
                  x,
                  1 + row * 4,
                  s.distance + 115 + row * 3,
                  x,
                  1 + row * 4,
                  s.distance - 35,
                  true,
                );
              }
          }
        }
        if (b.attack === 2) {
          b.beamX = b.attackX - 16 + 32 * Math.min(1, (b.attackTime - 1.8) / 2.4);
          if (Math.abs(s.x - b.beamX) < 2.4 && s.y < 14) damage(s, events);
        }
      }
      if (b.attackTime > 4.2) {
        b.attack = 0;
        b.nextBoss = boss.phase ? 3 : 5;
      }
    }
    if (b.fired > firedBefore && b.time >= b.nextSalvoSound) {
      b.nextSalvoSound = b.time + 0.14;
      events.push({ type: 'swarm-fire', x: b.fireX, y: b.fireY, d: b.fireD, boss: b.fireBoss });
    }
    for (const p of b.bullets)
      if (p.active) {
        const ax = p.x - previousX,
          ay = p.y - (previousY + 2),
          az = p.d - previous;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.d += p.vd * dt;
        p.life -= dt;
        const bx = p.x - s.x,
          by = p.y - (s.y + 2),
          bz = p.d - s.distance,
          dx = bx - ax,
          dy = by - ay,
          dz = bz - az,
          den = dx * dx + dy * dy + dz * dz,
          t = den ? Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / den)) : 0;
        const distance2 = (ax + dx * t) ** 2 + (ay + dy * t) ** 2 + (az + dz * t) ** 2;
        if (distance2 >= 2.25 && distance2 < 36 && az > 0 && bz <= 0 && b.time >= b.nextWhizSound) {
          b.nextWhizSound = b.time + 0.2;
          events.push({ type: 'bullet-whiz', x: p.x, y: p.y, d: p.d });
        }
        if (distance2 < 1.5 ** 2) {
          p.active = false;
          damage(s, events);
        } else if (p.life <= 0 || Math.abs(bz) > 450) p.active = false;
      }
  }
  function threat(s) {
    let nearest = 1.25,
      side = null;
    for (const p of s.swarm.bullets)
      if (p.active) {
        const x = p.x - s.x,
          y = p.y - s.y - 2,
          z = p.d - s.distance,
          vx = p.vx - s.vx,
          vy = p.vy - s.vy,
          vz = p.vd - s.speed,
          den = vx * vx + vy * vy + vz * vz;
        if (!den) continue;
        const t = -(x * vx + y * vy + z * vz) / den;
        if (t > 0 && t < nearest && (x + vx * t) ** 2 + (y + vy * t) ** 2 + (z + vz * t) ** 2 < 9) {
          nearest = t;
          side = x < -2 ? '左侧' : x > 2 ? '右侧' : '正前方';
        }
      }
    return side;
  }
  return { fresh, step, sweep, contains, kill, shoot, damage, threat };
})();
if (typeof module !== 'undefined') module.exports = SwarmCombat;
