/* Fixed aerial encounter pool; enemy damage is independent of visual effects. */
const SkyBattle = (() => {
  const fresh = () => ({
    wave: 0,
    nextWave: 60,
    nextBoss: 600,
    roarMark: 0,
    hitBudget: 0,
    enemies: Array.from({ length: 13 }, (_, i) => ({
      id: i,
      active: false,
      boss: i === 12,
      heavy: i !== 12 && i % 3 === 0,
      armorStage: 0,
      overloadStages: 0,
      impact: 0,
      stagger: 0,
      hp: 0,
      maxHp: 0,
      x: 0,
      y: 0,
      d: 0,
      age: 0,
      fire: 0,
      flash: 0,
      chain: 0,
      phase: 0,
      recoil: 0,
    })),
  });
  function hit(s, e, damage, events, impactScale = 1) {
    if (!e.active) return;
    const actual = damage * (e.stagger > 0 ? 1.75 : 1);
    const dealt = Math.min(e.hp, actual);
    const freshHit = e.flash <= 0;
    if (freshHit && s.battle.hitBudget < 3) {
      s.battle.hitBudget++;
      events.push({
        type: 'enemy-hit-point',
        x: e.x,
        y: e.y,
        d: e.d,
        boss: e.boss,
        heavy: e.heavy,
        damage: dealt,
      });
    }
    if (e.stagger <= 0 && actual < e.hp && !(e.boss && s.overload)) {
      e.impact += dealt * impactScale;
      if (e.impact >= (e.boss ? 120 : e.heavy ? 28 : 10)) {
        e.impact = 0;
        e.stagger = 2.2;
        e.fire += 2.2;
        events.push({ type: 'enemy-stagger', x: e.x, y: e.y, d: e.d, boss: e.boss });
        const stage = 1 << e.armorStage;
        if (e.boss && !s.overload && !(e.overloadStages & stage)) {
          e.overloadStages |= stage;
          s.overload = 5;
          events.push('overload');
        }
      }
    }
    s.health = Math.min(100, s.health + dealt * 0.25);
    e.hp = Math.max(0, e.hp - actual);
    if (freshHit) e.flash = 0.16;
    const stage = Math.min(3, Math.floor((1 - e.hp / e.maxHp) * 4));
    if (stage > e.armorStage) {
      e.armorStage = stage;
      if ((e.boss || e.heavy) && e.hp > 0)
        events.push({ type: 'armor-break', x: e.x, y: e.y, d: e.d, boss: e.boss });
    }
    if (e.hp > 0) return;
    e.active = false;
    s.kills++;
    s.score += e.boss ? 3000 : e.heavy ? 600 : 200;
    s.energy = Math.min(100, s.energy + 8);
    events.push({ type: 'enemy-burst', x: e.x, y: e.y, d: e.d, boss: e.boss });
    // Nearby craft detonate in sequence; each living craft can queue only once.
    for (const other of s.battle.enemies)
      if (
        other.active &&
        !other.boss &&
        !other.heavy &&
        Math.hypot(other.x - e.x, (other.d - e.d) * 0.5) < 18 &&
        !other.chain
      )
        other.chain = 0.12 + other.id * 0.025;
    if (e.boss) {
      s.health = Math.min(100, s.health + 5);
      events.push('boss-down');
    }
  }
  function step(s, dt, events) {
    const b = s.battle;
    b.hitBudget = 0;
    if (s.distance >= b.nextWave) {
      b.wave++;
      b.nextWave = s.distance + 450;
      for (let i = 0; i < 12; i++) {
        const e = b.enemies[i];
        if (!e.active)
          Object.assign(e, {
            active: true,
            hp: e.heavy ? 90 : 12,
            maxHp: e.heavy ? 90 : 12,
            armorStage: 0,
            impact: 0,
            stagger: 0,
            age: 0,
            fire: 2 + i * 0.4,
            chain: 0,
            flash: 0,
          });
      }
      events.push('wave');
    }
    const boss = b.enemies[12];
    if (s.distance >= b.nextBoss && !boss.active) {
      Object.assign(boss, {
        active: true,
        hp: 900,
        overloadStages: 0,
        maxHp: 900,
        armorStage: 0,
        impact: 0,
        stagger: 0,
        age: 0,
        fire: 3,
        chain: 0,
        flash: 0,
      });
      b.nextBoss = s.distance + 1800;
      events.push('boss');
    }
    const roar = s.roarCooldown > b.roarMark;
    b.roarMark = s.roarCooldown;
    for (const e of b.enemies)
      if (e.active) {
        e.age += dt;
        e.stagger = Math.max(0, e.stagger - dt);
        e.impact = Math.max(0, e.impact - dt * 2);
        e.recoil = Math.max(0, e.recoil - dt);
        e.flash = Math.max(0, e.flash - dt);
        const phase = e.boss && e.hp < e.maxHp * 0.5 ? 1 : 0;
        if (phase !== e.phase && phase) events.push('boss-rage');
        e.phase = phase;
        e.x = e.boss
          ? Math.sin(s.elapsed * 0.4) * 6
          : ((e.id % 4) - 1.5) * 7 + Math.sin(s.elapsed + e.id) * 2;
        e.y = e.boss ? 12 : 5 + Math.floor(e.id / 4) * 3 + Math.sin(s.elapsed * 2 + e.id);
        e.d = s.distance + (e.boss ? 78 : 38 + Math.floor(e.id / 4) * 12);
        if (e.chain > 0) {
          e.chain -= dt;
          if (e.chain <= 0) {
            hit(s, e, 6, events);
            continue;
          }
        }
        if (roar && !e.boss) hit(s, e, 2, events);
        if (s.pelicanTime > 0 && e.d - s.distance < 110) hit(s, e, dt * (e.boss ? 8 : 4), events);
        if (s.mode === 3) hit(s, e, dt * (e.boss ? 4 : 2), events);
        if (!e.active) continue;
        if (e.stagger > 0) continue;
        e.fire -= dt;
        if (e.fire <= 0) {
          // Reuse the existing warning/flight missile pool and its dodge rules.
          for (const offset of e.boss ? (e.phase ? [-3, 0, 3] : [-2, 2]) : [0]) {
            const m = s.missiles.find((m) => !m.active);
            if (m)
              Object.assign(m, {
                active: true,
                phase: 0,
                clock: e.boss ? 1.6 : 1.8,
                x: s.x + offset,
                y: s.y + 2,
                d: e.d,
                id: ++s.serial,
                offset,
              });
          }
          e.stagger = Math.max(0, e.stagger - dt);
          e.impact = Math.max(0, e.impact - dt * 2);
          e.recoil = 0.2;
          events.push({ type: 'enemy-fire', x: e.x, y: e.y, d: e.d, boss: e.boss });
          e.fire = e.boss ? (e.phase ? 1.2 : 2.5) : 7;
          events.push('lock');
        }
        if (e.age > 45 && !e.boss && !e.heavy) e.active = false;
      }
  }
  return { fresh, step, hit };
})();
if (typeof module !== 'undefined') module.exports = SkyBattle;
