function updateHud($, state, ambient, noticeUntil, nextText) {
  const overload = state.overload > 0;
  $('overload-hud').hidden = !overload;
  if (overload) $('overload-time').textContent = state.overload.toFixed(1) + 's';
  for (let i = 0; i < 6; i++) {
    const b = $('six' + i);
    b.disabled = state.status !== 'playing' || (!overload && state.sixCooldowns[i] > 0);
    b.querySelector('small').textContent = overload
      ? '无冷却'
      : state.sixCooldowns[i] > 0
        ? state.sixCooldowns[i].toFixed(1) + 's'
        : '就绪';
  }
  $('rings').textContent = String(state.count).padStart(2, '0');
  $('timer').textContent = String(Math.floor(state.distance));
  $('speed').textContent = Math.round(Math.abs(state.speed) * 3.6);
  if (state.status === 'playing') $('next').textContent = nextText();
  if (noticeUntil < ambient) $('banner').textContent = '';
  $('energy').value = state.energy;
  $('health').textContent = '耐久 ' + Math.ceil(state.health) + ' / 100';
  $('health-bar').value = state.health;
  $('score').textContent = Math.floor(state.distance) + state.score;
  for (let i = 0; i < 3; i++) {
    const b = $('power' + (i + 1));
    b.disabled = state.status !== 'playing' || state.mode !== 0 || state.cooldowns[i] > 0;
    b.querySelector('small').textContent =
      state.mode === i + 1
        ? '启动中'
        : state.cooldowns[i] > 0
          ? state.cooldowns[i].toFixed(1) + 's'
          : '就绪';
  }
  $('pelican-button').disabled = state.status !== 'playing' || state.pelicanCooldown > 0;
  $('pelican-button').querySelector('small').textContent =
    state.pelicanTime > 0
      ? '吞天中'
      : state.pelicanCooldown > 0
        ? state.pelicanCooldown.toFixed(1) + 's'
        : '就绪';
  $('fire-button').disabled = state.status !== 'playing' || state.ammo < 1;
  $('roar-button').disabled = state.status !== 'playing' || state.roarCooldown > 0;
  $('fire-button').querySelector('small').textContent = Math.floor(state.ammo) + '/8';
  $('roar-button').querySelector('small').textContent =
    state.roarCooldown > 0 ? state.roarCooldown.toFixed(1) + 's' : '就绪';
}
